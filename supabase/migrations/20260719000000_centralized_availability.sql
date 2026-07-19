BEGIN;

CREATE OR REPLACE FUNCTION public.compute_available_slots(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_local_date date,
  ignored_appointment_id text DEFAULT NULL
)
RETURNS TABLE (
  starts_at timestamptz,
  local_time text,
  duration_minutes integer,
  available boolean,
  unavailable_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_timezone text;
  establishment_hours_text text;
  professional_hours_text text;
  establishment_schedule jsonb := '[]'::jsonb;
  professional_schedule jsonb := '[]'::jsonb;
  establishment_day jsonb;
  professional_day jsonb;
  establishment_has_schedule boolean := false;
  professional_has_schedule boolean := false;
  establishment_open time;
  establishment_close time;
  professional_open time;
  professional_close time;
  effective_open time;
  effective_close time;
  resolved_duration integer;
  professional_service_active boolean := true;
  target_day integer := extract(dow FROM target_local_date)::integer;
  local_today date;
  local_start timestamp;
  latest_local_start timestamp;
  local_slot timestamp;
  slot_start timestamptz;
  slot_end timestamptz;
BEGIN
  SELECT establishment.timezone, establishment.opening_hours
  INTO target_timezone, establishment_hours_text
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names timezone_name WHERE timezone_name.name = target_timezone) THEN
    RAISE EXCEPTION 'invalid_establishment_timezone';
  END IF;

  local_today := (now() AT TIME ZONE target_timezone)::date;
  IF target_local_date < local_today OR target_local_date > local_today + 31 THEN
    RAISE EXCEPTION 'invalid_availability_date';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = target_professional_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
  ) THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT profile.work_hours INTO professional_hours_text
  FROM public.profiles profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL;

  SELECT COALESCE(professional_service.duration_minutes, service.duration_minutes),
    COALESCE(professional_service.is_active, true)
  INTO resolved_duration, professional_service_active
  FROM public.services service
  LEFT JOIN public.professional_services professional_service
    ON professional_service.professional_id = target_professional_id
    AND professional_service.service_id = service.id
    AND professional_service.establishment_id = target_establishment_id
  WHERE service.id = target_service_id
    AND service.establishment_id = target_establishment_id
    AND service.is_active = true
    AND service.deleted_at IS NULL;

  IF resolved_duration IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  IF NOT professional_service_active THEN RAISE EXCEPTION 'service_unavailable_for_professional'; END IF;

  BEGIN
    IF NULLIF(trim(establishment_hours_text), '') IS NOT NULL THEN
      establishment_schedule := establishment_hours_text::jsonb;
    END IF;
    IF NULLIF(trim(professional_hours_text), '') IS NOT NULL THEN
      professional_schedule := professional_hours_text::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END;

  IF jsonb_typeof(establishment_schedule) <> 'array'
    OR jsonb_typeof(professional_schedule) <> 'array'
  THEN RAISE EXCEPTION 'invalid_schedule_configuration'; END IF;

  establishment_has_schedule := jsonb_array_length(establishment_schedule) > 0;
  professional_has_schedule := jsonb_array_length(professional_schedule) > 0;

  IF NOT establishment_has_schedule AND NOT professional_has_schedule THEN
    starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
    available := false; unavailable_reason := 'schedule_not_configured';
    RETURN NEXT; RETURN;
  END IF;

  IF establishment_has_schedule THEN
    SELECT item INTO establishment_day
    FROM jsonb_array_elements(establishment_schedule) AS schedule_item(item)
    WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
      AND (item->>'day')::integer = target_day
    LIMIT 1;
    IF establishment_day IS NULL OR COALESCE(establishment_day->>'isOpen', 'false') <> 'true' THEN
      starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
      available := false; unavailable_reason := 'closed';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  IF professional_has_schedule THEN
    SELECT item INTO professional_day
    FROM jsonb_array_elements(professional_schedule) AS schedule_item(item)
    WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
      AND (item->>'day')::integer = target_day
    LIMIT 1;
    IF professional_day IS NULL OR COALESCE(professional_day->>'isOpen', 'false') <> 'true' THEN
      starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
      available := false; unavailable_reason := 'closed';
      RETURN NEXT; RETURN;
    END IF;
  END IF;

  BEGIN
    IF establishment_has_schedule THEN
      establishment_open := (establishment_day->>'open')::time;
      establishment_close := (establishment_day->>'close')::time;
    END IF;
    IF professional_has_schedule THEN
      professional_open := (professional_day->>'open')::time;
      professional_close := (professional_day->>'close')::time;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END;

  IF establishment_has_schedule AND professional_has_schedule THEN
    effective_open := GREATEST(establishment_open, professional_open);
    effective_close := LEAST(establishment_close, professional_close);
  ELSIF establishment_has_schedule THEN
    effective_open := establishment_open;
    effective_close := establishment_close;
  ELSE
    effective_open := professional_open;
    effective_close := professional_close;
  END IF;

  IF effective_open IS NULL OR effective_close IS NULL OR effective_open >= effective_close THEN
    starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
    available := false; unavailable_reason := 'closed';
    RETURN NEXT; RETURN;
  END IF;

  local_start := target_local_date + effective_open;
  latest_local_start := target_local_date + effective_close - make_interval(mins => resolved_duration);

  IF latest_local_start < local_start THEN
    starts_at := NULL; local_time := NULL; duration_minutes := resolved_duration;
    available := false; unavailable_reason := 'service_exceeds_workday';
    RETURN NEXT; RETURN;
  END IF;

  FOR local_slot IN
    SELECT generate_series(local_start, latest_local_start, interval '30 minutes')
  LOOP
    slot_start := local_slot AT TIME ZONE target_timezone;
    slot_end := slot_start + make_interval(mins => resolved_duration);
    starts_at := slot_start;
    local_time := to_char(local_slot, 'HH24:MI');
    duration_minutes := resolved_duration;

    IF slot_start <= now() THEN
      available := false;
      unavailable_reason := 'past';
    ELSIF EXISTS (
      SELECT 1 FROM public.appointments appointment
      WHERE appointment.professional_id = target_professional_id
        AND appointment.status IN ('pending', 'confirmed')
        AND appointment.deleted_at IS NULL
        AND (ignored_appointment_id IS NULL OR appointment.id <> ignored_appointment_id)
        AND appointment.date_time < slot_end
        AND appointment.ends_at > slot_start
    ) THEN
      available := false;
      unavailable_reason := 'busy';
    ELSE
      available := true;
      unavailable_reason := NULL;
    END IF;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_local_date date,
  target_appointment_id text DEFAULT NULL
)
RETURNS TABLE (
  starts_at timestamptz,
  local_time text,
  duration_minutes integer,
  available boolean,
  unavailable_reason text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF target_appointment_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.appointments appointment
    WHERE appointment.id = target_appointment_id
      AND appointment.deleted_at IS NULL
      AND appointment.establishment_id = target_establishment_id
      AND (
        appointment.client_id = (SELECT auth.uid())
        OR public.is_superadmin()
        OR public.has_active_membership(appointment.establishment_id, ARRAY['admin'])
        OR (
          appointment.professional_id = (SELECT auth.uid())
          AND public.has_active_membership(appointment.establishment_id, ARRAY['professional', 'admin'])
        )
      )
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  RETURN QUERY
  SELECT slot.starts_at, slot.local_time, slot.duration_minutes, slot.available, slot.unavailable_reason
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_local_date,
    target_appointment_id
  ) slot
  ORDER BY slot.starts_at NULLS FIRST;
