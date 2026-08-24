-- Protected execution queue for approved corporate access cases.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

CREATE INDEX IF NOT EXISTS corporate_case_fulfillment_queue_idx
  ON public.corporate_case_tasks(assigned_group_id, due_at, id)
  INCLUDE (case_id, assigned_profile_id, status, version)
  WHERE task_type = 'fulfillment'
    AND status IN ('pending', 'in_progress', 'waiting');

CREATE INDEX IF NOT EXISTS corporate_case_fulfillment_events_idx
  ON public.corporate_case_events(case_id, created_at DESC, id DESC)
  INCLUDE (event_type, payload)
  WHERE event_type IN (
    'corporate_case.fulfillment_applied',
    'corporate_case.fulfillment_failed',
    'corporate_case.fulfillment_deferred'
  );

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
      'control.cases.audit',
      'control.cases.fulfill'
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
          OR (
            'control.cases.fulfill' = ANY(coalesce(target_permissions, ARRAY[]::text[]))
            AND corporate_case.status = 'fulfillment'
            AND corporate_private.actor_is_active_group_member(
              corporate_case.current_group_id,
              target_actor_id
            )
          )
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
              'control.cases.route',
              'control.cases.fulfill'
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

REVOKE ALL ON FUNCTION corporate_private.actor_can_view_case(uuid, uuid, text[])
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.list_corporate_case_fulfillment_queue(
  target_priority text DEFAULT NULL,
  target_sla_state text DEFAULT NULL,
  target_attempt_state text DEFAULT NULL,
  target_limit integer DEFAULT 50,
  target_cursor_due_at timestamptz DEFAULT NULL,
  target_cursor_id uuid DEFAULT NULL
)
RETURNS TABLE (
  case_id uuid,
  protocol text,
  subject text,
  risk_level text,
  priority text,
  sensitivity text,
  case_version integer,
  task_id uuid,
  task_version integer,
  task_status text,
  task_due_at timestamptz,
  sla_state text,
  assigned_group_label text,
  assigned_profile_id uuid,
  assigned_profile_name text,
  beneficiary_name text,
  requested_action text,
  requested_profile_key text,
  requested_profile_label text,
  requested_valid_until timestamptz,
  attempt_count integer,
  attempt_state text,
  latest_failure_code text,
  can_claim boolean,
  can_execute boolean,
  case_expired boolean,
  expires_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid;
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;

  IF target_priority IS NOT NULL
     AND target_priority NOT IN ('low', 'normal', 'high', 'critical')
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_priority';
  END IF;
  IF target_sla_state IS NOT NULL
     AND target_sla_state NOT IN ('overdue', 'due_soon', 'on_track')
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_sla_state';
  END IF;
  IF target_attempt_state IS NOT NULL
     AND target_attempt_state NOT IN ('not_attempted', 'failed', 'deferred')
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_attempt_state';
  END IF;
  IF target_limit IS NULL OR target_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_limit';
  END IF;
  IF (target_cursor_due_at IS NULL) <> (target_cursor_id IS NULL) THEN
    RAISE EXCEPTION 'invalid_corporate_case_fulfillment_cursor';
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN RAISE EXCEPTION 'corporate_cases_disabled'; END IF;
  IF NOT runtime_settings.workflow_enabled THEN
    RAISE EXCEPTION 'corporate_case_workflow_disabled';
  END IF;
  IF NOT corporate_private.actor_has_active_control_permission(
    actor_id,
    'control.cases.fulfill'
  ) OR NOT corporate_private.actor_has_active_control_permission(
    actor_id,
    'control.access.apply'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  WITH queue_rows AS (
    SELECT
      corporate_case.id AS row_case_id,
      corporate_case.protocol AS row_protocol,
      corporate_case.subject AS row_subject,
      corporate_case.risk_level AS row_risk_level,
      corporate_case.priority AS row_priority,
      corporate_case.sensitivity AS row_sensitivity,
      corporate_case.version AS row_case_version,
      task.id AS row_task_id,
      task.version AS row_task_version,
      task.status AS row_task_status,
      task.due_at AS row_task_due_at,
      CASE
        WHEN task.due_at <= pg_catalog.now() THEN 'overdue'
        WHEN task.due_at <= pg_catalog.now() + interval '4 hours' THEN 'due_soon'
        ELSE 'on_track'
      END AS row_sla_state,
      work_group.label AS row_assigned_group_label,
      task.assigned_profile_id AS row_assigned_profile_id,
      assigned_profile.name AS row_assigned_profile_name,
      beneficiary.name AS row_beneficiary_name,
      access_request.requested_action AS row_requested_action,
      requested_profile.profile_key AS row_requested_profile_key,
      requested_profile.label AS row_requested_profile_label,
      access_request.requested_valid_until AS row_requested_valid_until,
      coalesce(attempts.attempt_count, 0)::integer AS row_attempt_count,
      coalesce(latest_attempt.execution_status, 'not_attempted') AS row_attempt_state,
      latest_attempt.failure_code AS row_latest_failure_code,
      corporate_case.expires_at <= pg_catalog.now() AS row_case_expired,
      corporate_case.expires_at AS row_expires_at,
      corporate_case.updated_at AS row_updated_at
    FROM public.corporate_case_tasks AS task
    JOIN public.corporate_cases AS corporate_case
      ON corporate_case.id = task.case_id
     AND corporate_case.status = 'fulfillment'
     AND corporate_case.current_stage_order = task.stage_order
     AND corporate_case.current_group_id = task.assigned_group_id
    JOIN public.corporate_case_access_requests AS access_request
      ON access_request.case_id = corporate_case.id
    JOIN public.control_access_profiles AS requested_profile
      ON requested_profile.id = access_request.requested_access_profile_id
    JOIN public.corporate_work_groups AS work_group
      ON work_group.id = task.assigned_group_id
    LEFT JOIN public.profiles AS assigned_profile
      ON assigned_profile.id = task.assigned_profile_id
    LEFT JOIN public.profiles AS beneficiary
      ON beneficiary.id = corporate_case.beneficiary_profile_id
    LEFT JOIN LATERAL (
      SELECT count(*)::integer AS attempt_count
      FROM public.corporate_case_events AS fulfillment_event
      WHERE fulfillment_event.case_id = corporate_case.id
        AND fulfillment_event.event_type IN (
          'corporate_case.fulfillment_applied',
          'corporate_case.fulfillment_failed',
          'corporate_case.fulfillment_deferred'
        )
    ) AS attempts ON true
    LEFT JOIN LATERAL (
      SELECT
        fulfillment_event.payload->>'execution_status' AS execution_status,
        fulfillment_event.payload->>'failure_code' AS failure_code
      FROM public.corporate_case_events AS fulfillment_event
      WHERE fulfillment_event.case_id = corporate_case.id
        AND fulfillment_event.event_type IN (
          'corporate_case.fulfillment_applied',
          'corporate_case.fulfillment_failed',
          'corporate_case.fulfillment_deferred'
        )
      ORDER BY fulfillment_event.created_at DESC, fulfillment_event.id DESC
      LIMIT 1
    ) AS latest_attempt ON true
    WHERE task.task_type = 'fulfillment'
      AND task.status IN ('pending', 'in_progress', 'waiting')
      AND EXISTS (
        SELECT 1
        FROM public.corporate_work_group_members AS member
        WHERE member.group_id = task.assigned_group_id
          AND member.profile_id = actor_id
          AND member.active
          AND member.can_receive
          AND member.valid_from <= pg_catalog.now()
          AND (member.valid_until IS NULL OR member.valid_until > pg_catalog.now())
      )
      AND corporate_private.actor_can_fulfill_access_case(
        corporate_case.id,
        task.assigned_group_id,
        actor_id
      )
      AND (
        target_cursor_due_at IS NULL
        OR (task.due_at, task.id) > (target_cursor_due_at, target_cursor_id)
      )
  )
  SELECT
    queue_row.row_case_id,
    queue_row.row_protocol,
    queue_row.row_subject,
    queue_row.row_risk_level,
    queue_row.row_priority,
    queue_row.row_sensitivity,
    queue_row.row_case_version,
    queue_row.row_task_id,
    queue_row.row_task_version,
    queue_row.row_task_status,
    queue_row.row_task_due_at,
    queue_row.row_sla_state,
    queue_row.row_assigned_group_label,
    queue_row.row_assigned_profile_id,
    queue_row.row_assigned_profile_name,
    queue_row.row_beneficiary_name,
    queue_row.row_requested_action,
    queue_row.row_requested_profile_key,
    queue_row.row_requested_profile_label,
    queue_row.row_requested_valid_until,
    queue_row.row_attempt_count,
    queue_row.row_attempt_state,
    queue_row.row_latest_failure_code,
    NOT queue_row.row_case_expired
      AND queue_row.row_task_status = 'pending'
      AND queue_row.row_assigned_profile_id IS NULL,
    NOT queue_row.row_case_expired
      AND queue_row.row_task_status = 'in_progress'
      AND queue_row.row_assigned_profile_id = actor_id,
    queue_row.row_case_expired,
    queue_row.row_expires_at,
    queue_row.row_updated_at
  FROM queue_rows AS queue_row
  WHERE (target_priority IS NULL OR queue_row.row_priority = target_priority)
    AND (target_sla_state IS NULL OR queue_row.row_sla_state = target_sla_state)
    AND (target_attempt_state IS NULL OR queue_row.row_attempt_state = target_attempt_state)
  ORDER BY queue_row.row_task_due_at, queue_row.row_task_id
  LIMIT target_limit;
END;
$$;

REVOKE ALL ON FUNCTION public.list_corporate_case_fulfillment_queue(
  text, text, text, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_corporate_case_fulfillment_queue(
  text, text, text, integer, timestamptz, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.list_corporate_case_fulfillment_queue(
  text, text, text, integer, timestamptz, uuid
) IS
  'Returns the AAL2 actor only active access fulfillment tasks for groups where the actor is eligible, with keyset pagination and operational filters.';

COMMIT;
