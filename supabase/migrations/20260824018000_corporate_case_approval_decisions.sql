-- Nominal approval decisions and consolidation into fulfillment.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

INSERT INTO public.control_permission_catalog(permission, label, area, risk_level)
VALUES (
  'control.cases.approve',
  'Decidir aprovações de chamados corporativos',
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
SELECT access_profile.id, 'control.cases.approve'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key IN (
  'saas_owner',
  'governance_manager',
  'security_reviewer',
  'access_administrator'
)
ON CONFLICT (access_profile_id, permission) DO NOTHING;

ALTER TABLE public.corporate_case_approval_slots
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  ADD COLUMN approver_was_owner boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX corporate_case_approval_slots_profile_unique
  ON public.corporate_case_approval_slots(task_id, requested_approver_profile_id)
  WHERE requested_approver_profile_id IS NOT NULL;

INSERT INTO public.corporate_notification_templates(
  template_key,
  channel,
  version,
  subject_template,
  body_template,
  active
)
VALUES (
  'corporate_case.approval_updated',
  'email',
  1,
  'Aprovação atualizada no CutSync Cloud',
  'Uma aprovação de chamado foi atualizada. Acesse o CutSync Cloud para consultar o estado após autenticação. Nenhuma decisão pode ser concluída por e-mail.',
  true
)
ON CONFLICT (template_key, channel, version) DO UPDATE
SET subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    active = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION corporate_private.actor_has_active_control_permission(
  target_actor_id uuid,
  target_permission text
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT target_actor_id IS NOT NULL
    AND target_permission IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.control_user_access_assignments AS assignment
      JOIN public.control_access_profiles AS access_profile
        ON access_profile.id = assignment.access_profile_id
       AND access_profile.active
      JOIN public.control_access_profile_permissions AS profile_permission
        ON profile_permission.access_profile_id = access_profile.id
       AND profile_permission.permission = target_permission
      JOIN public.control_permission_catalog AS permission_catalog
        ON permission_catalog.permission = profile_permission.permission
       AND permission_catalog.active
      WHERE assignment.target_profile_id = target_actor_id
        AND assignment.active
        AND assignment.revoked_at IS NULL
        AND assignment.valid_from <= now()
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
    );
$$;

CREATE OR REPLACE FUNCTION corporate_private.validate_corporate_case_approval_slot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  task_row public.corporate_case_tasks%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  previous_actor_id uuid;
BEGIN
  SELECT task.*
  INTO STRICT task_row
  FROM public.corporate_case_tasks AS task
  WHERE task.id = NEW.task_id;

  SELECT corporate_case.*
  INTO STRICT case_row
  FROM public.corporate_cases AS corporate_case
  WHERE corporate_case.id = task_row.case_id;

  IF task_row.task_type <> 'approval' THEN
    RAISE EXCEPTION 'corporate_case_approval_task_required';
  END IF;

  IF NEW.requested_approver_profile_id IS NOT NULL THEN
    SELECT previous_task.completed_by
    INTO previous_actor_id
    FROM public.corporate_case_tasks AS previous_task
    WHERE previous_task.case_id = task_row.case_id
      AND previous_task.stage_order = task_row.stage_order - 1
      AND previous_task.status = 'completed'
    ORDER BY previous_task.completed_at DESC, previous_task.id DESC
    LIMIT 1;

    IF NEW.requested_approver_profile_id = case_row.requester_profile_id
       OR NEW.requested_approver_profile_id IS NOT DISTINCT FROM case_row.beneficiary_profile_id
       OR NEW.requested_approver_profile_id IS NOT DISTINCT FROM previous_actor_id
    THEN
      RAISE EXCEPTION 'corporate_case_approval_separation_required';
    END IF;

    IF NOT corporate_private.actor_is_active_group_member(
      task_row.assigned_group_id,
      NEW.requested_approver_profile_id
    ) OR NOT corporate_private.actor_has_active_control_permission(
      NEW.requested_approver_profile_id,
      'control.cases.approve'
    ) OR NOT EXISTS (
      SELECT 1
      FROM public.governance_users AS governance
      JOIN public.profiles AS profile ON profile.id = governance.profile_id
      WHERE governance.profile_id = NEW.requested_approver_profile_id
        AND governance.is_active
        AND governance.revoked_at IS NULL
        AND (governance.expires_at IS NULL OR governance.expires_at > now())
        AND profile.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'corporate_case_approver_ineligible';
    END IF;
  ELSIF NEW.requested_approver_group_id IS DISTINCT FROM task_row.assigned_group_id THEN
    RAISE EXCEPTION 'corporate_case_approver_group_invalid';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER corporate_case_approval_slots_validate
BEFORE INSERT OR UPDATE OF requested_approver_profile_id, requested_approver_group_id, task_id
ON public.corporate_case_approval_slots
FOR EACH ROW EXECUTE FUNCTION corporate_private.validate_corporate_case_approval_slot();

REVOKE ALL ON FUNCTION corporate_private.actor_has_active_control_permission(uuid, text)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION corporate_private.validate_corporate_case_approval_slot()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_corporate_case_approval_candidates(
  target_case_id uuid,
  target_task_id uuid
)
RETURNS TABLE (
  profile_id uuid,
  name text,
  email text,
  is_owner boolean
)
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

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;
  IF NOT runtime_settings.workflow_enabled THEN RAISE EXCEPTION 'corporate_case_workflow_disabled'; END IF;

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
  WHERE task.id = target_task_id
    AND task.case_id = case_row.id;

  IF NOT FOUND
     OR task_row.task_type <> 'review'
     OR task_row.status <> 'in_progress'
     OR task_row.assigned_profile_id <> actor_id
     OR case_row.current_stage_order IS DISTINCT FROM task_row.stage_order
  THEN
    RAISE EXCEPTION 'corporate_case_task_assignment_required';
  END IF;
  IF NOT corporate_private.actor_is_active_group_member(task_row.assigned_group_id, actor_id)
     OR NOT corporate_private.actor_can_work_case_task(task_row.task_type, actor_permissions)
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT stage.*
  INTO next_stage
  FROM public.corporate_case_routing_stages AS stage
  WHERE stage.routing_policy_id = case_row.routing_policy_id
    AND stage.stage_order = task_row.stage_order + 1
    AND stage.task_type = 'approval';

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_next_stage_unavailable'; END IF;

  RETURN QUERY
  SELECT
    profile.id,
    coalesce(profile.name, 'Usuário'),
    profile.email,
    governance.role = 'SaaS_Owner'
  FROM public.corporate_work_group_members AS member
  JOIN public.profiles AS profile
    ON profile.id = member.profile_id
   AND profile.deleted_at IS NULL
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
    AND corporate_private.actor_has_active_control_permission(
      member.profile_id,
      'control.cases.approve'
    )
    AND profile.id <> actor_id
    AND profile.id <> case_row.requester_profile_id
    AND profile.id IS DISTINCT FROM case_row.beneficiary_profile_id
  ORDER BY profile.name, profile.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_corporate_case_approval_context(
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
  slot_row public.corporate_case_approval_slots%ROWTYPE;
  routing_stage public.corporate_case_routing_stages%ROWTYPE;
  approved_count integer := 0;
  pending_count integer := 0;
  requires_owner_approval boolean := false;
  can_decide boolean := false;
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

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;

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
    AND task.task_type = 'approval'
    AND task.status IN ('pending', 'in_progress')
  ORDER BY task.created_at DESC, task.id DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'workflow_enabled', runtime_settings.workflow_enabled,
      'case_id', case_row.id,
      'case_version', case_row.version,
      'task', NULL,
      'approval', NULL,
      'can_decide', false,
      'approved_count', 0,
      'pending_count', 0,
      'required_approvals', 0,
      'requires_owner_approval', false
    );
  END IF;

  SELECT stage.*
  INTO STRICT routing_stage
  FROM public.corporate_case_routing_stages AS stage
  WHERE stage.routing_policy_id = case_row.routing_policy_id
    AND stage.stage_order = task_row.stage_order;

  SELECT approval_slot.*
  INTO slot_row
  FROM public.corporate_case_approval_slots AS approval_slot
  WHERE approval_slot.task_id = task_row.id
    AND approval_slot.requested_approver_profile_id = actor_id
  ORDER BY approval_slot.slot_order, approval_slot.id
  LIMIT 1;

  SELECT
    count(*) FILTER (WHERE approval_slot.decision = 'approved'),
    count(*) FILTER (WHERE approval_slot.decision = 'pending')
  INTO approved_count, pending_count
  FROM public.corporate_case_approval_slots AS approval_slot
  WHERE approval_slot.task_id = task_row.id;

  SELECT coalesce(access_profile.requires_owner_approval, false)
  INTO requires_owner_approval
  FROM public.corporate_case_access_requests AS access_request
  JOIN public.control_access_profiles AS access_profile
    ON access_profile.id = access_request.requested_access_profile_id
  WHERE access_request.case_id = case_row.id;

  can_decide := runtime_settings.workflow_enabled
    AND slot_row.id IS NOT NULL
    AND slot_row.decision = 'pending'
    AND case_row.status = 'awaiting_approval'
    AND corporate_private.actor_is_active_group_member(task_row.assigned_group_id, actor_id)
    AND 'control.cases.approve' = ANY(actor_permissions)
    AND actor_id <> case_row.requester_profile_id
    AND actor_id IS DISTINCT FROM case_row.beneficiary_profile_id;

  RETURN jsonb_build_object(
    'workflow_enabled', runtime_settings.workflow_enabled,
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task', jsonb_build_object(
      'task_id', task_row.id,
      'task_version', task_row.version,
      'status', task_row.status,
      'due_at', task_row.due_at
    ),
    'approval', CASE WHEN slot_row.id IS NULL THEN NULL ELSE jsonb_build_object(
      'approval_id', slot_row.id,
      'approval_version', slot_row.version,
      'slot_order', slot_row.slot_order,
      'decision', slot_row.decision,
      'due_at', slot_row.due_at
    ) END,
    'can_decide', can_decide,
    'approved_count', approved_count,
    'pending_count', pending_count,
    'required_approvals', routing_stage.required_approvals,
    'requires_owner_approval', requires_owner_approval
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_corporate_case_approval(
  target_case_id uuid,
  target_task_id uuid,
  target_approval_id uuid,
  target_expected_case_version integer,
  target_expected_task_version integer,
  target_expected_approval_version integer,
  target_decision text,
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
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  case_row public.corporate_cases%ROWTYPE;
  task_row public.corporate_case_tasks%ROWTYPE;
  slot_row public.corporate_case_approval_slots%ROWTYPE;
  routing_stage public.corporate_case_routing_stages%ROWTYPE;
  next_stage public.corporate_case_routing_stages%ROWTYPE;
  next_task public.corporate_case_tasks%ROWTYPE;
  existing_event public.corporate_case_events%ROWTYPE;
  created_event public.corporate_case_events%ROWTYPE;
  previous_actor_id uuid;
  actor_is_owner boolean := false;
  requires_owner_approval boolean := false;
  approved_count integer := 0;
  pending_count integer := 0;
  owner_approval_count integer := 0;
  request_fingerprint text;
  result_status text;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  IF target_case_id IS NULL
     OR target_task_id IS NULL
     OR target_approval_id IS NULL
     OR target_client_request_id IS NULL
     OR target_expected_case_version < 1
     OR target_expected_task_version < 1
     OR target_expected_approval_version < 1
     OR target_decision NOT IN ('approve', 'reject')
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_approval_request';
  END IF;
  IF char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'corporate_case_reason_invalid';
  END IF;

  request_fingerprint := encode(
    extensions.digest(
      convert_to(target_decision || '|' || btrim(target_reason), 'UTF8'),
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
       OR existing_event.event_type <> 'corporate_case.approval_decided'
       OR existing_event.payload->>'task_id' <> target_task_id::text
       OR existing_event.payload->>'approval_id' <> target_approval_id::text
       OR existing_event.payload->>'request_fingerprint' <> request_fingerprint
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'case_id', existing_event.case_id,
      'case_version', (existing_event.payload->>'case_version')::integer,
      'task_id', target_task_id,
      'task_version', (existing_event.payload->>'task_version')::integer,
      'approval_id', target_approval_id,
      'approval_version', (existing_event.payload->>'approval_version')::integer,
      'status', existing_event.payload->>'status',
      'next_task_id', nullif(existing_event.payload->>'next_task_id', '')::uuid,
      'approved_count', (existing_event.payload->>'approved_count')::integer,
      'required_approvals', (existing_event.payload->>'required_approvals')::integer,
      'idempotent', true
    );
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;
  IF NOT runtime_settings.workflow_enabled THEN RAISE EXCEPTION 'corporate_case_workflow_disabled'; END IF;
  IF NOT ('control.cases.approve' = ANY(actor_permissions)) THEN RAISE EXCEPTION 'forbidden'; END IF;

  -- All workflow mutations lock in the same deterministic order.
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

  SELECT approval_slot.*
  INTO slot_row
  FROM public.corporate_case_approval_slots AS approval_slot
  WHERE approval_slot.id = target_approval_id
    AND approval_slot.task_id = target_task_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_approval_not_found'; END IF;

  -- Recheck after case -> task -> approval locks for concurrent retries.
  SELECT event.*
  INTO existing_event
  FROM public.corporate_case_events AS event
  WHERE event.event_key = target_client_request_id;

  IF FOUND THEN
    IF existing_event.case_id <> target_case_id
       OR existing_event.actor_profile_id <> actor_id
       OR existing_event.event_type <> 'corporate_case.approval_decided'
       OR existing_event.payload->>'task_id' <> target_task_id::text
       OR existing_event.payload->>'approval_id' <> target_approval_id::text
       OR existing_event.payload->>'request_fingerprint' <> request_fingerprint
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'case_id', existing_event.case_id,
      'case_version', (existing_event.payload->>'case_version')::integer,
      'task_id', target_task_id,
      'task_version', (existing_event.payload->>'task_version')::integer,
      'approval_id', target_approval_id,
      'approval_version', (existing_event.payload->>'approval_version')::integer,
      'status', existing_event.payload->>'status',
      'next_task_id', nullif(existing_event.payload->>'next_task_id', '')::uuid,
      'approved_count', (existing_event.payload->>'approved_count')::integer,
      'required_approvals', (existing_event.payload->>'required_approvals')::integer,
      'idempotent', true
    );
  END IF;

  IF case_row.version <> target_expected_case_version
     OR task_row.version <> target_expected_task_version
     OR slot_row.version <> target_expected_approval_version
  THEN
    RAISE EXCEPTION 'corporate_case_version_conflict';
  END IF;
  IF case_row.status <> 'awaiting_approval'
     OR case_row.current_stage_order IS DISTINCT FROM task_row.stage_order
     OR case_row.current_group_id IS DISTINCT FROM task_row.assigned_group_id
     OR task_row.task_type <> 'approval'
     OR task_row.status NOT IN ('pending', 'in_progress')
  THEN
    RAISE EXCEPTION 'corporate_case_approval_not_current';
  END IF;
  IF slot_row.decision <> 'pending'
     OR slot_row.requested_approver_profile_id IS DISTINCT FROM actor_id
  THEN
    RAISE EXCEPTION 'corporate_case_approval_not_pending';
  END IF;
  IF NOT corporate_private.actor_is_active_group_member(task_row.assigned_group_id, actor_id)
     OR NOT corporate_private.actor_has_active_control_permission(actor_id, 'control.cases.approve')
  THEN
    RAISE EXCEPTION 'corporate_case_group_membership_required';
  END IF;

  SELECT previous_task.completed_by
  INTO previous_actor_id
  FROM public.corporate_case_tasks AS previous_task
  WHERE previous_task.case_id = case_row.id
    AND previous_task.stage_order = task_row.stage_order - 1
    AND previous_task.status = 'completed'
  ORDER BY previous_task.completed_at DESC, previous_task.id DESC
  LIMIT 1;

  IF actor_id = case_row.requester_profile_id
     OR actor_id IS NOT DISTINCT FROM case_row.beneficiary_profile_id
     OR actor_id IS NOT DISTINCT FROM previous_actor_id
  THEN
    RAISE EXCEPTION 'corporate_case_approval_separation_required';
  END IF;

  SELECT stage.*
  INTO STRICT routing_stage
  FROM public.corporate_case_routing_stages AS stage
  WHERE stage.routing_policy_id = case_row.routing_policy_id
    AND stage.stage_order = task_row.stage_order;

  SELECT
    coalesce(access_profile.requires_owner_approval, false),
    governance.role = 'SaaS_Owner'
  INTO requires_owner_approval, actor_is_owner
  FROM public.corporate_case_access_requests AS access_request
  JOIN public.control_access_profiles AS access_profile
    ON access_profile.id = access_request.requested_access_profile_id
  JOIN public.governance_users AS governance
    ON governance.profile_id = actor_id
   AND governance.is_active
   AND governance.revoked_at IS NULL
   AND (governance.expires_at IS NULL OR governance.expires_at > now())
  WHERE access_request.case_id = case_row.id;

  IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_approver_ineligible'; END IF;

  INSERT INTO public.corporate_case_messages(
    case_id, author_profile_id, client_message_id, visibility, body
  )
  VALUES (case_row.id, actor_id, target_client_request_id, 'internal', btrim(target_reason));

  UPDATE public.corporate_case_approval_slots
  SET decision = CASE target_decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      decided_by = actor_id,
      decision_reason = btrim(target_reason),
      decided_at = now(),
      approver_was_owner = actor_is_owner,
      version = version + 1,
      updated_at = now()
  WHERE id = slot_row.id
  RETURNING * INTO slot_row;

  SELECT
    count(*) FILTER (WHERE approval_slot.decision = 'approved'),
    count(*) FILTER (WHERE approval_slot.decision = 'pending'),
    count(*) FILTER (
      WHERE approval_slot.decision = 'approved' AND approval_slot.approver_was_owner
    )
  INTO approved_count, pending_count, owner_approval_count
  FROM public.corporate_case_approval_slots AS approval_slot
  WHERE approval_slot.task_id = task_row.id;

  IF target_decision = 'reject' THEN
    result_status := 'rejected';

    UPDATE public.corporate_case_approval_slots
    SET decision = 'cancelled',
        decided_by = NULL,
        decision_reason = NULL,
        decided_at = NULL,
        approver_was_owner = false,
        version = version + 1,
        updated_at = now()
    WHERE task_id = task_row.id
      AND decision = 'pending';

    pending_count := 0;

    UPDATE public.corporate_case_tasks
    SET status = 'completed',
        completed_by = actor_id,
        completed_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE id = task_row.id
    RETURNING * INTO task_row;

    UPDATE public.corporate_cases
    SET status = result_status,
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
  ELSIF approved_count >= routing_stage.required_approvals THEN
    IF requires_owner_approval AND owner_approval_count < 1 THEN
      RAISE EXCEPTION 'corporate_case_owner_approval_required';
    END IF;

    SELECT stage.*
    INTO next_stage
    FROM public.corporate_case_routing_stages AS stage
    WHERE stage.routing_policy_id = case_row.routing_policy_id
      AND stage.stage_order = task_row.stage_order + 1
      AND stage.task_type = 'fulfillment';

    IF NOT FOUND THEN RAISE EXCEPTION 'corporate_case_next_stage_unavailable'; END IF;

    result_status := 'fulfillment';

    UPDATE public.corporate_case_approval_slots
    SET decision = 'cancelled',
        decided_by = NULL,
        decision_reason = NULL,
        decided_at = NULL,
        approver_was_owner = false,
        version = version + 1,
        updated_at = now()
    WHERE task_id = task_row.id
      AND decision = 'pending';

    pending_count := 0;

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

    INSERT INTO public.corporate_case_sla_instances(
      case_id, task_id, metric_key, status, target_at
    )
    VALUES (case_row.id, next_task.id, 'stage_response', 'running', next_task.due_at);

    UPDATE public.corporate_cases
    SET status = result_status,
        current_stage_order = next_stage.stage_order,
        current_group_id = next_stage.target_group_id,
        current_assignee_profile_id = NULL,
        version = version + 1,
        updated_at = now()
    WHERE id = case_row.id
    RETURNING * INTO case_row;
  ELSE
    result_status := 'awaiting_approval';

    UPDATE public.corporate_case_tasks
    SET status = 'in_progress',
        version = version + 1,
        updated_at = now()
    WHERE id = task_row.id
    RETURNING * INTO task_row;

    UPDATE public.corporate_cases
    SET version = version + 1,
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
    'corporate_case.approval_decided',
    'internal',
    jsonb_build_object(
      'task_id', task_row.id,
      'task_version', task_row.version,
      'approval_id', slot_row.id,
      'approval_version', slot_row.version,
      'decision', target_decision,
      'status', case_row.status,
      'case_version', case_row.version,
      'next_task_id', CASE WHEN case_row.status = 'fulfillment' THEN next_task.id ELSE NULL END,
      'approved_count', approved_count,
      'pending_count', pending_count,
      'required_approvals', routing_stage.required_approvals,
      'owner_approval_satisfied', NOT requires_owner_approval OR owner_approval_count >= 1,
      'reason_provided', true,
      'request_fingerprint', request_fingerprint
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
    WHERE case_row.status = 'fulfillment'
      AND member.group_id = case_row.current_group_id
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
    'approval_decided',
    case_row.priority,
    'Aprovação do chamado ' || case_row.protocol || ' atualizada',
    CASE case_row.status
      WHEN 'rejected' THEN 'Uma aprovação rejeitou o chamado. Consulte o registro no CutSync Cloud.'
      WHEN 'fulfillment' THEN 'As aprovações foram concluídas e o chamado seguiu para execução.'
      ELSE 'Uma aprovação foi registrada e as demais decisões continuam pendentes.'
    END,
    jsonb_build_object('case_id', case_row.id)
  FROM recipient_candidates AS recipient
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.corporate_notification_preferences AS preference
    WHERE preference.profile_id = recipient.profile_id
      AND preference.event_category = 'approval_decided'
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
        'template_key', 'corporate_case.approval_updated',
        'case_id', case_row.id,
        'event_id', created_event.id
      )
    FROM public.corporate_notifications AS notification
    WHERE notification.event_id = created_event.id
      AND NOT EXISTS (
        SELECT 1
        FROM public.corporate_notification_preferences AS preference
        WHERE preference.profile_id = notification.recipient_profile_id
          AND preference.event_category = 'approval_decided'
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
    'corporate_case.approval_' || target_decision,
    case_row.id,
    'corporate_case',
    jsonb_build_object(
      'task_id', task_row.id,
      'approval_id', slot_row.id,
      'status', case_row.status,
      'case_version', case_row.version,
      'approval_version', slot_row.version,
      'approver_was_owner', actor_is_owner,
      'approved_count', approved_count,
      'required_approvals', routing_stage.required_approvals,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'case_id', case_row.id,
    'case_version', case_row.version,
    'task_id', task_row.id,
    'task_version', task_row.version,
    'approval_id', slot_row.id,
    'approval_version', slot_row.version,
    'status', case_row.status,
    'next_task_id', CASE WHEN case_row.status = 'fulfillment' THEN next_task.id ELSE NULL END,
    'approved_count', approved_count,
    'required_approvals', routing_stage.required_approvals,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.list_corporate_case_approval_candidates(uuid, uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_corporate_case_approval_context(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_corporate_case_approval(
  uuid, uuid, uuid, integer, integer, integer, text, text, uuid
)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_corporate_case_approval_candidates(uuid, uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_corporate_case_approval_context(uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_corporate_case_approval(
  uuid, uuid, uuid, integer, integer, integer, text, text, uuid
)
TO authenticated, service_role;

COMMIT;
