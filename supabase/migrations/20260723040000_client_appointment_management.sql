BEGIN;

CREATE OR REPLACE FUNCTION public.get_client_appointments()
RETURNS TABLE (
  appointment_id text,
  appointment_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  reschedule_count integer,
  original_starts_at timestamptz,
  cancellation_reason text,
  cancelled_by_role text,
  created_at timestamptz,
  updated_at timestamptz,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  establishment_address text,
  establishment_phone text,
  establishment_timezone text,
  establishment_currency text,
  min_cancellation_hours integer,
  instant_booking_enabled boolean,
  service_id text,
  service_name text,
  professional_id uuid,
  professional_name text,
  professional_avatar_url text,
  cancellation_deadline timestamptz,
  can_cancel boolean,
  can_reschedule boolean,
  cancel_block_reason text,
  reschedule_block_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    appointment.id::text,
    appointment.status,
    appointment.date_time,
    appointment.ends_at,
    appointment.duration_minutes,
    appointment.reschedule_count,
    appointment.original_date_time,
    appointment.cancellation_reason,
    appointment.cancelled_by_role,
    appointment.created_at,
    appointment.updated_at,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.address,
    establishment.phone,
    establishment.timezone,
    establishment.currency,
    policy.min_hours,
    establishment.instant_booking_enabled,
    appointment.service_id,
    COALESCE(service.name, 'Serviço indisponível'),
    appointment.professional_id,
    COALESCE(professional.name, 'Profissional indisponível'),
    professional.avatar_url,
    appointment.date_time - make_interval(hours => policy.min_hours),
    appointment.status IN ('pending', 'confirmed')
      AND appointment.date_time > now()
      AND now() <= appointment.date_time - make_interval(hours => policy.min_hours),
    appointment.status IN ('pending', 'confirmed')
      AND appointment.date_time > now()
      AND now() <= appointment.date_time - make_interval(hours => policy.min_hours)
      AND appointment.reschedule_count < 2
      AND establishment.account_status = 'active',
    CASE
      WHEN appointment.status NOT IN ('pending', 'confirmed') THEN 'appointment_status_immutable'
      WHEN appointment.date_time <= now() THEN 'appointment_already_started'
      WHEN now() > appointment.date_time - make_interval(hours => policy.min_hours) THEN 'cancellation_window_closed'
      ELSE NULL
    END,
    CASE
      WHEN appointment.status NOT IN ('pending', 'confirmed') THEN 'appointment_status_immutable'
      WHEN appointment.date_time <= now() THEN 'appointment_already_started'
      WHEN establishment.account_status IS DISTINCT FROM 'active' THEN 'establishment_unavailable'
      WHEN appointment.reschedule_count >= 2 THEN 'reschedule_limit_reached'
      WHEN now() > appointment.date_time - make_interval(hours => policy.min_hours) THEN 'cancellation_window_closed'
      ELSE NULL
    END
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment ON establishment.id = appointment.establishment_id
  LEFT JOIN public.services AS service ON service.id = appointment.service_id
  LEFT JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  CROSS JOIN LATERAL (
    SELECT CASE
      WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0 THEN 24
      ELSE establishment.min_cancellation_hours
    END::integer AS min_hours
  ) AS policy
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND appointment.client_id = (SELECT auth.uid())
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.date_time DESC;
$$;

CREATE OR REPLACE FUNCTION public.get_client_appointment(target_appointment_id text)
RETURNS TABLE (
  appointment_id text,
  appointment_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  reschedule_count integer,
  original_starts_at timestamptz,
  cancellation_reason text,
  cancelled_by_role text,
  created_at timestamptz,
  updated_at timestamptz,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  establishment_address text,
  establishment_phone text,
  establishment_timezone text,
  establishment_currency text,
  min_cancellation_hours integer,
  instant_booking_enabled boolean,
  service_id text,
  service_name text,
  professional_id uuid,
  professional_name text,
  professional_avatar_url text,
  cancellation_deadline timestamptz,
  can_cancel boolean,
  can_reschedule boolean,
  cancel_block_reason text,
  reschedule_block_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT appointment.*
  FROM public.get_client_appointments() AS appointment
  WHERE appointment.appointment_id = target_appointment_id
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION public.update_appointment_status(
  target_appointment_id text,
  new_status text,
  new_cancellation_reason text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_professional_member boolean;
  actor_is_owner_client boolean;
  effective_cancelled_by_role text;
  effective_reason text;
  effective_min_hours integer;
  current_appointment public.appointments%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF new_status NOT IN ('confirmed', 'cancelled', 'completed') THEN RAISE EXCEPTION 'invalid_status_value'; END IF;

  SELECT * INTO current_appointment
  FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL
  FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.status IN ('cancelled', 'completed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin']);
  actor_is_professional_member := public.has_active_membership(
    current_appointment.establishment_id,
    ARRAY['professional', 'admin']
  );
  actor_is_owner_client := current_appointment.client_id = actor_id;

  IF new_status = 'confirmed' THEN
    IF current_appointment.status <> 'pending' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION 'forbidden'; END IF;
  ELSIF new_status = 'completed' THEN
    IF current_appointment.status <> 'confirmed' THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT actor_is_professional_member THEN RAISE EXCEPTION 'forbidden'; END IF;
    IF current_appointment.date_time > now() THEN RAISE EXCEPTION 'appointment_not_yet_finished'; END IF;
  ELSE
    IF current_appointment.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'invalid_status_transition'; END IF;
    IF NOT (actor_is_owner_client OR actor_is_professional_member) THEN RAISE EXCEPTION 'forbidden'; END IF;

    effective_reason := NULLIF(trim(COALESCE(new_cancellation_reason, '')), '');
    IF actor_is_owner_client AND NOT actor_is_professional_member THEN
      SELECT CASE
        WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0 THEN 24
        ELSE establishment.min_cancellation_hours
      END::integer
      INTO effective_min_hours
      FROM public.establishments AS establishment
      WHERE establishment.id = current_appointment.establishment_id;

      IF current_appointment.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;
      IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
        RAISE EXCEPTION 'cancellation_window_closed';
      END IF;
      IF effective_reason IS NULL OR effective_reason NOT IN (
        'Imprevisto de trabalho',
        'Questões de saúde',
        'Problema de transporte',
        'Vou reagendar',
        'Outro'
      ) THEN
        RAISE EXCEPTION 'invalid_cancellation_reason';
      END IF;
    END IF;

    IF actor_is_admin THEN effective_cancelled_by_role := 'admin';
    ELSIF actor_is_professional_member THEN effective_cancelled_by_role := 'professional';
    ELSE effective_cancelled_by_role := 'client';
    END IF;
  END IF;

  UPDATE public.appointments AS appointment
  SET
    status = new_status,
    cancellation_reason = CASE WHEN new_status = 'cancelled' THEN effective_reason ELSE appointment.cancellation_reason END,
    cancelled_by_role = CASE WHEN new_status = 'cancelled' THEN effective_cancelled_by_role ELSE appointment.cancelled_by_role END
  WHERE appointment.id = target_appointment_id;

  RETURN target_appointment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reschedule_appointment(
  target_appointment_id text,
  requested_date_time timestamptz,
  requested_professional_id uuid,
  requested_service_id text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_staff boolean;
  current_appointment public.appointments%ROWTYPE;
  establishment_status text;
  target_timezone text;
  instant_booking boolean;
  effective_min_hours integer;
  selected_slot record;
  next_status text;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;

  SELECT * INTO current_appointment
  FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL
  FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;
  IF current_appointment.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;

  actor_is_staff := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin'])
    OR (
      current_appointment.professional_id = actor_id
      AND public.has_active_membership(current_appointment.establishment_id, ARRAY['professional', 'admin'])
    );
  IF current_appointment.client_id <> actor_id AND NOT actor_is_staff THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT
    establishment.account_status,
    establishment.timezone,
    establishment.instant_booking_enabled,
    CASE
      WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0 THEN 24
      ELSE establishment.min_cancellation_hours
    END::integer
  INTO establishment_status, target_timezone, instant_booking, effective_min_hours
  FROM public.establishments AS establishment
  WHERE establishment.id = current_appointment.establishment_id;

  IF actor_is_staff THEN
    IF establishment_status NOT IN ('active', 'pending_verification') THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;
  ELSE
    IF establishment_status IS DISTINCT FROM 'active' THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;
    IF current_appointment.reschedule_count >= 2 THEN RAISE EXCEPTION 'reschedule_limit_reached'; END IF;
    IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
      RAISE EXCEPTION 'cancellation_window_closed';
    END IF;
  END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = requested_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    current_appointment.establishment_id,
    requested_professional_id,
    requested_service_id,
    (requested_date_time AT TIME ZONE target_timezone)::date,
    target_appointment_id
  ) AS slot
  WHERE slot.starts_at = requested_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'; END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  next_status := CASE
    WHEN actor_is_staff THEN 'confirmed'
    WHEN COALESCE(instant_booking, true) THEN 'confirmed'
    ELSE 'pending'
  END;

  UPDATE public.appointments
  SET
    original_date_time = COALESCE(original_date_time, date_time),
    date_time = requested_date_time,
    professional_id = requested_professional_id,
    service_id = requested_service_id,
    reschedule_count = reschedule_count + 1,
    status = next_status
  WHERE id = target_appointment_id;

  RETURN target_appointment_id;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;

REVOKE ALL ON FUNCTION public.get_client_appointments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_client_appointment(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_appointment_status(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_client_appointments() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_appointment(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_appointment_status(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_appointment_status(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
