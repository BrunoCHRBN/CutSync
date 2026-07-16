BEGIN;

CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
ALTER EXTENSION pgcrypto SET SCHEMA extensions;

CREATE TABLE IF NOT EXISTS public.memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'professional')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  commission_rate numeric NOT NULL DEFAULT 0.50 CHECK (commission_rate >= 0 AND commission_rate <= 1),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (profile_id, establishment_id)
);

CREATE TABLE IF NOT EXISTS public.superadmins (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.establishment_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requester_name text NOT NULL,
  requester_email text NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  address text,
  phone text,
  primary_color text NOT NULL DEFAULT '#F5A524',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS establishment_requests_pending_slug_idx
  ON public.establishment_requests (lower(slug)) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS public.invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'professional')),
  token_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS invitations_establishment_idx ON public.invitations(establishment_id, status);
CREATE INDEX IF NOT EXISTS invitations_email_idx ON public.invitations(lower(invited_email), status);
CREATE INDEX IF NOT EXISTS memberships_profile_idx ON public.memberships(profile_id, status);
CREATE INDEX IF NOT EXISTS memberships_establishment_idx ON public.memberships(establishment_id, role, status);

CREATE TABLE IF NOT EXISTS public.authorization_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.memberships (profile_id, establishment_id, role, commission_rate, created_by)
SELECT pe.profile_id, pe.establishment_id, pe.role, COALESCE(p.commission_rate, 0.50), pe.profile_id
FROM public.profile_establishments pe
JOIN public.profiles p ON p.id = pe.profile_id
WHERE pe.role IN ('admin', 'professional')
ON CONFLICT (profile_id, establishment_id) DO UPDATE
SET role = EXCLUDED.role,
    status = 'active',
    commission_rate = EXCLUDED.commission_rate,
    revoked_at = NULL,
    updated_at = now();

INSERT INTO public.memberships (profile_id, establishment_id, role, commission_rate, created_by)
SELECT p.id, p.establishment_id, p.role, COALESCE(p.commission_rate, 0.50), p.id
FROM public.profiles p
WHERE p.establishment_id IS NOT NULL AND p.role IN ('admin', 'professional')
ON CONFLICT (profile_id, establishment_id) DO UPDATE
SET role = EXCLUDED.role,
    status = 'active',
    commission_rate = EXCLUDED.commission_rate,
    revoked_at = NULL,
    updated_at = now();

INSERT INTO public.superadmins (profile_id, granted_by)
SELECT p.id, p.id
FROM public.profiles p
WHERE p.role = 'admin' AND p.deleted_at IS NULL
ORDER BY p.created_at
LIMIT 1
ON CONFLICT (profile_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.is_superadmin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.superadmins s WHERE s.profile_id = (SELECT auth.uid())
  );
$$;

