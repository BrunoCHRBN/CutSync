BEGIN;

-- 1. Criar tipo Enum de Status do Convite
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'invite_status_enum') THEN
    CREATE TYPE public.invite_status_enum AS ENUM ('pending', 'accepted', 'revoked', 'expired');
  END IF;
END $$;

-- 2. Tabela de Convites de Estabelecimento (establishment_invites)
CREATE TABLE IF NOT EXISTS public.establishment_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id UUID NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  target_contact TEXT NOT NULL, -- Email ou número de telefone (WhatsApp)
  role TEXT NOT NULL CHECK (role IN ('admin', 'professional')),
  token_hash TEXT NOT NULL UNIQUE,
  status public.invite_status_enum DEFAULT 'pending',
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  accepted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  revoked_at TIMESTAMPTZ,
  lgpd_accepted BOOLEAN DEFAULT false
);

-- Habilitar RLS
ALTER TABLE public.establishment_invites ENABLE ROW LEVEL SECURITY;

-- 3. Índices de Performance
CREATE INDEX IF NOT EXISTS establishment_invites_establishment_idx 
  ON public.establishment_invites(establishment_id, status);
CREATE INDEX IF NOT EXISTS establishment_invites_contact_idx 
  ON public.establishment_invites(lower(target_contact), status);

-- 4. View de Expiração Passiva (Filtra dinamicamente convites expirados)
CREATE OR REPLACE VIEW public.active_establishment_invites AS
  SELECT * FROM public.establishment_invites
  WHERE status = 'pending' AND expires_at > now();

-- 5. RPC para Listar Convites do Estabelecimento
CREATE OR REPLACE FUNCTION public.list_establishment_invites_v2(target_establishment_id UUID)
RETURNS TABLE (
  id UUID,
  target_contact TEXT,
  role TEXT,
  status TEXT,
  created_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
     AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN
     RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT 
    i.id,
    i.target_contact,
    i.role,
    CASE 
      WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' 
      ELSE i.status::text 
    END,
    i.created_at,
    i.expires_at
  FROM public.establishment_invites i
  WHERE i.establishment_id = target_establishment_id
  ORDER BY i.created_at DESC;
END;
$$;

-- 6. RPC para Criar Convite Tokenizado
CREATE OR REPLACE FUNCTION public.create_establishment_invite_v2(
  target_establishment_id UUID,
  target_contact TEXT,
  target_role TEXT
)
RETURNS TABLE (invitation_id UUID, raw_token TEXT, expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_contact TEXT := lower(trim(target_contact));
  generated_token TEXT := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id UUID;
  generated_expiry TIMESTAMPTZ := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_role NOT IN ('admin', 'professional') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF target_role = 'admin' AND NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_role = 'professional' AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Revogar convites pendentes anteriores para o mesmo contato
  UPDATE public.establishment_invites
  SET status = 'revoked', revoked_at = now()
  WHERE establishment_id = target_establishment_id
    AND lower(target_contact) = normalized_contact
    AND role = target_role
    AND status = 'pending';

  -- Criar o convite seguro
  INSERT INTO public.establishment_invites (
    establishment_id, target_contact, role, token_hash, expires_at, created_by
  ) VALUES (
    target_establishment_id, normalized_contact, target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), generated_expiry, (SELECT auth.uid())
  ) RETURNING id INTO generated_id;

  -- Log de Auditoria
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'invite.created',
    generated_id,
    'invite',
    jsonb_build_object('establishment_id', target_establishment_id, 'role', target_role, 'contact', normalized_contact)
  );

  RETURN QUERY SELECT generated_id, generated_token, generated_expiry;
END;
$$;

