BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE OR REPLACE FUNCTION public.get_public_establishment_experience(target_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF target_slug IS NULL OR target_slug !~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_establishment_slug' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', establishment.id,
      'slug', establishment.slug,
      'name', establishment.name,
      'description', establishment.description,
      'slogan', establishment.slogan,
      'logoUrl', establishment.logo_url,
      'bannerUrl', establishment.banner_url,
      'galleryUrls', public.safe_jsonb_array(establishment.gallery_urls),
      'primaryColor', establishment.primary_color,
      'address', establishment.address,
      'phone', establishment.phone,
      'timezone', establishment.timezone,
      'currency', establishment.currency,
      'openingHours', establishment.opening_hours,
      'instantBookingEnabled', COALESCE(establishment.instant_booking_enabled, true),
      'publishedAt', establishment.published_at
    ),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'price', service.price,
        'durationMinutes', service.duration_minutes,
        'kind', service.kind
      ) ORDER BY service.sort_order, service.name)
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id AND service.is_active
    ), '[]'::jsonb),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', profile.id,
        'name', profile.name,
        'avatarUrl', profile.avatar_url,
        'title', profile.titulo_profissional,
        'specialties', profile.specialties,
        'profileSlug', CASE
          WHEN professional_profile.is_public THEN professional_profile.slug
          ELSE NULL
        END
      ) ORDER BY profile.name)
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      LEFT JOIN public.professional_profiles AS professional_profile
        ON professional_profile.id = membership.professional_profile_id
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.revoked_at IS NULL
        AND membership.role_template = 'professional'
        AND profile.deleted_at IS NULL
        AND profile.work_hours IS NOT NULL
        AND NULLIF(btrim(profile.titulo_profissional), '') IS NOT NULL
    ), '[]'::jsonb),
    'bookingMode', CASE WHEN COALESCE(establishment.instant_booking_enabled, true) THEN 'instant' ELSE 'request' END
  ) INTO result
  FROM public.establishments AS establishment
  WHERE establishment.slug = target_slug
    AND establishment.account_status = 'active'
    AND establishment.discovery_status = 'published';

  IF result IS NULL THEN
    RAISE EXCEPTION 'public_establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_publication_readiness(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  establishment public.establishments%ROWTYPE;
  eligible boolean;
  completion_points integer := 0;
  blockers text[] := ARRAY[]::text[];
  recommendations text[] := ARRAY[]::text[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active'
        AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner', 'manager'])
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO establishment
  FROM public.establishments
  WHERE id = target_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF establishment.account_status <> 'active' THEN blockers := blockers || ARRAY['account_not_active']; END IF;
  IF char_length(btrim(establishment.name)) < 2 THEN blockers := blockers || ARRAY['name_required']; END IF;
  IF establishment.slug !~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$' THEN blockers := blockers || ARRAY['slug_invalid']; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE establishment_id = target_establishment_id AND is_active
  ) THEN blockers := blockers || ARRAY['active_service_required']; END IF;

  eligible := cardinality(blockers) = 0;
  completion_points := completion_points
    + CASE WHEN NULLIF(btrim(COALESCE(establishment.description, '')), '') IS NOT NULL THEN 20 ELSE 0 END
    + CASE WHEN establishment.logo_url IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN establishment.banner_url IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN COALESCE(establishment.gallery_urls, '') NOT IN ('', '[]') THEN 15 ELSE 0 END
    + CASE WHEN establishment.address IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN establishment.phone IS NOT NULL THEN 10 ELSE 0 END
    + CASE WHEN establishment.opening_hours IS NOT NULL THEN 10 ELSE 0 END;

  IF establishment.description IS NULL THEN recommendations := recommendations || ARRAY['add_description']; END IF;
  IF establishment.logo_url IS NULL THEN recommendations := recommendations || ARRAY['add_logo']; END IF;
  IF establishment.banner_url IS NULL THEN recommendations := recommendations || ARRAY['add_banner']; END IF;
  IF COALESCE(establishment.gallery_urls, '') IN ('', '[]') THEN recommendations := recommendations || ARRAY['add_gallery']; END IF;

  RETURN jsonb_build_object(
    'eligible', eligible,
    'bookingMode', CASE WHEN COALESCE(establishment.instant_booking_enabled, true) THEN 'instant' ELSE 'request' END,
    'completenessScore', completion_points,
    'blockers', blockers,
    'recommendations', recommendations,
    'discoveryStatus', establishment.discovery_status,
    'publishedAt', establishment.published_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_experience(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_publication_readiness(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_establishment_experience(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_publication_readiness(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
