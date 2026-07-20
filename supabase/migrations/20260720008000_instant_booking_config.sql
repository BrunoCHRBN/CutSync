-- Migration: Configuration for Instant Booking or Manual Confirmation
BEGIN;

-- 1. Add instant_booking_enabled column to establishments table
ALTER TABLE public.establishments ADD COLUMN IF NOT EXISTS instant_booking_enabled boolean NOT NULL DEFAULT true;

-- 2. Redefine create_appointment_before_schedule_blocks to respect the config
CREATE OR REPLACE FUNCTION public.create_appointment_before_schedule_blocks(
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
  is_instant_booking boolean;
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

  SELECT establishment.timezone, COALESCE(establishment.instant_booking_enabled, true)
  INTO target_timezone, is_instant_booking
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
    
    IF is_instant_booking THEN
      initial_status := 'confirmed';
    ELSE
      initial_status := 'pending';
    END IF;
  END IF;

  INSERT INTO public.appointments (establishment_id, client_id, client_name, professional_id, service_id, date_time, status, reschedule_count)
  VALUES (target_establishment_id, effective_client_id, effective_client_name, target_professional_id, target_service_id, target_date_time, initial_status, 0)
  RETURNING id INTO created_appointment_id;
  RETURN created_appointment_id;
EXCEPTION WHEN exclusion_violation THEN RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;

-- Secure the function after re-creation
REVOKE ALL ON FUNCTION public.create_appointment_before_schedule_blocks(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_appointment_before_schedule_blocks(uuid, uuid, text, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_before_schedule_blocks(uuid, uuid, text, timestamptz, text, uuid) TO service_role;

COMMIT;
