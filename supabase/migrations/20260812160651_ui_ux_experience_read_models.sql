BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE OR REPLACE FUNCTION public.safe_jsonb_array(target_value text)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE parsed jsonb;
BEGIN
  IF target_value IS NULL OR btrim(target_value) = '' THEN RETURN '[]'::jsonb; END IF;
  BEGIN
    parsed := target_value::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN '[]'::jsonb;
  END;
  RETURN CASE WHEN jsonb_typeof(parsed) = 'array' THEN parsed ELSE '[]'::jsonb END;
END;
$$;

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
        'profileSlug', profile.profile_slug
      ) ORDER BY profile.name)
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
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

  IF result IS NULL THEN RAISE EXCEPTION 'public_establishment_not_found' USING ERRCODE = 'P0002'; END IF;
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
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active' AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner', 'manager'])
    )
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO establishment FROM public.establishments WHERE id = target_establishment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF establishment.account_status <> 'active' THEN blockers := blockers || 'account_not_active'; END IF;
  IF char_length(btrim(establishment.name)) < 2 THEN blockers := blockers || 'name_required'; END IF;
  IF establishment.slug !~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$' THEN blockers := blockers || 'slug_invalid'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services WHERE establishment_id = target_establishment_id AND is_active) THEN blockers := blockers || 'active_service_required'; END IF;
  eligible := cardinality(blockers) = 0;

  completion_points := completion_points
    + CASE WHEN NULLIF(btrim(COALESCE(establishment.description, '')), '') IS NOT NULL THEN 20 ELSE 0 END
    + CASE WHEN establishment.logo_url IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN establishment.banner_url IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN COALESCE(establishment.gallery_urls, '') NOT IN ('', '[]') THEN 15 ELSE 0 END
    + CASE WHEN establishment.address IS NOT NULL THEN 15 ELSE 0 END
    + CASE WHEN establishment.phone IS NOT NULL THEN 10 ELSE 0 END
    + CASE WHEN establishment.opening_hours IS NOT NULL THEN 10 ELSE 0 END;
  IF establishment.description IS NULL THEN recommendations := recommendations || 'add_description'; END IF;
  IF establishment.logo_url IS NULL THEN recommendations := recommendations || 'add_logo'; END IF;
  IF establishment.banner_url IS NULL THEN recommendations := recommendations || 'add_banner'; END IF;
  IF COALESCE(establishment.gallery_urls, '') IN ('', '[]') THEN recommendations := recommendations || 'add_gallery'; END IF;

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