CREATE OR REPLACE FUNCTION public.has_active_membership(target_establishment_id uuid, allowed_roles text[] DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships m
    WHERE m.profile_id = (SELECT auth.uid())
      AND m.establishment_id = target_establishment_id
      AND m.status = 'active'
      AND (allowed_roles IS NULL OR m.role = ANY(allowed_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.can_view_profile(target_profile_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    target_profile_id = (SELECT auth.uid())
    OR public.is_superadmin()
    OR EXISTS (
      SELECT 1 FROM public.appointments own_appointment
      WHERE own_appointment.client_id = (SELECT auth.uid())
        AND own_appointment.professional_id = target_profile_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.memberships viewer
      WHERE viewer.profile_id = (SELECT auth.uid())
        AND viewer.status = 'active'
        AND viewer.role IN ('admin', 'professional')
        AND (
          EXISTS (
            SELECT 1 FROM public.memberships target
            WHERE target.profile_id = target_profile_id
              AND target.establishment_id = viewer.establishment_id
              AND target.status = 'active'
          )
          OR EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.client_id = target_profile_id
              AND a.establishment_id = viewer.establishment_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, push_token text, work_hours text,
  specialties text, instagram text, titulo_profissional text, deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, p.establishment_id, p.name, p.role, p.email, p.phone, p.avatar_url,
    p.commission_rate, p.push_token, p.work_hours, p.specialties, p.instagram,
    p.titulo_profissional, p.deleted_at
  FROM public.profiles p WHERE p.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.profiles (id, name, email, role, establishment_id, avatar_url, phone)
  VALUES (
    NEW.id,
    COALESCE(NULLIF(trim(NEW.raw_user_meta_data->>'name'), ''), 'Usuário'),
    lower(NEW.email),
    'client',
    NULL,
    NEW.raw_user_meta_data->>'avatar_url',
    NEW.raw_user_meta_data->>'phone'
  );
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_establishment(
  requested_name text,
  requested_slug text,
  requested_address text DEFAULT NULL,
  requested_phone text DEFAULT NULL,
  requested_primary_color text DEFAULT '#F5A524'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_profile public.profiles%ROWTYPE;
  normalized_slug text := lower(trim(requested_slug));
  request_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF trim(COALESCE(requested_name, '')) = '' THEN RAISE EXCEPTION 'invalid_name'; END IF;
  IF normalized_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' THEN RAISE EXCEPTION 'invalid_slug'; END IF;
  IF requested_primary_color !~ '^#[0-9A-Fa-f]{6}$' THEN RAISE EXCEPTION 'invalid_color'; END IF;

  SELECT * INTO current_profile FROM public.profiles WHERE id = (SELECT auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;
  IF EXISTS (SELECT 1 FROM public.establishments e WHERE lower(e.slug) = normalized_slug) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.establishment_requests r WHERE r.requester_id = current_profile.id AND r.status = 'pending') THEN
    RAISE EXCEPTION 'pending_request_exists';
  END IF;

  INSERT INTO public.establishment_requests (
    requester_id, requester_name, requester_email, name, slug, address, phone, primary_color
  ) VALUES (
    current_profile.id, current_profile.name, current_profile.email, trim(requested_name), normalized_slug,
    NULLIF(trim(requested_address), ''), NULLIF(trim(requested_phone), ''), upper(requested_primary_color)
  ) RETURNING id INTO request_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, metadata)
  VALUES (current_profile.id, 'establishment.requested', jsonb_build_object('request_id', request_id));
  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_invitation(
  target_establishment_id uuid,
  target_email text,
  target_role text
)
RETURNS TABLE (invitation_id uuid, raw_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_email text := lower(trim(target_email));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF target_role NOT IN ('admin', 'professional') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.establishments e WHERE e.id = target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF target_role = 'admin' AND NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_role = 'professional' AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked', revoked_at = now()
  WHERE establishment_id = target_establishment_id
    AND lower(invited_email) = normalized_email
    AND role = target_role
    AND status = 'pending';

  INSERT INTO public.invitations (
    establishment_id, invited_email, role, token_hash, expires_at, created_by
  ) VALUES (
    target_establishment_id, normalized_email, target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), generated_expiry, (SELECT auth.uid())
  ) RETURNING id INTO generated_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata)
  VALUES ((SELECT auth.uid()), 'invitation.created', target_establishment_id,
    jsonb_build_object('invitation_id', generated_id, 'role', target_role, 'email', normalized_email));

  RETURN QUERY SELECT generated_id, generated_token, generated_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_establishment_request(target_request_id uuid)
RETURNS TABLE (establishment_id uuid, invitation_id uuid, raw_token text, invited_email text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  pending_request public.establishment_requests%ROWTYPE;
  new_establishment_id uuid;
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_invitation_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO pending_request FROM public.establishment_requests
  WHERE id = target_request_id AND status = 'pending' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  IF EXISTS (SELECT 1 FROM public.establishments e WHERE lower(e.slug) = lower(pending_request.slug)) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  INSERT INTO public.establishments(name, slug, address, phone, primary_color, timezone, currency)
  VALUES (pending_request.name, pending_request.slug, pending_request.address, pending_request.phone,
    pending_request.primary_color, 'America/Sao_Paulo', 'BRL')
  RETURNING id INTO new_establishment_id;

  INSERT INTO public.invitations(establishment_id, invited_email, role, token_hash, expires_at, created_by)
  VALUES (new_establishment_id, lower(pending_request.requester_email), 'admin',
    encode(extensions.digest(generated_token, 'sha256'), 'hex'), generated_expiry, (SELECT auth.uid()))
  RETURNING id INTO generated_invitation_id;

  UPDATE public.establishment_requests
  SET status = 'approved', reviewed_by = (SELECT auth.uid()), reviewed_at = now(),
      establishment_id = new_establishment_id, updated_at = now()
  WHERE id = target_request_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'establishment.approved', new_establishment_id, pending_request.requester_id,
    jsonb_build_object('request_id', target_request_id, 'invitation_id', generated_invitation_id));

  RETURN QUERY SELECT new_establishment_id, generated_invitation_id, generated_token,
    lower(pending_request.requester_email), generated_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_establishment_request(target_request_id uuid, reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.establishment_requests
  SET status = 'rejected', rejection_reason = NULLIF(trim(reason), ''),
      reviewed_by = (SELECT auth.uid()), reviewed_at = now(), updated_at = now()
  WHERE id = target_request_id AND status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'request_not_pending'; END IF;
  INSERT INTO public.authorization_audit_log(actor_id, action, metadata)
  VALUES ((SELECT auth.uid()), 'establishment.rejected', jsonb_build_object('request_id', target_request_id));
END;
$$;

CREATE OR REPLACE FUNCTION public.inspect_invitation(invitation_token text)
RETURNS TABLE (establishment_name text, invited_email text, invited_role text, invitation_status text, expiration timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE current_email text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users WHERE id = (SELECT auth.uid());
  RETURN QUERY
  SELECT e.name, i.invited_email, i.role,
    CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
    i.expires_at
  FROM public.invitations i
  JOIN public.establishments e ON e.id = i.establishment_id
  WHERE i.token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
    AND lower(i.invited_email) = current_email;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text)
RETURNS TABLE (accepted_role text, accepted_establishment_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  pending_invitation public.invitations%ROWTYPE;
  current_email text;
  effective_role text;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT lower(email) INTO current_email FROM auth.users
  WHERE id = (SELECT auth.uid()) AND email_confirmed_at IS NOT NULL;
  IF current_email IS NULL THEN RAISE EXCEPTION 'verified_email_required'; END IF;

  SELECT * INTO pending_invitation FROM public.invitations
  WHERE token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex') FOR UPDATE;
  IF NOT FOUND OR pending_invitation.status <> 'pending' THEN RAISE EXCEPTION 'invalid_or_used_invitation'; END IF;
  IF pending_invitation.expires_at <= now() THEN
    UPDATE public.invitations SET status = 'expired' WHERE id = pending_invitation.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;
  IF lower(pending_invitation.invited_email) <> current_email THEN RAISE EXCEPTION 'invitation_email_mismatch'; END IF;

  INSERT INTO public.memberships(profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES ((SELECT auth.uid()), pending_invitation.establishment_id, pending_invitation.role, 'active', 0.50, pending_invitation.created_by)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = CASE WHEN public.memberships.role = 'admin' THEN 'admin' ELSE EXCLUDED.role END,
      status = 'active', revoked_at = NULL, updated_at = now();

  SELECT role INTO effective_role FROM public.memberships
  WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invitation.establishment_id;

  UPDATE public.profiles
  SET establishment_id = pending_invitation.establishment_id,
      role = effective_role,
      commission_rate = (SELECT commission_rate FROM public.memberships
        WHERE profile_id = (SELECT auth.uid()) AND establishment_id = pending_invitation.establishment_id),
      updated_at = now()
  WHERE id = (SELECT auth.uid());

  INSERT INTO public.profile_establishments(profile_id, establishment_id, role)
  VALUES ((SELECT auth.uid()), pending_invitation.establishment_id, effective_role)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  UPDATE public.invitations
  SET status = 'accepted', accepted_by = (SELECT auth.uid()), accepted_at = now()
  WHERE id = pending_invitation.id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'invitation.accepted', pending_invitation.establishment_id, (SELECT auth.uid()),
    jsonb_build_object('invitation_id', pending_invitation.id, 'role', effective_role));

  RETURN QUERY SELECT effective_role, pending_invitation.establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.switch_active_establishment(target_establishment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE membership_role text;
BEGIN
  SELECT role INTO membership_role FROM public.memberships
  WHERE profile_id = (SELECT auth.uid()) AND establishment_id = target_establishment_id AND status = 'active';
  IF membership_role IS NULL THEN RAISE EXCEPTION 'membership_required'; END IF;
  UPDATE public.profiles
  SET establishment_id = target_establishment_id, role = membership_role,
      commission_rate = (SELECT commission_rate FROM public.memberships
        WHERE profile_id = (SELECT auth.uid()) AND establishment_id = target_establishment_id),
      updated_at = now()
  WHERE id = (SELECT auth.uid());
  RETURN membership_role;
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_professional(
  target_profile_id uuid,
  target_establishment_id uuid,
  updates jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE new_commission numeric;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships m WHERE m.profile_id = target_profile_id
      AND m.establishment_id = target_establishment_id AND m.role = 'professional' AND m.status = 'active'
  ) THEN RAISE EXCEPTION 'professional_membership_required'; END IF;

  IF updates ? 'commission_rate' THEN
    new_commission := (updates->>'commission_rate')::numeric;
    IF new_commission < 0 OR new_commission > 1 THEN RAISE EXCEPTION 'invalid_commission'; END IF;
    UPDATE public.memberships SET commission_rate = new_commission, updated_at = now()
    WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;
  END IF;

  UPDATE public.profiles SET
    commission_rate = COALESCE(new_commission, commission_rate),
    specialties = CASE WHEN updates ? 'specialties' THEN NULLIF(trim(updates->>'specialties'), '') ELSE specialties END,
    instagram = CASE WHEN updates ? 'instagram' THEN NULLIF(trim(updates->>'instagram'), '') ELSE instagram END,
    titulo_profissional = CASE WHEN updates ? 'titulo_profissional' THEN NULLIF(trim(updates->>'titulo_profissional'), '') ELSE titulo_profissional END,
    work_hours = CASE WHEN updates ? 'work_hours' THEN updates->>'work_hours' ELSE work_hours END,
    updated_at = now()
  WHERE id = target_profile_id;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'professional.updated', target_establishment_id, target_profile_id,
    jsonb_build_object('fields_changed', jsonb_object_length(updates)));
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_professional(target_profile_id uuid, target_establishment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE next_membership public.memberships%ROWTYPE;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN RAISE EXCEPTION 'forbidden'; END IF;
  UPDATE public.memberships SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id
    AND role = 'professional' AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_membership_required'; END IF;

  DELETE FROM public.profile_establishments
  WHERE profile_id = target_profile_id AND establishment_id = target_establishment_id;

  IF EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = target_profile_id AND p.establishment_id = target_establishment_id) THEN
    SELECT * INTO next_membership FROM public.memberships
    WHERE profile_id = target_profile_id AND status = 'active' ORDER BY created_at LIMIT 1;
    UPDATE public.profiles SET
      establishment_id = next_membership.establishment_id,
      role = COALESCE(next_membership.role, 'client'),
      commission_rate = COALESCE(next_membership.commission_rate, 0.50), updated_at = now()
    WHERE id = target_profile_id;
  END IF;

  INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, target_profile_id)
  VALUES ((SELECT auth.uid()), 'professional.removed', target_establishment_id, target_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_establishment_team(target_establishment_id uuid, include_administrators boolean DEFAULT true)
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, work_hours text, specialties text,
  instagram text, titulo_profissional text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, m.establishment_id, p.name, m.role, p.email, p.phone, p.avatar_url,
    m.commission_rate, p.work_hours, p.specialties, p.instagram, p.titulo_profissional
  FROM public.memberships m JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.establishment_id = target_establishment_id AND m.status = 'active'
    AND (include_administrators OR m.role = 'professional') AND p.deleted_at IS NULL
  ORDER BY p.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_public_team(target_establishment_id uuid)
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, work_hours text, specialties text,
  instagram text, titulo_profissional text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, m.establishment_id, p.name, m.role, ''::text, NULL::text, p.avatar_url,
    NULL::numeric, p.work_hours, p.specialties, p.instagram, p.titulo_profissional
  FROM public.memberships m JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.establishment_id = target_establishment_id AND m.status = 'active'
    AND m.role IN ('professional', 'admin') AND p.deleted_at IS NULL
  ORDER BY p.name;
$$;

CREATE OR REPLACE FUNCTION public.list_establishment_invitations(target_establishment_id uuid)
RETURNS TABLE (id uuid, invited_email text, role text, status text, expires_at timestamptz, created_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY SELECT i.id, i.invited_email, i.role,
    CASE WHEN i.status = 'pending' AND i.expires_at <= now() THEN 'expired' ELSE i.status END,
    i.expires_at, i.created_at
  FROM public.invitations i WHERE i.establishment_id = target_establishment_id ORDER BY i.created_at DESC LIMIT 50;
END;
$$;

ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.superadmins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.authorization_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inserção pública de barbearias" ON public.establishments;
DROP POLICY IF EXISTS "Admins podem atualizar barbearia" ON public.establishments;
CREATE POLICY "Membership admins update establishments" ON public.establishments
  FOR UPDATE TO authenticated
  USING (public.is_superadmin() OR public.has_active_membership(id, ARRAY['admin']))
  WITH CHECK (public.is_superadmin() OR public.has_active_membership(id, ARRAY['admin']));

DROP POLICY IF EXISTS "Qualquer autenticado lê perfis" ON public.profiles;
DROP POLICY IF EXISTS "Usuário atualiza próprio perfil" ON public.profiles;
CREATE POLICY "Authorized profile visibility" ON public.profiles
  FOR SELECT TO authenticated USING (public.can_view_profile(id));
CREATE POLICY "Users update own safe profile fields" ON public.profiles
  FOR UPDATE TO authenticated USING (id = (SELECT auth.uid())) WITH CHECK (id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "Usuários lêem seus próprios vínculos" ON public.profile_establishments;
DROP POLICY IF EXISTS "Admins gerenciam vínculos da sua barbearia" ON public.profile_establishments;
CREATE POLICY "Legacy links are readable by owner" ON public.profile_establishments
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()) OR public.is_superadmin());

CREATE POLICY "Memberships visible to authorized users" ON public.memberships
  FOR SELECT TO authenticated USING (
    profile_id = (SELECT auth.uid()) OR public.is_superadmin()
    OR public.has_active_membership(establishment_id, ARRAY['admin'])
  );
CREATE POLICY "Superadmin marker visible to owner" ON public.superadmins
  FOR SELECT TO authenticated USING (profile_id = (SELECT auth.uid()));
CREATE POLICY "Users read own establishment requests" ON public.establishment_requests
  FOR SELECT TO authenticated USING (requester_id = (SELECT auth.uid()) OR public.is_superadmin());
CREATE POLICY "Authorized users read audit trail" ON public.authorization_audit_log
  FOR SELECT TO authenticated USING (
    actor_id = (SELECT auth.uid()) OR public.is_superadmin()
    OR (establishment_id IS NOT NULL AND public.has_active_membership(establishment_id, ARRAY['admin']))
  );

DROP POLICY IF EXISTS "Admins e Barbeiros gerenciam serviços da sua barbearia" ON public.services;
CREATE POLICY "Members manage establishment services" ON public.services
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin', 'professional']))
  WITH CHECK (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin', 'professional']));

DROP POLICY IF EXISTS "Barbeiros e Admins gerenciam agendamentos da barbearia" ON public.appointments;
CREATE POLICY "Members manage establishment appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin', 'professional']))
  WITH CHECK (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin', 'professional']));

DROP POLICY IF EXISTS "Admins gerenciam professional_services" ON public.professional_services;
CREATE POLICY "Admins manage professional services" ON public.professional_services
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin']))
  WITH CHECK (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin']));

REVOKE INSERT ON public.establishments FROM anon, authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar_url, push_token) ON public.profiles TO authenticated;
REVOKE SELECT ON public.profiles FROM authenticated;
GRANT SELECT (id, name, phone, avatar_url) ON public.profiles TO authenticated;
GRANT SELECT ON public.memberships, public.superadmins, public.establishment_requests, public.authorization_audit_log TO authenticated;

REVOKE ALL ON FUNCTION public.is_superadmin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_membership(uuid, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_profile(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.request_establishment(text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_invitation(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.approve_establishment_request(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_establishment_request(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.inspect_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.accept_invitation(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.switch_active_establishment(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_professional(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.remove_professional(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_establishment_team(uuid, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_team(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.list_establishment_invitations(uuid) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_superadmin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_view_profile(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_establishment(text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_establishment_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_establishment_request(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.inspect_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.switch_active_establishment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_professional(uuid, uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_professional(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_establishment_team(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_team(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_establishment_invitations(uuid) TO authenticated;

COMMIT;