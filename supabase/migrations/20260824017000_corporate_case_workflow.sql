-- Protected workflow for corporate cases: claim, route and reject.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

ALTER TABLE public.corporate_case_runtime_settings
  ADD COLUMN workflow_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.corporate_case_runtime_settings
  DROP CONSTRAINT corporate_case_runtime_settings_dependency;

ALTER TABLE public.corporate_case_runtime_settings
  ADD CONSTRAINT corporate_case_runtime_settings_dependency CHECK (
    (NOT creation_enabled OR enabled)
    AND (NOT workflow_enabled OR enabled)
    AND (NOT automation_enabled OR enabled)
    AND (NOT email_enabled OR automation_enabled)
    AND (NOT legacy_redirects_enabled OR enabled)
  );

INSERT INTO public.corporate_notification_templates(
  template_key,
  channel,
  version,
  subject_template,
  body_template,
  active
)
VALUES (
  'corporate_case.rejected',
  'email',
  1,
  'Atualização de chamado no CutSync Cloud',
  'Um chamado acompanhado por você foi rejeitado. Acesse o CutSync Cloud para consultar o registro e a justificativa após autenticação.',
  true
)
ON CONFLICT (template_key, channel, version) DO UPDATE
SET subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    active = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION corporate_private.actor_can_work_case_task(
  target_task_type text,
  target_permissions text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT CASE target_task_type
    WHEN 'triage' THEN coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
      'control.cases.triage', 'control.cases.manage'
    ]::text[]
    WHEN 'review' THEN coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
      'control.cases.route', 'control.cases.manage'
    ]::text[]
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION corporate_private.actor_can_work_case_task(text, text[])
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_corporate_case_action_context(
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
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  next_stage public.corporate_case_routing_stages%ROWTYPE;
  actor_is_member boolean := false;
  actor_has_permission boolean := false;
  task_payload jsonb := NULL;
  next_stage_payload jsonb := NULL;
  eligible_approvers jsonb := '[]'::jsonb;
  requires_owner_approval boolean := false;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN
    RAISE EXCEPTION 'corporate_cases_disabled';
  END IF;

  SELECT corporate_case.*
  INTO case_row
  FROM public.corporate_cases AS corporate_case
  WHERE corporate_case.id = target_case_id;

  IF NOT FOUND OR NOT corporate_private.actor_can_view_case(
    target_case_id,
    actor_id,
    actor_permissions
  ) THEN
    RAISE EXCEPTION 'corporate_case_not_found';
  END IF;

  SELECT task.*
  INTO task_row
  FROM public.corporate_case_tasks AS task
  WHERE task.case_id = case_row.id
    AND task.stage_order = case_row.current_stage_order
    AND task.status IN ('pending', 'in_progress', 'waiting')
  ORDER BY task.created_at DESC, task.id DESC
  LIMIT 1;

  IF FOUND THEN
    actor_is_member := corporate_private.actor_is_active_group_member(
      task_row.assigned_group_id,
      actor_id
    );
    actor_has_permission := corporate_private.actor_can_work_case_task(
      task_row.task_type,
      actor_permissions
    );

    task_payload := jsonb_build_object(
      'task_id', task_row.id,
      'stage_order', task_row.stage_order,
      'task_type', task_row.task_type,
      'assigned_group_id', task_row.assigned_group_id,
      'assigned_profile_id', task_row.assigned_profile_id,
      'status', task_row.status,
      'due_at', task_row.due_at,
      'version', task_row.version
    );

    IF task_row.task_type IN ('triage', 'review') THEN
      SELECT stage.*
      INTO next_stage
      FROM public.corporate_case_routing_stages AS stage
      WHERE stage.routing_policy_id = case_row.routing_policy_id
        AND stage.stage_order = task_row.stage_order + 1;

      IF FOUND THEN
        SELECT coalesce(access_profile.requires_owner_approval, false)
        INTO requires_owner_approval
        FROM public.corporate_case_access_requests AS access_request
        JOIN public.control_access_profiles AS access_profile
          ON access_profile.id = access_request.requested_access_profile_id
        WHERE access_request.case_id = case_row.id;

        next_stage_payload := jsonb_build_object(
          'stage_order', next_stage.stage_order,
          'stage_key', next_stage.stage_key,
          'label', next_stage.label,
          'task_type', next_stage.task_type,
          'target_group_id', next_stage.target_group_id,
          'required_approvals', next_stage.required_approvals,
          'requires_owner_approval', requires_owner_approval,
          'requires_distinct_actor', next_stage.requires_distinct_actor
        );

        IF next_stage.task_type = 'approval'
           AND runtime_settings.workflow_enabled
           AND actor_is_member
           AND actor_has_permission
        THEN
          SELECT coalesce(jsonb_agg(jsonb_build_object(
            'profile_id', profile.id,
            'name', coalesce(profile.name, 'Usuário'),
            'email', profile.email,
            'is_owner', governance.role = 'SaaS_Owner'
          ) ORDER BY profile.name, profile.id), '[]'::jsonb)
          INTO eligible_approvers
          FROM public.corporate_work_group_members AS member
          JOIN public.profiles AS profile ON profile.id = member.profile_id
          JOIN public.governance_users AS governance
            ON governance.profile_id = member.profile_id
           AND governance.is_active
           AND governance.revoked_at IS NULL
           AND (governance.expires_at IS NULL OR governance.expires_at > now())
          WHERE member.group_id = next_stage.target_group_id
            AND member.active
            AND member.can_receive
            AND member.valid_from <= now()
            AND (member.valid_until IS NULL OR member.valid_until > now())
            AND profile.deleted_at IS NULL
            AND profile.id <> actor_id
            AND profile.id <> case_row.requester_profile_id
            AND profile.id IS DISTINCT FROM case_row.beneficiary_profile_id;
        END IF;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'workflow_enabled', runtime_settings.workflow_enabled,
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task', task_payload,
    'can_claim', runtime_settings.workflow_enabled
      AND actor_is_member
      AND actor_has_permission
      AND task_row.status = 'pending'
      AND task_row.assigned_profile_id IS NULL,
    'can_advance', runtime_settings.workflow_enabled
      AND actor_is_member
      AND actor_has_permission
      AND task_row.status = 'in_progress'
      AND task_row.assigned_profile_id = actor_id,
    'next_stage', next_stage_payload,
    'eligible_approvers', eligible_approvers
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_corporate_case_task(
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
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  existing_event public.corporate_case_events%ROWTYPE;
  created_event public.corporate_case_events%ROWTYPE;
  actor_participant_role text;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  IF target_case_id IS NULL
     OR target_task_id IS NULL
     OR target_client_request_id IS NULL
     OR target_expected_case_version < 1
     OR target_expected_task_version < 1
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_workflow_request';
  END IF;

  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type <> 'corporate_case.task_claimed'
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
      'next_task_id', NULL,
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

  -- Recheck after the deterministic case -> task locks so concurrent retries
  -- observe the event committed by the first transaction.
  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type <> 'corporate_case.task_claimed'
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
      'next_task_id', NULL,
      'idempotent', true
    );
  END IF;

  IF case_row.version <> target_expected_case_version
     OR task_row.version <> target_expected_task_version
  THEN
    RAISE EXCEPTION 'corporate_case_version_conflict';
  END IF;
  IF case_row.current_stage_order IS DISTINCT FROM task_row.stage_order
     OR case_row.current_group_id IS DISTINCT FROM task_row.assigned_group_id
  THEN
    RAISE EXCEPTION 'corporate_case_task_not_current';
  END IF;
  IF task_row.task_type NOT IN ('triage', 'review')
     OR NOT corporate_private.actor_can_work_case_task(task_row.task_type, actor_permissions)
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT corporate_private.actor_is_active_group_member(task_row.assigned_group_id, actor_id) THEN
    RAISE EXCEPTION 'corporate_case_group_membership_required';
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
  SET status = CASE task_row.task_type WHEN 'triage' THEN 'triage' ELSE 'review' END,
      current_assignee_profile_id = actor_id,
      version = version + 1,
      updated_at = now()
  WHERE id = case_row.id
  RETURNING * INTO case_row;

  actor_participant_role := CASE task_row.task_type WHEN 'triage' THEN 'triager' ELSE 'assignee' END;
  INSERT INTO public.corporate_case_participants(
    case_id, profile_id, participant_role, notification_level, active, added_by
  )
  VALUES (case_row.id, actor_id, actor_participant_role, 'all', true, actor_id)
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
    'corporate_case.task_claimed',
    'internal',
    jsonb_build_object(
      'task_id', task_row.id,
      'stage_order', task_row.stage_order,
      'task_type', task_row.task_type,
      'case_version', case_row.version,
      'task_version', task_row.version,
      'status', case_row.status
    )
  )
  RETURNING * INTO created_event;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'corporate_case.task_claimed',
    case_row.id,
    'corporate_case',
    jsonb_build_object(
      'task_id', task_row.id,
      'stage_order', task_row.stage_order,
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
    'next_task_id', NULL,
    'idempotent', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.advance_corporate_case_task(
  target_case_id uuid,
  target_task_id uuid,
  target_expected_case_version integer,
  target_expected_task_version integer,
  target_decision text,
  target_reason text,
  target_approver_profile_ids uuid[],
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
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  next_task public.corporate_case_tasks%ROWTYPE;
  next_stage public.corporate_case_routing_stages%ROWTYPE;
  existing_event public.corporate_case_events%ROWTYPE;
  created_event public.corporate_case_events%ROWTYPE;
  normalized_approver_ids uuid[];
  operation_event_type text;
  next_status text;
  eligible_count integer;
  eligible_owner_count integer;
  requires_owner_approval boolean := false;
  request_fingerprint text;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  SELECT coalesce(array_agg(candidate.profile_id ORDER BY candidate.first_position), ARRAY[]::uuid[])
  INTO normalized_approver_ids
  FROM (
    SELECT approver.profile_id, min(approver.position) AS first_position
    FROM unnest(coalesce(target_approver_profile_ids, ARRAY[]::uuid[]))
      WITH ORDINALITY AS approver(profile_id, position)
    WHERE approver.profile_id IS NOT NULL
    GROUP BY approver.profile_id
  ) AS candidate;

  IF target_case_id IS NULL
     OR target_task_id IS NULL
     OR target_client_request_id IS NULL
     OR target_expected_case_version < 1
     OR target_expected_task_version < 1
     OR target_decision NOT IN ('advance', 'reject')
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_workflow_request';
  END IF;
  IF char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'corporate_case_reason_invalid';
  END IF;

  operation_event_type := CASE target_decision
    WHEN 'advance' THEN 'corporate_case.stage_advanced'
    ELSE 'corporate_case.rejected'
  END;
  request_fingerprint := encode(
    extensions.digest(
      convert_to(
        target_decision || '|' || btrim(target_reason) || '|' || array_to_string(normalized_approver_ids, ','),
        'UTF8'
      ),
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
       OR existing_event.event_type <> operation_event_type
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
      'next_task_id', nullif(existing_event.payload->>'next_task_id', '')::uuid,
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

  -- Recheck after the deterministic case -> task locks so concurrent retries
  -- observe the event committed by the first transaction.
  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type <> operation_event_type
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
      'next_task_id', nullif(existing_event.payload->>'next_task_id', '')::uuid,
      'idempotent', true
    );
  END IF;

  IF case_row.version <> target_expected_case_version
     OR task_row.version <> target_expected_task_version
  THEN
    RAISE EXCEPTION 'corporate_case_version_conflict';
  END IF;
  IF case_row.current_stage_order IS DISTINCT FROM task_row.stage_order
     OR case_row.current_group_id IS DISTINCT FROM task_row.assigned_group_id
  THEN
    RAISE EXCEPTION 'corporate_case_task_not_current';
  END IF;
  IF task_row.task_type NOT IN ('triage', 'review')
     OR NOT corporate_private.actor_can_work_case_task(task_row.task_type, actor_permissions)
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF NOT corporate_private.actor_is_active_group_member(task_row.assigned_group_id, actor_id) THEN
    RAISE EXCEPTION 'corporate_case_group_membership_required';
  END IF;
  IF task_row.status <> 'in_progress' OR task_row.assigned_profile_id <> actor_id THEN
    RAISE EXCEPTION 'corporate_case_task_assignment_required';
  END IF;

  IF target_decision = 'reject' AND cardinality(normalized_approver_ids) <> 0 THEN
    RAISE EXCEPTION 'corporate_case_approvers_not_allowed';
  END IF;

  IF target_decision = 'advance' THEN
    SELECT stage.*
    INTO next_stage
    FROM public.corporate_case_routing_stages AS stage
    WHERE stage.routing_policy_id = case_row.routing_policy_id
      AND stage.stage_order = task_row.stage_order + 1;

    IF NOT FOUND OR next_stage.task_type NOT IN ('review', 'approval') THEN
      RAISE EXCEPTION 'corporate_case_next_stage_unavailable';
    END IF;

    IF next_stage.task_type = 'approval' THEN
      SELECT coalesce(access_profile.requires_owner_approval, false)
      INTO requires_owner_approval
      FROM public.corporate_case_access_requests AS access_request
      JOIN public.control_access_profiles AS access_profile
        ON access_profile.id = access_request.requested_access_profile_id
      WHERE access_request.case_id = case_row.id;

      IF cardinality(normalized_approver_ids) <> next_stage.required_approvals THEN
        RAISE EXCEPTION 'corporate_case_approver_count_invalid';
      END IF;

      SELECT
        count(*),
        count(*) FILTER (WHERE governance.role = 'SaaS_Owner')
      INTO eligible_count, eligible_owner_count
      FROM unnest(normalized_approver_ids) AS selected(profile_id)
      JOIN public.corporate_work_group_members AS member
        ON member.profile_id = selected.profile_id
       AND member.group_id = next_stage.target_group_id
       AND member.active
       AND member.can_receive
       AND member.valid_from <= now()
       AND (member.valid_until IS NULL OR member.valid_until > now())
      JOIN public.profiles AS profile
        ON profile.id = selected.profile_id
       AND profile.deleted_at IS NULL
      JOIN public.governance_users AS governance
        ON governance.profile_id = selected.profile_id
       AND governance.is_active
       AND governance.revoked_at IS NULL
       AND (governance.expires_at IS NULL OR governance.expires_at > now())
      WHERE selected.profile_id <> actor_id
        AND selected.profile_id <> case_row.requester_profile_id
        AND selected.profile_id IS DISTINCT FROM case_row.beneficiary_profile_id;

      IF eligible_count <> cardinality(normalized_approver_ids) THEN
        RAISE EXCEPTION 'corporate_case_approver_ineligible';
      END IF;
      IF requires_owner_approval AND eligible_owner_count < 1 THEN
        RAISE EXCEPTION 'corporate_case_owner_approver_required';
      END IF;
    ELSIF cardinality(normalized_approver_ids) <> 0 THEN
      RAISE EXCEPTION 'corporate_case_approvers_not_allowed';
    END IF;
  END IF;

  INSERT INTO public.corporate_case_messages(
    case_id, author_profile_id, client_message_id, visibility, body
  )
  VALUES (
    case_row.id, actor_id, target_client_request_id, 'internal', btrim(target_reason)
  );

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
  WHERE task_id = task_row.id
    AND metric_key = 'stage_response'
    AND status IN ('pending', 'running', 'paused', 'breached');

  IF target_decision = 'reject' THEN
    next_status := 'rejected';
    UPDATE public.corporate_cases
    SET status = next_status,
        current_group_id = NULL,
        current_assignee_profile_id = NULL,
        version = version + 1,
        updated_at = now()
    WHERE id = case_row.id
    RETURNING * INTO case_row;

    UPDATE public.corporate_case_sla_instances
    SET status = 'stopped', updated_at = now()
    WHERE case_id = case_row.id
      AND status IN ('pending', 'running', 'paused');
  ELSE
    next_status := CASE next_stage.task_type
      WHEN 'review' THEN 'review'
      ELSE 'awaiting_approval'
    END;

    INSERT INTO public.corporate_case_tasks(
      case_id, stage_order, task_type, assigned_group_id, status, due_at
    )
    VALUES (
      case_row.id,
      next_stage.stage_order,
      next_stage.task_type,
      next_stage.target_group_id,
      'pending',
      now() + make_interval(mins => next_stage.sla_minutes)
    )
    RETURNING * INTO next_task;

    UPDATE public.corporate_cases
    SET status = next_status,
        current_stage_order = next_stage.stage_order,
        current_group_id = next_stage.target_group_id,
        current_assignee_profile_id = NULL,
        version = version + 1,
        updated_at = now()
    WHERE id = case_row.id
    RETURNING * INTO case_row;

    INSERT INTO public.corporate_case_sla_instances(
      case_id, task_id, metric_key, status, target_at
    )
    VALUES (case_row.id, next_task.id, 'stage_response', 'running', next_task.due_at);

    IF next_stage.task_type = 'approval' THEN
      INSERT INTO public.corporate_case_approval_slots(
        task_id, slot_order, requested_approver_profile_id, decision, due_at
      )
      SELECT next_task.id, approver.position::smallint, approver.profile_id, 'pending', next_task.due_at
      FROM unnest(normalized_approver_ids) WITH ORDINALITY AS approver(profile_id, position);

      INSERT INTO public.corporate_case_participants(
        case_id, profile_id, participant_role, notification_level, active, added_by
      )
      SELECT case_row.id, approver.profile_id, 'approver', 'all', true, actor_id
      FROM unnest(normalized_approver_ids) AS approver(profile_id)
      ON CONFLICT (case_id, profile_id, participant_role) DO UPDATE
      SET active = true,
          notification_level = 'all',
          removed_by = NULL,
          removed_at = NULL,
          updated_at = now();
    END IF;
  END IF;

  INSERT INTO public.corporate_case_events(
    event_key, case_id, actor_profile_id, event_type, audience, payload
  )
  VALUES (
    target_client_request_id,
    case_row.id,
    actor_id,
    operation_event_type,
    CASE target_decision WHEN 'reject' THEN 'participants' ELSE 'internal' END,
    jsonb_build_object(
      'task_id', task_row.id,
      'task_version', task_row.version,
      'from_stage_order', task_row.stage_order,
      'to_stage_order', CASE WHEN target_decision = 'advance' THEN next_stage.stage_order ELSE NULL END,
      'status', case_row.status,
      'case_version', case_row.version,
      'next_task_id', CASE WHEN target_decision = 'advance' THEN next_task.id ELSE NULL END,
      'reason_provided', true,
      'request_fingerprint', request_fingerprint,
      'approver_count', cardinality(normalized_approver_ids)
    )
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
    WHERE target_decision = 'advance'
      AND member.group_id = next_stage.target_group_id
      AND member.active
      AND member.can_receive
      AND member.valid_from <= now()
      AND (member.valid_until IS NULL OR member.valid_until > now())
    UNION
    SELECT approver.profile_id
    FROM unnest(normalized_approver_ids) AS approver(profile_id)
  )
  INSERT INTO public.corporate_notifications(
    event_id, recipient_profile_id, event_category, importance, title, body, route_payload
  )
  SELECT
    created_event.id,
    recipient.profile_id,
    CASE target_decision WHEN 'reject' THEN 'case_rejected' ELSE 'stage_changed' END,
    case_row.priority,
    'Chamado ' || case_row.protocol || ' atualizado',
    CASE target_decision
      WHEN 'reject' THEN 'O chamado foi rejeitado. Acesse o CutSync Cloud para consultar o registro.'
      ELSE 'O chamado avançou para uma nova etapa. Acesse o CutSync Cloud para consultar.'
    END,
    jsonb_build_object('case_id', case_row.id)
  FROM recipient_candidates AS recipient
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.corporate_notification_preferences AS preference
    WHERE preference.profile_id = recipient.profile_id
      AND preference.event_category = CASE target_decision WHEN 'reject' THEN 'case_rejected' ELSE 'stage_changed' END
      AND preference.channel = 'in_app'
      AND NOT preference.enabled
  )
  ON CONFLICT (event_id, recipient_profile_id) DO NOTHING;

  IF runtime_settings.email_enabled THEN
    INSERT INTO public.corporate_notification_outbox(notification_id, channel, status, payload)
    SELECT
      notification.id,
      'email',
      'pending',
      jsonb_build_object(
        'template_key', CASE target_decision
          WHEN 'reject' THEN 'corporate_case.rejected'
          ELSE 'corporate_case.assigned'
        END,
        'case_id', case_row.id,
        'event_id', created_event.id
      )
    FROM public.corporate_notifications AS notification
    WHERE notification.event_id = created_event.id
      AND (
        (target_decision = 'reject' AND EXISTS (
          SELECT 1
          FROM public.corporate_case_participants AS participant
          WHERE participant.case_id = case_row.id
            AND participant.profile_id = notification.recipient_profile_id
            AND participant.participant_role IN ('requester', 'beneficiary')
            AND participant.active
        ))
        OR (target_decision = 'advance' AND (
          corporate_private.actor_is_active_group_member(
            next_stage.target_group_id,
            notification.recipient_profile_id
          )
          OR notification.recipient_profile_id = ANY(normalized_approver_ids)
        ))
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.corporate_notification_preferences AS preference
        WHERE preference.profile_id = notification.recipient_profile_id
          AND preference.event_category = CASE target_decision WHEN 'reject' THEN 'case_rejected' ELSE 'stage_changed' END
          AND preference.channel = 'email'
          AND NOT preference.enabled
      )
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END IF;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    operation_event_type,
    case_row.id,
    'corporate_case',
    jsonb_build_object(
      'task_id', task_row.id,
      'from_stage_order', task_row.stage_order,
      'to_stage_order', CASE WHEN target_decision = 'advance' THEN next_stage.stage_order ELSE NULL END,
      'status', case_row.status,
      'case_version', case_row.version,
      'reason_provided', true,
      'approver_count', cardinality(normalized_approver_ids)
    )
  );

  RETURN jsonb_build_object(
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task_id', task_row.id,
    'task_version', task_row.version,
    'status', case_row.status,
    'next_task_id', CASE WHEN target_decision = 'advance' THEN next_task.id ELSE NULL END,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_corporate_case_action_context(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_corporate_case_task(uuid, uuid, integer, integer, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.advance_corporate_case_task(uuid, uuid, integer, integer, text, text, uuid[], uuid)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_corporate_case_action_context(uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.claim_corporate_case_task(uuid, uuid, integer, integer, uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.advance_corporate_case_task(uuid, uuid, integer, integer, text, text, uuid[], uuid)
TO authenticated, service_role;

COMMIT;
