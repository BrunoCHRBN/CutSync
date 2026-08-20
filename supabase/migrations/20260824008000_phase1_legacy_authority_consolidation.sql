BEGIN;

-- ============================================================================
-- PS1-E1C — Legacy Authority Consolidation & Regression Guard
-- Consolidates legacy compatibility endpoints into passive projections,
-- eliminates dynamic writes to profiles.role, and logs legacy RPC telemetry.
-- ============================================================================

-- 0. Helper: project_legacy_role_from_template
CREATE OR REPLACE FUNCTION public.project_legacy_role_from_template(target_role_template text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE target_role_template
    WHEN 'admin' THEN 'admin'
    WHEN 'manager' THEN 'admin'
    WHEN 'professional' THEN 'professional'
    WHEN 'reception' THEN 'professional'
    WHEN 'cashier' THEN 'professional'
    WHEN 'finance' THEN 'professional'
    ELSE 'client'
  END;
$$;

GRANT EXECUTE ON FUNCTION public.project_legacy_role_from_template(text) TO authenticated, service_role, anon;

-- 1. switch_active_establishment (Legacy Compatibility v1 RPC)
-- Transforms into a pure legacy hint writer without mutating profiles.role
-- or granting authorization. Logs telemetry to security_audit_logs.
CREATE OR REPLACE FUNCTION public.switch_active_establishment(target_establishment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  membership_record public.memberships%ROWTYPE;
  projected_role text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthenticated';
  END IF;

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'target_establishment_required';
  END IF;

  -- Validate active membership fail-closed
  SELECT * INTO membership_record
  FROM public.memberships
  WHERE profile_id = actor_id
    AND establishment_id = target_establishment_id
    AND status = 'active'
    AND revoked_at IS NULL;

  IF membership_record.id IS NULL THEN
    RAISE EXCEPTION 'membership_required';
  END IF;

  projected_role := COALESCE(
    public.project_legacy_role_from_template(membership_record.role_template),
    membership_record.role,
    'professional'
  );

  -- Update legacy last-visited hint ONLY. Never mutate profiles.role.
  UPDATE public.profiles
  SET establishment_id = target_establishment_id,
      updated_at = timezone('utc', now())
  WHERE id = actor_id;

  -- Telemetry logging for legacy v1 switch RPC usage
  INSERT INTO public.security_audit_logs (
    actor_id,
    action,
    target_id,
    target_type,
    changes
  ) VALUES (
    actor_id,
    'legacy.switch_active_establishment.used',
    target_establishment_id,
    'establishment',
    jsonb_build_object(
      'invoked_at', timezone('utc', now()),
      'projected_role', projected_role,
      'role_template', membership_record.role_template
    )
  );

  RETURN projected_role;
END;
$$;

REVOKE ALL ON FUNCTION public.switch_active_establishment(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.switch_active_establishment(uuid) TO authenticated, service_role;

-- 2. remove_professional (Team Management RPC)
-- Revokes membership without mutating the user's personal identity or profiles.role.
CREATE OR REPLACE FUNCTION public.remove_professional(
  target_profile_id uuid,
  target_establishment_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  next_membership public.memberships%ROWTYPE;
BEGIN
  -- Capability authority gate
  IF NOT public.has_business_capability(target_establishment_id, 'manage_team')
    AND NOT public.is_superadmin()
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF char_length(trim(COALESCE(reason, ''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'revocation_reason_required';
  END IF;

  -- Revoke the active membership
  UPDATE public.memberships
  SET status = 'revoked',
      revoked_at = timezone('utc', now()),
      revocation_reason = trim(reason),
      updated_at = timezone('utc', now())
  WHERE profile_id = target_profile_id
    AND establishment_id = target_establishment_id
    AND status = 'active';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'professional_membership_required';
  END IF;

  -- Clean up legacy mirror link
  DELETE FROM public.profile_establishments
  WHERE profile_id = target_profile_id
    AND establishment_id = target_establishment_id;

  -- If profiles.establishment_id pointed to the removed establishment, update the hint
  -- to another active establishment or NULL, without mutating profiles.role.
  IF EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = target_profile_id
      AND profile.establishment_id = target_establishment_id
  ) THEN
    SELECT * INTO next_membership
    FROM public.memberships
    WHERE profile_id = target_profile_id
      AND status = 'active'
      AND revoked_at IS NULL
    ORDER BY created_at
    LIMIT 1;

    UPDATE public.profiles
    SET establishment_id = next_membership.establishment_id,
        updated_at = timezone('utc', now())
    WHERE id = target_profile_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_professional(uuid, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_professional(uuid, uuid, text) TO authenticated, service_role;

-- 3. has_active_membership (Hardened Legacy Helper)
-- Evaluates allowed_roles dynamically against projected role_template.
CREATE OR REPLACE FUNCTION public.has_active_membership(
  target_establishment_id uuid,
  allowed_roles text[] DEFAULT NULL::text[]
)
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
      AND m.revoked_at IS NULL
      AND (
        allowed_roles IS NULL
        OR COALESCE(public.project_legacy_role_from_template(m.role_template), m.role) = ANY(allowed_roles)
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_active_membership(uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_active_membership(uuid, text[]) TO authenticated, service_role;

-- 4. get_my_profile (Projected Legacy Profile Reader)
-- Derives role dynamically from active memberships and role_template, never trusting profiles.role.
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE(
  id uuid,
  establishment_id uuid,
  name text,
  role text,
  email text,
  phone text,
  avatar_url text,
  commission_rate numeric,
  push_token text,
  work_hours text,
  specialties text,
  instagram text,
  titulo_profissional text,
  pix_key text,
  deleted_at timestamp with time zone
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    p.id,
    active_membership.establishment_id,
    p.name,
    COALESCE(
      public.project_legacy_role_from_template(active_membership.role_template),
      active_membership.role,
      'client'
    ) AS role,
    p.email,
    p.phone,
    p.avatar_url,
    COALESCE(active_membership.commission_rate, p.commission_rate) AS commission_rate,
    p.push_token,
    p.work_hours,
    p.specialties,
    p.instagram,
    p.titulo_profissional,
    p.pix_key,
    p.deleted_at
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT m.establishment_id, m.role, m.role_template, m.commission_rate
    FROM public.memberships m
    WHERE m.profile_id = p.id
      AND m.status = 'active'
      AND m.revoked_at IS NULL
    ORDER BY (m.establishment_id = p.establishment_id) DESC, m.created_at
    LIMIT 1
  ) active_membership ON true
  WHERE p.id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

COMMIT;
