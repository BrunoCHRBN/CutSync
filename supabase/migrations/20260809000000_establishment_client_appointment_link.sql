BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Link authenticated bookings to the establishment carteira. A CRM failure must
-- never abort an appointment: unresolved profiles leave establishment_client_id
-- null and are recorded for later reconciliation. Walk-ins created by the
-- business app finally record source = 'walk_in'. Historical appointments that
-- already carry a client_id are backfilled in batches without merging by name.

-- ---------------------------------------------------------------------------
-- Client and staff booking path
-- ---------------------------------------------------------------------------

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
  resolved_establishment_client_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_date_time <= now() THEN RAISE EXCEPTION 'appointment_must_be_in_future'; END IF;
  actor_is_admin := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin']);
  actor_is_professional := target_professional_id = actor_id
    AND public.has_active_membership(
      target_establishment_id, ARRAY['professional', 'admin']
    );
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = target_professional_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
  ) THEN
    RAISE EXCEPTION 'professional_unavailable';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.services AS service
    WHERE service.id = target_service_id
      AND service.establishment_id = target_establishment_id
      AND service.is_active = true
      AND service.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.professional_services AS professional_service
    WHERE professional_service.professional_id = target_professional_id
      AND professional_service.service_id = target_service_id
      AND professional_service.establishment_id = target_establishment_id
      AND professional_service.is_active = false
  ) THEN
    RAISE EXCEPTION 'service_unavailable_for_professional';
  END IF;

  SELECT establishment.timezone, COALESCE(establishment.instant_booking_enabled, true)
  INTO target_timezone, is_instant_booking
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    (target_date_time AT TIME ZONE target_timezone)::date,
    NULL
  ) AS slot
  WHERE slot.starts_at = target_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN
      RAISE EXCEPTION 'appointment_conflict';
    END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  IF actor_is_admin OR actor_is_professional THEN
    effective_client_id := target_client_id;
    IF effective_client_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.profiles AS profile WHERE profile.id = effective_client_id
    ) THEN RAISE EXCEPTION 'client_not_found'; END IF;
    effective_client_name := NULLIF(trim(target_client_name), '');
    IF effective_client_id IS NULL AND effective_client_name IS NULL THEN
      RAISE EXCEPTION 'client_name_required';
    END IF;
    initial_status := 'confirmed';
  ELSE
    IF target_client_id IS NOT NULL AND target_client_id <> actor_id THEN
      RAISE EXCEPTION 'forbidden';
    END IF;
    effective_client_id := actor_id;
    SELECT profile.name INTO effective_client_name
    FROM public.profiles AS profile
    WHERE profile.id = actor_id;
    IF effective_client_name IS NULL THEN RAISE EXCEPTION 'profile_not_found'; END IF;

    IF is_instant_booking THEN
      initial_status := 'confirmed';
    ELSE
      initial_status := 'pending';
    END IF;
  END IF;

  -- Prefer a confirmed link; otherwise create or reuse the local CRM row. A
  -- rejected identity request returns NULL and the booking still proceeds.
  IF effective_client_id IS NOT NULL THEN
    BEGIN
      resolved_establishment_client_id :=
        public.ensure_establishment_client_for_profile(
          target_establishment_id,
          effective_client_id,
          'client_booking'
        );
    EXCEPTION WHEN OTHERS THEN
      -- CRM must not invent a new failure mode for booking.
      resolved_establishment_client_id := NULL;
    END;
  END IF;

  INSERT INTO public.appointments (
    establishment_id,
    client_id,
    client_name,
    establishment_client_id,
    professional_id,
    service_id,
    date_time,
    status,
    reschedule_count
  ) VALUES (
    target_establishment_id,
    effective_client_id,
    effective_client_name,
    resolved_establishment_client_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    initial_status,
    0
  )
  RETURNING id INTO created_appointment_id;

  IF effective_client_id IS NOT NULL AND resolved_establishment_client_id IS NULL THEN
    INSERT INTO public.authorization_audit_log (
      actor_id, action, establishment_id, target_profile_id, metadata
    ) VALUES (
      actor_id,
      'client.establishment_client.unresolved_for_appointment',
      target_establishment_id,
      effective_client_id,
      jsonb_build_object(
        'appointment_id', created_appointment_id,
        'profile_id', effective_client_id
      )
    );
  END IF;

  RETURN created_appointment_id;
