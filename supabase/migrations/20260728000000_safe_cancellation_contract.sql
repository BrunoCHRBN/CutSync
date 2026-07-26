BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS cancellation_reason_code text,
  ADD COLUMN IF NOT EXISTS cancellation_note_internal text;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_cancellation_reason_code_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_cancellation_reason_code_check
  CHECK (
    cancellation_reason_code IS NULL OR cancellation_reason_code IN (
      'client_work_conflict', 'client_health', 'client_transport',
      'client_reschedule', 'client_other', 'establishment_cancelled',
      'professional_cancelled'
    )
  );

UPDATE public.appointments
SET
  cancellation_reason_code = CASE
    WHEN cancellation_reason = 'Imprevisto de trabalho' THEN 'client_work_conflict'
    WHEN cancellation_reason = 'Questões de saúde' THEN 'client_health'
    WHEN cancellation_reason = 'Problema de transporte' THEN 'client_transport'
    WHEN cancellation_reason = 'Vou reagendar' THEN 'client_reschedule'
    WHEN cancellation_reason = 'Outro' THEN 'client_other'
    WHEN cancelled_by_role = 'professional' THEN 'professional_cancelled'
    ELSE 'establishment_cancelled'
  END,
  cancellation_note_internal = CASE
    WHEN cancellation_reason IS NULL OR cancellation_reason IN (
      'Imprevisto de trabalho', 'Questões de saúde', 'Problema de transporte',
      'Vou reagendar', 'Outro'
    ) THEN cancellation_note_internal
    ELSE COALESCE(cancellation_note_internal, cancellation_reason)
  END
WHERE status = 'cancelled' AND cancellation_reason_code IS NULL;

CREATE OR REPLACE FUNCTION public.update_appointment_status_v2(
  target_appointment_id text,
  new_status text,
  new_cancellation_reason_code text DEFAULT NULL,
  new_cancellation_note_internal text DEFAULT NULL
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
  effective_reason_code text;
  effective_min_hours integer;
  current_appointment public.appointments%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF new_status NOT IN ('confirmed', 'cancelled', 'completed') THEN RAISE EXCEPTION 'invalid_status_value'; END IF;

  SELECT * INTO current_appointment FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF current_appointment.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF current_appointment.status IN ('cancelled', 'completed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(current_appointment.establishment_id, ARRAY['admin']);
  actor_is_professional_member := public.has_active_membership(
    current_appointment.establishment_id, ARRAY['professional', 'admin']
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

    IF actor_is_owner_client AND NOT actor_is_professional_member THEN
      IF new_cancellation_reason_code NOT IN (
        'client_work_conflict', 'client_health', 'client_transport', 'client_reschedule', 'client_other'
      ) THEN RAISE EXCEPTION 'invalid_cancellation_reason'; END IF;
      IF NULLIF(trim(COALESCE(new_cancellation_note_internal, '')), '') IS NOT NULL THEN RAISE EXCEPTION 'forbidden'; END IF;
      SELECT CASE WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0
        THEN 24 ELSE establishment.min_cancellation_hours END::integer
      INTO effective_min_hours
      FROM public.establishments AS establishment
      WHERE establishment.id = current_appointment.establishment_id;
      IF current_appointment.date_time <= now() THEN RAISE EXCEPTION 'appointment_already_started'; END IF;
      IF now() > current_appointment.date_time - make_interval(hours => effective_min_hours) THEN
        RAISE EXCEPTION 'cancellation_window_closed';
      END IF;
      effective_reason_code := new_cancellation_reason_code;
    ELSE
      effective_reason_code := CASE WHEN actor_is_admin THEN 'establishment_cancelled' ELSE 'professional_cancelled' END;
    END IF;

    IF actor_is_admin THEN effective_cancelled_by_role := 'admin';
    ELSIF actor_is_professional_member THEN effective_cancelled_by_role := 'professional';
    ELSE effective_cancelled_by_role := 'client';
    END IF;
  END IF;

  UPDATE public.appointments AS appointment SET
    status = new_status,
    cancellation_reason_code = CASE WHEN new_status = 'cancelled' THEN effective_reason_code ELSE appointment.cancellation_reason_code END,
    cancellation_note_internal = CASE
      WHEN new_status = 'cancelled' AND (actor_is_admin OR actor_is_professional_member)
        THEN NULLIF(trim(COALESCE(new_cancellation_note_internal, '')), '')
      ELSE appointment.cancellation_note_internal
    END,
    cancellation_reason = CASE WHEN new_status = 'cancelled' THEN effective_reason_code ELSE appointment.cancellation_reason END,
    cancelled_by_role = CASE WHEN new_status = 'cancelled' THEN effective_cancelled_by_role ELSE appointment.cancelled_by_role END
  WHERE appointment.id = target_appointment_id;

  RETURN target_appointment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.update_appointment_status_v2(text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_appointment_status_v2(text, text, text, text) TO authenticated, service_role;

COMMENT ON COLUMN public.appointments.cancellation_reason_code IS
  'Controlled public cancellation reason. Safe for role-appropriate presentation.';
COMMENT ON COLUMN public.appointments.cancellation_note_internal IS
  'Internal administrative note. Never expose through client-facing RPCs or UI.';

CREATE OR REPLACE FUNCTION public.get_client_appointments_v2()
RETURNS TABLE (
  appointment_id text,
  appointment_status text,
  starts_at timestamptz,
  reschedule_count integer,
  cancellation_reason_code text,
  cancelled_by_role text,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  establishment_address text,
  establishment_phone text,
  establishment_timezone text,
  establishment_currency text,
  min_cancellation_hours integer,
  service_id text,
  service_name text,
  service_price numeric,
  service_duration_minutes integer,
  professional_id uuid,
  professional_name text
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
    appointment.reschedule_count,
    COALESCE(
      appointment.cancellation_reason_code,
      CASE appointment.cancellation_reason
        WHEN 'Imprevisto de trabalho' THEN 'client_work_conflict'
        WHEN 'Questões de saúde' THEN 'client_health'
        WHEN 'Problema de transporte' THEN 'client_transport'
        WHEN 'Vou reagendar' THEN 'client_reschedule'
        WHEN 'Outro' THEN 'client_other'
        ELSE CASE WHEN appointment.cancelled_by_role = 'professional'
          THEN 'professional_cancelled' ELSE 'establishment_cancelled' END
      END
    ),
    appointment.cancelled_by_role,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.address,
    establishment.phone,
    establishment.timezone,
    establishment.currency,
    CASE WHEN establishment.min_cancellation_hours IS NULL OR establishment.min_cancellation_hours < 0
      THEN 24 ELSE establishment.min_cancellation_hours END::integer,
    service.id,
    COALESCE(service.name, 'Serviço indisponível'),
    service.price,
    service.duration_minutes,
    appointment.professional_id,
    COALESCE(professional.name, 'Profissional indisponível')
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment ON establishment.id = appointment.establishment_id
  LEFT JOIN public.services AS service ON service.id = appointment.service_id
  LEFT JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND appointment.client_id = (SELECT auth.uid())
    AND appointment.deleted_at IS NULL
  ORDER BY appointment.date_time DESC;
$$;

REVOKE ALL ON FUNCTION public.get_client_appointments_v2() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_client_appointments_v2() TO authenticated, service_role;

COMMIT;