CREATE OR REPLACE FUNCTION public.publish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (discovery_status text, published_at timestamptz, requirements jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE requirement_state jsonb;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active' AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner'])
    )
  THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;

  requirement_state := public.establishment_discovery_requirements(target_establishment_id);
  IF requirement_state IS NULL THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT COALESCE((requirement_state->>'account_active')::boolean, false)
    OR NOT COALESCE((requirement_state->>'name_valid')::boolean, false)
    OR NOT COALESCE((requirement_state->>'slug_valid')::boolean, false)
    OR NOT COALESCE((requirement_state->>'active_service_present')::boolean, false)
  THEN RAISE EXCEPTION 'discovery_requirements_not_met' USING ERRCODE = '22023'; END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'published',
      published_at = COALESCE(establishment.published_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  WHERE establishment.id = target_establishment_id;

  RETURN QUERY SELECT 'published'::text, establishment.published_at, requirement_state
  FROM public.establishments AS establishment WHERE establishment.id = target_establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_command_center(
  target_establishment_id uuid,
  target_local_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  can_manage boolean;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'view_team_agenda', 'full') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT timezone INTO target_timezone FROM public.establishments WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;
  can_manage := public.has_business_capability(target_establishment_id, actor_id, 'create_team_walk_in', 'full');

  SELECT jsonb_build_object(
    'establishmentId', target_establishment_id,
    'localDate', target_local_date,
    'generatedAt', now(),
    'allowedActions', CASE WHEN can_manage THEN jsonb_build_array('open_agenda', 'create_appointment') ELSE jsonb_build_array('open_agenda') END,
    'items', COALESCE(jsonb_agg(item.payload ORDER BY item.priority_rank, item.due_at, item.id), '[]'::jsonb)
  ) INTO result
  FROM (
    SELECT
      appointment.id,
      appointment.date_time AS due_at,
      CASE WHEN appointment.date_time < now() THEN 1 ELSE 2 END AS priority_rank,
      jsonb_build_object(
        'id', appointment.id,
        'type', CASE WHEN appointment.date_time < now() THEN 'appointment_delay' ELSE 'appointment_confirmation' END,
        'priority', CASE WHEN appointment.date_time < now() THEN 'critical' ELSE 'high' END,
        'dueAt', appointment.date_time,
        'title', CASE WHEN appointment.date_time < now() THEN 'Atendimento com possível atraso' ELSE 'Confirmação pendente' END,
        'description', COALESCE(establishment_client.display_name, appointment.client_name, client.name, 'Cliente') || ' · ' || service.name,
        'contextId', appointment.id,
        'route', '/(admin)?appointmentId=' || appointment.id::text,
        'allowedActions', CASE WHEN can_manage THEN jsonb_build_array('open', 'confirm') ELSE jsonb_build_array('open') END
      ) AS payload
    FROM public.appointments AS appointment
    JOIN public.services AS service ON service.id = appointment.service_id
    LEFT JOIN public.establishment_clients AS establishment_client ON establishment_client.id = appointment.establishment_client_id
    LEFT JOIN public.profiles AS client ON client.id = appointment.client_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.status = 'pending'
      AND (appointment.date_time AT TIME ZONE target_timezone)::date = target_local_date
  ) AS item;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_professional_daily_focus(
  target_establishment_id uuid,
  target_local_date date DEFAULT CURRENT_DATE
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'view_own_agenda', 'full') THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT timezone INTO target_timezone FROM public.establishments WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;

  SELECT jsonb_build_object(
    'establishmentId', target_establishment_id,
    'professionalId', actor_id,
    'localDate', target_local_date,
    'generatedAt', now(),
    'appointments', COALESCE(jsonb_agg(item.payload ORDER BY item.starts_at), '[]'::jsonb)
  ) INTO result
  FROM (
    SELECT appointment.date_time AS starts_at, jsonb_build_object(
      'appointmentId', appointment.id,
      'serviceId', appointment.service_id,
      'startsAt', appointment.date_time,
      'endsAt', appointment.ends_at,
      'updatedAt', appointment.updated_at,
      'durationMinutes', appointment.duration_minutes,
      'status', appointment.status,
      'clientDisplayName', COALESCE(establishment_client.display_name, appointment.client_name, client.name, 'Cliente'),
      'serviceName', service.name,
      'businessNotes', appointment.business_notes,
      'allowedActions', CASE appointment.status
        WHEN 'pending' THEN jsonb_build_array('open', 'confirm')
        WHEN 'confirmed' THEN jsonb_build_array('open', 'complete', 'request_reassignment')
        ELSE jsonb_build_array('open') END
    ) AS payload
    FROM public.appointments AS appointment
    JOIN public.services AS service ON service.id = appointment.service_id
    LEFT JOIN public.establishment_clients AS establishment_client ON establishment_client.id = appointment.establishment_client_id
    LEFT JOIN public.profiles AS client ON client.id = appointment.client_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.professional_id = actor_id
      AND appointment.deleted_at IS NULL
      AND appointment.status IN ('pending', 'confirmed')
      AND (appointment.date_time AT TIME ZONE target_timezone)::date = target_local_date
    ORDER BY appointment.date_time
    LIMIT 2
  ) AS item;
  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_experience(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.safe_jsonb_array(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_publication_readiness(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_business_command_center(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_professional_daily_focus(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_public_establishment_experience(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_publication_readiness(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_business_command_center(uuid, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_professional_daily_focus(uuid, date) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