EXCEPTION WHEN exclusion_violation THEN
  RAISE EXCEPTION 'appointment_conflict' USING ERRCODE = '23P01';
END;
$$;

-- ---------------------------------------------------------------------------
-- Walk-in source
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.create_business_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_request_id uuid,
  target_establishment_client_id uuid DEFAULT NULL,
  target_client_name text DEFAULT NULL,
  target_client_phone text DEFAULT NULL,
  target_client_email text DEFAULT NULL,
  target_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  selected_slot record;
  client_record public.establishment_clients%ROWTYPE;
  linked_profile_id uuid;
  created_appointment public.appointments%ROWTYPE;
  result jsonb;
BEGIN
  IF char_length(COALESCE(target_client_name, '')) > 120
    OR char_length(COALESCE(target_client_phone, '')) > 32
    OR char_length(COALESCE(target_client_email, '')) > 254
    OR char_length(COALESCE(target_notes, '')) > 2000
  THEN RAISE EXCEPTION 'invalid_client_details'; END IF;
  IF target_establishment_client_id IS NULL THEN
    PERFORM public.assert_valid_establishment_client_values(
      target_client_name,
      NULLIF(btrim(target_client_phone), ''),
      NULLIF(lower(btrim(target_client_email)), ''),
      ARRAY[]::text[],
      NULL
    );
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.created',
    jsonb_strip_nulls(jsonb_build_object(
      'professionalId', target_professional_id,
      'serviceId', target_service_id,
      'startsAt', target_date_time,
      'establishmentClientId', target_establishment_client_id,
      'clientName', NULLIF(btrim(target_client_name), ''),
      'clientPhone', NULLIF(btrim(target_client_phone), ''),
      'clientEmail', NULLIF(lower(btrim(target_client_email)), ''),
      'notes', NULLIF(btrim(target_notes), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF target_date_time IS NULL OR target_date_time < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'appointment_must_not_be_in_past';
  END IF;
  IF NOT public.can_operate_business_appointment(
    target_establishment_id, target_professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT timezone INTO target_timezone
  FROM public.establishments
  WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    (target_date_time AT TIME ZONE target_timezone)::date,
    NULL
  ) AS slot
  WHERE slot.starts_at = target_date_time;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN
      result := jsonb_build_object(
        'errorCode', 'appointment_conflict',
        'professionalId', target_professional_id
      );
      PERFORM public.enqueue_business_operational_conflict(
        'appointment-conflict:' || target_request_id::text,
        target_establishment_id,
        target_professional_id,
        NULL
      );
      RETURN public.complete_mobile_command(target_request_id, result);
    END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  IF target_establishment_client_id IS NOT NULL THEN
    SELECT * INTO client_record
    FROM public.establishment_clients
    WHERE id = target_establishment_client_id
      AND establishment_id = target_establishment_id
      AND status = 'active'
    FOR UPDATE;
    IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  ELSE
    IF NULLIF(btrim(target_client_name), '') IS NULL THEN
      RAISE EXCEPTION 'client_name_required';
    END IF;
    INSERT INTO public.establishment_clients (
      establishment_id, display_name, phone, email, source,
      created_by, updated_by
    ) VALUES (
      target_establishment_id,
      btrim(target_client_name),
      NULLIF(btrim(target_client_phone), ''),
      NULLIF(lower(btrim(target_client_email)), ''),
      'walk_in',
      actor_id,
      actor_id
    ) RETURNING * INTO client_record;
    PERFORM public.queue_establishment_client_match(client_record.id, actor_id);
  END IF;

  SELECT link.profile_id INTO linked_profile_id
  FROM public.establishment_client_links AS link
  WHERE link.establishment_client_id = client_record.id
    AND link.status = 'confirmed'
  LIMIT 1;

  INSERT INTO public.appointments (
    establishment_id,
    client_id,
    client_name,
    establishment_client_id,
    business_notes,
    professional_id,
    service_id,
    date_time,
    ends_at,
    duration_minutes,
    status
  ) VALUES (
    target_establishment_id,
    linked_profile_id,
    client_record.display_name,
    client_record.id,
    NULLIF(btrim(target_notes), ''),
    target_professional_id,
    target_service_id,
    target_date_time,
    target_date_time + make_interval(mins => selected_slot.duration_minutes),
    selected_slot.duration_minutes,
    'confirmed'
  ) RETURNING * INTO created_appointment;

  result := jsonb_build_object(
    'appointmentId', created_appointment.id,
    'status', created_appointment.status,
    'establishmentClientId', client_record.id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
EXCEPTION WHEN exclusion_violation THEN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.created',
    jsonb_strip_nulls(jsonb_build_object(
      'professionalId', target_professional_id,
      'serviceId', target_service_id,
      'startsAt', target_date_time,
      'establishmentClientId', target_establishment_client_id,
      'clientName', NULLIF(btrim(target_client_name), ''),
      'clientPhone', NULLIF(btrim(target_client_phone), ''),
      'clientEmail', NULLIF(lower(btrim(target_client_email)), ''),
      'notes', NULLIF(btrim(target_notes), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  result := jsonb_build_object(
    'errorCode', 'appointment_conflict',
    'professionalId', target_professional_id
  );
  PERFORM public.enqueue_business_operational_conflict(
    'appointment-conflict:' || target_request_id::text,
    target_establishment_id,
    target_professional_id,
    NULL
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Historical backfill
-- ---------------------------------------------------------------------------

-- Processes one page of distinct (establishment_id, client_id) pairs. Safe to
-- call repeatedly: already-linked appointments are skipped, and ensure is
-- idempotent for a given profile in a unit.
CREATE OR REPLACE FUNCTION public.backfill_establishment_clients_from_appointments(
  target_batch_size integer DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  batch_size integer := GREATEST(1, LEAST(COALESCE(target_batch_size, 100), 1000));
  pair record;
  resolved_client_id uuid;
  pairs_seen integer := 0;
  pairs_linked integer := 0;
  pairs_unresolved integer := 0;
  appointments_updated integer := 0;
  updated_for_pair integer;
BEGIN
  FOR pair IN
    SELECT appointment.establishment_id, appointment.client_id
    FROM public.appointments AS appointment
    WHERE appointment.client_id IS NOT NULL
      AND appointment.establishment_client_id IS NULL
      AND appointment.deleted_at IS NULL
    GROUP BY appointment.establishment_id, appointment.client_id
    ORDER BY appointment.establishment_id, appointment.client_id
    LIMIT batch_size
  LOOP
    pairs_seen := pairs_seen + 1;

    BEGIN
      resolved_client_id := public.ensure_establishment_client_for_profile(
        pair.establishment_id,
        pair.client_id,
        'client_booking'
      );
    EXCEPTION WHEN OTHERS THEN
      resolved_client_id := NULL;
    END;

    IF resolved_client_id IS NULL THEN
      pairs_unresolved := pairs_unresolved + 1;
      INSERT INTO public.authorization_audit_log (
        actor_id, action, establishment_id, target_profile_id, metadata
      ) VALUES (
        pair.client_id,
        'client.establishment_client.unresolved_for_backfill',
        pair.establishment_id,
        pair.client_id,
        jsonb_build_object('profile_id', pair.client_id)
      );
      CONTINUE;
    END IF;

    UPDATE public.appointments AS appointment
    SET establishment_client_id = resolved_client_id
    WHERE appointment.establishment_id = pair.establishment_id
      AND appointment.client_id = pair.client_id
      AND appointment.establishment_client_id IS NULL
      AND appointment.deleted_at IS NULL;
    GET DIAGNOSTICS updated_for_pair = ROW_COUNT;
    appointments_updated := appointments_updated + updated_for_pair;
    pairs_linked := pairs_linked + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'batchSize', batch_size,
    'pairsSeen', pairs_seen,
    'pairsLinked', pairs_linked,
    'pairsUnresolved', pairs_unresolved,
    'appointmentsUpdated', appointments_updated,
    'hasMore', pairs_seen = batch_size
  );
END;
$$;

REVOKE ALL ON FUNCTION public.backfill_establishment_clients_from_appointments(integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_establishment_clients_from_appointments(integer)
  TO service_role;

-- Drain existing profile-linked appointments. Name-only rows are intentionally
-- left alone: shared display names are not identity.
DO $backfill$
DECLARE
  page jsonb;
  rounds integer := 0;
BEGIN
  LOOP
    page := public.backfill_establishment_clients_from_appointments(200);
    rounds := rounds + 1;
    EXIT WHEN COALESCE((page->>'hasMore')::boolean, false) = false OR rounds >= 1000;
  END LOOP;
END;
$backfill$;

COMMIT;
