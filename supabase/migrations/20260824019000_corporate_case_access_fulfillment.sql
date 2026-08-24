-- Controlled fulfillment for approved corporate access cases.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

INSERT INTO public.control_permission_catalog(permission, label, area, risk_level)
VALUES (
  'control.cases.fulfill',
  'Executar solicitações de acesso aprovadas',
  'cases',
  'critical'
)
ON CONFLICT (permission) DO UPDATE
SET label = EXCLUDED.label,
    area = EXCLUDED.area,
    risk_level = EXCLUDED.risk_level,
    active = true,
    updated_at = now();

INSERT INTO public.control_access_profile_permissions(access_profile_id, permission)
SELECT access_profile.id, 'control.cases.fulfill'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key IN ('saas_owner', 'access_administrator')
ON CONFLICT (access_profile_id, permission) DO NOTHING;

INSERT INTO public.corporate_notification_templates(
  template_key,
  channel,
  version,
  subject_template,
  body_template,
  active
)
VALUES (
  'corporate_case.fulfillment_updated',
  'email',
  1,
  'Execução atualizada no CutSync Cloud',
  'A execução de um chamado foi atualizada. Acesse o CutSync Cloud para consultar o estado após autenticação. O e-mail não contém justificativas, dados sensíveis ou ações executáveis.',
  true
)
ON CONFLICT (template_key, channel, version) DO UPDATE
SET subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    active = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION corporate_private.actor_can_fulfill_access_case(
  target_case_id uuid,
  target_group_id uuid,
  target_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT target_case_id IS NOT NULL
    AND target_group_id IS NOT NULL
    AND target_actor_id IS NOT NULL
    AND corporate_private.actor_is_active_group_member(target_group_id, target_actor_id)
    AND corporate_private.actor_has_active_control_permission(
      target_actor_id,
      'control.cases.fulfill'
    )
    AND corporate_private.actor_has_active_control_permission(
      target_actor_id,
      'control.access.apply'
    )
    AND EXISTS (
      SELECT 1
      FROM public.corporate_cases AS corporate_case
      JOIN public.corporate_case_access_requests AS access_request
        ON access_request.case_id = corporate_case.id
      WHERE corporate_case.id = target_case_id
        AND corporate_case.requester_profile_id <> target_actor_id
        AND corporate_case.beneficiary_profile_id IS DISTINCT FROM target_actor_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.corporate_case_tasks AS previous_task
      WHERE previous_task.case_id = target_case_id
        AND previous_task.task_type IN ('triage', 'review')
        AND previous_task.completed_by = target_actor_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.corporate_case_approval_slots AS approval_slot
      JOIN public.corporate_case_tasks AS approval_task
        ON approval_task.id = approval_slot.task_id
      WHERE approval_task.case_id = target_case_id
        AND approval_slot.decided_by = target_actor_id
        AND approval_slot.decision IN ('approved', 'rejected')
    );
$$;

REVOKE ALL ON FUNCTION corporate_private.actor_can_fulfill_access_case(uuid, uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_corporate_case_fulfillment_context(
  target_case_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid;
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  access_request public.corporate_case_access_requests%ROWTYPE;
  requested_profile public.control_access_profiles%ROWTYPE;
  legacy_status text;
  actor_is_eligible boolean := false;
  attempt_count integer := 0;
  latest_outcome text;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;

  SELECT corporate_case.*
  INTO case_row
  FROM public.corporate_cases AS corporate_case
  WHERE corporate_case.id = target_case_id;

  IF NOT FOUND OR NOT corporate_private.actor_can_view_case(
    target_case_id,
    actor_id,
    ARRAY(
      SELECT permission_value
      FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value)
    )
  ) THEN
    RAISE EXCEPTION 'corporate_case_not_found';
  END IF;

  SELECT task.*
  INTO task_row
  FROM public.corporate_case_tasks AS task
  WHERE task.case_id = case_row.id
    AND task.stage_order = case_row.current_stage_order
    AND task.task_type = 'fulfillment'
    AND task.status IN ('pending', 'in_progress', 'waiting')
  ORDER BY task.created_at DESC, task.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'workflow_enabled', runtime_settings.workflow_enabled,
      'case_id', case_row.id,
      'case_version', case_row.version,
      'task', NULL,
      'request', NULL,
      'can_claim', false,
      'can_execute', false,
      'separation_satisfied', false,
      'attempt_count', 0,
      'latest_outcome', NULL
    );
  END IF;

  SELECT access_projection.*
  INTO STRICT access_request
  FROM public.corporate_case_access_requests AS access_projection
  WHERE access_projection.case_id = case_row.id;

  SELECT access_profile.*
  INTO STRICT requested_profile
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.id = access_request.requested_access_profile_id;

  IF access_request.legacy_access_request_id IS NOT NULL THEN
    SELECT request.status
    INTO legacy_status
    FROM public.control_access_requests AS request
    WHERE request.id = access_request.legacy_access_request_id;
  END IF;

  actor_is_eligible := corporate_private.actor_can_fulfill_access_case(
    case_row.id,
    task_row.assigned_group_id,
    actor_id
  );

  SELECT count(*)::integer
  INTO attempt_count
  FROM public.corporate_case_events AS event
  WHERE event.case_id = case_row.id
    AND event.event_type IN (
      'corporate_case.fulfillment_applied',
      'corporate_case.fulfillment_failed',
      'corporate_case.fulfillment_deferred'
    );

  SELECT event.payload->>'execution_status'
  INTO latest_outcome
  FROM public.corporate_case_events AS event
  WHERE event.case_id = case_row.id
    AND event.event_type IN (
      'corporate_case.fulfillment_applied',
      'corporate_case.fulfillment_failed',
      'corporate_case.fulfillment_deferred'
    )
  ORDER BY event.created_at DESC, event.id DESC
  LIMIT 1;

  RETURN jsonb_build_object(
    'workflow_enabled', runtime_settings.workflow_enabled,
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task', jsonb_build_object(
      'task_id', task_row.id,
      'task_version', task_row.version,
      'status', task_row.status,
      'due_at', task_row.due_at,
      'assigned_profile_id', task_row.assigned_profile_id
    ),
    'request', jsonb_build_object(
      'requested_action', access_request.requested_action,
      'requested_profile_key', requested_profile.profile_key,
      'requested_profile_label', requested_profile.label,
      'requested_valid_until', access_request.requested_valid_until,
      'legacy_access_request_id', access_request.legacy_access_request_id,
      'legacy_status', legacy_status
    ),
    'can_claim', runtime_settings.workflow_enabled
      AND case_row.status = 'fulfillment'
      AND task_row.status = 'pending'
      AND task_row.assigned_profile_id IS NULL
      AND actor_is_eligible,
    'can_execute', runtime_settings.workflow_enabled
      AND case_row.status = 'fulfillment'
      AND task_row.status = 'in_progress'
      AND task_row.assigned_profile_id = actor_id
      AND actor_is_eligible,
    'separation_satisfied', actor_is_eligible,
    'attempt_count', attempt_count,
    'latest_outcome', latest_outcome
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_corporate_case_fulfillment(
  target_case_id uuid,
  target_task_id uuid,
  target_expected_case_version integer,
  target_expected_task_version integer,
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid;
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  existing_event public.corporate_case_events%ROWTYPE;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  IF target_case_id IS NULL
     OR target_task_id IS NULL
     OR target_client_request_id IS NULL
     OR target_expected_case_version < 1
     OR target_expected_task_version < 1
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_claim';
  END IF;

  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type <> 'corporate_case.fulfillment_claimed'
       OR existing_event.payload->>'task_id' <> target_task_id::text
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'case_id', existing_event.case_id,
      'case_version', (existing_event.payload->>'case_version')::integer,
      'task_id', target_task_id,
      'task_version', (existing_event.payload->>'task_version')::integer,
      'status', existing_event.payload->>'status',
      'idempotent', true
    );
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;
  IF NOT runtime_settings.workflow_enabled THEN RAISE EXCEPTION 'corporate_case_workflow_disabled'; END IF;

  SELECT corporate_case.*
  INTO case_row
  FROM public.corporate_cases AS corporate_case
  WHERE corporate_case.id = target_case_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_not_found'; END IF;

  SELECT task.*
  INTO task_row
  FROM public.corporate_case_tasks AS task
  WHERE task.id = target_task_id
    AND task.case_id = target_case_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_task_not_found'; END IF;

  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type <> 'corporate_case.fulfillment_claimed'
       OR existing_event.payload->>'task_id' <> target_task_id::text
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'case_id', existing_event.case_id,
      'case_version', (existing_event.payload->>'case_version')::integer,
      'task_id', target_task_id,
      'task_version', (existing_event.payload->>'task_version')::integer,
      'status', existing_event.payload->>'status',
      'idempotent', true
    );
  END IF;

  IF case_row.version <> target_expected_case_version
     OR task_row.version <> target_expected_task_version
  THEN
    RAISE EXCEPTION 'corporate_case_version_conflict';
  END IF;
  IF case_row.status <> 'fulfillment'
     OR case_row.current_stage_order IS DISTINCT FROM task_row.stage_order
     OR case_row.current_group_id IS DISTINCT FROM task_row.assigned_group_id
     OR task_row.task_type <> 'fulfillment'
  THEN
    RAISE EXCEPTION 'corporate_case_fulfillment_not_current';
  END IF;
  IF case_row.expires_at <= now() THEN RAISE EXCEPTION 'corporate_case_expired'; END IF;
  IF NOT corporate_private.actor_can_fulfill_access_case(
    case_row.id,
    task_row.assigned_group_id,
    actor_id
  ) THEN
    RAISE EXCEPTION 'corporate_case_fulfillment_separation_required';
  END IF;
  IF task_row.status <> 'pending' OR task_row.assigned_profile_id IS NOT NULL THEN
    RAISE EXCEPTION 'corporate_case_task_not_claimable';
  END IF;

  UPDATE public.corporate_case_tasks
  SET status = 'in_progress',
      assigned_profile_id = actor_id,
      version = version + 1,
      updated_at = now()
  WHERE id = task_row.id
  RETURNING * INTO task_row;

  UPDATE public.corporate_cases
  SET current_assignee_profile_id = actor_id,
      version = version + 1,
      updated_at = now()
  WHERE id = case_row.id
  RETURNING * INTO case_row;

  INSERT INTO public.corporate_case_participants(
    case_id, profile_id, participant_role, notification_level, active, added_by
  )
  VALUES (case_row.id, actor_id, 'assignee', 'all', true, actor_id)
  ON CONFLICT (case_id, profile_id, participant_role) DO UPDATE
  SET active = true,
      notification_level = 'all',
      removed_by = NULL,
      removed_at = NULL,
      updated_at = now();

  INSERT INTO public.corporate_case_events(
    event_key, case_id, actor_profile_id, event_type, audience, payload
  )
  VALUES (
    target_client_request_id,
    case_row.id,
    actor_id,
    'corporate_case.fulfillment_claimed',
    'internal',
    jsonb_build_object(
      'task_id', task_row.id,
      'case_version', case_row.version,
      'task_version', task_row.version,
      'status', case_row.status
    )
  );

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'corporate_case.fulfillment_claimed',
    case_row.id,
    'corporate_case',
    jsonb_build_object(
      'task_id', task_row.id,
      'case_version', case_row.version,
      'task_version', task_row.version
    )
  );

  RETURN jsonb_build_object(
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task_id', task_row.id,
    'task_version', task_row.version,
    'status', case_row.status,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.execute_corporate_access_fulfillment(
  target_case_id uuid,
  target_task_id uuid,
  target_expected_case_version integer,
  target_expected_task_version integer,
  target_operation text,
  target_reason text,
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid;
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  access_projection public.corporate_case_access_requests%ROWTYPE;
  requested_profile public.control_access_profiles%ROWTYPE;
  legacy_request public.control_access_requests%ROWTYPE;
  existing_event public.corporate_case_events%ROWTYPE;
  created_event public.corporate_case_events%ROWTYPE;
  apply_result jsonb;
  assignment_id uuid;
  message_id uuid;
  approved_count integer := 0;
  pending_approval_count integer := 0;
  rejected_approval_count integer := 0;
  required_approvals integer := 0;
  owner_approval_count integer := 0;
  failure_code text;
  caught_message text;
  execution_status text;
  event_type text;
  request_fingerprint text;
  retryable boolean := true;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  IF target_case_id IS NULL
     OR target_task_id IS NULL
     OR target_client_request_id IS NULL
     OR target_expected_case_version < 1
     OR target_expected_task_version < 1
     OR target_operation NOT IN ('apply', 'defer')
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_request';
  END IF;
  IF char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'corporate_case_reason_invalid';
  END IF;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(target_operation || '|' || btrim(target_reason), 'UTF8'),
      'sha256'
    ),
    'hex'
  );

  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type NOT IN (
         'corporate_case.fulfillment_applied',
         'corporate_case.fulfillment_failed',
         'corporate_case.fulfillment_deferred'
       )
       OR existing_event.payload->>'task_id' <> target_task_id::text
       OR existing_event.payload->>'request_fingerprint' <> request_fingerprint
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'case_id', existing_event.case_id,
      'case_version', (existing_event.payload->>'case_version')::integer,
      'task_id', target_task_id,
      'task_version', (existing_event.payload->>'task_version')::integer,
      'status', existing_event.payload->>'status',
      'execution_status', existing_event.payload->>'execution_status',
      'legacy_access_request_id', nullif(existing_event.payload->>'legacy_access_request_id', '')::uuid,
      'assignment_id', nullif(existing_event.payload->>'assignment_id', '')::uuid,
      'failure_code', existing_event.payload->>'failure_code',
      'retryable', coalesce((existing_event.payload->>'retryable')::boolean, false),
      'idempotent', true
    );
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;
  IF NOT runtime_settings.workflow_enabled THEN RAISE EXCEPTION 'corporate_case_workflow_disabled'; END IF;

  -- Workflow mutations always lock case -> task -> access projection -> legacy request.
  SELECT corporate_case.*
  INTO case_row
  FROM public.corporate_cases AS corporate_case
  WHERE corporate_case.id = target_case_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_not_found'; END IF;

  SELECT task.*
  INTO task_row
  FROM public.corporate_case_tasks AS task
  WHERE task.id = target_task_id
    AND task.case_id = target_case_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_task_not_found'; END IF;

  SELECT access_request.*
  INTO access_projection
  FROM public.corporate_case_access_requests AS access_request
  WHERE access_request.case_id = target_case_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_access_projection_not_found'; END IF;

  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type NOT IN (
         'corporate_case.fulfillment_applied',
         'corporate_case.fulfillment_failed',
         'corporate_case.fulfillment_deferred'
       )
       OR existing_event.payload->>'task_id' <> target_task_id::text
       OR existing_event.payload->>'request_fingerprint' <> request_fingerprint
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'case_id', existing_event.case_id,
      'case_version', (existing_event.payload->>'case_version')::integer,
      'task_id', target_task_id,
      'task_version', (existing_event.payload->>'task_version')::integer,
      'status', existing_event.payload->>'status',
      'execution_status', existing_event.payload->>'execution_status',
      'legacy_access_request_id', nullif(existing_event.payload->>'legacy_access_request_id', '')::uuid,
      'assignment_id', nullif(existing_event.payload->>'assignment_id', '')::uuid,
      'failure_code', existing_event.payload->>'failure_code',
      'retryable', coalesce((existing_event.payload->>'retryable')::boolean, false),
      'idempotent', true
    );
  END IF;

  IF case_row.version <> target_expected_case_version
     OR task_row.version <> target_expected_task_version
  THEN
    RAISE EXCEPTION 'corporate_case_version_conflict';
  END IF;
  IF case_row.status <> 'fulfillment'
     OR case_row.current_stage_order IS DISTINCT FROM task_row.stage_order
     OR case_row.current_group_id IS DISTINCT FROM task_row.assigned_group_id
     OR task_row.task_type <> 'fulfillment'
  THEN
    RAISE EXCEPTION 'corporate_case_fulfillment_not_current';
  END IF;
  IF case_row.expires_at <= now() THEN RAISE EXCEPTION 'corporate_case_expired'; END IF;
  IF task_row.status <> 'in_progress' OR task_row.assigned_profile_id <> actor_id THEN
    RAISE EXCEPTION 'corporate_case_task_assignment_required';
  END IF;
  IF NOT corporate_private.actor_can_fulfill_access_case(
    case_row.id,
    task_row.assigned_group_id,
    actor_id
  ) THEN
    RAISE EXCEPTION 'corporate_case_fulfillment_separation_required';
  END IF;

  SELECT access_profile.*
  INTO requested_profile
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.id = access_projection.requested_access_profile_id
    AND access_profile.assignment_mode = 'delegated'
    AND access_profile.active;

  IF NOT FOUND THEN RAISE EXCEPTION 'access_profile_not_found'; END IF;

  SELECT
    count(*) FILTER (WHERE approval_slot.decision = 'approved'),
    count(*) FILTER (WHERE approval_slot.decision = 'pending'),
    count(*) FILTER (WHERE approval_slot.decision = 'rejected'),
    count(*) FILTER (
      WHERE approval_slot.decision = 'approved' AND approval_slot.approver_was_owner
    ),
    routing_stage.required_approvals
  INTO approved_count, pending_approval_count, rejected_approval_count,
       owner_approval_count, required_approvals
  FROM public.corporate_case_tasks AS approval_task
  JOIN public.corporate_case_approval_slots AS approval_slot
    ON approval_slot.task_id = approval_task.id
  JOIN public.corporate_case_routing_stages AS routing_stage
    ON routing_stage.routing_policy_id = case_row.routing_policy_id
   AND routing_stage.stage_order = approval_task.stage_order
  WHERE approval_task.case_id = case_row.id
    AND approval_task.task_type = 'approval'
  GROUP BY routing_stage.required_approvals;

  IF NOT FOUND OR required_approvals IS NULL THEN
    RAISE EXCEPTION 'corporate_case_approvals_incomplete';
  END IF;
  IF case_row.beneficiary_profile_id IS NULL THEN
    RAISE EXCEPTION 'corporate_case_beneficiary_required';
  END IF;
  IF approved_count < required_approvals
     OR pending_approval_count > 0
     OR rejected_approval_count > 0
     OR (requested_profile.requires_owner_approval AND owner_approval_count < 1)
  THEN
    RAISE EXCEPTION 'corporate_case_approvals_incomplete';
  END IF;

  INSERT INTO public.corporate_case_messages(
    case_id, author_profile_id, client_message_id, visibility, body
  )
  VALUES (
    case_row.id, actor_id, target_client_request_id, 'internal', btrim(target_reason)
  )
  RETURNING id INTO message_id;

  IF target_operation = 'defer' THEN
    execution_status := 'deferred';
    event_type := 'corporate_case.fulfillment_deferred';
  ELSE
    IF access_projection.requested_valid_until IS NOT NULL
       AND access_projection.requested_valid_until <= now()
    THEN
      failure_code := 'access_validity_expired';
      retryable := false;
    END IF;

    IF failure_code IS NULL THEN
      IF access_projection.legacy_access_request_id IS NOT NULL THEN
        SELECT request.*
        INTO legacy_request
        FROM public.control_access_requests AS request
        WHERE request.id = access_projection.legacy_access_request_id
        FOR UPDATE;

        IF NOT FOUND THEN RAISE EXCEPTION 'legacy_access_request_not_found'; END IF;
      ELSE
        SELECT request.*
        INTO legacy_request
        FROM public.control_access_requests AS request
        WHERE request.client_request_id = case_row.client_request_id
        FOR UPDATE;

        IF NOT FOUND THEN
          INSERT INTO public.control_access_requests(
            client_request_id,
            requested_by,
            target_profile_id,
            source_access_profile_id,
            requested_access_profile_id,
            requested_action,
            requested_valid_until,
            justification,
            ticket_reference,
            risk_level,
            required_approvals,
            requires_owner_approval,
            status,
            expires_at,
            approved_at
          )
          VALUES (
            case_row.client_request_id,
            case_row.requester_profile_id,
            case_row.beneficiary_profile_id,
            access_projection.source_access_profile_id,
            access_projection.requested_access_profile_id,
            access_projection.requested_action,
            access_projection.requested_valid_until,
            'Solicitação aprovada no chamado ' || case_row.protocol || '. Consulte o registro corporativo.',
            case_row.protocol,
            case_row.risk_level,
            required_approvals,
            requested_profile.requires_owner_approval,
            'approved',
            case_row.expires_at,
            now()
          )
          RETURNING * INTO legacy_request;

          INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
          VALUES (
            actor_id,
            'corporate_case.access_projection_created',
            legacy_request.id,
            'control_access_request',
            jsonb_build_object(
              'case_id', case_row.id,
              'target_profile_id', case_row.beneficiary_profile_id,
              'requested_profile_key', requested_profile.profile_key,
              'requested_action', access_projection.requested_action,
              'corporate_approvals', approved_count
            )
          );
        END IF;

        UPDATE public.corporate_case_access_requests
        SET legacy_access_request_id = legacy_request.id,
            updated_at = now()
        WHERE case_id = case_row.id
        RETURNING * INTO access_projection;
      END IF;

      IF legacy_request.client_request_id <> case_row.client_request_id
         OR legacy_request.requested_by <> case_row.requester_profile_id
         OR legacy_request.target_profile_id IS DISTINCT FROM case_row.beneficiary_profile_id
         OR legacy_request.requested_access_profile_id <> access_projection.requested_access_profile_id
         OR legacy_request.source_access_profile_id IS DISTINCT FROM access_projection.source_access_profile_id
         OR legacy_request.requested_action <> access_projection.requested_action
         OR legacy_request.requested_valid_until IS DISTINCT FROM access_projection.requested_valid_until
      THEN
        RAISE EXCEPTION 'corporate_case_access_projection_mismatch';
      END IF;

      IF legacy_request.status = 'applied' THEN
        IF access_projection.requested_action = 'grant' AND NOT EXISTS (
          SELECT 1
          FROM public.control_user_access_assignments AS assignment
          WHERE assignment.target_profile_id = case_row.beneficiary_profile_id
            AND assignment.access_profile_id = access_projection.requested_access_profile_id
            AND assignment.source_request_id = legacy_request.id
            AND assignment.active
            AND assignment.revoked_at IS NULL
            AND assignment.valid_from <= now()
            AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
        ) THEN
          failure_code := 'legacy_applied_state_mismatch';
          retryable := false;
        ELSIF access_projection.requested_action = 'revoke' AND EXISTS (
          SELECT 1
          FROM public.control_user_access_assignments AS assignment
          WHERE assignment.target_profile_id = case_row.beneficiary_profile_id
            AND assignment.access_profile_id = access_projection.requested_access_profile_id
            AND assignment.source_type <> 'role_compat'
            AND assignment.active
            AND assignment.revoked_at IS NULL
        ) THEN
          failure_code := 'legacy_applied_state_mismatch';
          retryable := false;
        ELSE
          execution_status := 'applied';
        END IF;
      ELSIF legacy_request.status <> 'approved' THEN
        failure_code := 'legacy_request_state_invalid';
        retryable := false;
      ELSE
        BEGIN
          apply_result := public.apply_control_access_request(
            legacy_request.id,
            legacy_request.version,
            target_client_request_id
          );
          IF apply_result->>'status' = 'applied' THEN
            execution_status := 'applied';
            assignment_id := nullif(apply_result->>'assignment_id', '')::uuid;
          ELSE
            failure_code := 'legacy_request_expired';
            retryable := false;
          END IF;
        EXCEPTION WHEN OTHERS THEN
          GET STACKED DIAGNOSTICS caught_message = MESSAGE_TEXT;
          IF caught_message IN (
            'control_assignment_already_active',
            'control_assignment_not_active',
            'access_expiry_required',
            'access_profile_not_found',
            'access_request_not_approved',
            'approval_version_conflict'
          ) THEN
            failure_code := caught_message;
          ELSE
            RAISE;
          END IF;
        END;
      END IF;
    END IF;

    IF execution_status = 'applied' THEN
      event_type := 'corporate_case.fulfillment_applied';
    ELSE
      execution_status := 'failed';
      event_type := 'corporate_case.fulfillment_failed';
    END IF;
  END IF;

  IF execution_status = 'applied' THEN
    UPDATE public.corporate_case_tasks
    SET status = 'completed',
        completed_by = actor_id,
        completed_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE id = task_row.id
    RETURNING * INTO task_row;

    UPDATE public.corporate_case_sla_instances
    SET status = CASE WHEN status = 'breached' THEN 'breached' ELSE 'met' END,
        met_at = CASE WHEN status = 'breached' THEN met_at ELSE now() END,
        updated_at = now()
    WHERE case_id = case_row.id
      AND status IN ('pending', 'running', 'paused', 'breached');

    UPDATE public.corporate_cases
    SET status = 'resolved',
        current_group_id = NULL,
        current_assignee_profile_id = NULL,
        resolved_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE id = case_row.id
    RETURNING * INTO case_row;
  ELSE
    UPDATE public.corporate_case_tasks
    SET status = 'pending',
        assigned_profile_id = NULL,
        version = version + 1,
        updated_at = now()
    WHERE id = task_row.id
    RETURNING * INTO task_row;

    UPDATE public.corporate_cases
    SET current_assignee_profile_id = NULL,
        version = version + 1,
        updated_at = now()
    WHERE id = case_row.id
    RETURNING * INTO case_row;
  END IF;

  INSERT INTO public.corporate_case_events(
    event_key, case_id, actor_profile_id, event_type, audience, payload
  )
  VALUES (
    target_client_request_id,
    case_row.id,
    actor_id,
    event_type,
    CASE WHEN execution_status = 'applied' THEN 'participants' ELSE 'internal' END,
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', task_row.id,
      'task_version', task_row.version,
      'message_id', message_id,
      'operation', target_operation,
      'execution_status', execution_status,
      'status', case_row.status,
      'case_version', case_row.version,
      'legacy_access_request_id', access_projection.legacy_access_request_id,
      'assignment_id', assignment_id,
      'failure_code', failure_code,
      'retryable', retryable,
      'reason_provided', true,
      'request_fingerprint', request_fingerprint
    ))
  )
  RETURNING * INTO created_event;

  WITH recipient_candidates AS (
    SELECT participant.profile_id
    FROM public.corporate_case_participants AS participant
    WHERE participant.case_id = case_row.id
      AND participant.active
      AND participant.notification_level <> 'none'
    UNION
    SELECT member.profile_id
    FROM public.corporate_work_group_members AS member
    WHERE execution_status <> 'applied'
      AND member.group_id = task_row.assigned_group_id
      AND member.active
      AND member.can_receive
      AND member.valid_from <= now()
      AND (member.valid_until IS NULL OR member.valid_until > now())
  )
  INSERT INTO public.corporate_notifications(
    event_id, recipient_profile_id, event_category, importance, title, body, route_payload
  )
  SELECT
    created_event.id,
    recipient.profile_id,
    'fulfillment_updated',
    case_row.priority,
    'Execução do chamado ' || case_row.protocol || ' atualizada',
    CASE execution_status
      WHEN 'applied' THEN 'A solicitação foi executada e o chamado foi resolvido.'
      WHEN 'deferred' THEN 'A execução foi devolvida à fila para nova análise.'
      ELSE 'A execução não foi concluída e requer nova análise no CutSync Cloud.'
    END,
    jsonb_build_object('case_id', case_row.id)
  FROM recipient_candidates AS recipient
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.corporate_notification_preferences AS preference
    WHERE preference.profile_id = recipient.profile_id
      AND preference.event_category = 'fulfillment_updated'
      AND preference.channel = 'in_app'
      AND (
        NOT preference.enabled
        OR (preference.important_only AND case_row.priority NOT IN ('high', 'critical'))
      )
  )
  ON CONFLICT (event_id, recipient_profile_id) DO NOTHING;

  IF runtime_settings.email_enabled THEN
    INSERT INTO public.corporate_notification_outbox(notification_id, channel, status, payload)
    SELECT
      notification.id,
      'email',
      'pending',
      jsonb_build_object(
        'template_key', 'corporate_case.fulfillment_updated',
        'case_id', case_row.id,
        'event_id', created_event.id
      )
    FROM public.corporate_notifications AS notification
    WHERE notification.event_id = created_event.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.corporate_notification_preferences AS preference
        WHERE preference.profile_id = notification.recipient_profile_id
          AND preference.event_category = 'fulfillment_updated'
          AND preference.channel = 'email'
          AND (
            NOT preference.enabled
            OR (preference.important_only AND case_row.priority NOT IN ('high', 'critical'))
          )
      )
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END IF;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    event_type,
    case_row.id,
    'corporate_case',
    jsonb_strip_nulls(jsonb_build_object(
      'task_id', task_row.id,
      'status', case_row.status,
      'case_version', case_row.version,
      'task_version', task_row.version,
      'legacy_access_request_id', access_projection.legacy_access_request_id,
      'assignment_id', assignment_id,
      'failure_code', failure_code,
      'retryable', retryable,
      'reason_provided', true
    ))
  );

  RETURN jsonb_build_object(
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task_id', task_row.id,
    'task_version', task_row.version,
    'status', case_row.status,
    'execution_status', execution_status,
    'legacy_access_request_id', access_projection.legacy_access_request_id,
    'assignment_id', assignment_id,
    'failure_code', failure_code,
    'retryable', retryable,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_corporate_case_fulfillment_context(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_corporate_case_fulfillment(
  uuid, uuid, integer, integer, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.execute_corporate_access_fulfillment(
  uuid, uuid, integer, integer, text, text, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_corporate_case_fulfillment_context(uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_corporate_case_fulfillment(
  uuid, uuid, integer, integer, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.execute_corporate_access_fulfillment(
  uuid, uuid, integer, integer, text, text, uuid
) TO authenticated, service_role;

COMMIT;
