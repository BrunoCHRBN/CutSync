BEGIN;

-- 20260731000000 replaced the safe trigger body from 20260730040412 and
-- referenced fields that do not exist on every TG_TABLE_NAME record. Resolve
-- the target only inside the matching branch so PostgreSQL never dereferences
-- NEW.establishment_id for an establishments trigger.
CREATE OR REPLACE FUNCTION public.enforce_establishment_discovery_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid;
  status_state text;
  requirement_state jsonb;
BEGIN
  IF TG_TABLE_NAME = 'services' THEN
    target_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.establishment_id
      ELSE NEW.establishment_id
    END;
  ELSIF TG_TABLE_NAME = 'establishments' THEN
    target_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END;
  ELSE
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT establishment.discovery_status
  INTO STRICT status_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_id;

  IF status_state = 'published' THEN
    requirement_state := public.establishment_discovery_requirements(target_id);
    IF EXISTS (
      SELECT 1
      FROM jsonb_each_text(requirement_state) AS requirement
      WHERE requirement.value <> 'true'
    ) THEN
      UPDATE public.establishments
      SET discovery_status = 'draft',
          published_at = NULL
      WHERE id = target_id
        AND discovery_status = 'published';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_establishment_discovery_eligibility()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_establishment_discovery_eligibility()
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
