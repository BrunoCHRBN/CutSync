BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Restore the persisted discovery transition that was lost when publication
-- authorization moved to the capability model in 20260824005000.
CREATE OR REPLACE FUNCTION public.publish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (discovery_status text, published_at timestamptz, requirements jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE requirement_state jsonb;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'manage_operational_settings')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active'
        AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner'])
    )
  THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  requirement_state := public.establishment_discovery_requirements(target_establishment_id);
  IF requirement_state IS NULL THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT COALESCE((requirement_state->>'account_active')::boolean, false)
    OR NOT COALESCE((requirement_state->>'name_valid')::boolean, false)
    OR NOT COALESCE((requirement_state->>'slug_valid')::boolean, false)
    OR NOT COALESCE((requirement_state->>'active_service_present')::boolean, false)
  THEN
    RAISE EXCEPTION 'discovery_requirements_not_met' USING ERRCODE = '22023';
  END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'published',
      published_at = COALESCE(establishment.published_at, now()),
      updated_at = now()
  WHERE establishment.id = target_establishment_id;

  RETURN QUERY
  SELECT establishment.discovery_status, establishment.published_at, requirement_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_establishment_discovery(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_establishment_discovery(uuid)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
