BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase2_decision_actor(actor_id uuid)
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

CREATE OR REPLACE FUNCTION pg_temp.open_phase2_proposal(
  target_appointment_id text,
  target_updated_at timestamptz,
  target_due_at timestamptz,
  original_professional_id uuid,
  manager_id uuid,
  replacement_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  response jsonb;
  workflow_id uuid;
BEGIN
  PERFORM pg_temp.set_phase2_decision_actor(original_professional_id);
  response := public.request_appointment_reassignment(
    target_appointment_id, 'professional_absence', 'professional',
    target_due_at, target_updated_at, gen_random_uuid(), gen_random_uuid()
  );
  workflow_id := (response->>'reassignmentRequestId')::uuid;
  PERFORM public.validate_appointment_reassignment(
    workflow_id, 1, gen_random_uuid()
  );
  PERFORM pg_temp.set_phase2_decision_actor(manager_id);
  PERFORM public.propose_appointment_reassignment(
    workflow_id, replacement_id, 2, gen_random_uuid()
  );
  RETURN workflow_id;
END;
$$;

DO $test$
DECLARE
  unit_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  original_professional_id uuid := gen_random_uuid();
  replacement_id uuid := gen_random_uuid();
  chosen_professional_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  service_id text := gen_random_uuid()::text;
  choose_appointment_id text := gen_random_uuid()::text;
  reschedule_appointment_id text := gen_random_uuid()::text;
  cancel_appointment_id text := gen_random_uuid()::text;
  contested_appointment_id text := gen_random_uuid()::text;
  choose_updated_at timestamptz;
  reschedule_updated_at timestamptz;
  cancel_updated_at timestamptz;
  contested_updated_at timestamptz;
  choose_workflow_id uuid;
  reschedule_workflow_id uuid;
  cancel_workflow_id uuid;
  contested_workflow_id uuid;
  local_date date := current_date + 2;
  local_day integer := extract(dow FROM current_date + 2)::integer;
  starts_at timestamptz;
  schedule_json text;
  response jsonb;
  competing_proposal_blocked boolean := false;
  competing_apply_blocked boolean := false;
BEGIN
  starts_at := (local_date::timestamp + time '10:00')
    AT TIME ZONE 'America/Sao_Paulo';
  schedule_json := jsonb_build_array(jsonb_build_object(
    'day', local_day, 'isOpen', true, 'open', '09:00', 'close', '18:00'
  ))::text;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (customer_id, 'phase2-decisions-customer@example.test', now()),
    (original_professional_id, 'phase2-decisions-original@example.test', now()),
    (replacement_id, 'phase2-decisions-replacement@example.test', now()),
    (chosen_professional_id, 'phase2-decisions-chosen@example.test', now()),
    (manager_id, 'phase2-decisions-manager@example.test', now());
  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas, opening_hours
  ) VALUES (
    unit_id, 'G13 Decision Unit',
    'g13-decisions-' || substr(unit_id::text, 1, 8),
    'active', 'America/Sao_Paulo', false, schedule_json
  );
  UPDATE public.establishments
  SET appointment_reassignment_enabled = true
  WHERE id = unit_id;
  UPDATE public.profiles
  SET work_hours = CASE
    WHEN id IN (original_professional_id, replacement_id, chosen_professional_id)
      THEN schedule_json
    ELSE work_hours
  END
  WHERE id IN (
    customer_id, original_professional_id, replacement_id,
    chosen_professional_id, manager_id
  );
  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (original_professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (replacement_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (chosen_professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (manager_id, unit_id, 'professional', 'manager', 'active', manager_id);
  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (service_id, unit_id, 'G13 Decision Service', 50, 30, true);
  INSERT INTO public.professional_services(
    establishment_id, professional_id, service_id, price,
    duration_minutes, is_active
  ) VALUES
    (unit_id, original_professional_id, service_id, 50, 30, true),
    (unit_id, replacement_id, service_id, 50, 30, true),
    (unit_id, chosen_professional_id, service_id, 50, 30, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    choose_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at, starts_at + interval '30 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO choose_updated_at;
  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    reschedule_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at + interval '2 hours', starts_at + interval '150 minutes',
    30, 'confirmed', 50
  ) RETURNING updated_at INTO reschedule_updated_at;
  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    cancel_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at + interval '4 hours', starts_at + interval '270 minutes',
    30, 'confirmed', 50
  ) RETURNING updated_at INTO cancel_updated_at;
  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    contested_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at + interval '6 hours', starts_at + interval '390 minutes',
    30, 'confirmed', 50
  ) RETURNING updated_at INTO contested_updated_at;

  choose_workflow_id := pg_temp.open_phase2_proposal(
    choose_appointment_id, choose_updated_at, starts_at - interval '1 hour',
    original_professional_id, manager_id, replacement_id
  );
  BEGIN
    PERFORM public.propose_appointment_reassignment(
      choose_workflow_id, chosen_professional_id, 2, gen_random_uuid()
    );
  EXCEPTION WHEN serialization_failure THEN
    competing_proposal_blocked := true;
  END;
  IF NOT competing_proposal_blocked THEN
    RAISE EXCEPTION 'competing proposal accepted the consumed version';
  END IF;

  PERFORM pg_temp.set_phase2_decision_actor(customer_id);
  response := public.decide_appointment_reassignment(
    choose_workflow_id, 'choose_professional', chosen_professional_id,
    'client_app', NULL, 3, gen_random_uuid()
  );
  IF response->>'status' <> 'awaiting_manager'
    OR NOT EXISTS (
      SELECT 1 FROM public.appointment_professional_assignments AS assignment
      WHERE assignment.reassignment_request_id = choose_workflow_id
        AND assignment.professional_id = replacement_id
        AND assignment.status = 'superseded'
    )
  THEN
    RAISE EXCEPTION 'customer professional choice did not supersede proposal: %', response;
  END IF;
  PERFORM pg_temp.set_phase2_decision_actor(manager_id);
  PERFORM public.propose_appointment_reassignment(
    choose_workflow_id, chosen_professional_id, 4, gen_random_uuid()
  );
  PERFORM pg_temp.set_phase2_decision_actor(customer_id);
  PERFORM public.decide_appointment_reassignment(
    choose_workflow_id, 'accept_replacement', NULL,
    'client_app', NULL, 5, gen_random_uuid()
  );
  PERFORM pg_temp.set_phase2_decision_actor(manager_id);
  response := public.apply_appointment_reassignment(
    choose_workflow_id, 6, gen_random_uuid()
  );
  IF (SELECT professional_id FROM public.appointments
      WHERE id = choose_appointment_id) <> chosen_professional_id
  THEN
    RAISE EXCEPTION 'chosen professional was not applied: %', response;
  END IF;
  BEGIN
    PERFORM public.apply_appointment_reassignment(
      choose_workflow_id, 6, gen_random_uuid()
    );
  EXCEPTION WHEN serialization_failure THEN
    competing_apply_blocked := true;
  END;
  IF NOT competing_apply_blocked THEN
    RAISE EXCEPTION 'competing application accepted the consumed version';
  END IF;

  reschedule_workflow_id := pg_temp.open_phase2_proposal(
    reschedule_appointment_id, reschedule_updated_at, starts_at + interval '1 hour',
    original_professional_id, manager_id, replacement_id
  );
  PERFORM pg_temp.set_phase2_decision_actor(customer_id);
  response := public.decide_appointment_reassignment(
    reschedule_workflow_id, 'reschedule_original', NULL,
    'client_app', 'Cliente prefere outro horário com o profissional original.',
    3, gen_random_uuid()
  );
  IF response->>'status' <> 'manual_review'
    OR (SELECT professional_id FROM public.appointments
        WHERE id = reschedule_appointment_id) <> original_professional_id
  THEN
    RAISE EXCEPTION 'reschedule decision changed assignment: %', response;
  END IF;

  cancel_workflow_id := pg_temp.open_phase2_proposal(
    cancel_appointment_id, cancel_updated_at, starts_at + interval '3 hours',
    original_professional_id, manager_id, replacement_id
  );
  PERFORM pg_temp.set_phase2_decision_actor(customer_id);
  response := public.decide_appointment_reassignment(
    cancel_workflow_id, 'cancel_due_to_change', NULL,
    'client_app', 'Cliente cancelou devido à alteração iniciada pela unidade.',
    3, gen_random_uuid()
  );
  IF response->>'status' <> 'declined'
    OR (SELECT status FROM public.appointments
        WHERE id = cancel_appointment_id) <> 'cancelled'
    OR (SELECT cancellation_reason_code FROM public.appointments
        WHERE id = cancel_appointment_id) <> 'establishment_cancelled'
  THEN
    RAISE EXCEPTION 'cancel due to change was not classified safely: %', response;
  END IF;

  contested_workflow_id := pg_temp.open_phase2_proposal(
    contested_appointment_id, contested_updated_at, starts_at + interval '5 hours',
    original_professional_id, manager_id, replacement_id
  );
  PERFORM pg_temp.set_phase2_decision_actor(customer_id);
  response := public.decide_appointment_reassignment(
    contested_workflow_id, 'contested', NULL, 'client_app',
    'Cliente contestou as condições apresentadas para a substituição.',
    3, gen_random_uuid()
  );
  IF response->>'status' <> 'manual_review' THEN
    RAISE EXCEPTION 'contested decision did not enter manual review: %', response;
  END IF;
  PERFORM pg_temp.set_phase2_decision_actor(manager_id);
  response := public.decide_appointment_reassignment(
    contested_workflow_id, 'resolved', NULL, 'business',
    'Contestação revisada; uma nova proposta deverá ser apresentada.',
    4, gen_random_uuid()
  );
  IF response->>'status' <> 'awaiting_manager'
    OR (SELECT professional_id FROM public.appointments
        WHERE id = contested_appointment_id) <> original_professional_id
  THEN
    RAISE EXCEPTION 'contested resolution changed assignment: %', response;
  END IF;
END;
$test$;

ROLLBACK;
