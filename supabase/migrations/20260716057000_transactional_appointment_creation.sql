BEGIN;

CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
SET LOCAL search_path = pg_catalog, public, extensions;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS duration_minutes integer,
  ADD COLUMN IF NOT EXISTS ends_at timestamptz;

UPDATE public.appointments appointment
SET duration_minutes = COALESCE(
  (SELECT professional_service.duration_minutes FROM public.professional_services professional_service
   WHERE professional_service.professional_id = appointment.professional_id
     AND professional_service.service_id = appointment.service_id
     AND professional_service.is_active = true LIMIT 1),
  (SELECT service.duration_minutes FROM public.services service WHERE service.id = appointment.service_id LIMIT 1),
  30
)
WHERE appointment.duration_minutes IS NULL;

UPDATE public.appointments
SET ends_at = date_time + make_interval(mins => duration_minutes)
WHERE ends_at IS NULL;

ALTER TABLE public.appointments
  ALTER COLUMN duration_minutes SET DEFAULT 30,
  ALTER COLUMN duration_minutes SET NOT NULL,
  ALTER COLUMN ends_at SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_duration_minutes_check' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_duration_minutes_check CHECK (duration_minutes BETWEEN 1 AND 1440);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_valid_time_range_check' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_valid_time_range_check CHECK (ends_at > date_time);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_appointment_duration_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE resolved_duration integer;
BEGIN
  IF TG_OP = 'INSERT' OR NEW.service_id IS DISTINCT FROM OLD.service_id OR NEW.professional_id IS DISTINCT FROM OLD.professional_id OR NEW.duration_minutes IS NULL THEN
    SELECT COALESCE(professional_service.duration_minutes, service.duration_minutes)
    INTO resolved_duration
    FROM public.services service
    LEFT JOIN public.professional_services professional_service
      ON professional_service.professional_id = NEW.professional_id
      AND professional_service.service_id = service.id
      AND professional_service.establishment_id = NEW.establishment_id
      AND professional_service.is_active = true
    WHERE service.id = NEW.service_id
      AND service.establishment_id = NEW.establishment_id
      AND service.deleted_at IS NULL
      AND service.is_active = true;
    IF resolved_duration IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
    NEW.duration_minutes := resolved_duration;
  END IF;
  NEW.ends_at := NEW.date_time + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_duration_snapshot ON public.appointments;
CREATE TRIGGER set_appointment_duration_snapshot
  BEFORE INSERT OR UPDATE OF service_id, professional_id, establishment_id, date_time
  ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.set_appointment_duration_snapshot();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.appointments first_appointment
    JOIN public.appointments second_appointment
      ON second_appointment.professional_id = first_appointment.professional_id
      AND second_appointment.id > first_appointment.id
      AND tstzrange(second_appointment.date_time, second_appointment.ends_at, '[)') && tstzrange(first_appointment.date_time, first_appointment.ends_at, '[)')
    WHERE first_appointment.status IN ('pending', 'confirmed')
      AND second_appointment.status IN ('pending', 'confirmed')
      AND first_appointment.deleted_at IS NULL
      AND second_appointment.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'existing_appointment_conflicts'; END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'appointments_no_professional_overlap' AND conrelid = 'public.appointments'::regclass) THEN
    ALTER TABLE public.appointments ADD CONSTRAINT appointments_no_professional_overlap
      EXCLUDE USING gist (professional_id WITH =, tstzrange(date_time, ends_at, '[)') WITH &&)
      WHERE (status IN ('pending', 'confirmed') AND deleted_at IS NULL)
      DEFERRABLE INITIALLY IMMEDIATE;
  END IF;
END $$;

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
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF requested_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;
  SELECT * INTO current_appointment FROM public.appointments WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.client_id <> actor_id
    AND NOT public.is_superadmin()
    AND NOT public.has_active_membership(current_appointment.establishment_id, ARRAY['admin', 'professional'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF current_appointment.reschedule_count >= 2 AND current_appointment.client_id = actor_id THEN RAISE EXCEPTION 'reschedule_limit_reached'; END IF;
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

CREATE OR REPLACE FUNCTION public.get_public_busy_slots(target_professional_id uuid, range_start timestamptz, range_end timestamptz)
RETURNS TABLE (date_time timestamptz, duration_minutes integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
BEGIN
  IF range_end <= range_start OR range_end > range_start + interval '31 days' THEN RAISE EXCEPTION 'invalid_availability_range'; END IF;
  RETURN QUERY SELECT appointment.date_time, appointment.duration_minutes FROM public.appointments appointment
  WHERE appointment.professional_id = target_professional_id
    AND appointment.status IN ('pending', 'confirmed')
    AND appointment.deleted_at IS NULL
    AND appointment.date_time < range_end AND appointment.ends_at > range_start
  ORDER BY appointment.date_time;
END;
$$;

REVOKE INSERT, UPDATE, DELETE ON public.appointments FROM authenticated;
REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_public_busy_slots(uuid, timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_appointment_duration_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_busy_slots(uuid, timestamptz, timestamptz) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;