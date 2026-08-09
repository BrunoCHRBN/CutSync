BEGIN;

SET LOCAL search_path = pg_catalog, public;

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS appointment_reassignment_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establishments.appointment_reassignment_enabled IS
  'Platform-controlled kill switch for the future customer-aware reassignment workflow. Direct app writes are rejected and the default is false.';

CREATE OR REPLACE FUNCTION public.protect_appointment_reassignment_flag()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  jwt_role text := NULLIF(current_setting('request.jwt.claim.role', true), '');
BEGIN
  IF NEW.appointment_reassignment_enabled IS DISTINCT FROM OLD.appointment_reassignment_enabled
     AND COALESCE(jwt_role, '') IN ('anon', 'authenticated')
  THEN
    RAISE EXCEPTION 'appointment_reassignment_flag_write_forbidden';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS establishments_protect_appointment_reassignment_flag
  ON public.establishments;
CREATE TRIGGER establishments_protect_appointment_reassignment_flag
BEFORE UPDATE OF appointment_reassignment_enabled ON public.establishments
FOR EACH ROW
EXECUTE FUNCTION public.protect_appointment_reassignment_flag();

REVOKE ALL ON FUNCTION public.protect_appointment_reassignment_flag()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.protect_appointment_reassignment_flag()
  TO service_role;

-- Legacy rescheduling remains available for date/service changes with the same
-- professional. Any professional change must go through either the future
-- customer-aware workflow or the narrowly scoped unlinked walk-in correction.
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
  internal_unlinked_transfer boolean :=
    COALESCE(current_setting('app.allow_unlinked_appointment_transfer', true), '') = 'on';
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
  IF current_appointment.client_id IS DISTINCT FROM actor_id AND NOT actor_is_staff THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  previous_professional_id := current_appointment.professional_id;
  IF previous_professional_id IS DISTINCT FROM requested_professional_id THEN
    IF current_appointment.client_id IS NOT NULL
       OR current_appointment.establishment_client_id IS NOT NULL
       OR NOT internal_unlinked_transfer
    THEN
      -- Intentionally omit appointment, client and professional identifiers.
      RAISE LOG 'appointment_reassignment_requires_workflow';
      RAISE EXCEPTION 'appointment_reassignment_requires_workflow';
    END IF;
  END IF;

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
    status = next_status,
    transferred_from_professional_id = CASE
      WHEN previous_professional_id IS DISTINCT FROM requested_professional_id
        THEN previous_professional_id
      ELSE transferred_from_professional_id
    END,
    transfer_reason = CASE
      WHEN previous_professional_id IS DISTINCT FROM requested_professional_id
        THEN COALESCE(transfer_reason, 'walk_in_correction')
      ELSE transfer_reason
    END
  WHERE id = target_appointment_id;

  RETURN target_appointment_id;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS authorization_audit_log_walk_in_transfer_request_idx
  ON public.authorization_audit_log ((metadata->>'request_id'))
  WHERE action = 'appointment.walk_in.transferred'
    AND metadata ? 'request_id';

