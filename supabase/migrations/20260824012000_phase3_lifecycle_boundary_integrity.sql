-- ============================================================================
-- Migration: 20260824012000_phase3_lifecycle_boundary_integrity.sql
-- Module: PS3-E1.2 Lifecycle Boundary Integrity & Regression Signal Gate
-- ============================================================================

-- 1. Redefine establishment_discovery_requirements to include lifecycle_active
CREATE OR REPLACE FUNCTION public.establishment_discovery_requirements(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'account_active', COALESCE(establishment.account_status = 'active', false),
    'lifecycle_active', COALESCE(establishment.lifecycle_status = 'active', false),
    'name_valid', (
      char_length(btrim(establishment.name)) >= 3
      AND btrim(establishment.name) !~* '^shop[[:space:]_-]*[0-9]+$'
    ),
    'slug_valid', btrim(establishment.slug) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    'address_present', char_length(btrim(COALESCE(establishment.address, ''))) >= 3,
    'active_service_present', EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    )
  ) INTO res
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.establishment_discovery_requirements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.establishment_discovery_requirements(uuid) TO authenticated, service_role;

-- 2. Update trigger on establishments to also watch lifecycle_status for discovery eligibility
DROP TRIGGER IF EXISTS enforce_discovery_after_establishment_change ON public.establishments;
CREATE TRIGGER enforce_discovery_after_establishment_change
  AFTER UPDATE OF account_status, lifecycle_status, name, slug, address ON public.establishments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_establishment_discovery_eligibility();

-- 3. Redefine list_public_discovery_establishments ensuring both active account & active lifecycle
CREATE OR REPLACE FUNCTION public.list_public_discovery_establishments(result_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  address text,
  logo_url text,
  banner_url text,
  timezone text,
  currency text,
  opening_hours text,
  average_rating numeric,
  review_count integer,
  discovery_status text,
  published_at timestamptz,
  services jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.description,
    establishment.address,
    establishment.logo_url,
    establishment.banner_url,
    establishment.timezone,
    establishment.currency,
    establishment.opening_hours,
    establishment.average_rating,
    establishment.review_count,
    establishment.discovery_status,
    establishment.published_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'price', service.price,
        'is_active', service.is_active
      ) ORDER BY service.sort_order, service.name)
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    ), '[]'::jsonb)
  FROM public.establishments AS establishment
  WHERE establishment.discovery_status = 'published'
    AND establishment.account_status = 'active'
    AND establishment.lifecycle_status = 'active'
    AND char_length(btrim(establishment.name)) >= 3
    AND btrim(establishment.name) !~* '^shop[[:space:]_-]*[0-9]+$'
    AND btrim(establishment.slug) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND char_length(btrim(COALESCE(establishment.address, ''))) >= 3
    AND EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    )
  ORDER BY establishment.average_rating DESC, establishment.name
  LIMIT LEAST(GREATEST(COALESCE(result_limit, 50), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_discovery_establishments(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_discovery_establishments(integer) TO anon, authenticated, service_role;

-- 4. Redefine publish_establishment_discovery guarding against inactive lifecycle/account
CREATE OR REPLACE FUNCTION public.publish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (
  discovery_status text,
  published_at timestamptz,
  requirements jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requirement_state jsonb;
  establishment_record public.establishments%ROWTYPE;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'manage_operational_settings')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active' AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner'])
    )
  THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;

  SELECT * INTO establishment_record
  FROM public.establishments
  WHERE id = target_establishment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;

  IF establishment_record.account_status <> 'active' OR establishment_record.lifecycle_status <> 'active' THEN
    RAISE EXCEPTION 'FORBIDDEN: cannot publish when account or lifecycle not active' USING ERRCODE = '42501';
  END IF;

  requirement_state := public.establishment_discovery_requirements(target_establishment_id);
  IF requirement_state IS NULL THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(requirement_state) AS requirement
    WHERE requirement.value <> 'true'
  ) THEN
    RAISE EXCEPTION 'discovery_requirements_not_met' USING ERRCODE = '22023';
  END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'published',
      published_at = COALESCE(establishment.published_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  WHERE establishment.id = target_establishment_id;

  RETURN QUERY
  SELECT
    establishment.discovery_status,
    establishment.published_at,
    requirement_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_establishment_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_establishment_discovery(uuid) TO authenticated, service_role;

-- 5. Redefine create_appointment using capability authority (can_operate_business_appointment)
CREATE OR REPLACE FUNCTION public.create_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_client_name text DEFAULT NULL,
  target_client_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  establishment_status text;
  establishment_lifecycle text;
  actor_is_staff boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT establishment.account_status, establishment.lifecycle_status
  INTO establishment_status, establishment_lifecycle
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;

  actor_is_staff := public.is_superadmin()
    OR public.can_operate_business_appointment(target_establishment_id, target_professional_id);

  -- Client bookings require both active governance and active operational lifecycle
  IF NOT actor_is_staff THEN
    IF establishment_status <> 'active' OR establishment_lifecycle <> 'active' THEN
      RAISE EXCEPTION 'establishment_unavailable';
    END IF;
  ELSE
    -- Staff internal booking is blocked if governance blocks or unit is paused/closed/archived
    IF establishment_lifecycle IN ('paused', 'closed', 'archived')
      OR establishment_status IN ('blocked', 'delinquent')
    THEN
      RAISE EXCEPTION 'establishment_unavailable';
    END IF;
  END IF;

  PERFORM profile.id FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  RETURN public.create_appointment_before_schedule_blocks(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    target_client_name,
    target_client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated, service_role;
