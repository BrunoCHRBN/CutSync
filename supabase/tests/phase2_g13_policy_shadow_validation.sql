BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase2_g13_actor(actor_id uuid)
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
  original_professional_id uuid := gen_random_uuid();
  equivalent_professional_id uuid := gen_random_uuid();
  priced_professional_id uuid := gen_random_uuid();
  external_professional_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  service_id text := gen_random_uuid()::text;
  safe_appointment_id text := gen_random_uuid()::text;
  priced_appointment_id text := gen_random_uuid()::text;
  cross_unit_appointment_id text := gen_random_uuid()::text;
  safe_updated_at timestamptz;
  priced_updated_at timestamptz;
  cross_unit_updated_at timestamptz;
  safe_workflow_id uuid;
  priced_workflow_id uuid;
  cross_unit_workflow_id uuid;
  first_run_id uuid;
  second_run_id uuid;
  first_shadow_request_id uuid := gen_random_uuid();
  local_date date := current_date + 2;
  local_day integer := extract(dow FROM current_date + 2)::integer;
  starts_at timestamptz;
  schedule_json text;
  response jsonb;
  cross_unit_blocked boolean := false;
  professional_reconcile_blocked boolean := false;
  immutable_evidence boolean := false;
  operational_party_change_blocked boolean := false;
