BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase3_actor(actor_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
END;
$$;

DO $test$
DECLARE
  unit_id uuid := gen_random_uuid();
  other_unit_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  professional_id uuid := gen_random_uuid();
  replacement_id uuid := gen_random_uuid();
  alternative_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  service_id text := gen_random_uuid()::text;
  appointment_id text := gen_random_uuid()::text;
  local_date date := current_date + 2;
  local_day integer := extract(dow FROM current_date + 2)::integer;
  starts_at timestamptz;
  schedule_json text;
  appointment_updated_at timestamptz;
  workflow_id uuid;
  response jsonb;
  queue jsonb;
  detail jsonb;
  forbidden boolean := false;
BEGIN
  starts_at := (local_date::timestamp + time '12:00') AT TIME ZONE 'America/Sao_Paulo';
  IF has_function_privilege(
    'anon', 'public.get_business_appointment_detail(uuid,text)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'anonymous role can execute the Business appointment detail read model';
  END IF;
  IF NOT has_function_privilege(
    'authenticated', 'public.get_business_appointment_detail(uuid,text)', 'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'authenticated role cannot execute the Business appointment detail read model';
  END IF;
  schedule_json := jsonb_build_array(jsonb_build_object(
    'day', local_day, 'isOpen', true, 'open', '09:00', 'close', '18:00'
  ))::text;
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (customer_id, 'phase3-read-customer@example.test', now()),
    (professional_id, 'phase3-read-professional@example.test', now()),
    (replacement_id, 'phase3-read-replacement@example.test', now()),
    (alternative_id, 'phase3-read-alternative@example.test', now()),
    (manager_id, 'phase3-read-manager@example.test', now()),
    (outsider_id, 'phase3-read-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas,
    appointment_reassignment_enabled, opening_hours
  ) VALUES
    (unit_id, 'Phase 3 Unit', 'phase3-unit-' || substr(unit_id::text, 1, 8),
      'active', 'America/Sao_Paulo', false, true, schedule_json),
    (other_unit_id, 'Phase 3 Other', 'phase3-other-' || substr(other_unit_id::text, 1, 8),
      'active', 'America/Sao_Paulo', false, true, schedule_json);

  UPDATE public.profiles
  SET work_hours = schedule_json
  WHERE id IN (professional_id, replacement_id, alternative_id);
  UPDATE public.profiles
  SET notification_channels = ARRAY['push']::text[]
  WHERE id = customer_id;
  INSERT INTO public.push_devices(
    profile_id, app_kind, platform, expo_push_token, enabled
  ) VALUES (
    customer_id, 'client', 'android',
    'ExponentPushToken[phase3-g14-customer-device]', true
  );

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (replacement_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (alternative_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (manager_id, unit_id, 'professional', 'manager', 'active', manager_id),
    (outsider_id, other_unit_id, 'professional', 'manager', 'active', outsider_id);

  INSERT INTO public.services(id, establishment_id, name, price, duration_minutes, is_active)
  VALUES (service_id, unit_id, 'Corte Fase 3', 50, 30, true);
  INSERT INTO public.professional_services(
    establishment_id, professional_id, service_id, price, duration_minutes, is_active
  ) VALUES
    (unit_id, professional_id, service_id, 50, 30, true),
    (unit_id, replacement_id, service_id, 55, 30, true),
    (unit_id, alternative_id, service_id, 50, 30, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    appointment_id, unit_id, customer_id, professional_id, service_id,
    starts_at, starts_at + interval '30 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO appointment_updated_at;

  PERFORM pg_temp.set_phase3_actor(professional_id);
  detail := public.get_business_appointment_detail(unit_id, appointment_id);
  IF detail->>'updatedAt' IS NULL
    OR (detail->>'updatedAt')::timestamptz <> appointment_updated_at
  THEN
    RAISE EXCEPTION 'Business appointment detail omitted the optimistic version: %', detail;
  END IF;
  response := public.request_appointment_reassignment(
    appointment_id, 'professional_absence', 'professional',
    starts_at - interval '1 hour', appointment_updated_at,
    gen_random_uuid(), gen_random_uuid()
  );
  workflow_id := (response->>'reassignmentRequestId')::uuid;

  queue := public.list_business_decision_queue(unit_id);
  IF jsonb_array_length(queue) <> 1
    OR queue->0->'allowedActions' <> '["validate","withdraw"]'::jsonb
  THEN
    RAISE EXCEPTION 'professional queue leaked actions or missed own request: %', queue;
  END IF;

  PERFORM pg_temp.set_phase3_actor(manager_id);
  queue := public.list_business_decision_queue(unit_id);
  IF jsonb_array_length(queue) <> 1
    OR NOT (queue->0->'allowedActions' ? 'validate')
    OR queue->0->>'correlationId' <> response->>'correlationId'
  THEN
    RAISE EXCEPTION 'manager queue read model invalid: %', queue;
  END IF;

  response := public.validate_appointment_reassignment(workflow_id, 1, gen_random_uuid());
  IF response->>'status' <> 'awaiting_manager' THEN
    RAISE EXCEPTION 'Business validation command failed: %', response;
  END IF;
  queue := public.list_business_reassignment_candidates(unit_id, workflow_id);
  IF jsonb_array_length(queue) <> 2
    OR NOT EXISTS (
      SELECT 1
      FROM jsonb_array_elements(queue) AS candidate
      WHERE candidate->>'profileId' = replacement_id::text
        AND (candidate->>'priceCents')::integer = 5500
        AND candidate->>'monetaryImpact' = 'true'
    )
  THEN
    RAISE EXCEPTION 'candidate read model invalid: %', queue;
  END IF;

  response := public.propose_appointment_reassignment(
    workflow_id, replacement_id, 2, gen_random_uuid()
  );
  IF response->>'status' <> 'awaiting_customer' THEN
    RAISE EXCEPTION 'Business proposal command failed: %', response;
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'eventType', delivery.event_type,
    'appointmentId', delivery.payload->>'appointmentId',
    'reassignmentRequestId', delivery.payload->>'reassignmentRequestId',
    'correlationId', delivery.payload->>'correlationId'
  )) INTO queue
  FROM public.client_push_deliveries AS delivery
  WHERE delivery.event_type = 'appointment_reassignment_decision_required';
  IF jsonb_array_length(COALESCE(queue, '[]'::jsonb)) <> 1
    OR queue->0->>'appointmentId' <> appointment_id
    OR queue->0->>'reassignmentRequestId' <> workflow_id::text
    OR queue->0->>'correlationId' <> response->>'correlationId'
  THEN
    RAISE EXCEPTION 'Client decision push payload invalid: %', queue;
  END IF;

  detail := public.get_business_reassignment_detail(unit_id, workflow_id);
  IF detail->>'reassignmentRequestId' <> workflow_id::text
    OR jsonb_array_length(detail->'timeline') < 1
    OR detail->'timeline'->0->>'correlationId' <> detail->>'correlationId'
  THEN
    RAISE EXCEPTION 'detail timeline contract invalid: %', detail;
  END IF;

  PERFORM pg_temp.set_phase3_actor(customer_id);
  queue := public.list_client_reassignment_decisions();
  IF jsonb_array_length(queue) <> 1
    OR queue->0->>'reassignmentRequestId' <> workflow_id::text
    OR queue->0->'allowedActions' <> '["accept_replacement","choose_professional","reschedule_original","cancel_due_to_change"]'::jsonb
    OR queue->0->>'correlationId' <> response->>'correlationId'
  THEN
    RAISE EXCEPTION 'Client pending decision queue invalid: %', queue;
  END IF;

  detail := public.get_client_reassignment_detail(appointment_id);
  IF detail->>'reassignmentRequestId' <> workflow_id::text
    OR detail->'currentProfessional'->>'id' <> professional_id::text
    OR detail->'proposedProfessional'->>'id' <> replacement_id::text
    OR jsonb_array_length(detail->'timeline') < 3
    OR detail->'timeline'->0->>'correlationId' <> detail->>'correlationId'
  THEN
    RAISE EXCEPTION 'Client reassignment detail invalid: %', detail;
  END IF;

  queue := public.list_client_reassignment_candidates(workflow_id);
  IF jsonb_array_length(queue) <> 1
    OR queue->0->>'profileId' <> alternative_id::text
  THEN
    RAISE EXCEPTION 'Client alternative candidates invalid: %', queue;
  END IF;

  response := public.decide_appointment_reassignment(
    workflow_id, 'accept_replacement', NULL, 'client_app', NULL, 3, gen_random_uuid()
  );
  IF response->>'status' <> 'ready_to_apply' OR (response->>'version')::integer <> 4 THEN
    RAISE EXCEPTION 'Client acceptance receipt invalid: %', response;
  END IF;

  queue := public.list_client_reassignment_decisions();
  IF jsonb_array_length(queue) <> 0 THEN
    RAISE EXCEPTION 'accepted Client decision remained pending: %', queue;
  END IF;

  PERFORM pg_temp.set_phase3_actor(manager_id);
  response := public.withdraw_appointment_reassignment(
    workflow_id, 4, 'Cobertura indisponível após contato', gen_random_uuid()
  );
  IF response->>'status' <> 'withdrawn' THEN
    RAISE EXCEPTION 'Business withdrawal command failed: %', response;
  END IF;
  SELECT jsonb_agg(jsonb_build_object(
    'eventType', delivery.event_type,
    'appointmentId', delivery.payload->>'appointmentId',
    'reassignmentRequestId', delivery.payload->>'reassignmentRequestId',
    'correlationId', delivery.payload->>'correlationId'
  )) INTO queue
  FROM public.client_push_deliveries AS delivery
  WHERE delivery.event_type = 'appointment_reassignment_updated';
  IF jsonb_array_length(COALESCE(queue, '[]'::jsonb)) <> 1
    OR queue->0->>'appointmentId' <> appointment_id
    OR queue->0->>'reassignmentRequestId' <> workflow_id::text
    OR queue->0->>'correlationId' <> response->>'correlationId'
  THEN
    RAISE EXCEPTION 'Client reassignment update push invalid: %', queue;
  END IF;

  PERFORM pg_temp.set_phase3_actor(outsider_id);
  BEGIN
    PERFORM public.list_business_decision_queue(unit_id);
  EXCEPTION WHEN insufficient_privilege THEN
    forbidden := SQLERRM LIKE '%forbidden%';
  END;
  IF NOT forbidden THEN
    RAISE EXCEPTION 'cross-unit queue access was not denied';
  END IF;
  forbidden := false;
  BEGIN
    PERFORM public.get_client_reassignment_detail(appointment_id);
  EXCEPTION WHEN no_data_found THEN
    forbidden := SQLERRM LIKE '%appointment_not_found%';
  END;
  IF NOT forbidden THEN
    RAISE EXCEPTION 'Client appointment ownership was not enforced';
  END IF;
END;
$test$;

ROLLBACK;
