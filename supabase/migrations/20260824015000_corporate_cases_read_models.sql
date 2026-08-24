-- Read-only corporate cases APIs with backend-authoritative visibility.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

CREATE SCHEMA IF NOT EXISTS corporate_private;

REVOKE ALL ON SCHEMA corporate_private FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION corporate_private.actor_is_active_group_member(
  target_group_id uuid,
  target_actor_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT target_group_id IS NOT NULL
    AND target_actor_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.corporate_work_group_members AS member
      WHERE member.group_id = target_group_id
        AND member.profile_id = target_actor_id
        AND member.active
        AND member.can_receive
        AND member.valid_from <= now()
        AND (member.valid_until IS NULL OR member.valid_until > now())
    );
$$;

CREATE OR REPLACE FUNCTION corporate_private.actor_can_view_case(
  target_case_id uuid,
  target_actor_id uuid,
  target_permissions text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT target_case_id IS NOT NULL
    AND target_actor_id IS NOT NULL
    AND coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
      'control.cases.request',
      'control.cases.read',
      'control.cases.triage',
      'control.cases.route',
      'control.cases.manage',
      'control.cases.audit'
    ]::text[]
    AND EXISTS (
      SELECT 1
      FROM public.corporate_cases AS corporate_case
      WHERE corporate_case.id = target_case_id
        AND (
          corporate_case.sensitivity <> 'confidential'
          OR coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
            'control.cases.manage',
            'control.cases.audit'
          ]::text[]
          OR corporate_case.requester_profile_id = target_actor_id
          OR corporate_case.beneficiary_profile_id = target_actor_id
          OR corporate_case.current_assignee_profile_id = target_actor_id
          OR EXISTS (
            SELECT 1
            FROM public.corporate_case_participants AS confidential_participant
            WHERE confidential_participant.case_id = corporate_case.id
              AND confidential_participant.profile_id = target_actor_id
              AND confidential_participant.active
          )
          OR EXISTS (
            SELECT 1
            FROM public.corporate_case_approval_slots AS confidential_approval_slot
            JOIN public.corporate_case_tasks AS confidential_approval_task
              ON confidential_approval_task.id = confidential_approval_slot.task_id
            WHERE confidential_approval_task.case_id = corporate_case.id
              AND confidential_approval_slot.decision = 'pending'
              AND confidential_approval_slot.requested_approver_profile_id = target_actor_id
          )
        )
        AND (
          coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
            'control.cases.manage',
            'control.cases.audit'
          ]::text[]
          OR (
            coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
              'control.cases.request',
              'control.cases.read'
            ]::text[]
            AND (
              corporate_case.requester_profile_id = target_actor_id
              OR corporate_case.beneficiary_profile_id = target_actor_id
            )
          )
          OR (
            coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
              'control.cases.read',
              'control.cases.triage',
              'control.cases.route'
            ]::text[]
            AND (
              corporate_case.current_assignee_profile_id = target_actor_id
              OR corporate_private.actor_is_active_group_member(
                corporate_case.current_group_id,
                target_actor_id
              )
              OR EXISTS (
                SELECT 1
                FROM public.corporate_case_participants AS participant
                WHERE participant.case_id = corporate_case.id
                  AND participant.profile_id = target_actor_id
                  AND participant.active
              )
              OR EXISTS (
                SELECT 1
                FROM public.corporate_case_tasks AS task
                WHERE task.case_id = corporate_case.id
                  AND task.status IN ('pending', 'in_progress', 'waiting')
                  AND (
                    task.assigned_profile_id = target_actor_id
                    OR corporate_private.actor_is_active_group_member(
                      task.assigned_group_id,
                      target_actor_id
                    )
                  )
              )
              OR EXISTS (
                SELECT 1
                FROM public.corporate_case_approval_slots AS approval_slot
                JOIN public.corporate_case_tasks AS approval_task
                  ON approval_task.id = approval_slot.task_id
                WHERE approval_task.case_id = corporate_case.id
                  AND approval_slot.decision = 'pending'
                  AND (
                    approval_slot.requested_approver_profile_id = target_actor_id
                    OR corporate_private.actor_is_active_group_member(
                      approval_slot.requested_approver_group_id,
                      target_actor_id
                    )
                  )
              )
            )
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION corporate_private.actor_has_internal_case_access(
  target_case_id uuid,
  target_actor_id uuid,
  target_permissions text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
      'control.cases.manage',
      'control.cases.audit'
    ]::text[]
    OR EXISTS (
      SELECT 1
      FROM public.corporate_cases AS corporate_case
      WHERE corporate_case.id = target_case_id
        AND (
          corporate_case.current_assignee_profile_id = target_actor_id
          OR corporate_private.actor_is_active_group_member(
            corporate_case.current_group_id,
            target_actor_id
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.corporate_case_participants AS participant
      WHERE participant.case_id = target_case_id
        AND participant.profile_id = target_actor_id
        AND participant.participant_role IN ('triager', 'assignee', 'approver', 'auditor')
        AND participant.active
    )
    OR EXISTS (
      SELECT 1
      FROM public.corporate_case_tasks AS task
      WHERE task.case_id = target_case_id
        AND task.status IN ('pending', 'in_progress', 'waiting')
        AND (
          task.assigned_profile_id = target_actor_id
          OR corporate_private.actor_is_active_group_member(
            task.assigned_group_id,
            target_actor_id
          )
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.corporate_case_approval_slots AS approval_slot
      JOIN public.corporate_case_tasks AS approval_task
        ON approval_task.id = approval_slot.task_id
      WHERE approval_task.case_id = target_case_id
        AND approval_slot.decision = 'pending'
        AND (
          approval_slot.requested_approver_profile_id = target_actor_id
          OR corporate_private.actor_is_active_group_member(
            approval_slot.requested_approver_group_id,
            target_actor_id
          )
        )
    );
$$;

CREATE OR REPLACE FUNCTION corporate_private.actor_has_restricted_case_access(
  target_case_id uuid,
  target_actor_id uuid,
  target_permissions text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT coalesce(target_permissions, ARRAY[]::text[]) && ARRAY[
      'control.cases.manage',
      'control.cases.audit'
    ]::text[]
    OR EXISTS (
      SELECT 1
      FROM public.corporate_cases AS corporate_case
      WHERE corporate_case.id = target_case_id
        AND corporate_case.current_assignee_profile_id = target_actor_id
    )
    OR EXISTS (
      SELECT 1
      FROM public.corporate_case_participants AS participant
      WHERE participant.case_id = target_case_id
        AND participant.profile_id = target_actor_id
        AND participant.participant_role IN ('assignee', 'approver', 'auditor')
        AND participant.active
    )
    OR EXISTS (
      SELECT 1
      FROM public.corporate_case_approval_slots AS approval_slot
      JOIN public.corporate_case_tasks AS approval_task
        ON approval_task.id = approval_slot.task_id
      WHERE approval_task.case_id = target_case_id
        AND approval_slot.decision = 'pending'
        AND approval_slot.requested_approver_profile_id = target_actor_id
    );
$$;

REVOKE ALL ON FUNCTION corporate_private.actor_is_active_group_member(uuid, uuid)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION corporate_private.actor_can_view_case(uuid, uuid, text[])
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION corporate_private.actor_has_internal_case_access(uuid, uuid, text[])
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION corporate_private.actor_has_restricted_case_access(uuid, uuid, text[])
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_corporate_cases_read_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
BEGIN
  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value)
  WHERE permission_value LIKE 'control.cases.%';

  IF cardinality(actor_permissions) = 0 THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  RETURN jsonb_build_object(
    'enabled', runtime_settings.enabled,
    'creation_enabled', runtime_settings.creation_enabled,
    'permissions', to_jsonb(actor_permissions),
    'views', jsonb_build_object(
      'mine', actor_permissions && ARRAY[
        'control.cases.request', 'control.cases.read', 'control.cases.triage',
        'control.cases.route', 'control.cases.manage', 'control.cases.audit'
      ]::text[],
      'observing', actor_permissions && ARRAY[
        'control.cases.read', 'control.cases.triage', 'control.cases.route',
        'control.cases.manage', 'control.cases.audit'
      ]::text[],
      'pending', actor_permissions && ARRAY[
        'control.cases.read', 'control.cases.triage', 'control.cases.route',
        'control.cases.manage', 'control.cases.audit'
      ]::text[],
      'queue', actor_permissions && ARRAY[
        'control.cases.triage', 'control.cases.route',
        'control.cases.manage', 'control.cases.audit'
      ]::text[],
      'all', actor_permissions && ARRAY[
        'control.cases.manage', 'control.cases.audit'
      ]::text[]
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_corporate_case_types()
RETURNS TABLE (
  type_id uuid,
  type_key text,
  area text,
  category text,
  label text,
  description text,
  form_key text,
  form_version integer,
  default_risk text,
  sensitivity text,
  requires_beneficiary boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_permissions text[];
  runtime_enabled boolean;
BEGIN
  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  SELECT settings.enabled
  INTO STRICT runtime_enabled
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_enabled THEN
    RAISE EXCEPTION 'corporate_cases_disabled';
  END IF;

  IF NOT actor_permissions && ARRAY[
    'control.cases.request', 'control.cases.read', 'control.cases.triage',
    'control.cases.route', 'control.cases.manage', 'control.cases.audit'
  ]::text[] THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    case_type.id,
    case_type.type_key,
    case_type.area,
    case_type.category,
    case_type.label,
    case_type.description,
    case_type.form_key,
    case_type.form_version,
    case_type.default_risk,
    case_type.sensitivity,
    case_type.requires_beneficiary
  FROM public.corporate_case_types AS case_type
  WHERE case_type.active
    AND (
      case_type.opening_permission = ANY(actor_permissions)
      OR actor_permissions && ARRAY[
        'control.cases.manage', 'control.cases.audit'
      ]::text[]
    )
  ORDER BY case_type.area, case_type.category, case_type.label, case_type.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_corporate_cases(
  target_view text DEFAULT 'mine',
  target_status text DEFAULT NULL,
  target_limit integer DEFAULT 50,
  target_cursor_updated_at timestamptz DEFAULT NULL,
  target_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  case_id uuid,
  protocol text,
  case_type_key text,
  case_type_label text,
  risk_level text,
  priority text,
  sensitivity text,
  status text,
  subject text,
  summary text,
  current_stage_order smallint,
  current_group_label text,
  current_assignee_name text,
  requester_name text,
  beneficiary_name text,
  expires_at timestamptz,
  updated_at timestamptz,
  created_at timestamptz,
  version integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid := (SELECT auth.uid());
  actor_permissions text[];
  runtime_enabled boolean;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF target_view IS NULL OR target_view NOT IN ('mine', 'observing', 'pending', 'queue', 'all') THEN
    RAISE EXCEPTION 'invalid_corporate_case_view';
  END IF;

  IF target_status IS NOT NULL AND target_status NOT IN (
    'submitted', 'triage', 'review', 'awaiting_approval', 'approved',
    'fulfillment', 'waiting_requester', 'resolved', 'closed', 'rejected',
    'cancelled', 'expired', 'archived'
  ) THEN
    RAISE EXCEPTION 'invalid_corporate_case_status';
  END IF;

  IF target_limit IS NULL OR target_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_corporate_case_limit';
  END IF;

  IF (target_cursor_updated_at IS NULL) <> (target_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_corporate_case_cursor';
  END IF;

  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value)
  WHERE permission_value LIKE 'control.cases.%';

  SELECT settings.enabled
  INTO STRICT runtime_enabled
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_enabled THEN
    RAISE EXCEPTION 'corporate_cases_disabled';
  END IF;

  IF cardinality(actor_permissions) = 0 THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_view = 'queue' AND NOT actor_permissions && ARRAY[
    'control.cases.triage', 'control.cases.route',
    'control.cases.manage', 'control.cases.audit'
  ]::text[] THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_view = 'all' AND NOT actor_permissions && ARRAY[
    'control.cases.manage', 'control.cases.audit'
  ]::text[] THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    corporate_case.id,
    corporate_case.protocol,
    case_type.type_key,
    case_type.label,
    corporate_case.risk_level,
    corporate_case.priority,
    corporate_case.sensitivity,
    corporate_case.status,
    corporate_case.subject,
    corporate_case.summary,
    corporate_case.current_stage_order,
    current_group.label,
    current_assignee.name,
    coalesce(requester.name, 'Usuário'),
    beneficiary.name,
    corporate_case.expires_at,
    corporate_case.updated_at,
    corporate_case.created_at,
    corporate_case.version
  FROM public.corporate_cases AS corporate_case
  JOIN public.corporate_case_types AS case_type ON case_type.id = corporate_case.case_type_id
  JOIN public.profiles AS requester ON requester.id = corporate_case.requester_profile_id
  LEFT JOIN public.profiles AS beneficiary ON beneficiary.id = corporate_case.beneficiary_profile_id
  LEFT JOIN public.corporate_work_groups AS current_group
    ON current_group.id = corporate_case.current_group_id
  LEFT JOIN public.profiles AS current_assignee
    ON current_assignee.id = corporate_case.current_assignee_profile_id
  WHERE (target_status IS NULL OR corporate_case.status = target_status)
    AND (
      target_cursor_updated_at IS NULL
      OR (corporate_case.updated_at, corporate_case.id) < (
        target_cursor_updated_at,
        target_cursor_id
      )
    )
    AND corporate_private.actor_can_view_case(
      corporate_case.id,
      actor_id,
      actor_permissions
    )
    AND CASE target_view
      WHEN 'mine' THEN
        corporate_case.requester_profile_id = actor_id
        OR corporate_case.beneficiary_profile_id = actor_id
        OR EXISTS (
          SELECT 1
          FROM public.corporate_case_participants AS participant
          WHERE participant.case_id = corporate_case.id
            AND participant.profile_id = actor_id
            AND participant.active
        )
      WHEN 'observing' THEN EXISTS (
        SELECT 1
        FROM public.corporate_case_participants AS participant
        WHERE participant.case_id = corporate_case.id
          AND participant.profile_id = actor_id
          AND participant.participant_role = 'observer'
          AND participant.active
      )
      WHEN 'pending' THEN
        corporate_case.current_assignee_profile_id = actor_id
        OR EXISTS (
          SELECT 1
          FROM public.corporate_case_tasks AS task
          WHERE task.case_id = corporate_case.id
            AND task.status IN ('pending', 'in_progress', 'waiting')
            AND (
              task.assigned_profile_id = actor_id
              OR corporate_private.actor_is_active_group_member(
                task.assigned_group_id,
                actor_id
              )
            )
        )
        OR EXISTS (
          SELECT 1
          FROM public.corporate_case_approval_slots AS approval_slot
          JOIN public.corporate_case_tasks AS approval_task
            ON approval_task.id = approval_slot.task_id
          WHERE approval_task.case_id = corporate_case.id
            AND approval_slot.decision = 'pending'
            AND (
              approval_slot.requested_approver_profile_id = actor_id
              OR corporate_private.actor_is_active_group_member(
                approval_slot.requested_approver_group_id,
                actor_id
              )
            )
        )
      WHEN 'queue' THEN
        corporate_private.actor_is_active_group_member(
          corporate_case.current_group_id,
          actor_id
        )
        OR EXISTS (
          SELECT 1
          FROM public.corporate_case_tasks AS task
          WHERE task.case_id = corporate_case.id
            AND task.status IN ('pending', 'in_progress', 'waiting')
            AND corporate_private.actor_is_active_group_member(
              task.assigned_group_id,
              actor_id
            )
        )
      WHEN 'all' THEN true
      ELSE false
    END
  ORDER BY corporate_case.updated_at DESC, corporate_case.id DESC
  LIMIT target_limit;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_corporate_case_detail(target_case_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid := (SELECT auth.uid());
  actor_permissions text[];
  runtime_enabled boolean;
  can_view_internal boolean;
  can_view_restricted boolean;
  result_payload jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF target_case_id IS NULL THEN
    RAISE EXCEPTION 'corporate_case_not_found';
  END IF;

  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value)
  WHERE permission_value LIKE 'control.cases.%';

  SELECT settings.enabled
  INTO STRICT runtime_enabled
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_enabled THEN
    RAISE EXCEPTION 'corporate_cases_disabled';
  END IF;

  IF NOT corporate_private.actor_can_view_case(
    target_case_id,
    actor_id,
    actor_permissions
  ) THEN
    RAISE EXCEPTION 'corporate_case_not_found';
  END IF;

  can_view_internal := corporate_private.actor_has_internal_case_access(
    target_case_id,
    actor_id,
    actor_permissions
  );
  can_view_restricted := corporate_private.actor_has_restricted_case_access(
    target_case_id,
    actor_id,
    actor_permissions
  );

  SELECT jsonb_build_object(
    'case', jsonb_build_object(
      'case_id', corporate_case.id,
      'case_number', corporate_case.case_number,
      'protocol', corporate_case.protocol,
      'case_type_key', case_type.type_key,
      'case_type_label', case_type.label,
      'area', case_type.area,
      'category', case_type.category,
      'form_key', case_type.form_key,
      'form_version', case_type.form_version,
      'requester_profile_id', corporate_case.requester_profile_id,
      'requester_name', coalesce(requester.name, 'Usuário'),
      'beneficiary_profile_id', corporate_case.beneficiary_profile_id,
      'beneficiary_name', beneficiary.name,
      'risk_level', corporate_case.risk_level,
      'priority', corporate_case.priority,
      'sensitivity', corporate_case.sensitivity,
      'status', corporate_case.status,
      'current_stage_order', corporate_case.current_stage_order,
      'current_group_id', corporate_case.current_group_id,
      'current_group_label', current_group.label,
      'current_assignee_profile_id', corporate_case.current_assignee_profile_id,
      'current_assignee_name', current_assignee.name,
      'subject', corporate_case.subject,
      'summary', corporate_case.summary,
      'form_payload', corporate_case.form_payload,
      'external_reference', corporate_case.external_reference,
      'version', corporate_case.version,
      'expires_at', corporate_case.expires_at,
      'resolved_at', corporate_case.resolved_at,
      'closed_at', corporate_case.closed_at,
      'created_at', corporate_case.created_at,
      'updated_at', corporate_case.updated_at
    ),
    'visibility', jsonb_build_object(
      'internal', can_view_internal,
      'restricted', can_view_restricted
    ),
    'participants', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'profile_id', participant.profile_id,
        'name', coalesce(participant_profile.name, 'Usuário'),
        'role', participant.participant_role,
        'notification_level', participant.notification_level,
        'created_at', participant.created_at
      ) ORDER BY participant.created_at, participant.profile_id, participant.participant_role)
      FROM public.corporate_case_participants AS participant
      JOIN public.profiles AS participant_profile ON participant_profile.id = participant.profile_id
      WHERE participant.case_id = corporate_case.id
        AND participant.active
    ), '[]'::jsonb),
    'tasks', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'task_id', task.id,
        'stage_order', task.stage_order,
        'task_type', task.task_type,
        'assigned_group_id', task.assigned_group_id,
        'assigned_group_label', task_group.label,
        'assigned_profile_id', task.assigned_profile_id,
        'assigned_profile_name', assigned_profile.name,
        'status', task.status,
        'due_at', task.due_at,
        'completed_at', task.completed_at,
        'version', task.version,
        'created_at', task.created_at,
        'updated_at', task.updated_at
      ) ORDER BY task.stage_order, task.created_at, task.id)
      FROM public.corporate_case_tasks AS task
      JOIN public.corporate_work_groups AS task_group ON task_group.id = task.assigned_group_id
      LEFT JOIN public.profiles AS assigned_profile ON assigned_profile.id = task.assigned_profile_id
      WHERE task.case_id = corporate_case.id
    ), '[]'::jsonb),
    'approvals', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'approval_id', approval_slot.id,
        'task_id', approval_slot.task_id,
        'slot_order', approval_slot.slot_order,
        'requested_approver_profile_id', approval_slot.requested_approver_profile_id,
        'requested_approver_name', approver_profile.name,
        'requested_approver_group_id', approval_slot.requested_approver_group_id,
        'requested_approver_group_label', approver_group.label,
        'decision', approval_slot.decision,
        'decided_by_name', decision_profile.name,
        'decision_reason', CASE WHEN can_view_internal THEN approval_slot.decision_reason ELSE NULL END,
        'decided_at', approval_slot.decided_at,
        'due_at', approval_slot.due_at,
        'created_at', approval_slot.created_at
      ) ORDER BY approval_task.stage_order, approval_slot.slot_order, approval_slot.id)
      FROM public.corporate_case_approval_slots AS approval_slot
      JOIN public.corporate_case_tasks AS approval_task ON approval_task.id = approval_slot.task_id
      LEFT JOIN public.profiles AS approver_profile
        ON approver_profile.id = approval_slot.requested_approver_profile_id
      LEFT JOIN public.corporate_work_groups AS approver_group
        ON approver_group.id = approval_slot.requested_approver_group_id
      LEFT JOIN public.profiles AS decision_profile ON decision_profile.id = approval_slot.decided_by
      WHERE approval_task.case_id = corporate_case.id
    ), '[]'::jsonb),
    'messages', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'message_id', message.id,
        'author_profile_id', message.author_profile_id,
        'author_name', coalesce(message_author.name, 'Sistema'),
        'visibility', message.visibility,
        'body', message.body,
        'created_at', message.created_at,
        'edited_at', message.edited_at
      ) ORDER BY message.created_at, message.id)
      FROM public.corporate_case_messages AS message
      LEFT JOIN public.profiles AS message_author ON message_author.id = message.author_profile_id
      WHERE message.case_id = corporate_case.id
        AND (
          message.visibility = 'participants'
          OR (message.visibility = 'internal' AND can_view_internal)
          OR (message.visibility = 'restricted' AND can_view_restricted)
        )
    ), '[]'::jsonb),
    'events', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
        'event_id', event.id,
        'event_type', event.event_type,
        'actor_profile_id', event.actor_profile_id,
        'actor_name', coalesce(event_actor.name, 'Sistema'),
        'audience', event.audience,
        'payload', event.payload,
        'created_at', event.created_at
      ) ORDER BY event.created_at, event.id)
      FROM public.corporate_case_events AS event
      LEFT JOIN public.profiles AS event_actor ON event_actor.id = event.actor_profile_id
      WHERE event.case_id = corporate_case.id
        AND (
          event.audience = 'participants'
          OR (event.audience IN ('internal', 'system') AND can_view_internal)
          OR (event.audience = 'restricted' AND can_view_restricted)
        )
    ), '[]'::jsonb)
  )
  INTO result_payload
  FROM public.corporate_cases AS corporate_case
  JOIN public.corporate_case_types AS case_type ON case_type.id = corporate_case.case_type_id
  JOIN public.profiles AS requester ON requester.id = corporate_case.requester_profile_id
  LEFT JOIN public.profiles AS beneficiary ON beneficiary.id = corporate_case.beneficiary_profile_id
  LEFT JOIN public.corporate_work_groups AS current_group
    ON current_group.id = corporate_case.current_group_id
  LEFT JOIN public.profiles AS current_assignee
    ON current_assignee.id = corporate_case.current_assignee_profile_id
  WHERE corporate_case.id = target_case_id;

  IF result_payload IS NULL THEN
    RAISE EXCEPTION 'corporate_case_not_found';
  END IF;

  RETURN result_payload;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_corporate_notifications(
  target_unread_only boolean DEFAULT false,
  target_limit integer DEFAULT 50,
  target_cursor_created_at timestamptz DEFAULT NULL,
  target_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  notification_id uuid,
  event_id uuid,
  event_category text,
  importance text,
  title text,
  body text,
  route_payload jsonb,
  read_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid := (SELECT auth.uid());
  actor_permissions text[];
  runtime_enabled boolean;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'unauthorized';
  END IF;

  IF target_limit IS NULL OR target_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_corporate_notification_limit';
  END IF;

  IF (target_cursor_created_at IS NULL) <> (target_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_corporate_notification_cursor';
  END IF;

  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value)
  WHERE permission_value LIKE 'control.cases.%';

  SELECT settings.enabled
  INTO STRICT runtime_enabled
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_enabled THEN
    RAISE EXCEPTION 'corporate_cases_disabled';
  END IF;

  IF cardinality(actor_permissions) = 0 THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    notification.id,
    notification.event_id,
    notification.event_category,
    notification.importance,
    notification.title,
    notification.body,
    notification.route_payload,
    notification.read_at,
    notification.created_at
  FROM public.corporate_notifications AS notification
  JOIN public.corporate_case_events AS notification_event
    ON notification_event.id = notification.event_id
  WHERE notification.recipient_profile_id = actor_id
    AND corporate_private.actor_can_view_case(
      notification_event.case_id,
      actor_id,
      actor_permissions
    )
    AND (NOT target_unread_only OR notification.read_at IS NULL)
    AND (
      target_cursor_created_at IS NULL
      OR (notification.created_at, notification.id) < (
        target_cursor_created_at,
        target_cursor_id
      )
    )
  ORDER BY notification.created_at DESC, notification.id DESC
  LIMIT target_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.get_corporate_cases_read_context()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_corporate_case_types()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_corporate_cases(
  text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_corporate_case_detail(uuid)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_corporate_notifications(
  boolean, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_corporate_cases_read_context()
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_corporate_case_types()
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_corporate_cases(
  text, text, integer, timestamptz, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_corporate_case_detail(uuid)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_corporate_notifications(
  boolean, integer, timestamptz, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_corporate_cases_read_context() IS
  'Returns corporate case feature flags and read views available to the current AAL2 Control identity.';
COMMENT ON FUNCTION public.list_corporate_cases(text, text, integer, timestamptz, uuid) IS
  'Cursor-paginated corporate case summaries filtered by participant, assignment, group and Control permissions.';
COMMENT ON FUNCTION public.get_corporate_case_detail(uuid) IS
  'Returns one authorized corporate case with sensitivity-filtered participants, workflow, messages and events.';
COMMENT ON FUNCTION public.list_corporate_notifications(boolean, integer, timestamptz, uuid) IS
  'Returns only corporate notifications addressed to the current AAL2 Control identity.';

COMMIT;