BEGIN
  starts_at := (local_date::timestamp + time '12:00')
    AT TIME ZONE 'America/Sao_Paulo';
  schedule_json := jsonb_build_array(jsonb_build_object(
    'day', local_day, 'isOpen', true, 'open', '09:00', 'close', '18:00'
  ))::text;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (customer_id, 'phase2-g13-customer@example.test', now()),
    (original_professional_id, 'phase2-g13-original@example.test', now()),
    (equivalent_professional_id, 'phase2-g13-equivalent@example.test', now()),
    (priced_professional_id, 'phase2-g13-priced@example.test', now()),
    (external_professional_id, 'phase2-g13-external@example.test', now()),
    (manager_id, 'phase2-g13-manager@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas, opening_hours
  ) VALUES
    (
      unit_id, 'G13 Policy Unit',
      'g13-policy-' || substr(unit_id::text, 1, 8),
      'active', 'America/Sao_Paulo', false, schedule_json
    ),
    (
      other_unit_id, 'G13 External Unit',
      'g13-external-' || substr(other_unit_id::text, 1, 8),
      'active', 'America/Sao_Paulo', false, schedule_json
    );
  UPDATE public.establishments
  SET appointment_reassignment_enabled = true
  WHERE id = unit_id;

  UPDATE public.profiles
  SET work_hours = CASE
    WHEN id IN (
      original_professional_id, equivalent_professional_id,
      priced_professional_id, external_professional_id
    ) THEN schedule_json
    ELSE work_hours
  END
  WHERE id IN (
    customer_id, original_professional_id, equivalent_professional_id,
    priced_professional_id, external_professional_id, manager_id
  );

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (original_professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (equivalent_professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (priced_professional_id, unit_id, 'professional', 'professional', 'active', manager_id),
    (external_professional_id, other_unit_id, 'professional', 'professional', 'active', manager_id),
    (manager_id, unit_id, 'professional', 'manager', 'active', manager_id);

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (service_id, unit_id, 'G13 Policy Service', 50, 30, true);
  INSERT INTO public.professional_services(
    establishment_id, professional_id, service_id, price,
    duration_minutes, is_active
  ) VALUES
    (unit_id, original_professional_id, service_id, 50, 30, true),
    (unit_id, equivalent_professional_id, service_id, 50, 30, true),
    (unit_id, priced_professional_id, service_id, 60, 30, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    safe_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at, starts_at + interval '30 minutes', 30, 'confirmed', 50
  ) RETURNING updated_at INTO safe_updated_at;
  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    priced_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at + interval '2 hours', starts_at + interval '150 minutes',
    30, 'confirmed', 50
  ) RETURNING updated_at INTO priced_updated_at;
  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    cross_unit_appointment_id, unit_id, customer_id, original_professional_id,
    service_id, starts_at + interval '3 hours', starts_at + interval '210 minutes',
    30, 'confirmed', 50
  ) RETURNING updated_at INTO cross_unit_updated_at;

  INSERT INTO public.appointment_professional_preference_snapshots(
    appointment_id, establishment_id, preference, selected_professional_id,
    policy_version, policy_accepted, acceptance_channel, accepted_at,
    captured_by, request_id
  ) VALUES
    (safe_appointment_id, unit_id, 'any_available', NULL, 1, true,
      'client_app', now(), customer_id, gen_random_uuid()),
    (priced_appointment_id, unit_id, 'any_available', NULL, 1, true,
      'client_app', now(), customer_id, gen_random_uuid()),
    (cross_unit_appointment_id, unit_id, 'any_available', NULL, 1, true,
      'client_app', now(), customer_id, gen_random_uuid());

  PERFORM pg_temp.set_phase2_g13_actor(original_professional_id);
  response := public.request_appointment_reassignment(
    safe_appointment_id, 'professional_absence', 'professional',
    starts_at - interval '1 hour', safe_updated_at,
    gen_random_uuid(), gen_random_uuid()
  );
  safe_workflow_id := (response->>'reassignmentRequestId')::uuid;
  IF response->>'customerDecisionRequired' <> 'false' THEN
    RAISE EXCEPTION 'accepted any_available did not enter policy evaluation';
  END IF;
  PERFORM public.validate_appointment_reassignment(
    safe_workflow_id, 1, gen_random_uuid()
  );

  PERFORM pg_temp.set_phase2_g13_actor(manager_id);
  response := public.propose_appointment_reassignment(
    safe_workflow_id, equivalent_professional_id, 2, gen_random_uuid()
  );
  IF response->>'status' <> 'ready_to_apply'
    OR response->>'customerDecisionRequired' <> 'false'
    OR response->>'monetaryImpact' <> 'false'
  THEN
    RAISE EXCEPTION 'equivalent any_available proposal was not safe: %', response;
  END IF;
  UPDATE public.appointment_reassignment_requests
  SET proposed_condition = jsonb_set(
    proposed_condition, '{legalEntityId}', to_jsonb(gen_random_uuid()::text)
  )
  WHERE id = safe_workflow_id;
  BEGIN
    PERFORM public.apply_appointment_reassignment(
      safe_workflow_id, 3, gen_random_uuid()
    );
  EXCEPTION WHEN serialization_failure THEN
    operational_party_change_blocked :=
      SQLERRM LIKE '%reassignment_operational_party_changed%';
  END;
  IF NOT operational_party_change_blocked
    OR (SELECT professional_id FROM public.appointments
        WHERE id = safe_appointment_id) <> original_professional_id
  THEN
    RAISE EXCEPTION 'operational party change was not rolled back atomically';
  END IF;
  UPDATE public.appointment_reassignment_requests
  SET proposed_condition = jsonb_set(
    proposed_condition, '{legalEntityId}', 'null'::jsonb
  )
  WHERE id = safe_workflow_id;
  response := public.apply_appointment_reassignment(
    safe_workflow_id, 3, gen_random_uuid()
  );
  IF response->>'status' <> 'applied'
    OR (SELECT professional_id FROM public.appointments
        WHERE id = safe_appointment_id) <> equivalent_professional_id
  THEN
    RAISE EXCEPTION 'safe any_available reassignment was not applied: %', response;
  END IF;

  PERFORM pg_temp.set_phase2_g13_actor(original_professional_id);
  response := public.request_appointment_reassignment(
    priced_appointment_id, 'professional_absence', 'professional',
    starts_at + interval '1 hour', priced_updated_at,
    gen_random_uuid(), gen_random_uuid()
  );
  priced_workflow_id := (response->>'reassignmentRequestId')::uuid;
  PERFORM public.validate_appointment_reassignment(
    priced_workflow_id, 1, gen_random_uuid()
  );
  PERFORM pg_temp.set_phase2_g13_actor(manager_id);
  response := public.propose_appointment_reassignment(
    priced_workflow_id, priced_professional_id, 2, gen_random_uuid()
  );
  IF response->>'status' <> 'awaiting_customer'
    OR response->>'customerDecisionRequired' <> 'true'
    OR response->>'monetaryImpact' <> 'true'
  THEN
    RAISE EXCEPTION 'price change bypassed customer decision: %', response;
  END IF;

  PERFORM pg_temp.set_phase2_g13_actor(original_professional_id);
  response := public.request_appointment_reassignment(
    cross_unit_appointment_id, 'professional_absence', 'professional',
    starts_at + interval '2 hours', cross_unit_updated_at,
    gen_random_uuid(), gen_random_uuid()
  );
  cross_unit_workflow_id := (response->>'reassignmentRequestId')::uuid;
  PERFORM public.validate_appointment_reassignment(
    cross_unit_workflow_id, 1, gen_random_uuid()
  );
  PERFORM pg_temp.set_phase2_g13_actor(manager_id);
  BEGIN
    PERFORM public.propose_appointment_reassignment(
      cross_unit_workflow_id, external_professional_id, 2, gen_random_uuid()
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    cross_unit_blocked := SQLERRM LIKE '%replacement_professional_not_linked%';
  END;
  IF NOT cross_unit_blocked THEN
    RAISE EXCEPTION 'professional linked only to another unit was proposed';
  END IF;

  PERFORM pg_temp.set_phase2_g13_actor(original_professional_id);
  BEGIN
    PERFORM public.reconcile_appointment_assignment_shadow(unit_id, gen_random_uuid());
  EXCEPTION WHEN insufficient_privilege THEN
    professional_reconcile_blocked := true;
  END;
  IF NOT professional_reconcile_blocked THEN
    RAISE EXCEPTION 'professional reconciled unit-wide shadow authority';
  END IF;

  PERFORM pg_temp.set_phase2_g13_actor(manager_id);
  response := public.reconcile_appointment_assignment_shadow(
    unit_id, first_shadow_request_id
  );
  first_run_id := (response->>'runId')::uuid;
  IF response->>'cutoverEligible' <> 'true'
    OR (response->>'totalAppointments')::integer <> 3
    OR (response->>'mismatchedAppointments')::integer <> 0
  THEN
    RAISE EXCEPTION 'matching shadow run is invalid: %', response;
  END IF;
  response := public.reconcile_appointment_assignment_shadow(
    unit_id, first_shadow_request_id
  );
  IF response->>'replayed' <> 'true'
    OR (response->>'runId')::uuid <> first_run_id
  THEN
    RAISE EXCEPTION 'shadow reconciliation replay failed: %', response;
  END IF;

  UPDATE public.appointment_professional_assignments AS assignment
  SET professional_id = priced_professional_id
  WHERE assignment.appointment_id = cross_unit_appointment_id
    AND assignment.status = 'active'
    AND assignment.effective_until IS NULL;
  response := public.reconcile_appointment_assignment_shadow(
    unit_id, gen_random_uuid()
  );
  second_run_id := (response->>'runId')::uuid;
  IF response->>'cutoverEligible' <> 'false'
    OR (response->>'mismatchedAppointments')::integer <> 1
    OR NOT EXISTS (
      SELECT 1 FROM public.appointment_assignment_shadow_issues AS issue
      WHERE issue.run_id = second_run_id
        AND issue.appointment_id = cross_unit_appointment_id
        AND issue.issue_code = 'professional_mismatch'
    )
  THEN
    RAISE EXCEPTION 'shadow mismatch was not captured: %', response;
  END IF;

  BEGIN
    UPDATE public.appointment_assignment_shadow_runs
    SET cutover_eligible = true
    WHERE id = second_run_id;
  EXCEPTION WHEN insufficient_privilege THEN
    immutable_evidence := SQLERRM LIKE '%assignment_shadow_evidence_immutable%';
  END;
  IF NOT immutable_evidence THEN
    RAISE EXCEPTION 'shadow evidence was mutable';
  END IF;
  IF first_run_id = second_run_id THEN
    RAISE EXCEPTION 'independent shadow runs reused an identifier';
  END IF;
END;
$test$;

ROLLBACK;
