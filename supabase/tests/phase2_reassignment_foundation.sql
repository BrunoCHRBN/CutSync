BEGIN;

\set ON_ERROR_STOP on

DO $test$
DECLARE
  unit_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  professional_id uuid := gen_random_uuid();
  target_appointment_id text := gen_random_uuid()::text;
  service_id text := gen_random_uuid()::text;
  assignment_id uuid;
  workflow_id uuid := gen_random_uuid();
  event_id uuid := gen_random_uuid();
  appointment_updated_at timestamptz;
  projection record;
  mutation_blocked boolean := false;
  duplicate_active_blocked boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (customer_id, 'phase2-foundation-customer@example.test', now()),
    (professional_id, 'phase2-foundation-professional@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  ) VALUES (
    unit_id,
    'Phase 2 Foundation Unit',
    'phase2-foundation-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false
  );

  UPDATE public.profiles
  SET name = CASE WHEN id = customer_id THEN 'Foundation Customer' ELSE 'Foundation Professional' END
  WHERE id IN (customer_id, professional_id);

  INSERT INTO public.services(id, establishment_id, name, price, duration_minutes)
  VALUES (service_id, unit_id, 'Foundation Service', 50, 30);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status
  ) VALUES (
    target_appointment_id, unit_id, customer_id, professional_id, service_id,
    now() + interval '2 days', now() + interval '2 days 30 minutes', 30, 'confirmed'
  ) RETURNING updated_at INTO appointment_updated_at;

  SELECT * INTO projection
  FROM public.appointment_professional_preference_projection AS preference_projection
  WHERE preference_projection.appointment_id = target_appointment_id;
  IF projection.preference <> 'specific'
    OR projection.selected_professional_id <> professional_id
    OR projection.preference_source <> 'legacy_default'
  THEN
    RAISE EXCEPTION 'legacy preference did not fail closed: %', row_to_json(projection);
  END IF;

  INSERT INTO public.appointment_professional_preference_snapshots(
    appointment_id, establishment_id, preference, selected_professional_id,
    policy_version, policy_accepted, request_id
  ) VALUES (
    target_appointment_id, unit_id, 'specific', professional_id,
    1, false, gen_random_uuid()
  );

  SELECT assignment.id INTO assignment_id
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.appointment_id = target_appointment_id
    AND assignment.status = 'active';
  IF assignment_id IS NULL THEN
    INSERT INTO public.appointment_professional_assignments(
      appointment_id, establishment_id, professional_id, status, source,
      correlation_id
    ) VALUES (
      target_appointment_id, unit_id, professional_id, 'active',
      'legacy_projection', gen_random_uuid()
    ) RETURNING id INTO assignment_id;
  END IF;

  BEGIN
    INSERT INTO public.appointment_professional_assignments(
      appointment_id, establishment_id, professional_id, status, source,
      correlation_id
    ) VALUES (
      target_appointment_id, unit_id, professional_id, 'active',
      'legacy_projection', gen_random_uuid()
    );
  EXCEPTION WHEN unique_violation THEN
    duplicate_active_blocked := true;
  END;
  IF NOT duplicate_active_blocked THEN
    RAISE EXCEPTION 'multiple active assignments were accepted';
  END IF;

  INSERT INTO public.appointment_reassignment_requests(
    id, appointment_id, establishment_id, previous_assignment_id,
    proposed_professional_id, initiated_by, responsibility, reason_code,
    previous_condition, proposed_condition, due_at, request_id,
    correlation_id, expected_appointment_updated_at
  ) VALUES (
    workflow_id, target_appointment_id, unit_id, assignment_id,
    professional_id, professional_id, 'professional', 'professional_absence',
    jsonb_build_object('professionalId', professional_id),
    jsonb_build_object('professionalId', professional_id),
    now() + interval '1 day', gen_random_uuid(), gen_random_uuid(),
    appointment_updated_at
  );

  INSERT INTO public.customer_change_decisions(
    reassignment_request_id, appointment_id
  ) VALUES (workflow_id, target_appointment_id);

  INSERT INTO public.decision_queue_items(
    reassignment_request_id, appointment_id, establishment_id, status,
    urgency, responsibility, due_at, next_actor_kind,
    customer_decision_required, correlation_id, version
  )
  SELECT
    request.id, request.appointment_id, request.establishment_id, request.status,
    'normal', request.responsibility, request.due_at, 'manager',
    request.customer_decision_required, request.correlation_id, request.version
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = workflow_id;

  INSERT INTO public.appointment_assignment_events(
    id, appointment_id, establishment_id, reassignment_request_id,
    assignment_id, event_type, actor_id, actor_kind, request_id,
    correlation_id, resulting_version
  )
  SELECT
    event_id, request.appointment_id, request.establishment_id, request.id,
    assignment_id, 'reassignment.requested', professional_id, 'professional',
    gen_random_uuid(), request.correlation_id, request.version
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = workflow_id;

  BEGIN
    UPDATE public.appointment_assignment_events
    SET payload = jsonb_build_object('tampered', true)
    WHERE id = event_id;
  EXCEPTION WHEN insufficient_privilege THEN
    mutation_blocked := true;
  END;
  IF NOT mutation_blocked THEN
    RAISE EXCEPTION 'assignment event mutation was accepted';
  END IF;

  SELECT * INTO projection
  FROM public.appointment_assignment_shadow_comparison AS comparison
  WHERE comparison.appointment_id = target_appointment_id;
  IF NOT projection.projection_matches OR projection.active_assignment_count <> 1 THEN
    RAISE EXCEPTION 'assignment shadow projection mismatch: %', row_to_json(projection);
  END IF;

  IF has_table_privilege(
      'authenticated',
      'public.appointment_reassignment_requests',
      'SELECT'
    )
    OR has_table_privilege(
      'authenticated',
      'public.customer_change_decisions',
      'INSERT'
    )
    OR has_table_privilege(
      'authenticated',
      'public.decision_queue_items',
      'UPDATE'
    )
  THEN
    RAISE EXCEPTION 'authenticated retained direct reassignment table privileges';
  END IF;
END;
$test$;

ROLLBACK;
