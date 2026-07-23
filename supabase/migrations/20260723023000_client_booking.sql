BEGIN;

CREATE OR REPLACE FUNCTION public.get_client_booking_options(target_slug text)
RETURNS TABLE (
  establishment_id uuid,
  establishment_slug text,
  establishment_name text,
  establishment_address text,
  establishment_timezone text,
  establishment_currency text,
  instant_booking_enabled boolean,
  services jsonb,
  professionals jsonb,
  professional_services jsonb
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
    establishment.address,
    establishment.timezone,
    establishment.currency,
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
          profile.specialties
        FROM public.memberships AS membership
        JOIN public.profiles AS profile ON profile.id = membership.profile_id
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.role IN ('admin', 'professional')
          AND profile.deleted_at IS NULL
      ) AS professional_row
    ), '[]'::jsonb),
    COALESCE((
      SELECT jsonb_agg(to_jsonb(configuration_row))
      FROM (
        SELECT
          configuration.professional_id,
          configuration.service_id,
          configuration.price,
          configuration.duration_minutes,
          configuration.is_active
        FROM public.professional_services AS configuration
        WHERE configuration.establishment_id = establishment.id
          AND EXISTS (
            SELECT 1 FROM public.services AS service
            WHERE service.id = configuration.service_id
              AND service.establishment_id = establishment.id
              AND service.is_active
              AND service.deleted_at IS NULL
          )
          AND EXISTS (
            SELECT 1 FROM public.memberships AS membership
            JOIN public.profiles AS profile ON profile.id = membership.profile_id
            WHERE membership.profile_id = configuration.professional_id
              AND membership.establishment_id = establishment.id
              AND membership.status = 'active'
              AND membership.role IN ('admin', 'professional')
              AND profile.deleted_at IS NULL
          )
      ) AS configuration_row
    ), '[]'::jsonb)
  FROM public.establishments AS establishment
  WHERE establishment.slug = normalized_slug
    AND establishment.account_status = 'active'
    AND EXISTS (
      SELECT 1 FROM pg_catalog.pg_timezone_names AS timezone_name
      WHERE timezone_name.name = establishment.timezone
    );
END;
$$;

-- Mantém o contrato compartilhado, mas aplica o circuit breaker também dentro
-- da função SECURITY DEFINER para que ele não dependa apenas de RLS.
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
  actor_is_staff boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT establishment.account_status
  INTO establishment_status
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;

  actor_is_staff := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin', 'professional']);
  IF establishment_status IS DISTINCT FROM 'active'
    AND (establishment_status IS DISTINCT FROM 'pending_verification' OR NOT actor_is_staff)
  THEN
    RAISE EXCEPTION 'establishment_unavailable';
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

CREATE OR REPLACE FUNCTION public.create_client_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz
)
RETURNS TABLE (
  appointment_id text,
  appointment_status text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  created_id text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = actor_id
      AND profile.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.establishments AS establishment
    WHERE establishment.id = target_establishment_id
      AND establishment.account_status = 'active'
  ) THEN
    RAISE EXCEPTION 'establishment_unavailable';
  END IF;

  created_id := public.create_appointment(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    NULL,
    actor_id
  );

  RETURN QUERY
  SELECT appointment.id, appointment.status
  FROM public.appointments AS appointment
  WHERE appointment.id = created_id
    AND appointment.client_id = actor_id
    AND appointment.deleted_at IS NULL;

  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_booking_options(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_client_appointment(uuid, uuid, text, timestamptz) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_booking_options(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_client_appointment(uuid, uuid, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
