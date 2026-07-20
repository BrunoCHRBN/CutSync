BEGIN;

-- 1. RPC para criação de estabelecimento e auto-promoção atômica (CNPJ)
CREATE OR REPLACE FUNCTION public.create_establishment_and_promote_owner(
  target_user_id UUID,
  target_cnpj TEXT,
  requested_name TEXT,
  requested_slug TEXT,
  requested_address TEXT,
  requested_phone TEXT,
  requested_primary_color TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_establishment_id UUID;
  normalized_slug TEXT := lower(trim(requested_slug));
BEGIN
  -- Validar unicidade de CNPJ
  IF EXISTS (SELECT 1 FROM public.establishments WHERE document_number = target_cnpj) THEN
    RAISE EXCEPTION 'cnpj_already_registered';
  END IF;

  -- Validar unicidade de slug
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug) = normalized_slug) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  -- Inserir estabelecimento no Nível 1
  INSERT INTO public.establishments (
    name, slug, address, phone, primary_color, document_number, document_type, account_status, verification_level
  ) VALUES (
    trim(requested_name), normalized_slug, trim(requested_address), trim(requested_phone), upper(requested_primary_color), target_cnpj, 'CNPJ', 'pending_verification', 1
  ) RETURNING id INTO new_establishment_id;

  -- Criar membership como admin (proprietário)
  INSERT INTO public.memberships (profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES (target_user_id, new_establishment_id, 'admin', 'active', 0.50, target_user_id)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();

  -- Atualizar tabela profiles
  UPDATE public.profiles
  SET establishment_id = new_establishment_id,
      role = 'admin',
      updated_at = now()
  WHERE id = target_user_id;

  -- Atualizar tabela profile_establishments
  INSERT INTO public.profile_establishments (profile_id, establishment_id, role)
  VALUES (target_user_id, new_establishment_id, 'admin')
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  -- Registrar log de auditoria
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    target_user_id,
    'establishment.auto_promoted',
    new_establishment_id,
    'establishment',
    jsonb_build_object('cnpj', target_cnpj, 'name', requested_name, 'slug', requested_slug)
  );

  RETURN new_establishment_id;
END;
$$;

-- 2. RPC para criação de estabelecimento e auto-promoção atômica (CPF Autônomo)
CREATE OR REPLACE FUNCTION public.create_establishment_cpf(
  target_user_id UUID,
  target_cpf TEXT,
  requested_name TEXT,
  requested_slug TEXT,
  requested_address TEXT,
  requested_phone TEXT,
  requested_primary_color TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  new_establishment_id UUID;
  normalized_slug TEXT := lower(trim(requested_slug));
BEGIN
  -- Validar unicidade de CPF
  IF EXISTS (SELECT 1 FROM public.establishments WHERE document_number = target_cpf) THEN
    RAISE EXCEPTION 'cpf_already_registered';
  END IF;

  -- Validar unicidade de slug
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug) = normalized_slug) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  -- Inserir estabelecimento no Nível 1 com WhatsApp verificado
  INSERT INTO public.establishments (
    name, slug, address, phone, primary_color, document_number, document_type, account_status, verification_level, whatsapp_verified
  ) VALUES (
    trim(requested_name), normalized_slug, trim(requested_address), trim(requested_phone), upper(requested_primary_color), target_cpf, 'CPF', 'pending_verification', 1, true
  ) RETURNING id INTO new_establishment_id;

  -- Criar membership como admin (proprietário)
  INSERT INTO public.memberships (profile_id, establishment_id, role, status, commission_rate, created_by)
  VALUES (target_user_id, new_establishment_id, 'admin', 'active', 0.50, target_user_id)
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();

  -- Atualizar tabela profiles
  UPDATE public.profiles
  SET establishment_id = new_establishment_id,
      role = 'admin',
      updated_at = now()
  WHERE id = target_user_id;

  -- Atualizar tabela profile_establishments
  INSERT INTO public.profile_establishments (profile_id, establishment_id, role)
  VALUES (target_user_id, new_establishment_id, 'admin')
  ON CONFLICT (profile_id, establishment_id) DO UPDATE SET role = EXCLUDED.role, updated_at = now();

  -- Registrar log de auditoria
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    target_user_id,
    'establishment.auto_promoted_cpf',
    new_establishment_id,
    'establishment',
    jsonb_build_object('cpf', target_cpf, 'name', requested_name, 'slug', requested_slug)
  );

  RETURN new_establishment_id;
END;
$$;

-- Revogar execução pública por motivos de segurança
REVOKE ALL ON FUNCTION public.create_establishment_and_promote_owner(uuid, text, text, text, text, text, text) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_establishment_cpf(uuid, text, text, text, text, text, text) FROM public, anon, authenticated;

COMMIT;
