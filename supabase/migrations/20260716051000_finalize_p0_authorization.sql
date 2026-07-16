BEGIN;

-- Esta migration complementar é intencionalmente idempotente: corrige projetos
-- onde a primeira versão do P0 já tenha sido registrada pelo Supabase.
CREATE OR REPLACE FUNCTION public.bootstrap_superadmins_from_config()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  configured_emails text := current_setting('app.settings.cutsync_superadmin_emails', true);
  inserted_count integer := 0;
BEGIN
  IF trim(COALESCE(configured_emails, '')) = '' THEN RETURN 0; END IF;

  WITH allowed_email AS (
    SELECT lower(trim(value)) AS email
    FROM unnest(string_to_array(configured_emails, ',')) AS value
    WHERE trim(value) <> ''
  )
  INSERT INTO public.superadmins(profile_id, granted_by)
  SELECT p.id, NULL
  FROM public.profiles p
  JOIN allowed_email allowed ON allowed.email = lower(p.email)
  WHERE p.deleted_at IS NULL
  ON CONFLICT (profile_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

SELECT public.bootstrap_superadmins_from_config();

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
  SELECT p.id, active_membership.establishment_id, p.name,
    COALESCE(active_membership.role, 'client'), p.email, p.phone, p.avatar_url,
    COALESCE(active_membership.commission_rate, p.commission_rate), p.push_token,
    p.work_hours, p.specialties, p.instagram, p.titulo_profissional, p.deleted_at
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT m.establishment_id, m.role, m.commission_rate
    FROM public.memberships m
    WHERE m.profile_id = p.id AND m.status = 'active'
    ORDER BY (m.establishment_id = p.establishment_id) DESC, m.created_at
    LIMIT 1
  ) active_membership ON true
  WHERE p.id = (SELECT auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.protect_profile_authorization_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (SELECT auth.uid()) = OLD.id
    AND current_setting('app.cutsync_authorization_write', true) IS DISTINCT FROM 'trusted'
    AND (
      NEW.role IS DISTINCT FROM OLD.role
      OR NEW.establishment_id IS DISTINCT FROM OLD.establishment_id
      OR NEW.commission_rate IS DISTINCT FROM OLD.commission_rate
    )
  THEN RAISE EXCEPTION 'protected_profile_fields'; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS protect_profile_authorization_fields ON public.profiles;
CREATE TRIGGER protect_profile_authorization_fields
  BEFORE UPDATE OF role, establishment_id, commission_rate ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.protect_profile_authorization_fields();

REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar_url, push_token) ON public.profiles TO authenticated;
REVOKE ALL ON FUNCTION public.bootstrap_superadmins_from_config() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.protect_profile_authorization_fields() FROM PUBLIC;

COMMIT;