CREATE OR REPLACE FUNCTION public.transfer_unlinked_walk_in_professional(
  target_appointment_id text,
  target_professional_id uuid,
  target_reason text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  appointment_record public.appointments%ROWTYPE;
  actor_role text;
  reason_code text := lower(NULLIF(btrim(target_reason), ''));
  replay_result jsonb;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_request_id IS NULL THEN RAISE EXCEPTION 'idempotency_key_required'; END IF;
  IF reason_code IS NULL OR reason_code NOT IN (
    'walk_in_correction',
    'professional_unavailable',
    'booking_error',
    'other_internal'
  ) THEN
    RAISE EXCEPTION 'transfer_reason_required';
  END IF;

  SELECT audit.metadata->'result'
  INTO replay_result
  FROM public.authorization_audit_log AS audit
  WHERE audit.action = 'appointment.walk_in.transferred'
    AND audit.metadata->>'request_id' = target_request_id::text
  LIMIT 1;
  IF replay_result IS NOT NULL THEN
    RETURN replay_result;
  END IF;

  SELECT * INTO appointment_record
  FROM public.appointments AS appointment
  WHERE appointment.id = target_appointment_id
    AND appointment.deleted_at IS NULL
  FOR UPDATE;
  IF appointment_record.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF appointment_record.client_id IS NOT NULL
     OR appointment_record.establishment_client_id IS NOT NULL
  THEN
    RAISE LOG 'appointment_reassignment_requires_workflow';
    RAISE EXCEPTION 'appointment_reassignment_requires_workflow';
  END IF;
  IF appointment_record.professional_id = target_professional_id THEN
    RAISE EXCEPTION 'substitute_must_differ';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.service_orders AS service_order
    WHERE service_order.appointment_id = appointment_record.id
      AND service_order.status <> 'voided'
  ) THEN
    RAISE EXCEPTION 'appointment_locked_by_service_order';
  END IF;

  IF NOT public.is_superadmin() THEN
    SELECT identity.operational_role
    INTO actor_role
    FROM public.resolve_business_operational_identity(
      appointment_record.establishment_id,
      actor_id
    ) AS identity
    LIMIT 1;

    IF COALESCE(actor_role, '') NOT IN ('owner', 'admin') THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
  END IF;

  PERFORM set_config('app.allow_unlinked_appointment_transfer', 'on', true);
  PERFORM public.reschedule_appointment(
    appointment_record.id,
    appointment_record.date_time,
    target_professional_id,
    appointment_record.service_id
  );

  UPDATE public.appointments
  SET transfer_reason = reason_code
  WHERE id = appointment_record.id;

  result := jsonb_build_object(
    'appointmentId', appointment_record.id,
    'professionalId', target_professional_id,
    'requestId', target_request_id,
    'applied', true
  );

  INSERT INTO public.authorization_audit_log (
    actor_id,
    action,
    establishment_id,
    target_profile_id,
    metadata
  ) VALUES (
    actor_id,
    'appointment.walk_in.transferred',
    appointment_record.establishment_id,
    target_professional_id,
    jsonb_build_object(
      'request_id', target_request_id,
      'appointment_id', appointment_record.id,
      'from_professional_id', appointment_record.professional_id,
      'to_professional_id', target_professional_id,
      'reason_code', reason_code,
      'result', result
    )
  );

  RETURN result;