END;
$$;

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
  actor_is_admin boolean;
  actor_is_professional boolean;
  effective_client_id uuid;
  effective_client_name text;
  initial_status text;
  created_appointment_id text;
  target_timezone text;
  selected_slot record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;
  actor_is_admin := public.is_superadmin() OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_professional := target_professional_id = actor_id AND public.has_active_membership(target_establishment_id, ARRAY['professional', 'admin']);
  IF NOT EXISTS (SELECT 1 FROM public.memberships membership WHERE membership.profile_id = target_professional_id AND membership.establishment_id = target_establishment_id AND membership.status = 'active' AND membership.role IN ('professional', 'admin')) THEN
    RAISE EXCEPTION 'professional_unavailable';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.services service WHERE service.id = target_service_id AND service.establishment_id = target_establishment_id AND service.is_active = true AND service.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;
  IF EXISTS (SELECT 1 FROM public.professional_services professional_service WHERE professional_service.professional_id = target_professional_id AND professional_service.service_id = target_service_id AND professional_service.establishment_id = target_establishment_id AND professional_service.is_active = false) THEN
    RAISE EXCEPTION 'service_unavailable_for_professional';
  END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment WHERE establishment.id = target_establishment_id;
  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
      target_establishment_id,
      target_professional_id,
      target_service_id,
      (target_date_time AT TIME ZONE target_timezone)::date,
      NULL
    ) slot
  WHERE slot.starts_at = target_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'; END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  IF actor_is_admin OR actor_is_professional THEN
    effective_client_id := target_client_id;
    IF effective_client_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.profiles profile WHERE profile.id = effective_client_id) THEN RAISE EXCEPTION 'client_not_found'; END IF;
    effective_client_name := NULLIF(trim(target_client_name), '');
    IF effective_client_id IS NULL AND effective_client_name IS NULL THEN RAISE EXCEPTION 'client_name_required'; END IF;
    initial_status := 'confirmed';
  ELSE
    IF target_client_id IS NOT NULL AND target_client_id <> actor_id THEN RAISE EXCEPTION 'forbidden'; END IF;
    effective_client_id := actor_id;
    SELECT profile.name INTO effective_client_name FROM public.profiles profile WHERE profile.id = actor_id;
    IF effective_client_name IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;
    initial_status := 'pending';
  END IF;
  INSERT INTO public.appointments (establishment_id, client_id, client_name, professional_id, service_id, date_time, status, reschedule_count)
  VALUES (target_establishment_id, effective_client_id, effective_client_name, target_professional_id, target_service_id, target_date_time, initial_status, 0)
  RETURNING id INTO created_appointment_id;
  RETURN created_appointment_id;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
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
  current_appointment public.appointments%ROWTYPE;
  target_timezone text;
  selected_slot record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;
  SELECT * INTO current_appointment FROM public.appointments WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.client_id <> actor_id
    AND NOT public.is_superadmin()
    AND NOT public.has_active_membership(current_appointment.establishment_id, ARRAY['admin'])
    AND NOT (
      current_appointment.professional_id = actor_id
      AND public.has_active_membership(current_appointment.establishment_id, ARRAY['professional', 'admin'])
    )
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF current_appointment.reschedule_count >= 2 AND current_appointment.client_id = actor_id THEN RAISE EXCEPTION 'reschedule_limit_reached'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment WHERE establishment.id = current_appointment.establishment_id;
  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
      current_appointment.establishment_id,
      requested_professional_id,
      requested_service_id,
      (requested_date_time AT TIME ZONE target_timezone)::date,
      target_appointment_id
    ) slot
  WHERE slot.starts_at = requested_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN RAISE EXCEPTION 'appointment_conflict'; END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  UPDATE public.appointments SET
    original_date_time = COALESCE(original_date_time, date_time),
    date_time = requested_date_time,
    professional_id = requested_professional_id,
    service_id = requested_service_id,
    reschedule_count = reschedule_count + 1,
    status = CASE WHEN current_appointment.client_id = actor_id THEN 'pending' ELSE 'confirmed' END
  WHERE id = target_appointment_id;
  RETURN target_appointment_id;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;

REVOKE ALL ON FUNCTION public.compute_available_slots(uuid, uuid, text, date, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_slots(uuid, uuid, text, date, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, text, date, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;