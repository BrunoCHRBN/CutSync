BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase2_actor(actor_id uuid)
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
  customer_id uuid := gen_random_uuid();
  professional_id uuid := gen_random_uuid();
  replacement_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  target_appointment_id text := gen_random_uuid()::text;
  blocked_appointment_id text := gen_random_uuid()::text;
  target_service_id text := gen_random_uuid()::text;
  appointment_starts_at timestamptz;
  blocked_appointment_starts_at timestamptz;
  blocked_due_at timestamptz;
  appointment_updated_at timestamptz;
  blocked_appointment_updated_at timestamptz;
  local_date date := current_date + 2;
  local_day integer := extract(dow FROM current_date + 2)::integer;
  schedule_json text;
  create_request_id uuid := gen_random_uuid();
  correlation_id uuid := gen_random_uuid();
  validate_request_id uuid := gen_random_uuid();
  propose_request_id uuid := gen_random_uuid();
  workflow_id uuid;
  response jsonb;
  workflow_status text;
  workflow_version integer;
  projected_professional_id uuid;
  queue_actions text[];
  forbidden_proposal boolean := false;
  version_conflict boolean := false;
  order_open_blocked boolean := false;
BEGIN
  appointment_starts_at := (
    local_date::timestamp + time '12:00'
  ) AT TIME ZONE 'America/Sao_Paulo';
  blocked_appointment_starts_at := (
    (now() AT TIME ZONE 'America/Sao_Paulo')::date + time '23:59:59.999999'
  ) AT TIME ZONE 'America/Sao_Paulo';
  blocked_due_at := now() + ((blocked_appointment_starts_at - now()) / 2);
  schedule_json := jsonb_build_array(jsonb_build_object(
    'day', local_day,
    'isOpen', true,
    'open', '09:00',
    'close', '18:00'
  ))::text;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (customer_id, 'phase2-rvp-customer@example.test', now()),
    (professional_id, 'phase2-rvp-professional@example.test', now()),
    (replacement_id, 'phase2-rvp-replacement@example.test', now()),
    (manager_id, 'phase2-rvp-manager@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas, opening_hours
  ) VALUES (
    unit_id,
    'Phase 2 RPC Unit',
    'phase2-rpc-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false,
    schedule_json
  );
  UPDATE public.establishments
  SET appointment_reassignment_enabled = true
  WHERE id = unit_id;

  UPDATE public.profiles
  SET work_hours = CASE
    WHEN id IN (professional_id, replacement_id) THEN schedule_json
    ELSE work_hours
  END
  WHERE id IN (customer_id, professional_id, replacement_id, manager_id);

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (replacement_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (manager_id, unit_id, 'professional', 'manager', 'active', manager_id);

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (target_service_id, unit_id, 'Phase 2 RPC Service', 50, 30, true);
  INSERT INTO public.professional_services(
    establishment_id, professional_id, service_id, price,
    duration_minutes, is_active
  ) VALUES
    (unit_id, professional_id, target_service_id, 50, 30, true),
    (unit_id, replacement_id, target_service_id, 50, 30, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    target_appointment_id, unit_id, customer_id, professional_id,
    target_service_id, appointment_starts_at,
    appointment_starts_at + interval '30 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO appointment_updated_at;

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    blocked_appointment_id, unit_id, customer_id, professional_id,
    target_service_id, blocked_appointment_starts_at,
    blocked_appointment_starts_at + interval '30 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO blocked_appointment_updated_at;
  INSERT INTO public.service_orders(
    establishment_id, appointment_id, professional_id,
    created_by, updated_by
  ) VALUES (
    unit_id, blocked_appointment_id, professional_id,
    manager_id, manager_id
  );

  PERFORM pg_temp.set_phase2_actor(professional_id);
  BEGIN
    PERFORM public.request_appointment_reassignment(
      blocked_appointment_id,
      'professional_absence',
      'professional',
      blocked_due_at,
      blocked_appointment_updated_at,
      gen_random_uuid(),
      gen_random_uuid()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    order_open_blocked := SQLERRM LIKE '%appointment_reassignment_after_order_open%';
  END;
  IF NOT order_open_blocked THEN
    RAISE EXCEPTION 'request was accepted after the service order opened';
  END IF;

  response := public.request_appointment_reassignment(
    target_appointment_id,
    'professional_absence',
    'professional',
    appointment_starts_at - interval '1 hour',
    appointment_updated_at,
    create_request_id,
    correlation_id
  );
  workflow_id := (response->>'reassignmentRequestId')::uuid;
  IF response->>'status' <> 'requested'
    OR (response->>'version')::integer <> 1
    OR response->>'replayed' <> 'false'
    OR response->>'customerDecisionRequired' <> 'true'
  THEN
    RAISE EXCEPTION 'invalid request response: %', response;
  END IF;

  response := public.request_appointment_reassignment(
    target_appointment_id,
    'professional_absence',
    'professional',
    appointment_starts_at - interval '1 hour',
    appointment_updated_at,
    create_request_id,
    correlation_id
  );
  IF response->>'replayed' <> 'true'
    OR (response->>'reassignmentRequestId')::uuid <> workflow_id
  THEN
    RAISE EXCEPTION 'request replay failed: %', response;
  END IF;

  BEGIN
    PERFORM public.validate_appointment_reassignment(
      workflow_id, 99, gen_random_uuid()
    );
  EXCEPTION WHEN serialization_failure THEN
    version_conflict := true;
  END;
  IF NOT version_conflict THEN
    RAISE EXCEPTION 'validation accepted a stale version';
  END IF;

  response := public.validate_appointment_reassignment(
    workflow_id, 1, validate_request_id
  );
  IF response->>'status' <> 'awaiting_manager'
    OR (response->>'version')::integer <> 2
    OR response->>'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'invalid validation response: %', response;
  END IF;
  response := public.validate_appointment_reassignment(
    workflow_id, 1, validate_request_id
  );
  IF response->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'validation replay failed: %', response;
  END IF;

  BEGIN
    PERFORM public.propose_appointment_reassignment(
      workflow_id, replacement_id, 2, gen_random_uuid()
    );
  EXCEPTION WHEN insufficient_privilege THEN
    forbidden_proposal := true;
  END;
  IF NOT forbidden_proposal THEN
    RAISE EXCEPTION 'professional proposed a replacement without apply capability';
  END IF;

  PERFORM pg_temp.set_phase2_actor(manager_id);
  response := public.propose_appointment_reassignment(
    workflow_id, replacement_id, 2, propose_request_id
  );
  IF response->>'status' <> 'awaiting_customer'
    OR (response->>'version')::integer <> 3
    OR response->>'replayed' <> 'false'
    OR response->>'monetaryImpact' <> 'false'
  THEN
    RAISE EXCEPTION 'invalid proposal response: %', response;
  END IF;
  response := public.propose_appointment_reassignment(
    workflow_id, replacement_id, 2, propose_request_id
  );
  IF response->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'proposal replay failed: %', response;
  END IF;

  SELECT request.status, request.version
  INTO workflow_status, workflow_version
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = workflow_id;
  SELECT appointment.professional_id INTO projected_professional_id
  FROM public.appointments AS appointment
  WHERE appointment.id = target_appointment_id;
  SELECT item.allowed_actions INTO queue_actions
  FROM public.decision_queue_items AS item
  WHERE item.reassignment_request_id = workflow_id;

  IF workflow_status <> 'awaiting_customer'
    OR workflow_version <> 3
    OR projected_professional_id <> professional_id
    OR NOT ('accept_replacement' = ANY(queue_actions))
  THEN
    RAISE EXCEPTION 'workflow projection changed prematurely';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_professional_assignments AS assignment
    WHERE assignment.reassignment_request_id = workflow_id
      AND assignment.professional_id = replacement_id
      AND assignment.status = 'proposed'
  ) THEN
    RAISE EXCEPTION 'proposed assignment was not recorded';
  END IF;
  IF (SELECT count(*) FROM public.appointment_assignment_events AS event
      WHERE event.reassignment_request_id = workflow_id) <> 3
  THEN
    RAISE EXCEPTION 'expected request, validation and proposal events';
  END IF;
END;
$test$;

ROLLBACK;
