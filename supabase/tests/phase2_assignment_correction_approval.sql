BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase2_correction_actor(
  actor_id uuid,
  actor_aal text DEFAULT 'aal2'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
    true
  );
END;
$$;

DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  manager_id uuid := gen_random_uuid();
  original_professional_id uuid := gen_random_uuid();
  corrected_professional_id uuid := gen_random_uuid();
  customer_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  target_service_id text := gen_random_uuid()::text;
  target_appointment_id text := gen_random_uuid()::text;
  appointment_updated_at timestamptz;
  approval_id uuid;
  approval_request_id uuid := gen_random_uuid();
  approval_decision_id uuid := gen_random_uuid();
  correction_id uuid := gen_random_uuid();
  correction_correlation_id uuid := gen_random_uuid();
  response jsonb;
  aal1_blocked boolean := false;
  self_approval_blocked boolean := false;
  correction_aal1_blocked boolean := false;
  approval_key_reuse_blocked boolean := false;
  correction_key_reuse_blocked boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'phase2-correction-owner@example.test', now()),
    (manager_id, 'phase2-correction-manager@example.test', now()),
    (original_professional_id, 'phase2-correction-original@example.test', now()),
    (corrected_professional_id, 'phase2-correction-target@example.test', now()),
    (customer_id, 'phase2-correction-customer@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  ) VALUES (
    unit_id,
    'Phase 2 Correction Unit',
    'phase2-correction-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false
  );
  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (owner_id, unit_id, 'admin', 'admin', 'active', owner_id),
    (manager_id, unit_id, 'professional', 'manager', 'active', owner_id),
    (original_professional_id, unit_id, 'professional', 'professional', 'active', owner_id),
    (corrected_professional_id, unit_id, 'professional', 'professional', 'active', owner_id);
  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Phase 2 Correction Org', 'active', owner_id);
  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  ) VALUES (organization_id, owner_id, 'owner', 'active', owner_id);
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  ) VALUES (organization_id, unit_id, 'active', owner_id);

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (target_service_id, unit_id, 'Correction Service', 70, 45, true);
  INSERT INTO public.professional_services(
    establishment_id, professional_id, service_id, price,
    duration_minutes, is_active
  ) VALUES
    (unit_id, original_professional_id, target_service_id, 70, 45, true),
    (unit_id, corrected_professional_id, target_service_id, 70, 45, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_id, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES (
    target_appointment_id, unit_id, customer_id, original_professional_id,
    target_service_id, now() - interval '2 hours', now() - interval '75 minutes',
    45, 'completed', 70
  ) RETURNING updated_at INTO appointment_updated_at;

  PERFORM pg_temp.set_phase2_correction_actor(manager_id, 'aal1');
  BEGIN
    PERFORM public.request_appointment_assignment_correction_approval(
      target_appointment_id,
      corrected_professional_id,
      'Correção factual do executor registrada após o atendimento.',
      gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    aal1_blocked := SQLERRM LIKE '%aal2_required%';
  END;
  IF NOT aal1_blocked THEN
    RAISE EXCEPTION 'AAL1 requested a sensitive assignment correction';
  END IF;

  PERFORM pg_temp.set_phase2_correction_actor(manager_id);
  response := public.request_appointment_assignment_correction_approval(
    target_appointment_id,
    corrected_professional_id,
    'Correção factual do executor registrada após o atendimento.',
    approval_request_id
  );
  approval_id := (response->>'approvalRequestId')::uuid;
  IF response->>'status' <> 'pending' OR response->>'replayed' <> 'false' THEN
    RAISE EXCEPTION 'invalid correction approval request: %', response;
  END IF;
  response := public.request_appointment_assignment_correction_approval(
    target_appointment_id,
    corrected_professional_id,
    'Correção factual do executor registrada após o atendimento.',
    approval_request_id
  );
  IF response->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'approval request replay failed: %', response;
  END IF;
  BEGIN
    PERFORM public.request_appointment_assignment_correction_approval(
      target_appointment_id,
      corrected_professional_id,
      'Outro motivo não pode reutilizar a mesma chave idempotente.',
      approval_request_id
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    approval_key_reuse_blocked := SQLERRM LIKE '%idempotency_key_reused%';
  END;
  IF NOT approval_key_reuse_blocked THEN
    RAISE EXCEPTION 'approval idempotency key accepted a changed reason';
  END IF;

  BEGIN
    PERFORM public.decide_appointment_assignment_correction_approval(
      approval_id, 1, 'approved',
      'Aprovação independente após revisão das evidências operacionais.',
      gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    self_approval_blocked := SQLERRM LIKE '%approval_separation_required%';
  END;
  IF NOT self_approval_blocked THEN
    RAISE EXCEPTION 'requester approved the own correction request';
  END IF;

  PERFORM pg_temp.set_phase2_correction_actor(owner_id);
  response := public.decide_appointment_assignment_correction_approval(
    approval_id, 1, 'approved',
    'Aprovação independente após revisão das evidências operacionais.',
    approval_decision_id
  );
  IF response->>'status' <> 'approved'
    OR (response->>'version')::integer <> 2
    OR response->>'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'invalid independent approval response: %', response;
  END IF;

  PERFORM pg_temp.set_phase2_correction_actor(manager_id, 'aal1');
  BEGIN
    PERFORM public.correct_appointment_assignment(
      target_appointment_id, corrected_professional_id, approval_id,
      appointment_updated_at,
      'Executor real corrigido com evidência e aprovação independente.',
      correction_id, correction_correlation_id
    );
  EXCEPTION WHEN OTHERS THEN
    correction_aal1_blocked := SQLERRM LIKE '%aal2_required%';
  END;
  IF NOT correction_aal1_blocked THEN
    RAISE EXCEPTION 'AAL1 applied the approved assignment correction';
  END IF;

  PERFORM pg_temp.set_phase2_correction_actor(manager_id);
  response := public.correct_appointment_assignment(
    target_appointment_id, corrected_professional_id, approval_id,
    appointment_updated_at,
    'Executor real corrigido com evidência e aprovação independente.',
    correction_id, correction_correlation_id
  );
  IF (response->>'professionalId')::uuid <> corrected_professional_id
    OR response->>'replayed' <> 'false'
  THEN
    RAISE EXCEPTION 'invalid assignment correction response: %', response;
  END IF;
  response := public.correct_appointment_assignment(
    target_appointment_id, corrected_professional_id, approval_id,
    appointment_updated_at,
    'Executor real corrigido com evidência e aprovação independente.',
    correction_id, correction_correlation_id
  );
  IF response->>'replayed' <> 'true' THEN
    RAISE EXCEPTION 'assignment correction replay failed: %', response;
  END IF;
  BEGIN
    PERFORM public.correct_appointment_assignment(
      target_appointment_id, corrected_professional_id, approval_id,
      appointment_updated_at,
      'Outro motivo não pode reutilizar a chave da correção aplicada.',
      correction_id, correction_correlation_id
    );
  EXCEPTION WHEN invalid_parameter_value THEN
    correction_key_reuse_blocked := SQLERRM LIKE '%idempotency_key_reused%';
  END;
  IF NOT correction_key_reuse_blocked THEN
    RAISE EXCEPTION 'correction idempotency key accepted a changed reason';
  END IF;

  IF (SELECT professional_id FROM public.appointments WHERE id = target_appointment_id)
      <> corrected_professional_id
  THEN
    RAISE EXCEPTION 'corrected professional was not projected to appointment';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_professional_assignments AS assignment
    WHERE assignment.appointment_id = target_appointment_id
      AND assignment.professional_id = original_professional_id
      AND assignment.status = 'corrected'
      AND assignment.effective_until IS NOT NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.appointment_professional_assignments AS assignment
    WHERE assignment.appointment_id = target_appointment_id
      AND assignment.professional_id = corrected_professional_id
      AND assignment.status = 'active'
      AND assignment.source = 'correction'
  ) THEN
    RAISE EXCEPTION 'correction assignment history is incomplete';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.approval_requests AS approval
    WHERE approval.id = approval_id
      AND approval.status = 'approved'
      AND approval.consumed_at IS NOT NULL
      AND approval.consumed_by = manager_id
  ) THEN
    RAISE EXCEPTION 'approved correction was not consumed';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_assignment_events AS event
    WHERE event.appointment_id = target_appointment_id
      AND event.event_type = 'assignment.corrected'
      AND event.request_id = correction_id
      AND event.correlation_id = correction_correlation_id
  ) THEN
    RAISE EXCEPTION 'immutable correction event was not recorded';
  END IF;
END;
$test$;

ROLLBACK;
