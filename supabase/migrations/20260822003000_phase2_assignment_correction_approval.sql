BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

ALTER TABLE public.approval_requests
  ADD COLUMN subject_appointment_id text,
  ADD COLUMN proposed_professional_id uuid,
  ADD COLUMN correction_payload jsonb,
  ADD COLUMN consumed_at timestamptz,
  ADD COLUMN consumed_by uuid;

ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_subject_appointment_id_fkey
    FOREIGN KEY (subject_appointment_id)
    REFERENCES public.appointments(id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT approval_requests_proposed_professional_id_fkey
    FOREIGN KEY (proposed_professional_id)
    REFERENCES public.profiles(id) ON DELETE RESTRICT NOT VALID,
  ADD CONSTRAINT approval_requests_consumed_by_fkey
    FOREIGN KEY (consumed_by)
    REFERENCES public.profiles(id) ON DELETE SET NULL NOT VALID,
  ADD CONSTRAINT executor_correction_approval_payload_check CHECK (
    request_type <> 'executor_correction'
    OR (
      establishment_id IS NOT NULL
      AND subject_appointment_id IS NOT NULL
      AND proposed_professional_id IS NOT NULL
      AND correction_payload IS NOT NULL
      AND jsonb_typeof(correction_payload) = 'object'
    )
  ) NOT VALID;

CREATE OR REPLACE FUNCTION public.request_appointment_assignment_correction_approval(
  target_appointment_id text,
  target_proposed_professional_id uuid,
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
  appointment public.appointments%ROWTYPE;
  active_assignment public.appointment_professional_assignments%ROWTYPE;
  existing public.approval_requests%ROWTYPE;
  created public.approval_requests%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL OR target_proposed_professional_id IS NULL
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'invalid_assignment_correction_approval' USING ERRCODE = '22023'; END IF;

  SELECT * INTO existing FROM public.approval_requests
  WHERE request_id = target_request_id;
  IF FOUND THEN
    IF existing.request_type <> 'executor_correction'
      OR existing.requested_by <> actor_id
      OR existing.subject_appointment_id <> target_appointment_id
      OR existing.proposed_professional_id <> target_proposed_professional_id
      OR existing.justification <> btrim(target_reason)
    THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023'; END IF;
    RETURN jsonb_build_object(
      'approvalRequestId', existing.id, 'status', existing.status,
      'version', existing.version, 'requestId', existing.request_id,
      'replayed', true
    );
  END IF;

  SELECT * INTO appointment FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF NOT public.has_business_capability(
    appointment.establishment_id, actor_id,
    'correct_appointment_assignment', 'full'
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF appointment.status <> 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.service_orders AS service_order
      WHERE service_order.appointment_id = appointment.id
        AND service_order.status = 'closed'
    )
  THEN RAISE EXCEPTION 'assignment_correction_requires_completed_service' USING ERRCODE = '22023'; END IF;
  IF appointment.professional_id = target_proposed_professional_id THEN
    RAISE EXCEPTION 'assignment_correction_must_change_professional' USING ERRCODE = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = target_proposed_professional_id
      AND membership.establishment_id = appointment.establishment_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.professional_services AS professional_service
    WHERE professional_service.professional_id = target_proposed_professional_id
      AND professional_service.establishment_id = appointment.establishment_id
      AND professional_service.service_id = appointment.service_id
  ) THEN
    RAISE EXCEPTION 'corrected_professional_has_no_service_history' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO active_assignment
  FROM public.appointment_professional_assignments AS assignment
  WHERE assignment.appointment_id = appointment.id
    AND assignment.status = 'active'
    AND assignment.effective_until IS NULL
  FOR UPDATE;
  IF NOT FOUND OR active_assignment.professional_id <> appointment.professional_id THEN
    RAISE EXCEPTION 'appointment_assignment_projection_mismatch' USING ERRCODE = '40001';
  END IF;

  INSERT INTO public.approval_requests(
    establishment_id, request_type, requested_by, justification,
    request_id, subject_appointment_id, proposed_professional_id,
    correction_payload
  ) VALUES (
    appointment.establishment_id, 'executor_correction', actor_id,
    btrim(target_reason), target_request_id, appointment.id,
    target_proposed_professional_id,
    jsonb_build_object(
      'previousAssignmentId', active_assignment.id,
      'previousProfessionalId', active_assignment.professional_id,
      'appointmentUpdatedAt', appointment.updated_at
    )
  ) RETURNING * INTO created;

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id, 'appointment_assignment.correction_approval_requested',
    appointment.establishment_id,
    jsonb_build_object(
      'approval_request_id', created.id,
      'appointment_id', appointment.id,
      'request_id', target_request_id
    )
  );
  RETURN jsonb_build_object(
    'approvalRequestId', created.id, 'status', created.status,
    'version', created.version, 'requestId', created.request_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_appointment_assignment_correction_approval(
  target_approval_request_id uuid,
  target_expected_version integer,
  target_decision text,
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
  approval public.approval_requests%ROWTYPE;
  actor_identity record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL OR target_decision NOT IN ('approved', 'rejected')
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'invalid_correction_approval_decision' USING ERRCODE = '22023'; END IF;
  SELECT * INTO approval FROM public.approval_requests
  WHERE id = target_approval_request_id FOR UPDATE;
  IF NOT FOUND OR approval.request_type <> 'executor_correction' THEN
    RAISE EXCEPTION 'approval_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF approval.requested_by = actor_id THEN
    RAISE EXCEPTION 'approval_separation_required' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO actor_identity FROM public.resolve_business_operational_identity(
    approval.establishment_id, actor_id
  ) LIMIT 1;
  IF NOT FOUND OR actor_identity.operational_role <> 'owner' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF approval.status <> 'pending'
    AND approval.decision_request_id = target_request_id
  THEN
    IF approval.status <> target_decision
      OR approval.decided_by <> actor_id
      OR approval.decision_reason <> btrim(target_reason)
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'approvalRequestId', approval.id, 'status', approval.status,
      'version', approval.version, 'requestId', target_request_id,
      'replayed', true
    );
  END IF;
  IF approval.status <> 'pending' THEN RAISE EXCEPTION 'approval_request_not_pending' USING ERRCODE = '22023'; END IF;
  IF approval.version <> target_expected_version THEN RAISE EXCEPTION 'approval_version_conflict' USING ERRCODE = '40001'; END IF;
  IF approval.expires_at <= now() THEN RAISE EXCEPTION 'approval_request_expired' USING ERRCODE = '22023'; END IF;
  UPDATE public.approval_requests
  SET status = target_decision, decided_by = actor_id,
      decision_request_id = target_request_id,
      decision_reason = btrim(target_reason), decided_at = now(),
      version = version + 1, updated_at = now()
  WHERE id = approval.id RETURNING * INTO approval;
  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id, 'appointment_assignment.correction_approval_' || target_decision,
    approval.establishment_id,
    jsonb_build_object(
      'approval_request_id', approval.id,
      'appointment_id', approval.subject_appointment_id,
      'version', approval.version
    )
  );
  RETURN jsonb_build_object(
    'approvalRequestId', approval.id, 'status', approval.status,
    'version', approval.version, 'requestId', target_request_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.correct_appointment_assignment(
  target_appointment_id text,
  target_proposed_professional_id uuid,
  target_approval_request_id uuid,
  target_expected_appointment_updated_at timestamptz,
  target_reason text,
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
  approval public.approval_requests%ROWTYPE;
  current_assignment public.appointment_professional_assignments%ROWTYPE;
  corrected_assignment public.appointment_professional_assignments%ROWTYPE;
  replay_event public.appointment_assignment_events%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000'; END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL OR target_correlation_id IS NULL
    OR target_expected_appointment_updated_at IS NULL
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'invalid_assignment_correction' USING ERRCODE = '22023'; END IF;
  SELECT * INTO replay_event FROM public.appointment_assignment_events
  WHERE request_id = target_request_id;
  IF FOUND THEN
    IF replay_event.appointment_id <> target_appointment_id
      OR replay_event.event_type <> 'assignment.corrected'
      OR replay_event.actor_id <> actor_id
      OR replay_event.correlation_id <> target_correlation_id
      OR replay_event.payload->>'professionalId' <> target_proposed_professional_id::text
      OR replay_event.payload->>'approvalRequestId' <> target_approval_request_id::text
      OR replay_event.payload->>'reason' <> btrim(target_reason)
    THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023'; END IF;
    SELECT * INTO corrected_assignment FROM public.appointment_professional_assignments
    WHERE id = replay_event.assignment_id;
    RETURN jsonb_build_object(
      'appointmentId', target_appointment_id,
      'assignmentId', corrected_assignment.id,
      'professionalId', corrected_assignment.professional_id,
      'requestId', target_request_id,
      'correlationId', replay_event.correlation_id,
      'replayed', true
    );
  END IF;
  SELECT * INTO appointment FROM public.appointments
  WHERE id = target_appointment_id AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002'; END IF;
  IF appointment.updated_at IS DISTINCT FROM target_expected_appointment_updated_at THEN
    RAISE EXCEPTION 'appointment_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF NOT public.has_business_capability(
    appointment.establishment_id, actor_id,
    'correct_appointment_assignment', 'full'
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF appointment.status <> 'completed'
    AND NOT EXISTS (
      SELECT 1 FROM public.service_orders AS service_order
      WHERE service_order.appointment_id = appointment.id
        AND service_order.status = 'closed'
    )
  THEN RAISE EXCEPTION 'assignment_correction_requires_completed_service' USING ERRCODE = '22023'; END IF;
  SELECT * INTO approval FROM public.approval_requests
  WHERE id = target_approval_request_id FOR UPDATE;
  IF NOT FOUND OR approval.request_type <> 'executor_correction'
    OR approval.status <> 'approved' OR approval.expires_at <= now()
    OR approval.requested_by <> actor_id
    OR approval.subject_appointment_id <> appointment.id
    OR approval.proposed_professional_id <> target_proposed_professional_id
    OR approval.consumed_at IS NOT NULL
  THEN RAISE EXCEPTION 'approved_correction_request_required' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = target_proposed_professional_id
      AND membership.establishment_id = appointment.establishment_id
  ) OR NOT EXISTS (
    SELECT 1 FROM public.professional_services AS professional_service
    WHERE professional_service.professional_id = target_proposed_professional_id
      AND professional_service.establishment_id = appointment.establishment_id
      AND professional_service.service_id = appointment.service_id
  ) THEN RAISE EXCEPTION 'corrected_professional_has_no_service_history' USING ERRCODE = '22023'; END IF;
  SELECT * INTO current_assignment FROM public.appointment_professional_assignments
  WHERE appointment_id = appointment.id AND status = 'active'
    AND effective_until IS NULL FOR UPDATE;
  IF NOT FOUND OR current_assignment.professional_id <> appointment.professional_id THEN
    RAISE EXCEPTION 'appointment_assignment_projection_mismatch' USING ERRCODE = '40001';
  END IF;
  UPDATE public.appointment_professional_assignments
  SET status = 'corrected',
      effective_until = CASE WHEN now() > effective_from THEN now() ELSE effective_from + interval '1 microsecond' END,
      version = version + 1, updated_at = now()
  WHERE id = current_assignment.id;
  INSERT INTO public.appointment_professional_assignments(
    appointment_id, establishment_id, professional_id, status, source,
    supersedes_assignment_id, created_by, request_id, correlation_id
  ) VALUES (
    appointment.id, appointment.establishment_id,
    target_proposed_professional_id, 'active', 'correction',
    current_assignment.id, actor_id, target_request_id, target_correlation_id
  ) RETURNING * INTO corrected_assignment;
  UPDATE public.appointments
  SET professional_id = target_proposed_professional_id,
      transferred_from_professional_id = current_assignment.professional_id,
      transfer_reason = 'audited_assignment_correction',
      updated_at = now()
  WHERE id = appointment.id;
  UPDATE public.approval_requests
  SET consumed_at = now(), consumed_by = actor_id,
      version = version + 1, updated_at = now()
  WHERE id = approval.id;
  INSERT INTO public.appointment_assignment_events(
    appointment_id, establishment_id, assignment_id, event_type,
    actor_id, actor_kind, request_id, correlation_id,
    previous_version, resulting_version, payload
  ) VALUES (
    appointment.id, appointment.establishment_id, corrected_assignment.id,
    'assignment.corrected', actor_id, 'staff', target_request_id,
    target_correlation_id, current_assignment.version,
    corrected_assignment.version,
    jsonb_build_object(
      'previousAssignmentId', current_assignment.id,
      'previousProfessionalId', current_assignment.professional_id,
      'professionalId', target_proposed_professional_id,
      'approvalRequestId', approval.id,
      'reason', btrim(target_reason)
    )
  );
  RETURN jsonb_build_object(
    'appointmentId', appointment.id,
    'assignmentId', corrected_assignment.id,
    'professionalId', corrected_assignment.professional_id,
    'requestId', target_request_id,
    'correlationId', target_correlation_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_appointment_assignment_correction_approval(
  text, uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.request_appointment_assignment_correction_approval(
  text, uuid, text, uuid
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.decide_appointment_assignment_correction_approval(
  uuid, integer, text, text, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.decide_appointment_assignment_correction_approval(
  uuid, integer, text, text, uuid
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.correct_appointment_assignment(
  text, uuid, uuid, timestamptz, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.correct_appointment_assignment(
  text, uuid, uuid, timestamptz, text, uuid, uuid
) TO authenticated, service_role;

COMMIT;