-- 7. RPC para Inspecionar Convite
CREATE OR REPLACE FUNCTION public.inspect_invitation_v2(invitation_token TEXT)
RETURNS TABLE (
  establishment_name TEXT,
  invited_contact TEXT,
  invited_role TEXT,
  invitation_status TEXT,
  expiration TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  current_email TEXT;
  current_phone TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_invitation_token'; END IF;

  SELECT lower(email), phone INTO current_email, current_phone FROM public.profiles WHERE id = (SELECT auth.uid());

  RETURN QUERY
  SELECT 
    e.name,
    i.target_contact,
    i.role,
    CASE 
      WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' 
      ELSE i.status::text 
    END,
    i.expires_at
  FROM public.establishment_invites i
  JOIN public.establishments e ON e.id = i.establishment_id
  WHERE i.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    AND (lower(i.target_contact) = current_email OR i.target_contact = current_phone);
END;
$$;

-- 8. RPC para Aceitar Convite com Match de Identidade e LGPD
CREATE OR REPLACE FUNCTION public.accept_invitation_v2(invitation_token TEXT)
RETURNS TABLE (accepted_role TEXT, accepted_establishment_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  pending_invite public.establishment_invites%ROWTYPE;
  current_email TEXT;
  current_phone TEXT;
  effective_role TEXT;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid_invitation_token'; END IF;

  SELECT lower(email), phone INTO current_email, current_phone FROM public.profiles
  WHERE id = (SELECT auth.uid()) AND deleted_at IS NULL;

  -- Obter o convite com trava for update
  SELECT * INTO pending_invite FROM public.establishment_invites
  WHERE token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex') FOR UPDATE;
  
  IF NOT FOUND OR pending_invite.status <> 'pending' THEN 
    RAISE EXCEPTION 'invalid_or_used_invitation'; 
  END IF;

  -- Expiração passiva
  IF pending_invite.expires_at <= now() THEN
    UPDATE public.establishment_invites SET status = 'expired' WHERE id = pending_invite.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;

  -- Match de Identidade
  IF lower(pending_invite.target_contact) <> current_email AND pending_invite.target_contact <> current_phone THEN
    RAISE EXCEPTION 'invitation_contact_mismatch';
  END IF;

  -- Vínculo na tabela de memberships
  INSERT INTO public.memberships(profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES (
    (SELECT auth.uid()),
    pending_invite.establishment_id,
    pending_invite.role,
    'active',
    0.50,
    pending_invite.created_by
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = CASE WHEN public.memberships.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
      status = 'active', revoked_at = NULL, updated_at = now();

  SELECT role INTO effective_role FROM public.memberships
  WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invite.establishment_id;

  -- Atualizar perfil ativo do usuário
  UPDATE public.profiles
  SET establishment_id = pending_invite.establishment_id,
      role = effective_role,
      commission_rate = (SELECT commission_rate FROM public.memberships
        WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invite.establishment_id),
      updated_at = now()
  WHERE id = (SELECT auth.uid());

  -- Atualizar tabela de vinculação legada
  INSERT INTO public.profile_establishments(profile_id, establishment_id, role)
  VALUES ((SELECT auth.uid()), pending_invite.establishment_id, effective_role)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  -- Marcar convite como resgatado e salvar aceite LGPD
  UPDATE public.establishment_invites
  SET status = 'accepted', 
      accepted_by = (SELECT auth.uid()), 
      accepted_at = now(),
      lgpd_accepted = true
  WHERE id = pending_invite.id;

  -- Log de Auditoria
  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'invite.accepted',
    pending_invite.id,
    'invite',
    jsonb_build_object('establishment_id', pending_invite.establishment_id, 'role', effective_role)
  );

  RETURN QUERY SELECT effective_role, pending_invite.establishment_id;
END;
$$;

-- RLS Políticas para establishment_invites
CREATE POLICY "Admins read invites of establishment" ON public.establishment_invites
  FOR SELECT TO authenticated
  USING (
    public.is_superadmin() 
    OR public.has_active_membership(establishment_id, ARRAY['admin'])
  );

CREATE POLICY "Admins insert invites of establishment" ON public.establishment_invites
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_superadmin() 
    OR public.has_active_membership(establishment_id, ARRAY['admin'])
  );

CREATE POLICY "Admins update invites of establishment" ON public.establishment_invites
  FOR UPDATE TO authenticated
  USING (
    public.is_superadmin() 
    OR public.has_active_membership(establishment_id, ARRAY['admin'])
  )
  WITH CHECK (
    public.is_superadmin() 
    OR public.has_active_membership(establishment_id, ARRAY['admin'])
  );

-- Conceder permissões para os novos recursos
GRANT SELECT ON public.establishment_invites TO authenticated;
GRANT ALL ON FUNCTION public.list_establishment_invites_v2(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.create_establishment_invite_v2(uuid, text, text) TO authenticated;
GRANT ALL ON FUNCTION public.inspect_invitation_v2(text) TO authenticated;
GRANT ALL ON FUNCTION public.accept_invitation_v2(text) TO authenticated;

COMMIT;
