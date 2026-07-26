BEGIN;

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS discovery_status text NOT NULL DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS published_at timestamptz;

ALTER TABLE public.establishments
  DROP CONSTRAINT IF EXISTS establishments_discovery_status_check;

ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_discovery_status_check
  CHECK (discovery_status IN ('draft', 'published'));

CREATE INDEX IF NOT EXISTS establishments_public_discovery_idx
  ON public.establishments (discovery_status, account_status, name)
  WHERE discovery_status = 'published';

CREATE OR REPLACE FUNCTION public.establishment_discovery_requirements(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_build_object(
    'account_active', COALESCE(establishment.account_status = 'active', false),
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
  )
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
$$;

CREATE OR REPLACE FUNCTION public.get_establishment_discovery_publication(target_establishment_id uuid)
RETURNS TABLE (
  discovery_status text,
  published_at timestamptz,
  requirements jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    establishment.discovery_status,
    establishment.published_at,
    public.establishment_discovery_requirements(establishment.id)
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

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
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  requirement_state := public.establishment_discovery_requirements(target_establishment_id);
  IF requirement_state IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(requirement_state) AS requirement
    WHERE requirement.value <> 'true'
  ) THEN
    RAISE EXCEPTION 'discovery_requirements_not_met';
  END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'published',
      published_at = COALESCE(establishment.published_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  WHERE establishment.id = target_establishment_id;

  RETURN QUERY
  SELECT 'published'::text, establishment.published_at, requirement_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.unpublish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (
  discovery_status text,
  published_at timestamptz,
  requirements jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'draft',
      published_at = NULL,
      updated_at = timezone('utc', now())
  WHERE establishment.id = target_establishment_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  RETURN QUERY
  SELECT
    establishment.discovery_status,
    establishment.published_at,
    public.establishment_discovery_requirements(establishment.id)
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
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
$$;

CREATE OR REPLACE FUNCTION public.enforce_establishment_discovery_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid := (
    CASE WHEN TG_TABLE_NAME = 'services'
      THEN COALESCE(NEW.establishment_id::text, OLD.establishment_id::text)
      ELSE COALESCE(NEW.id::text, OLD.id::text)
    END
  )::uuid;
  status_state text;
  requirement_state jsonb;
BEGIN
  SELECT establishment.discovery_status
  INTO STRICT status_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_id;

  IF status_state = 'published' THEN
    requirement_state := public.establishment_discovery_requirements(target_id);
    IF EXISTS (
      SELECT 1 FROM jsonb_each_text(requirement_state) AS requirement
      WHERE requirement.value <> 'true'
    ) THEN
      UPDATE public.establishments
      SET discovery_status = 'draft', published_at = NULL
      WHERE id = target_id AND discovery_status = 'published';
    END IF;
  END IF;
  RETURN COALESCE(NEW, OLD);
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS enforce_discovery_after_establishment_change ON public.establishments;
CREATE TRIGGER enforce_discovery_after_establishment_change
AFTER UPDATE OF account_status, name, slug, address ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.enforce_establishment_discovery_eligibility();

DROP TRIGGER IF EXISTS enforce_discovery_after_service_change ON public.services;
CREATE TRIGGER enforce_discovery_after_service_change
AFTER INSERT OR UPDATE OF is_active, deleted_at, establishment_id OR DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.enforce_establishment_discovery_eligibility();

UPDATE public.establishments AS establishment
SET discovery_status = 'published',
    published_at = COALESCE(establishment.published_at, timezone('utc', now()))
WHERE establishment.account_status = 'active'
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
  );

REVOKE ALL ON FUNCTION public.establishment_discovery_requirements(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_establishment_discovery_publication(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_establishment_discovery(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unpublish_establishment_discovery(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_public_discovery_establishments(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_establishment_discovery_eligibility() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_establishment_discovery_publication(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_establishment_discovery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unpublish_establishment_discovery(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_public_discovery_establishments(integer) TO anon, authenticated;

COMMIT;
