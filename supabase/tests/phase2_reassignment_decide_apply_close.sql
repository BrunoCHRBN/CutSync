BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase2_close_actor(actor_id uuid)
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
  original_professional_id uuid := gen_random_uuid();
  replacement_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  target_appointment_id text := gen_random_uuid()::text;
  withdrawn_appointment_id text := gen_random_uuid()::text;
  expired_appointment_id text := gen_random_uuid()::text;
  target_service_id text := gen_random_uuid()::text;
  appointment_starts_at timestamptz;
  appointment_updated_at timestamptz;
  withdrawn_updated_at timestamptz;
  expired_updated_at timestamptz;
  local_date date := current_date + 2;
  local_day integer := extract(dow FROM current_date + 2)::integer;
  schedule_json text;
  workflow_id uuid;
  withdrawn_workflow_id uuid;
  expired_workflow_id uuid;
  request_id uuid := gen_random_uuid();
  validate_id uuid := gen_random_uuid();
  propose_id uuid := gen_random_uuid();
  decision_id uuid := gen_random_uuid();
  apply_id uuid := gen_random_uuid();
  response jsonb;
  stale_apply_blocked boolean := false;
  decision_key_reuse_blocked boolean := false;
BEGIN
  appointment_starts_at := (
    local_date::timestamp + time '12:00'
  ) AT TIME ZONE 'America/Sao_Paulo';
  schedule_json := jsonb_build_array(jsonb_build_object(
    'day', local_day,
    'isOpen', true,
    'open', '09:00',
    'close', '18:00'
  ))::text;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (customer_id, 'phase2-close-customer@example.test', now()),
    (original_professional_id, 'phase2-close-professional@example.test', now()),
    (replacement_id, 'phase2-close-replacement@example.test', now()),
    (manager_id, 'phase2-close-manager@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas, opening_hours
  ) VALUES (
    unit_id,
    'Phase 2 Close Unit',
    'phase2-close-' || substr(unit_id::text, 1, 8),
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
    WHEN id IN (original_professional_id, replacement_id) THEN schedule_json
    ELSE work_hours
  END
  WHERE id IN (customer_id, original_professional_id, replacement_id, manager_id);

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (original_professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (replacement_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (manager_id, unit_id, 'professional', 'manager', 'active', manager_id);

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (target_service_id, unit_id, 'Phase 2 Close Service', 50, 30, true);
  INSERT INTO public.professional_services(
    establishment_id, professional_id, service_id, price,
    duration_minutes, is_active
  ) VALUES
    (unit_id, original_professional_id, target_service_id, 50, 30, true),
    (unit_id, replacement_id, target_service_id, 50, 30, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    target_appointment_id, unit_id, customer_id, original_professional_id,
    target_service_id, appointment_starts_at,
    appointment_starts_at + interval '30 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO appointment_updated_at;

  PERFORM pg_temp.set_phase2_close_actor(original_professional_id);
  response := public.request_appointment_reassignment(
    target_appointment_id,
    'professional_absence',
    'professional',
    appointment_starts_at - interval '1 hour',
    appointment_updated_at,
    request_id,
    gen_random_uuid()
  );
  workflow_id := (response->>'reassignmentRequestId')::uuid;
  PERFORM public.validate_appointment_reassignment(workflow_id, 1, validate_id);

  PERFORM pg_temp.set_phase2_close_actor(manager_id);
  PERFORM public.propose_appointment_reassignment(
    workflow_id, replacement_id, 2, propose_id
  );

  PERFORM pg_temp.set_phase2_close_actor(customer_id);
  response := public.decide_appointment_reassignment(
    workflow_id, 'accept_replacement', NULL, 'client_app', NULL, 3, decision_id
  );
  IF response->>'status' <> 'ready_to_apply'
    OR (response->>'version')::integer <> 4
    OR response->>'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'invalid customer decision response: %', response;
  END IF;
  response := public.decide_appointment_reassignment(
    workflow_id, 'accept_replacement', NULL, 'client_app', NULL, 3, decision_id
  );
  IF response->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'customer decision replay failed: %', response;
  END IF;
  BEGIN
    PERFORM public.decide_appointment_reassignment(
      workflow_id, 'accept_replacement', NULL, 'client_web', NULL, 3, decision_id
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    decision_key_reuse_blocked := SQLERRM LIKE '%idempotency_key_reused%';
  END;
  IF NOT decision_key_reuse_blocked THEN
    RAISE EXCEPTION 'decision idempotency key accepted a changed channel';
  END IF;

  PERFORM pg_temp.set_phase2_close_actor(manager_id);
  BEGIN
    PERFORM public.apply_appointment_reassignment(workflow_id, 3, gen_random_uuid());
  EXCEPTION WHEN serialization_failure THEN
    stale_apply_blocked := true;
  END;
  IF NOT stale_apply_blocked THEN
    RAISE EXCEPTION 'application accepted stale workflow version';
  END IF;

  response := public.apply_appointment_reassignment(workflow_id, 4, apply_id);
  IF response->>'status' <> 'applied'
    OR (response->>'version')::integer <> 5
    OR (response->>'professionalId')::uuid <> replacement_id
    OR response->>'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'invalid application response: %', response;
  END IF;
  response := public.apply_appointment_reassignment(workflow_id, 4, apply_id);
  IF response->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'application replay failed: %', response;
  END IF;

  IF (SELECT professional_id FROM public.appointments WHERE id = target_appointment_id)
      <> replacement_id
  THEN
    RAISE EXCEPTION 'appointment projection was not updated atomically';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_professional_assignments
    WHERE appointment_id = target_appointment_id
      AND professional_id = replacement_id
      AND status = 'active'
      AND effective_until IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.appointment_professional_assignments AS assignment
    WHERE assignment.appointment_id = target_appointment_id
      AND assignment.professional_id = original_professional_id
      AND assignment.status = 'superseded'
      AND assignment.effective_until IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'assignment history did not close correctly';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.decision_queue_items
    WHERE reassignment_request_id = workflow_id
  ) THEN
    RAISE EXCEPTION 'terminal workflow remained in the decision queue';
  END IF;
  IF (SELECT count(*) FROM public.appointment_assignment_events
      WHERE reassignment_request_id = workflow_id) <> 5
  THEN
    RAISE EXCEPTION 'expected five immutable workflow events';
  END IF;

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    withdrawn_appointment_id, unit_id, customer_id, original_professional_id,
    target_service_id, appointment_starts_at + interval '2 hours',
    appointment_starts_at + interval '150 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO withdrawn_updated_at;
  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    expired_appointment_id, unit_id, customer_id, original_professional_id,
    target_service_id, appointment_starts_at + interval '3 hours',
    appointment_starts_at + interval '210 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO expired_updated_at;

  PERFORM pg_temp.set_phase2_close_actor(original_professional_id);
  response := public.request_appointment_reassignment(
    withdrawn_appointment_id, 'professional_absence', 'professional',
    appointment_starts_at - interval '1 hour', withdrawn_updated_at,
    gen_random_uuid(), gen_random_uuid()
  );
  withdrawn_workflow_id := (response->>'reassignmentRequestId')::uuid;
  response := public.withdraw_appointment_reassignment(
    withdrawn_workflow_id, 1,
    'Ausência resolvida antes de qualquer substituição.', gen_random_uuid()
  );
  IF response->>'status' <> 'withdrawn'
    OR (SELECT professional_id FROM public.appointments
        WHERE id = withdrawn_appointment_id) <> original_professional_id
  THEN
    RAISE EXCEPTION 'withdraw changed the appointment projection: %', response;
  END IF;

  response := public.request_appointment_reassignment(
    expired_appointment_id, 'professional_absence', 'professional',
    appointment_starts_at - interval '1 hour', expired_updated_at,
    gen_random_uuid(), gen_random_uuid()
  );
  expired_workflow_id := (response->>'reassignmentRequestId')::uuid;
  UPDATE public.appointment_reassignment_requests
  SET created_at = now() - interval '2 hours',
      due_at = now() - interval '1 hour'
  WHERE id = expired_workflow_id;

  PERFORM pg_temp.set_phase2_close_actor(manager_id);
  response := public.expire_appointment_reassignment(
    expired_workflow_id, 1, gen_random_uuid()
  );
  IF response->>'status' <> 'expired'
    OR (SELECT professional_id FROM public.appointments
        WHERE id = expired_appointment_id) <> original_professional_id
  THEN
    RAISE EXCEPTION 'expiration changed the appointment projection: %', response;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.decision_queue_items
    WHERE reassignment_request_id IN (withdrawn_workflow_id, expired_workflow_id)
  ) THEN
    RAISE EXCEPTION 'withdrawn or expired workflow remained in decision queue';
  END IF;
END;
$test$;

ROLLBACK;
