BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE UNIQUE INDEX appointment_reassignment_one_live_workflow_idx
  ON public.appointment_reassignment_requests(appointment_id)
  WHERE status IN (
    'requested', 'validating', 'awaiting_manager', 'awaiting_customer',
    'ready_to_apply', 'manual_review'
  );

CREATE OR REPLACE FUNCTION public.seed_appointment_assignment_projection()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.appointment_professional_assignments(
    appointment_id, establishment_id, professional_id, status, source,
    effective_from, correlation_id
  ) VALUES (
    NEW.id, NEW.establishment_id, NEW.professional_id, 'active', 'booking',
    NEW.created_at, gen_random_uuid()
  )
  ON CONFLICT (appointment_id)
    WHERE status = 'active' AND effective_until IS NULL
  DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER appointments_seed_assignment_projection
AFTER INSERT ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.seed_appointment_assignment_projection();

CREATE OR REPLACE FUNCTION public.refresh_appointment_decision_queue_item(
  target_reassignment_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  workflow public.appointment_reassignment_requests%ROWTYPE;
  urgency_value text;
  next_actor text;
  actions text[];
BEGIN
  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id;
  IF NOT FOUND THEN
    DELETE FROM public.decision_queue_items
    WHERE reassignment_request_id = target_reassignment_request_id;
    RETURN;
  END IF;

  IF workflow.status IN ('applied', 'declined', 'withdrawn', 'expired', 'failed') THEN
    DELETE FROM public.decision_queue_items
    WHERE reassignment_request_id = workflow.id;
    RETURN;
  END IF;

  urgency_value := CASE
    WHEN workflow.due_at <= now() THEN 'overdue'
    WHEN workflow.due_at <= now() + interval '2 hours' THEN 'urgent'
    WHEN workflow.due_at <= now() + interval '12 hours' THEN 'attention'
    ELSE 'normal'
  END;
  next_actor := CASE workflow.status
    WHEN 'awaiting_customer' THEN 'customer'
    WHEN 'requested' THEN 'professional'
    WHEN 'validating' THEN 'system'
    ELSE 'manager'
  END;
  actions := CASE workflow.status
    WHEN 'requested' THEN ARRAY['validate', 'withdraw']::text[]
    WHEN 'validating' THEN ARRAY['validate', 'withdraw']::text[]
    WHEN 'awaiting_manager' THEN ARRAY['propose', 'withdraw']::text[]
    WHEN 'awaiting_customer' THEN ARRAY[
      'accept_replacement', 'choose_professional',
      'reschedule_original', 'cancel_due_to_change'
    ]::text[]
    WHEN 'ready_to_apply' THEN ARRAY['apply', 'withdraw']::text[]
    WHEN 'manual_review' THEN ARRAY['review', 'withdraw']::text[]
    ELSE ARRAY[]::text[]
  END;

  INSERT INTO public.decision_queue_items(
    reassignment_request_id, appointment_id, establishment_id, status,
    urgency, responsibility, due_at, next_actor_kind,
    customer_decision_required, monetary_impact, allowed_actions,
    correlation_id, version, data_cutoff_at, updated_at
  ) VALUES (
    workflow.id, workflow.appointment_id, workflow.establishment_id,
    workflow.status, urgency_value, workflow.responsibility, workflow.due_at,
    next_actor, workflow.customer_decision_required,
    COALESCE((workflow.proposed_condition->>'monetaryImpact')::boolean, false),
    actions, workflow.correlation_id, workflow.version, now(), now()
  )
  ON CONFLICT (reassignment_request_id) DO UPDATE
  SET status = EXCLUDED.status,
      urgency = EXCLUDED.urgency,
      responsibility = EXCLUDED.responsibility,
      due_at = EXCLUDED.due_at,
      next_actor_kind = EXCLUDED.next_actor_kind,
      customer_decision_required = EXCLUDED.customer_decision_required,
      monetary_impact = EXCLUDED.monetary_impact,
      allowed_actions = EXCLUDED.allowed_actions,
      correlation_id = EXCLUDED.correlation_id,
      version = EXCLUDED.version,
      data_cutoff_at = EXCLUDED.data_cutoff_at,
      updated_at = EXCLUDED.updated_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.request_appointment_reassignment(
  target_appointment_id text,
  target_reason_code text,
  target_responsibility text,
  target_due_at timestamptz,
  target_expected_appointment_updated_at timestamptz,
  target_request_id uuid,
  target_correlation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  appointment public.appointments%ROWTYPE;
  active_assignment public.appointment_professional_assignments%ROWTYPE;
  existing public.appointment_reassignment_requests%ROWTYPE;
  created public.appointment_reassignment_requests%ROWTYPE;
  preference record;
  actor_role_template text;
  requires_customer boolean;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_correlation_id IS NULL
    OR target_expected_appointment_updated_at IS NULL
    OR target_reason_code !~ '^[a-z][a-z0-9_]{2,79}$'
    OR target_responsibility NOT IN (
      'professional', 'reception', 'manager', 'admin', 'owner'
    )
    OR target_due_at <= now()
  THEN
    RAISE EXCEPTION 'invalid_reassignment_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing
  FROM public.appointment_reassignment_requests AS request
  WHERE request.request_id = target_request_id;
  IF FOUND THEN
    IF existing.initiated_by <> actor_id
      OR existing.appointment_id <> target_appointment_id
      OR existing.reason_code <> target_reason_code
      OR existing.correlation_id <> target_correlation_id
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'reassignmentRequestId', existing.id,
      'appointmentId', existing.appointment_id,
      'status', existing.status,
      'version', existing.version,
      'requestId', existing.request_id,
      'correlationId', existing.correlation_id,
      'customerDecisionRequired', existing.customer_decision_required,
      'replayed', true
    );
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = target_appointment_id AND target.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF appointment.updated_at IS DISTINCT FROM target_expected_appointment_updated_at THEN
    RAISE EXCEPTION 'appointment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF appointment.status NOT IN ('pending', 'confirmed')
    OR appointment.date_time <= now()
  THEN
    RAISE EXCEPTION 'appointment_not_reassignable' USING ERRCODE = '22023';
  END IF;
  IF target_due_at > appointment.date_time THEN
    RAISE EXCEPTION 'reassignment_deadline_after_appointment' USING ERRCODE = '22023';
  END IF;
  IF NOT COALESCE((
    SELECT establishment.appointment_reassignment_enabled
    FROM public.establishments AS establishment
    WHERE establishment.id = appointment.establishment_id
  ), false) THEN
    RAISE EXCEPTION 'appointment_reassignment_disabled' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_business_capability(
    appointment.establishment_id, actor_id,
    'request_appointment_reassignment', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT membership.role_template INTO actor_role_template
  FROM public.memberships AS membership
  WHERE membership.profile_id = actor_id
    AND membership.establishment_id = appointment.establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
  LIMIT 1;
  IF actor_role_template = 'professional'
    AND appointment.professional_id <> actor_id
  THEN
    RAISE EXCEPTION 'professional_reassignment_scope_forbidden' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_orders AS service_order
    WHERE service_order.appointment_id = appointment.id
      AND service_order.status <> 'voided'
  ) THEN
    RAISE EXCEPTION 'appointment_reassignment_after_order_open' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO active_assignment
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.appointment_id = appointment.id
    AND assignment.status = 'active'
    AND assignment.effective_until IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.appointment_professional_assignments(
      appointment_id, establishment_id, professional_id, status, source,
      effective_from, correlation_id
    ) VALUES (
      appointment.id, appointment.establishment_id, appointment.professional_id,
      'active', 'legacy_projection', appointment.created_at, target_correlation_id
    ) RETURNING * INTO active_assignment;
  END IF;
  IF active_assignment.professional_id <> appointment.professional_id THEN
    RAISE EXCEPTION 'appointment_assignment_projection_mismatch'
      USING ERRCODE = '40001';
  END IF;

  SELECT * INTO preference
  FROM public.appointment_professional_preference_projection AS projection
  WHERE projection.appointment_id = appointment.id;
  requires_customer := appointment.client_id IS NOT NULL
    OR appointment.establishment_client_id IS NOT NULL;

  INSERT INTO public.appointment_reassignment_requests(
    appointment_id, establishment_id, previous_assignment_id,
    initiated_by, responsibility, reason_code, previous_condition,
    proposed_condition, customer_decision_required, status, due_at,
    request_id, correlation_id, expected_appointment_updated_at
  ) VALUES (
    appointment.id, appointment.establishment_id, active_assignment.id,
    actor_id, target_responsibility, target_reason_code,
    jsonb_build_object(
      'professionalId', appointment.professional_id,
      'startsAt', appointment.date_time,
      'endsAt', appointment.ends_at,
      'serviceId', appointment.service_id,
      'priceCents', round(appointment.price_charged * 100)::bigint,
      'preference', preference.preference,
      'preferenceSource', preference.preference_source
    ),
    '{}'::jsonb, requires_customer, 'requested', target_due_at,
    target_request_id, target_correlation_id,
    target_expected_appointment_updated_at
  ) RETURNING * INTO created;

  IF requires_customer THEN
    INSERT INTO public.customer_change_decisions(
      reassignment_request_id, appointment_id
    ) VALUES (created.id, appointment.id);
  END IF;

  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    assignment_id, event_type, actor_id, actor_kind, request_id,
    correlation_id, resulting_version, payload
  ) VALUES (
    appointment.id, appointment.establishment_id, created.id,
    active_assignment.id, 'reassignment.requested', actor_id,
    CASE WHEN actor_role_template = 'professional' THEN 'professional' ELSE 'staff' END,
    target_request_id, target_correlation_id, created.version,
    jsonb_build_object(
      'reasonCode', target_reason_code,
      'responsibility', target_responsibility,
      'customerDecisionRequired', requires_customer
    )
  );
  PERFORM public.refresh_appointment_decision_queue_item(created.id);

  RETURN jsonb_build_object(
    'reassignmentRequestId', created.id,
    'appointmentId', created.appointment_id,
    'status', created.status,
    'version', created.version,
    'requestId', created.request_id,
    'correlationId', created.correlation_id,
    'customerDecisionRequired', created.customer_decision_required,
    'replayed', false
  );
