BEGIN;

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS transferred_from_professional_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS transfer_reason text;

COMMENT ON COLUMN public.appointments.transferred_from_professional_id IS
  'Professional who previously owned the appointment before a staff transfer.';
COMMENT ON COLUMN public.appointments.transfer_reason IS
  'Optional reason recorded when an appointment is transferred between professionals.';

-- Keep transfer audit when reschedule changes the professional.
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
  previous_professional_id uuid;
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

  previous_professional_id := current_appointment.professional_id;

  UPDATE public.appointments
  SET
    original_date_time = COALESCE(original_date_time, date_time),
    date_time = requested_date_time,
    professional_id = requested_professional_id,
    service_id = requested_service_id,
    reschedule_count = reschedule_count + 1,
    status = next_status,
    transferred_from_professional_id = CASE
      WHEN previous_professional_id IS DISTINCT FROM requested_professional_id
        THEN previous_professional_id
      ELSE transferred_from_professional_id
    END,
    transfer_reason = CASE
      WHEN previous_professional_id IS DISTINCT FROM requested_professional_id
        THEN COALESCE(transfer_reason, 'professional_transfer')
      ELSE transfer_reason
    END
  WHERE id = target_appointment_id;

  RETURN target_appointment_id;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_professional_absence(
  target_professional_id uuid,
  range_start timestamptz,
  range_end timestamptz,
  transfers jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_is_admin boolean;
  actor_is_owner boolean;
  establishment_id uuid;
  item jsonb;
  appointment_row public.appointments%ROWTYPE;
  action_name text;
  to_professional_id uuid;
  cancel_note text;
  item_error text;
  results jsonb := '[]'::jsonb;
  created_block_id uuid;
  block_start timestamptz;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF range_end <= range_start THEN RAISE EXCEPTION 'invalid_absence_range'; END IF;
  IF range_end > range_start + interval '31 days' THEN RAISE EXCEPTION 'invalid_absence_range'; END IF;
  IF transfers IS NULL OR jsonb_typeof(transfers) <> 'array' THEN RAISE EXCEPTION 'invalid_transfers_payload'; END IF;

  SELECT membership.establishment_id
  INTO establishment_id
  FROM public.memberships AS membership
  WHERE membership.profile_id = target_professional_id
    AND membership.status = 'active'
    AND membership.role IN ('professional', 'admin')
  ORDER BY CASE WHEN membership.role = 'professional' THEN 0 ELSE 1 END
  LIMIT 1;

  IF establishment_id IS NULL THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(establishment_id, ARRAY['admin']);
  actor_is_owner := actor_id = target_professional_id
    AND public.has_active_membership(establishment_id, ARRAY['professional', 'admin']);
  IF NOT actor_is_admin AND NOT actor_is_owner THEN RAISE EXCEPTION 'forbidden'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(transfers)
  LOOP
    item_error := NULL;
    action_name := lower(COALESCE(item->>'action', ''));
    -- Nested BEGIN/EXCEPTION creates an implicit subtransaction per item.
    -- SAVEPOINT / ROLLBACK TO are not allowed inside FUNCTIONS.
    BEGIN
      SELECT * INTO appointment_row
      FROM public.appointments
      WHERE id = item->>'appointment_id'
        AND deleted_at IS NULL
      FOR UPDATE;

      IF appointment_row.id IS NULL THEN
        RAISE EXCEPTION 'appointment_not_found';
      END IF;
      IF appointment_row.establishment_id <> establishment_id THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
      IF appointment_row.professional_id <> target_professional_id THEN
        RAISE EXCEPTION 'forbidden';
      END IF;
      IF appointment_row.status NOT IN ('pending', 'confirmed') THEN
        RAISE EXCEPTION 'appointment_status_immutable';
      END IF;
      IF appointment_row.date_time < range_start OR appointment_row.date_time >= range_end THEN
        RAISE EXCEPTION 'appointment_outside_absence_range';
      END IF;

      IF action_name = 'keep' THEN
        NULL;
      ELSIF action_name = 'cancel' THEN
        cancel_note := NULLIF(trim(COALESCE(item->>'cancellation_note', 'Ausência do profissional')), '');
        PERFORM public.update_appointment_status_v2(
          appointment_row.id,
          'cancelled',
          CASE WHEN actor_is_admin THEN 'establishment_cancelled' ELSE 'professional_cancelled' END,
          cancel_note
        );
      ELSIF action_name = 'transfer' THEN
        to_professional_id := NULLIF(item->>'to_professional_id', '')::uuid;
        IF to_professional_id IS NULL THEN RAISE EXCEPTION 'substitute_required'; END IF;
        IF to_professional_id = target_professional_id THEN RAISE EXCEPTION 'substitute_must_differ'; END IF;

        PERFORM public.reschedule_appointment(
          appointment_row.id,
          appointment_row.date_time,
          to_professional_id,
          appointment_row.service_id
        );

        UPDATE public.appointments
        SET transfer_reason = COALESCE(NULLIF(trim(item->>'transfer_reason'), ''), 'absence_mode')
        WHERE id = appointment_row.id;
      ELSE
        RAISE EXCEPTION 'invalid_transfer_action';
      END IF;

      results := results || jsonb_build_array(jsonb_build_object(
        'appointment_id', appointment_row.id,
        'ok', true,
        'action', action_name,
        'error', NULL
      ));
    EXCEPTION WHEN OTHERS THEN
      item_error := SQLERRM;
      results := results || jsonb_build_array(jsonb_build_object(
        'appointment_id', COALESCE(item->>'appointment_id', ''),
        'ok', false,
        'action', action_name,
        'error', item_error
      ));
    END;
  END LOOP;

  -- Allow "from now" absence blocks after appointments were cleared/transferred.
  block_start := GREATEST(range_start, now() + interval '1 second');
  IF block_start < range_end THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments appointment
      WHERE appointment.establishment_id = establishment_id
        AND appointment.professional_id = target_professional_id
        AND appointment.status IN ('pending', 'confirmed')
        AND appointment.deleted_at IS NULL
        AND appointment.date_time < range_end
        AND appointment.ends_at > block_start
    ) THEN
      -- Remaining active appointments block time_off; report without failing transfers.
      RETURN jsonb_build_object(
        'results', results,
        'schedule_block_id', NULL,
        'schedule_block_error', 'schedule_block_conflict'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.schedule_blocks block
      WHERE block.establishment_id = establishment_id
        AND block.professional_id = target_professional_id
        AND block.deleted_at IS NULL
        AND block.starts_at < range_end
        AND block.ends_at > block_start
    ) THEN
      INSERT INTO public.schedule_blocks (
        establishment_id, professional_id, starts_at, ends_at, kind, reason, created_by
      ) VALUES (
        establishment_id, target_professional_id, block_start, range_end,
        'time_off', 'Modo ausência', actor_id
      ) RETURNING id INTO created_block_id;

      INSERT INTO public.authorization_audit_log (
        actor_id, action, establishment_id, target_profile_id, metadata
      ) VALUES (
        actor_id, 'schedule_block_created', establishment_id, target_professional_id,
        jsonb_build_object(
          'schedule_block_id', created_block_id,
          'kind', 'time_off',
          'source', 'transfer_professional_absence',
          'starts_at', block_start,
          'ends_at', range_end
        )
      );
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'results', results,
    'schedule_block_id', created_block_id,
    'schedule_block_error', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_professional_absence(uuid, timestamptz, timestamptz, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_professional_absence(uuid, timestamptz, timestamptz, jsonb) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
