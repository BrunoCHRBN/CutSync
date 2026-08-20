BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE OR REPLACE FUNCTION public.supersede_reassignment_proposals(
  target_reassignment_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.appointment_professional_assignments
  SET status = 'superseded',
      effective_until = CASE
        WHEN now() > effective_from THEN now()
        ELSE effective_from + interval '1 microsecond'
      END,
      version = version + 1,
      updated_at = now()
  WHERE reassignment_request_id = target_reassignment_request_id
    AND status = 'proposed';
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_appointment_reassignment(
  target_reassignment_request_id uuid,
  target_decision text,
  target_chosen_professional_id uuid,
  target_channel text,
  target_reason text,
  target_expected_version integer,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  customer_decision public.customer_change_decisions%ROWTYPE;
  proposed_assignment public.appointment_professional_assignments%ROWTYPE;
  replay_event public.appointment_assignment_events%ROWTYPE;
  actor_is_customer boolean;
  actor_is_staff boolean;
  previous_version integer;
  next_status text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_expected_version < 1
    OR target_decision NOT IN (
      'accept_replacement', 'choose_professional', 'reschedule_original',
      'cancel_due_to_change', 'contested', 'resolved'
    )
    OR target_channel NOT IN (
      'client_web', 'client_app', 'business', 'web', 'support'
    )
    OR (target_decision = 'choose_professional' AND target_chosen_professional_id IS NULL)
    OR (target_decision <> 'choose_professional' AND target_chosen_professional_id IS NOT NULL)
    OR (target_reason IS NOT NULL AND char_length(btrim(target_reason)) NOT BETWEEN 3 AND 500)
  THEN
    RAISE EXCEPTION 'invalid_customer_change_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO replay_event
  FROM public.appointment_assignment_events AS event
  WHERE event.request_id = target_request_id;
  IF FOUND THEN
    IF replay_event.reassignment_request_id <> target_reassignment_request_id
      OR replay_event.event_type <> 'reassignment.customer_decided'
      OR replay_event.actor_id <> actor_id
      OR replay_event.payload->>'decision' <> target_decision
      OR replay_event.payload->>'channel' <> target_channel
      OR COALESCE(replay_event.payload->>'chosenProfessionalId', '') <>
        COALESCE(target_chosen_professional_id::text, '')
      OR COALESCE(replay_event.payload->>'reason', '') <>
        COALESCE(NULLIF(btrim(COALESCE(target_reason, '')), ''), '')
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO workflow FROM public.appointment_reassignment_requests
    WHERE id = target_reassignment_request_id;
    RETURN jsonb_build_object(
      'reassignmentRequestId', workflow.id,
      'status', workflow.status,
      'decision', target_decision,
      'version', workflow.version,
      'requestId', target_request_id,
      'correlationId', workflow.correlation_id,
      'replayed', true
    );
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_reassignment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF workflow.version <> target_expected_version THEN
    RAISE EXCEPTION 'reassignment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF workflow.due_at <= now() THEN
    RAISE EXCEPTION 'appointment_reassignment_expired' USING ERRCODE = '22023';
  END IF;
  IF workflow.status NOT IN ('awaiting_customer', 'manual_review') THEN
    RAISE EXCEPTION 'reassignment_not_awaiting_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id AND target.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;
  actor_is_customer := appointment.client_id = actor_id;
  actor_is_staff := public.has_business_capability(
    workflow.establishment_id, actor_id, 'manage_team', 'full'
  );
  IF NOT actor_is_customer AND NOT actor_is_staff THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF actor_is_customer AND target_channel NOT IN ('client_web', 'client_app') THEN
    RAISE EXCEPTION 'invalid_customer_decision_channel' USING ERRCODE = '22023';
  END IF;
  IF NOT actor_is_customer AND target_channel IN ('client_web', 'client_app') THEN
    RAISE EXCEPTION 'invalid_staff_decision_channel' USING ERRCODE = '22023';
  END IF;
  IF actor_is_staff AND target_decision <> 'resolved'
    AND target_reason IS NULL
  THEN
    RAISE EXCEPTION 'staff_customer_decision_evidence_required'
      USING ERRCODE = '22023';
  END IF;
  IF target_decision = 'resolved' AND NOT actor_is_staff THEN
    RAISE EXCEPTION 'decision_resolution_requires_staff' USING ERRCODE = '42501';
  END IF;
  IF target_decision = 'resolved' AND workflow.status <> 'manual_review' THEN
    RAISE EXCEPTION 'contested_decision_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO customer_decision
  FROM public.customer_change_decisions AS decision
  WHERE decision.reassignment_request_id = workflow.id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'customer_decision_not_available' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO proposed_assignment
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.reassignment_request_id = workflow.id
    AND assignment.status = 'proposed'
  ORDER BY assignment.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF target_decision = 'accept_replacement' AND NOT FOUND THEN
    RAISE EXCEPTION 'proposed_assignment_required' USING ERRCODE = '22023';
  END IF;

  next_status := CASE target_decision
    WHEN 'accept_replacement' THEN 'ready_to_apply'
    WHEN 'choose_professional' THEN 'awaiting_manager'
    WHEN 'reschedule_original' THEN 'manual_review'
    WHEN 'cancel_due_to_change' THEN 'declined'
    WHEN 'contested' THEN 'manual_review'
    WHEN 'resolved' THEN 'awaiting_manager'
  END;

  IF target_decision IN (
    'choose_professional', 'reschedule_original',
    'cancel_due_to_change', 'contested', 'resolved'
  ) THEN
    PERFORM public.supersede_reassignment_proposals(workflow.id);
  END IF;

  UPDATE public.customer_change_decisions
  SET decision = target_decision,
      accepted_assignment_id = CASE
        WHEN target_decision = 'accept_replacement' THEN proposed_assignment.id
        ELSE NULL
      END,
      chosen_professional_id = target_chosen_professional_id,
      decided_by = actor_id,
      actor_kind = CASE WHEN actor_is_customer THEN 'customer' ELSE 'staff' END,
      channel = target_channel,
      decision_reason = NULLIF(btrim(COALESCE(target_reason, '')), ''),
      request_id = target_request_id,
      version = version + 1,
      decided_at = now(),
      updated_at = now()
  WHERE id = customer_decision.id
  RETURNING * INTO customer_decision;

  IF target_decision = 'cancel_due_to_change' THEN
    UPDATE public.appointments
    SET status = 'cancelled',
        cancellation_reason = 'Cancelado por alteração iniciada pelo estabelecimento',
        cancellation_reason_code = 'establishment_cancelled',
        cancellation_note_internal = 'customer_change_decision',
        cancelled_by_role = 'admin',
        updated_at = now()
    WHERE id = appointment.id;
  END IF;

  previous_version := workflow.version;
  UPDATE public.appointment_reassignment_requests
  SET status = next_status,
      proposed_professional_id = CASE
        WHEN target_decision IN ('choose_professional', 'resolved') THEN NULL
        ELSE proposed_professional_id
      END,
      proposed_condition = CASE
        WHEN target_decision = 'choose_professional' THEN
          proposed_condition || jsonb_build_object(
            'customerRequestedProfessionalId', target_chosen_professional_id
          )
        ELSE proposed_condition
      END,
      responsibility = CASE
        WHEN next_status IN ('awaiting_manager', 'manual_review') THEN 'manager'
        ELSE responsibility
      END,
      version = version + 1,
      completed_at = CASE WHEN next_status = 'declined' THEN now() ELSE completed_at END,
      updated_at = now()
  WHERE id = workflow.id
  RETURNING * INTO workflow;

  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    assignment_id, event_type, actor_id, actor_kind, request_id,
    correlation_id, previous_version, resulting_version, payload
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id, workflow.id,
    CASE WHEN target_decision = 'accept_replacement' THEN proposed_assignment.id ELSE NULL END,
    'reassignment.customer_decided', actor_id,
    CASE WHEN actor_is_customer THEN 'customer' ELSE 'staff' END,
    target_request_id, workflow.correlation_id,
    previous_version, workflow.version,
    jsonb_build_object(
      'decision', target_decision,
      'channel', target_channel,
      'nextStatus', workflow.status,
      'chosenProfessionalId', target_chosen_professional_id,
      'reason', NULLIF(btrim(COALESCE(target_reason, '')), '')
    )
  );
  PERFORM public.refresh_appointment_decision_queue_item(workflow.id);

  RETURN jsonb_build_object(
    'reassignmentRequestId', workflow.id,
    'status', workflow.status,
    'decision', customer_decision.decision,
    'version', workflow.version,
    'requestId', target_request_id,
    'correlationId', workflow.correlation_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_appointment_reassignment(
  target_reassignment_request_id uuid,
  target_expected_version integer,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  current_assignment public.appointment_professional_assignments%ROWTYPE;
  proposed_assignment public.appointment_professional_assignments%ROWTYPE;
  customer_decision public.customer_change_decisions%ROWTYPE;
  replay_event public.appointment_assignment_events%ROWTYPE;
  proposed_price numeric;
  expected_price_cents bigint;
  slot record;
  previous_version integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_expected_version < 1 THEN
    RAISE EXCEPTION 'invalid_reassignment_application' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO replay_event
  FROM public.appointment_assignment_events AS event
  WHERE event.request_id = target_request_id;
  IF FOUND THEN
    IF replay_event.reassignment_request_id <> target_reassignment_request_id
      OR replay_event.event_type <> 'reassignment.applied'
      OR replay_event.actor_id <> actor_id
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO workflow FROM public.appointment_reassignment_requests
    WHERE id = target_reassignment_request_id;
    RETURN jsonb_build_object(
      'reassignmentRequestId', workflow.id,
      'status', workflow.status,
      'version', workflow.version,
      'requestId', target_request_id,
      'correlationId', workflow.correlation_id,
      'replayed', true
    );
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_reassignment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF workflow.version <> target_expected_version THEN
    RAISE EXCEPTION 'reassignment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF workflow.status <> 'ready_to_apply' OR workflow.due_at <= now() THEN
    RAISE EXCEPTION 'reassignment_not_ready_to_apply' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_business_capability(
    workflow.establishment_id, actor_id,
    'apply_appointment_reassignment', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT COALESCE((
    SELECT establishment.appointment_reassignment_enabled
    FROM public.establishments AS establishment
    WHERE establishment.id = workflow.establishment_id
  ), false) THEN
    RAISE EXCEPTION 'appointment_reassignment_disabled' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id AND target.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND OR appointment.status NOT IN ('pending', 'confirmed')
    OR appointment.date_time <= now()
  THEN
    RAISE EXCEPTION 'appointment_not_reassignable' USING ERRCODE = '22023';
  END IF;
  IF appointment.updated_at IS DISTINCT FROM workflow.expected_appointment_updated_at THEN
    RAISE EXCEPTION 'appointment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_orders AS service_order
    WHERE service_order.appointment_id = appointment.id
      AND service_order.status <> 'voided'
  ) THEN
    RAISE EXCEPTION 'appointment_reassignment_after_order_open' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO current_assignment
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.id = workflow.previous_assignment_id
    AND assignment.status = 'active'
    AND assignment.effective_until IS NULL
  FOR UPDATE;
  IF NOT FOUND OR current_assignment.professional_id <> appointment.professional_id THEN
    RAISE EXCEPTION 'appointment_assignment_projection_mismatch'
      USING ERRCODE = '40001';
  END IF;
  SELECT * INTO proposed_assignment
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.reassignment_request_id = workflow.id
    AND assignment.status = 'proposed'
    AND assignment.professional_id = workflow.proposed_professional_id
  ORDER BY assignment.created_at DESC
  LIMIT 1
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'proposed_assignment_required' USING ERRCODE = '22023';
  END IF;

  IF workflow.customer_decision_required THEN
    SELECT * INTO customer_decision
    FROM public.customer_change_decisions AS decision
    WHERE decision.reassignment_request_id = workflow.id
    FOR UPDATE;
    IF NOT FOUND
      OR customer_decision.decision <> 'accept_replacement'
      OR customer_decision.accepted_assignment_id <> proposed_assignment.id
    THEN
      RAISE EXCEPTION 'customer_acceptance_required' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = proposed_assignment.professional_id
      AND membership.establishment_id = workflow.establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'replacement_professional_not_linked' USING ERRCODE = '22023';
  END IF;
  SELECT professional_service.price INTO proposed_price
  FROM public.professional_services AS professional_service
  WHERE professional_service.establishment_id = workflow.establishment_id
    AND professional_service.professional_id = proposed_assignment.professional_id
    AND professional_service.service_id = appointment.service_id
    AND professional_service.is_active
  LIMIT 1;
  IF proposed_price IS NULL THEN
    RAISE EXCEPTION 'replacement_professional_not_qualified' USING ERRCODE = '22023';
  END IF;
  expected_price_cents := (workflow.proposed_condition->>'priceCents')::bigint;
  IF expected_price_cents IS NULL
    OR round(proposed_price * 100)::bigint <> expected_price_cents
  THEN
    RAISE EXCEPTION 'reassignment_proposal_changed' USING ERRCODE = '40001';
  END IF;

  SELECT available_slot.* INTO slot
  FROM public.compute_available_slots(
    workflow.establishment_id,
    proposed_assignment.professional_id,
    appointment.service_id,
    (appointment.date_time AT TIME ZONE (
      SELECT establishment.timezone FROM public.establishments AS establishment
      WHERE establishment.id = workflow.establishment_id
    ))::date,
    appointment.id
  ) AS available_slot
  WHERE available_slot.starts_at = appointment.date_time
    AND available_slot.available
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'replacement_professional_unavailable' USING ERRCODE = '22023';
  END IF;

  UPDATE public.appointment_professional_assignments
  SET status = 'superseded',
      effective_until = CASE
        WHEN now() > effective_from THEN now()
        ELSE effective_from + interval '1 microsecond'
      END,
      version = version + 1,
      updated_at = now()
  WHERE id = current_assignment.id;
  UPDATE public.appointment_professional_assignments
  SET status = 'active',
      effective_from = now(),
      effective_until = NULL,
      version = version + 1,
      updated_at = now()
  WHERE id = proposed_assignment.id;

  UPDATE public.appointments
  SET professional_id = proposed_assignment.professional_id,
      price_charged = expected_price_cents::numeric / 100,
      transferred_from_professional_id = current_assignment.professional_id,
      transfer_reason = 'customer_aware_reassignment',
      updated_at = now()
  WHERE id = appointment.id;

  previous_version := workflow.version;
  UPDATE public.appointment_reassignment_requests
  SET status = 'applied',
      version = version + 1,
      applied_at = now(),
      completed_at = now(),
      updated_at = now()
  WHERE id = workflow.id
  RETURNING * INTO workflow;

  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    assignment_id, event_type, actor_id, actor_kind, request_id,
    correlation_id, previous_version, resulting_version, payload
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id, workflow.id,
    proposed_assignment.id, 'reassignment.applied', actor_id, 'staff',
    target_request_id, workflow.correlation_id,
    previous_version, workflow.version,
    jsonb_build_object(
      'previousProfessionalId', current_assignment.professional_id,
      'professionalId', proposed_assignment.professional_id,
      'priceCents', expected_price_cents
    )
  );
  PERFORM public.refresh_appointment_decision_queue_item(workflow.id);

  RETURN jsonb_build_object(
    'reassignmentRequestId', workflow.id,
    'appointmentId', workflow.appointment_id,
    'assignmentId', proposed_assignment.id,
    'professionalId', proposed_assignment.professional_id,
    'status', workflow.status,
    'version', workflow.version,
    'requestId', target_request_id,
    'correlationId', workflow.correlation_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.withdraw_appointment_reassignment(
  target_reassignment_request_id uuid,
  target_expected_version integer,
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
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  replay_event public.appointment_assignment_events%ROWTYPE;
  previous_version integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_expected_version < 1
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 3 AND 500
  THEN
    RAISE EXCEPTION 'invalid_reassignment_withdrawal' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO replay_event FROM public.appointment_assignment_events
  WHERE request_id = target_request_id;
  IF FOUND THEN
    IF replay_event.reassignment_request_id <> target_reassignment_request_id
      OR replay_event.event_type <> 'reassignment.withdrawn'
      OR replay_event.actor_id <> actor_id
      OR replay_event.payload->>'reason' <> btrim(target_reason)
    THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023'; END IF;
    SELECT * INTO workflow FROM public.appointment_reassignment_requests
    WHERE id = target_reassignment_request_id;
    RETURN jsonb_build_object(
      'reassignmentRequestId', workflow.id, 'status', workflow.status,
      'version', workflow.version, 'requestId', target_request_id,
      'correlationId', workflow.correlation_id, 'replayed', true
    );
  END IF;
  SELECT * INTO workflow FROM public.appointment_reassignment_requests
  WHERE id = target_reassignment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_reassignment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF workflow.version <> target_expected_version THEN
    RAISE EXCEPTION 'reassignment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF workflow.status NOT IN (
    'requested', 'validating', 'awaiting_manager', 'awaiting_customer',
    'ready_to_apply', 'manual_review'
  ) THEN RAISE EXCEPTION 'reassignment_not_withdrawable' USING ERRCODE = '22023'; END IF;
  IF workflow.initiated_by <> actor_id
    AND NOT public.has_business_capability(
      workflow.establishment_id, actor_id, 'manage_team', 'full'
    )
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO appointment FROM public.appointments
  WHERE id = workflow.appointment_id FOR UPDATE;
  PERFORM public.supersede_reassignment_proposals(workflow.id);
  previous_version := workflow.version;
  UPDATE public.appointment_reassignment_requests
  SET status = 'withdrawn', version = version + 1,
      completed_at = now(), updated_at = now()
  WHERE id = workflow.id RETURNING * INTO workflow;
  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    event_type, actor_id, actor_kind, request_id, correlation_id,
    previous_version, resulting_version, payload
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id, workflow.id,
    'reassignment.withdrawn', actor_id,
    CASE WHEN appointment.professional_id = actor_id THEN 'professional' ELSE 'staff' END,
    target_request_id, workflow.correlation_id,
    previous_version, workflow.version,
    jsonb_build_object('reason', btrim(target_reason))
  );
  PERFORM public.refresh_appointment_decision_queue_item(workflow.id);
  RETURN jsonb_build_object(
    'reassignmentRequestId', workflow.id, 'status', workflow.status,
    'version', workflow.version, 'requestId', target_request_id,
    'correlationId', workflow.correlation_id, 'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_appointment_reassignment(
  target_reassignment_request_id uuid,
  target_expected_version integer,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  jwt_role text := COALESCE((SELECT auth.jwt()->>'role'), '');
  workflow public.appointment_reassignment_requests%ROWTYPE;
  replay_event public.appointment_assignment_events%ROWTYPE;
  previous_version integer;
BEGIN
  IF actor_id IS NULL AND jwt_role <> 'service_role' THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_expected_version < 1 THEN
    RAISE EXCEPTION 'invalid_reassignment_expiration' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO replay_event FROM public.appointment_assignment_events
  WHERE request_id = target_request_id;
  IF FOUND THEN
    IF replay_event.reassignment_request_id <> target_reassignment_request_id
      OR replay_event.event_type <> 'reassignment.expired'
    THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023'; END IF;
    SELECT * INTO workflow FROM public.appointment_reassignment_requests
    WHERE id = target_reassignment_request_id;
    RETURN jsonb_build_object(
      'reassignmentRequestId', workflow.id, 'status', workflow.status,
      'version', workflow.version, 'requestId', target_request_id,
      'correlationId', workflow.correlation_id, 'replayed', true
    );
  END IF;
  SELECT * INTO workflow FROM public.appointment_reassignment_requests
  WHERE id = target_reassignment_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_reassignment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF workflow.version <> target_expected_version THEN
    RAISE EXCEPTION 'reassignment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF workflow.status NOT IN (
    'requested', 'validating', 'awaiting_manager', 'awaiting_customer',
    'ready_to_apply', 'manual_review'
  ) THEN RAISE EXCEPTION 'reassignment_not_expirable' USING ERRCODE = '22023'; END IF;
  IF workflow.due_at > now() THEN
    RAISE EXCEPTION 'reassignment_not_due' USING ERRCODE = '22023';
  END IF;
  IF jwt_role <> 'service_role'
    AND NOT public.has_business_capability(
      workflow.establishment_id, actor_id,
      'apply_appointment_reassignment', 'full'
    )
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  PERFORM public.supersede_reassignment_proposals(workflow.id);
  previous_version := workflow.version;
  UPDATE public.appointment_reassignment_requests
  SET status = 'expired', version = version + 1,
      completed_at = now(), updated_at = now()
  WHERE id = workflow.id RETURNING * INTO workflow;
  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    event_type, actor_id, actor_kind, request_id, correlation_id,
    previous_version, resulting_version, payload
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id, workflow.id,
    'reassignment.expired', actor_id,
    CASE WHEN jwt_role = 'service_role' THEN 'system' ELSE 'staff' END,
    target_request_id, workflow.correlation_id,
    previous_version, workflow.version, '{}'::jsonb
  );
  PERFORM public.refresh_appointment_decision_queue_item(workflow.id);
  RETURN jsonb_build_object(
    'reassignmentRequestId', workflow.id, 'status', workflow.status,
    'version', workflow.version, 'requestId', target_request_id,
    'correlationId', workflow.correlation_id, 'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.supersede_reassignment_proposals(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.supersede_reassignment_proposals(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.decide_appointment_reassignment(
  uuid, text, uuid, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_appointment_reassignment(
  uuid, text, uuid, text, text, integer, uuid
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.apply_appointment_reassignment(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_appointment_reassignment(uuid, integer, uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.withdraw_appointment_reassignment(uuid, integer, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_appointment_reassignment(uuid, integer, text, uuid)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.expire_appointment_reassignment(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expire_appointment_reassignment(uuid, integer, uuid)
  TO authenticated, service_role;

COMMIT;