EXCEPTION
  WHEN unique_violation THEN
    IF EXISTS (
      SELECT 1 FROM public.appointment_reassignment_requests AS request
      WHERE request.appointment_id = target_appointment_id
        AND request.status IN (
          'requested', 'validating', 'awaiting_manager', 'awaiting_customer',
          'ready_to_apply', 'manual_review'
        )
    ) THEN
      RAISE EXCEPTION 'appointment_reassignment_already_active'
        USING ERRCODE = '23505';
    END IF;
    RAISE;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_appointment_reassignment(
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
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  replay_event public.appointment_assignment_events%ROWTYPE;
  previous_version integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_expected_version < 1 THEN
    RAISE EXCEPTION 'invalid_reassignment_validation' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO replay_event
  FROM public.appointment_assignment_events AS event
  WHERE event.request_id = target_request_id;
  IF FOUND THEN
    IF replay_event.reassignment_request_id <> target_reassignment_request_id
      OR replay_event.event_type <> 'reassignment.validated'
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
  IF workflow.status NOT IN ('requested', 'validating') THEN
    RAISE EXCEPTION 'reassignment_not_validatable' USING ERRCODE = '22023';
  END IF;
  IF workflow.due_at <= now() THEN
    RAISE EXCEPTION 'appointment_reassignment_expired' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_business_capability(
    workflow.establishment_id, actor_id,
    'request_appointment_reassignment', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF workflow.initiated_by <> actor_id
    AND NOT public.has_business_capability(
      workflow.establishment_id, actor_id, 'manage_team', 'full'
    )
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
  IF NOT COALESCE((
    SELECT establishment.appointment_reassignment_enabled
    FROM public.establishments AS establishment
    WHERE establishment.id = workflow.establishment_id
  ), false) THEN
    RAISE EXCEPTION 'appointment_reassignment_disabled' USING ERRCODE = '42501';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_orders AS service_order
    WHERE service_order.appointment_id = appointment.id
      AND service_order.status <> 'voided'
  ) THEN
    RAISE EXCEPTION 'appointment_reassignment_after_order_open' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appointment_professional_assignments AS assignment
    WHERE assignment.id = workflow.previous_assignment_id
      AND assignment.status = 'active'
      AND assignment.effective_until IS NULL
      AND assignment.professional_id = appointment.professional_id
  ) THEN
    RAISE EXCEPTION 'appointment_assignment_projection_mismatch'
      USING ERRCODE = '40001';
  END IF;

  previous_version := workflow.version;
  UPDATE public.appointment_reassignment_requests
  SET status = 'awaiting_manager',
      version = version + 1,
      updated_at = now()
  WHERE id = workflow.id
  RETURNING * INTO workflow;

  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    assignment_id, event_type, actor_id, actor_kind, request_id,
    correlation_id, previous_version, resulting_version, payload
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id, workflow.id,
    workflow.previous_assignment_id, 'reassignment.validated', actor_id,
    CASE WHEN appointment.professional_id = actor_id THEN 'professional' ELSE 'staff' END,
    target_request_id, workflow.correlation_id,
    previous_version, workflow.version,
    jsonb_build_object('nextStatus', workflow.status)
  );
  PERFORM public.refresh_appointment_decision_queue_item(workflow.id);

  RETURN jsonb_build_object(
    'reassignmentRequestId', workflow.id,
    'status', workflow.status,
    'version', workflow.version,
    'requestId', target_request_id,
    'correlationId', workflow.correlation_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.propose_appointment_reassignment(
  target_reassignment_request_id uuid,
  target_proposed_professional_id uuid,
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
  proposed_assignment public.appointment_professional_assignments%ROWTYPE;
  replay_assignment public.appointment_professional_assignments%ROWTYPE;
  previous_version integer;
  proposed_price numeric;
  slot record;
  next_status text;
  monetary_impact boolean;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL OR target_proposed_professional_id IS NULL
    OR target_expected_version < 1
  THEN
    RAISE EXCEPTION 'invalid_reassignment_proposal' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO replay_assignment
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.request_id = target_request_id;
  IF FOUND THEN
    IF replay_assignment.reassignment_request_id <> target_reassignment_request_id
      OR replay_assignment.professional_id <> target_proposed_professional_id
      OR replay_assignment.created_by <> actor_id
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT * INTO workflow FROM public.appointment_reassignment_requests
    WHERE id = target_reassignment_request_id;
    RETURN jsonb_build_object(
      'reassignmentRequestId', workflow.id,
      'proposedAssignmentId', replay_assignment.id,
      'status', workflow.status,
      'version', workflow.version,
      'requestId', target_request_id,
      'correlationId', workflow.correlation_id,
      'customerDecisionRequired', workflow.customer_decision_required,
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
  IF workflow.status <> 'awaiting_manager' OR workflow.due_at <= now() THEN
    RAISE EXCEPTION 'reassignment_not_proposable' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_business_capability(
    workflow.establishment_id, actor_id,
    'apply_appointment_reassignment', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
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
  IF appointment.professional_id = target_proposed_professional_id THEN
    RAISE EXCEPTION 'replacement_must_change_professional' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.service_orders AS service_order
    WHERE service_order.appointment_id = appointment.id
      AND service_order.status <> 'voided'
  ) THEN
    RAISE EXCEPTION 'appointment_reassignment_after_order_open' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = target_proposed_professional_id
      AND membership.establishment_id = workflow.establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'replacement_professional_not_linked' USING ERRCODE = '22023';
  END IF;

  SELECT professional_service.price INTO proposed_price
  FROM public.professional_services AS professional_service
  WHERE professional_service.establishment_id = workflow.establishment_id
    AND professional_service.professional_id = target_proposed_professional_id
    AND professional_service.service_id = appointment.service_id
    AND professional_service.is_active
  LIMIT 1;
  IF proposed_price IS NULL THEN
    RAISE EXCEPTION 'replacement_professional_not_qualified' USING ERRCODE = '22023';
  END IF;

  SELECT available_slot.* INTO slot
  FROM public.compute_available_slots(
    workflow.establishment_id,
    target_proposed_professional_id,
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

  monetary_impact := round(proposed_price * 100)::bigint
    <> round(COALESCE(appointment.price_charged, 0) * 100)::bigint;
  next_status := CASE
    WHEN workflow.customer_decision_required THEN 'awaiting_customer'
    ELSE 'ready_to_apply'
  END;

  INSERT INTO public.appointment_professional_assignments(
    appointment_id, establishment_id, professional_id, status, source,
    supersedes_assignment_id, created_by, request_id, correlation_id,
    reassignment_request_id
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id,
    target_proposed_professional_id, 'proposed', 'reassignment',
    workflow.previous_assignment_id, actor_id, target_request_id,
    workflow.correlation_id, workflow.id
  ) RETURNING * INTO proposed_assignment;

  previous_version := workflow.version;
  UPDATE public.appointment_reassignment_requests
  SET proposed_professional_id = target_proposed_professional_id,
      proposed_condition = jsonb_build_object(
        'professionalId', target_proposed_professional_id,
        'startsAt', appointment.date_time,
        'endsAt', appointment.ends_at,
        'serviceId', appointment.service_id,
        'priceCents', round(proposed_price * 100)::bigint,
        'monetaryImpact', monetary_impact
      ),
      status = next_status,
      version = version + 1,
      updated_at = now()
  WHERE id = workflow.id
  RETURNING * INTO workflow;

  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, reassignment_request_id,
    assignment_id, event_type, actor_id, actor_kind, request_id,
    correlation_id, previous_version, resulting_version, payload
  ) VALUES (
    workflow.appointment_id, workflow.establishment_id, workflow.id,
    proposed_assignment.id, 'reassignment.proposed', actor_id, 'staff',
    target_request_id, workflow.correlation_id,
    previous_version, workflow.version,
    jsonb_build_object(
      'nextStatus', workflow.status,
      'customerDecisionRequired', workflow.customer_decision_required,
      'monetaryImpact', monetary_impact
    )
  );
  PERFORM public.refresh_appointment_decision_queue_item(workflow.id);

  RETURN jsonb_build_object(
    'reassignmentRequestId', workflow.id,
    'proposedAssignmentId', proposed_assignment.id,
    'status', workflow.status,
    'version', workflow.version,
    'requestId', target_request_id,
    'correlationId', workflow.correlation_id,
    'customerDecisionRequired', workflow.customer_decision_required,
    'monetaryImpact', monetary_impact,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.seed_appointment_assignment_projection()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.refresh_appointment_decision_queue_item(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.seed_appointment_assignment_projection()
  TO service_role;
GRANT EXECUTE ON FUNCTION public.refresh_appointment_decision_queue_item(uuid)
  TO service_role;

REVOKE ALL ON FUNCTION public.request_appointment_reassignment(
  text, text, text, timestamptz, timestamptz, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_appointment_reassignment(
  text, text, text, timestamptz, timestamptz, uuid, uuid
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.validate_appointment_reassignment(uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.validate_appointment_reassignment(uuid, integer, uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.propose_appointment_reassignment(uuid, uuid, integer, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.propose_appointment_reassignment(uuid, uuid, integer, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.request_appointment_reassignment(
  text, text, text, timestamptz, timestamptz, uuid, uuid
) IS 'Creates a locked, idempotent reassignment workflow without changing appointments.professional_id.';
COMMENT ON FUNCTION public.validate_appointment_reassignment(uuid, integer, uuid)
  IS 'Revalidates the appointment and active shadow assignment, then routes the workflow to manager proposal.';
COMMENT ON FUNCTION public.propose_appointment_reassignment(uuid, uuid, integer, uuid)
  IS 'Creates a proposed assignment after linkage, qualification and availability checks; never applies it.';

COMMIT;