EXCEPTION WHEN unique_violation THEN
  SELECT audit.metadata->'result'
  INTO replay_result
  FROM public.authorization_audit_log AS audit
  WHERE audit.action = 'appointment.walk_in.transferred'
    AND audit.metadata->>'request_id' = target_request_id::text
  LIMIT 1;
  IF replay_result IS NOT NULL THEN RETURN replay_result; END IF;
  RAISE;
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
  resolved_establishment_id uuid;
  item jsonb;
  appointment_row public.appointments%ROWTYPE;
  action_name text;
  to_professional_id uuid;
  cancel_note text;
  item_error text;
  item_request_id uuid;
  results jsonb := '[]'::jsonb;
  created_block_id uuid;
  block_start timestamptz;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF range_end <= range_start THEN RAISE EXCEPTION 'invalid_absence_range'; END IF;
  IF range_end > range_start + interval '31 days' THEN RAISE EXCEPTION 'invalid_absence_range'; END IF;
  IF transfers IS NULL OR jsonb_typeof(transfers) <> 'array' THEN RAISE EXCEPTION 'invalid_transfers_payload'; END IF;

  SELECT membership.establishment_id
  INTO resolved_establishment_id
  FROM public.memberships AS membership
  WHERE membership.profile_id = target_professional_id
    AND membership.status = 'active'
    AND membership.role IN ('professional', 'admin')
  ORDER BY CASE WHEN membership.role = 'professional' THEN 0 ELSE 1 END
  LIMIT 1;

  IF resolved_establishment_id IS NULL THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(resolved_establishment_id, ARRAY['admin']);
  actor_is_owner := actor_id = target_professional_id
    AND public.has_active_membership(resolved_establishment_id, ARRAY['professional', 'admin']);
  IF NOT actor_is_admin AND NOT actor_is_owner THEN RAISE EXCEPTION 'forbidden'; END IF;

  FOR item IN SELECT * FROM jsonb_array_elements(transfers)
  LOOP
    item_error := NULL;
    action_name := lower(COALESCE(item->>'action', ''));
    BEGIN
      SELECT * INTO appointment_row
      FROM public.appointments
      WHERE id = item->>'appointment_id'
        AND deleted_at IS NULL
      FOR UPDATE;

      IF appointment_row.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
      IF appointment_row.establishment_id <> resolved_establishment_id THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF appointment_row.professional_id <> target_professional_id THEN RAISE EXCEPTION 'forbidden'; END IF;
      IF appointment_row.status NOT IN ('pending', 'confirmed') THEN RAISE EXCEPTION 'appointment_status_immutable'; END IF;
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
        IF appointment_row.client_id IS NOT NULL
           OR appointment_row.establishment_client_id IS NOT NULL
        THEN
          RAISE LOG 'appointment_reassignment_requires_workflow';
          RAISE EXCEPTION 'appointment_reassignment_requires_workflow';
        END IF;
        IF NOT actor_is_admin THEN RAISE EXCEPTION 'forbidden'; END IF;

        to_professional_id := NULLIF(item->>'to_professional_id', '')::uuid;
        IF to_professional_id IS NULL THEN RAISE EXCEPTION 'substitute_required'; END IF;
        IF to_professional_id = target_professional_id THEN RAISE EXCEPTION 'substitute_must_differ'; END IF;
        item_request_id := NULLIF(item->>'request_id', '')::uuid;

        PERFORM public.transfer_unlinked_walk_in_professional(
          appointment_row.id,
          to_professional_id,
          item->>'reason_code',
          item_request_id
        );
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

  block_start := GREATEST(range_start, now() + interval '1 second');
  IF block_start < range_end THEN
    IF EXISTS (
      SELECT 1 FROM public.appointments appointment
      WHERE appointment.establishment_id = resolved_establishment_id
        AND appointment.professional_id = target_professional_id
        AND appointment.status IN ('pending', 'confirmed')
        AND appointment.deleted_at IS NULL
        AND appointment.date_time < range_end
        AND appointment.ends_at > block_start
    ) THEN
      RETURN jsonb_build_object(
        'results', results,
        'schedule_block_id', NULL,
        'schedule_block_error', 'schedule_block_conflict'
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM public.schedule_blocks block
      WHERE block.establishment_id = resolved_establishment_id
        AND block.professional_id = target_professional_id
        AND block.deleted_at IS NULL
        AND block.starts_at < range_end
        AND block.ends_at > block_start
    ) THEN
      INSERT INTO public.schedule_blocks (
        establishment_id, professional_id, starts_at, ends_at, kind, reason, created_by
      ) VALUES (
        resolved_establishment_id, target_professional_id, block_start, range_end,
        'time_off', 'Modo ausência', actor_id
      ) RETURNING id INTO created_block_id;

      INSERT INTO public.authorization_audit_log (
        actor_id, action, establishment_id, target_profile_id, metadata
      ) VALUES (
        actor_id, 'schedule_block_created', resolved_establishment_id, target_professional_id,
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

REVOKE ALL ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reschedule_appointment(text, timestamptz, uuid, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_unlinked_walk_in_professional(text, uuid, text, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_unlinked_walk_in_professional(text, uuid, text, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_professional_absence(uuid, timestamptz, timestamptz, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_professional_absence(uuid, timestamptz, timestamptz, jsonb)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
