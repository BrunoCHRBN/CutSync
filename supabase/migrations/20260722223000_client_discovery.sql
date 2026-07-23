BEGIN;

CREATE OR REPLACE FUNCTION public.list_client_discovery_establishments(
  target_query text DEFAULT '',
  result_limit integer DEFAULT 30
)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  slogan text,
  description text,
  address text,
  logo_url text,
  banner_url text,
  primary_color text,
  timezone text,
  currency text,
  opening_hours text,
  average_rating numeric,
  review_count integer,
  average_price numeric,
  price_level integer,
  instant_booking_enabled boolean,
  service_count bigint,
  professional_count bigint,
  service_names text[],
  professional_names text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_query text := regexp_replace(btrim(COALESCE(target_query, '')), '[[:space:]]+', ' ', 'g');
  normalized_limit integer := LEAST(GREATEST(COALESCE(result_limit, 30), 1), 50);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_query) > 80
    OR NOT public.is_safe_client_profile_text(normalized_query)
  THEN
    RAISE EXCEPTION 'invalid_discovery_query';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.slogan,
    establishment.description,
    establishment.address,
    establishment.logo_url,
    establishment.banner_url,
    establishment.primary_color,
    establishment.timezone,
    establishment.currency,
    establishment.opening_hours,
    establishment.average_rating,
    establishment.review_count,
    establishment.average_price,
    establishment.price_level,
    establishment.instant_booking_enabled,
    (SELECT count(*)
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL),
    (SELECT count(*)
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.role IN ('admin', 'professional')
        AND profile.deleted_at IS NULL),
    ARRAY(
      SELECT service.name
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
      ORDER BY service.sort_order, service.name
      LIMIT 3
    ),
    ARRAY(
      SELECT profile.name
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.role IN ('admin', 'professional')
        AND profile.deleted_at IS NULL
      ORDER BY profile.name
      LIMIT 3
    )
  FROM public.establishments AS establishment
  WHERE establishment.account_status = 'active'
    AND (
      normalized_query = ''
      OR establishment.name ILIKE '%' || normalized_query || '%'
      OR COALESCE(establishment.slogan, '') ILIKE '%' || normalized_query || '%'
      OR COALESCE(establishment.address, '') ILIKE '%' || normalized_query || '%'
      OR EXISTS (
        SELECT 1
        FROM public.services AS service
        WHERE service.establishment_id = establishment.id
          AND service.is_active
          AND service.deleted_at IS NULL
          AND service.name ILIKE '%' || normalized_query || '%'
      )
      OR EXISTS (
        SELECT 1
        FROM public.memberships AS membership
        JOIN public.profiles AS profile ON profile.id = membership.profile_id
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.role IN ('admin', 'professional')
          AND profile.deleted_at IS NULL
          AND (
            profile.name ILIKE '%' || normalized_query || '%'
            OR COALESCE(profile.specialties, '') ILIKE '%' || normalized_query || '%'
            OR COALESCE(profile.titulo_profissional, '') ILIKE '%' || normalized_query || '%'
          )
      )
    )
  ORDER BY
    CASE WHEN normalized_query <> '' AND establishment.name ILIKE normalized_query || '%' THEN 0 ELSE 1 END,
    establishment.average_rating DESC,
    establishment.name
  LIMIT normalized_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_client_discovery_establishment(target_slug text)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  slogan text,
  description text,
  address text,
  logo_url text,
  banner_url text,
  primary_color text,
  timezone text,
  currency text,
  opening_hours text,
  average_rating numeric,
  review_count integer,
  average_price numeric,
  price_level integer,
  instant_booking_enabled boolean,
  services jsonb,
  professionals jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_slug text := lower(btrim(COALESCE(target_slug, '')));
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(normalized_slug) NOT BETWEEN 1 AND 120
    OR normalized_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    OR NOT public.is_safe_client_profile_text(normalized_slug)
  THEN
    RAISE EXCEPTION 'invalid_establishment_slug';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.slogan,
    establishment.description,
    establishment.address,
    establishment.logo_url,
    establishment.banner_url,
    establishment.primary_color,
    establishment.timezone,
    establishment.currency,
    establishment.opening_hours,
    establishment.average_rating,
    establishment.review_count,
    establishment.average_price,
    establishment.price_level,
    establishment.instant_booking_enabled,
    COALESCE((
      SELECT jsonb_agg(to_jsonb(service_row) ORDER BY service_row.sort_order, service_row.name)
      FROM (
        SELECT service.id, service.name, service.price, service.duration_minutes, service.sort_order
        FROM public.services AS service
        WHERE service.establishment_id = establishment.id
          AND service.is_active
          AND service.deleted_at IS NULL
      ) AS service_row
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(professional_row) ORDER BY professional_row.name)
      FROM (
        SELECT
          profile.id,
          profile.name,
          profile.avatar_url,
          profile.titulo_profissional,
          profile.specialties,
          CASE WHEN public_profile.is_public THEN public_profile.slug ELSE NULL END AS profile_slug
        FROM public.memberships AS membership
        JOIN public.profiles AS profile ON profile.id = membership.profile_id
        LEFT JOIN public.professional_profiles AS public_profile
          ON public_profile.id = membership.professional_profile_id
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.role IN ('admin', 'professional')
          AND profile.deleted_at IS NULL
      ) AS professional_row
    ), '[]'::jsonb)
  FROM public.establishments AS establishment
  WHERE establishment.slug = normalized_slug
    AND establishment.account_status = 'active';
END;
$$;

REVOKE ALL ON FUNCTION public.list_client_discovery_establishments(text, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_client_discovery_establishment(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_client_discovery_establishments(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_discovery_establishment(text) TO authenticated;

COMMIT;
