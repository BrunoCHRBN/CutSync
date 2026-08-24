-- Close idempotency races in access-request creation and harden the
-- corporate event ledger without rewriting migrations already applied remotely.

BEGIN;

-- Persist the optimistic-lock input used by each approval so a retry can only
-- reuse its idempotency key when the complete original command is identical.
ALTER TABLE public.control_access_request_approvals
  ADD COLUMN IF NOT EXISTS expected_request_version integer;

-- Prefer immutable audit evidence. Historical rows without one exact audit
-- match are filled only when the remaining ordinal is mathematically unique;
-- otherwise the migration aborts instead of inventing an ordering.
DO $$
DECLARE
  approval_row record;
  request_group record;
  matching_audit_count integer;
  valid_audit_count integer;
  audit_expected_version integer;
  remaining_ordinal_count integer;
  remaining_ordinal integer;
BEGIN
  FOR approval_row IN
    SELECT
      approval.id,
      approval.request_id,
      approval.approver_id,
      approval.decision,
      approval.expected_request_version
    FROM public.control_access_request_approvals AS approval
  LOOP
    SELECT
      count(*),
      count(*) FILTER (
        WHERE audit_match.audit_version BETWEEN 2 AND 2147483647
      ),
      min(audit_match.audit_version - 1) FILTER (
        WHERE audit_match.audit_version BETWEEN 2 AND 2147483647
      )::integer
    INTO
      matching_audit_count,
      valid_audit_count,
      audit_expected_version
    FROM (
      SELECT CASE
        WHEN pg_catalog.jsonb_typeof(audit_log.changes->'version') = 'number'
         AND coalesce(audit_log.changes->>'version', '') ~ '^[1-9][0-9]*$'
         AND char_length(audit_log.changes->>'version') <= 10
        THEN (audit_log.changes->>'version')::bigint
        ELSE NULL
      END AS audit_version
      FROM public.security_audit_logs AS audit_log
      WHERE audit_log.target_type = 'control_access_request'
        AND audit_log.target_id = approval_row.request_id
        AND audit_log.actor_id = approval_row.approver_id
        AND audit_log.action = 'control.access.approval_' || approval_row.decision
    ) AS audit_match;

    IF matching_audit_count > 1 THEN
      RAISE EXCEPTION
        'ambiguous_control_approval_version_backfill:multiple_audit_matches';
    END IF;

    IF matching_audit_count = 1 AND valid_audit_count <> 1 THEN
      RAISE EXCEPTION
        'ambiguous_control_approval_version_backfill:invalid_audit_version';
    END IF;

    IF valid_audit_count = 1 THEN
      IF approval_row.expected_request_version IS NOT NULL
         AND approval_row.expected_request_version IS DISTINCT FROM audit_expected_version
      THEN
        RAISE EXCEPTION
          'ambiguous_control_approval_version_backfill:audit_version_conflict';
      END IF;

      UPDATE public.control_access_request_approvals AS approval
      SET expected_request_version = audit_expected_version
      WHERE approval.id = approval_row.id
        AND approval.expected_request_version IS NULL;
    END IF;
  END LOOP;

  FOR request_group IN
    SELECT
      approval.request_id,
      count(*)::integer AS approval_count,
      count(*) FILTER (
        WHERE approval.expected_request_version IS NULL
      )::integer AS missing_count,
      count(approval.expected_request_version)::integer AS known_count,
      count(DISTINCT approval.expected_request_version)::integer AS distinct_known_count,
      min(approval.expected_request_version) AS minimum_known_version,
      max(approval.expected_request_version) AS maximum_known_version
    FROM public.control_access_request_approvals AS approval
    GROUP BY approval.request_id
  LOOP
    IF request_group.known_count IS DISTINCT FROM request_group.distinct_known_count
       OR request_group.minimum_known_version < 1
       OR request_group.maximum_known_version > request_group.approval_count
    THEN
      RAISE EXCEPTION
        'ambiguous_control_approval_version_backfill:invalid_known_ordinals';
    END IF;

    IF request_group.missing_count > 1 THEN
      RAISE EXCEPTION
        'ambiguous_control_approval_version_backfill:multiple_missing_ordinals';
    END IF;

    IF request_group.missing_count = 1 THEN
      SELECT count(*)::integer, min(candidate.ordinal)::integer
      INTO remaining_ordinal_count, remaining_ordinal
      FROM pg_catalog.generate_series(1, request_group.approval_count) AS candidate(ordinal)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.control_access_request_approvals AS known_approval
        WHERE known_approval.request_id = request_group.request_id
          AND known_approval.expected_request_version = candidate.ordinal
      );

      IF remaining_ordinal_count <> 1 THEN
        RAISE EXCEPTION
          'ambiguous_control_approval_version_backfill:non_unique_remaining_ordinal';
      END IF;

      UPDATE public.control_access_request_approvals AS approval
      SET expected_request_version = remaining_ordinal
      WHERE approval.request_id = request_group.request_id
        AND approval.expected_request_version IS NULL;
    END IF;
  END LOOP;
END;
$$;

ALTER TABLE public.control_access_request_approvals
  ALTER COLUMN expected_request_version SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.control_access_request_approvals'::pg_catalog.regclass
      AND constraint_row.conname =
        'control_access_request_approvals_expected_version_check'
  ) THEN
    ALTER TABLE public.control_access_request_approvals
      ADD CONSTRAINT control_access_request_approvals_expected_version_check
      CHECK (expected_request_version > 0);
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_constraint AS constraint_row
    WHERE constraint_row.conrelid =
      'public.control_access_request_approvals'::pg_catalog.regclass
      AND constraint_row.conname =
        'control_access_request_approvals_request_expected_version_key'
  ) THEN
    ALTER TABLE public.control_access_request_approvals
      ADD CONSTRAINT control_access_request_approvals_request_expected_version_key
      UNIQUE (request_id, expected_request_version);
  END IF;
END;
$$;

COMMENT ON COLUMN public.control_access_request_approvals.expected_request_version IS
  'Request version supplied by the approver and included in the idempotency fingerprint.';

CREATE OR REPLACE FUNCTION public.create_control_access_request(
  target_profile_id uuid,
  target_requested_profile_key text,
  target_action text,
  target_source_profile_key text,
  target_valid_until timestamptz,
  target_justification text,
  target_ticket_reference text,
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  requested_target_id uuid := target_profile_id;
  normalized_profile_key text := btrim(coalesce(target_requested_profile_key, ''));
  normalized_source_profile_key text := nullif(btrim(coalesce(target_source_profile_key, '')), '');
  normalized_justification text := btrim(coalesce(target_justification, ''));
  normalized_ticket_reference text := btrim(coalesce(target_ticket_reference, ''));
  requested_profile public.control_access_profiles%ROWTYPE;
  source_profile_id uuid;
  existing_request public.control_access_requests%ROWTYPE;
  existing_requested_profile_key text;
  existing_source_profile_key text;
  created_request public.control_access_requests%ROWTYPE;
BEGIN
  IF NOT public.current_control_has_permission('control.access.request') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF actor_id IS NULL OR requested_target_id IS NULL OR target_client_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_access_request';
  END IF;
  IF target_action IS NULL OR target_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'invalid_access_action';
  END IF;
  IF char_length(normalized_justification) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'access_reason_required';
  END IF;
  IF char_length(normalized_ticket_reference) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'access_ticket_required';
  END IF;
  -- Serialize the key before its first lookup. A concurrent retry waits for
  -- the winner and then observes the committed row instead of a UNIQUE error.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cutsync:create_control_access_request:' || target_client_request_id::text,
      0
    )
  );

  SELECT request.*
  INTO existing_request
  FROM public.control_access_requests AS request
  WHERE request.client_request_id = target_client_request_id;

  IF FOUND THEN
    SELECT
      requested_access_profile.profile_key,
      source_access_profile.profile_key
    INTO
      existing_requested_profile_key,
      existing_source_profile_key
    FROM public.control_access_profiles AS requested_access_profile
    LEFT JOIN public.control_access_profiles AS source_access_profile
      ON source_access_profile.id = existing_request.source_access_profile_id
    WHERE requested_access_profile.id = existing_request.requested_access_profile_id;

    IF existing_request.requested_by IS DISTINCT FROM actor_id
       OR existing_request.target_profile_id IS DISTINCT FROM requested_target_id
       OR existing_request.requested_action IS DISTINCT FROM target_action
       OR existing_requested_profile_key IS DISTINCT FROM normalized_profile_key
       OR existing_source_profile_key IS DISTINCT FROM normalized_source_profile_key
       OR existing_request.requested_valid_until IS DISTINCT FROM target_valid_until
       OR existing_request.justification IS DISTINCT FROM normalized_justification
       OR existing_request.ticket_reference IS DISTINCT FROM normalized_ticket_reference
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', existing_request.id,
      'request_number', existing_request.request_number,
      'status', existing_request.status,
      'version', existing_request.version,
      'required_approvals', existing_request.required_approvals
    );
  END IF;

  IF target_valid_until IS NOT NULL AND target_valid_until <= now() THEN
    RAISE EXCEPTION 'access_expiry_invalid';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = requested_target_id AND profile.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT access_profile.*
  INTO requested_profile
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.profile_key = normalized_profile_key
    AND access_profile.assignment_mode = 'delegated'
    AND access_profile.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_profile_not_found';
  END IF;
  IF target_action = 'grant'
     AND requested_profile.requires_expiry
     AND target_valid_until IS NULL
  THEN
    RAISE EXCEPTION 'access_expiry_required';
  END IF;

  IF normalized_source_profile_key IS NOT NULL THEN
    SELECT access_profile.id
    INTO source_profile_id
    FROM public.control_access_profiles AS access_profile
    WHERE access_profile.profile_key = normalized_source_profile_key
      AND access_profile.active;

    IF source_profile_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.control_user_access_assignments AS assignment
      WHERE assignment.target_profile_id = requested_target_id
        AND assignment.access_profile_id = source_profile_id
        AND assignment.active
        AND assignment.revoked_at IS NULL
        AND assignment.valid_from <= now()
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
    ) THEN
      RAISE EXCEPTION 'source_access_profile_not_active';
    END IF;
  END IF;

  IF target_action = 'grant' AND EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    WHERE assignment.target_profile_id = requested_target_id
      AND assignment.access_profile_id = requested_profile.id
      AND assignment.active
      AND assignment.revoked_at IS NULL
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
  ) THEN
    RAISE EXCEPTION 'control_assignment_already_active';
  END IF;

  IF target_action = 'revoke' AND NOT EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    WHERE assignment.target_profile_id = requested_target_id
      AND assignment.access_profile_id = requested_profile.id
      AND assignment.active
      AND assignment.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'control_assignment_not_active';
  END IF;

  INSERT INTO public.control_access_requests(
    client_request_id, requested_by, target_profile_id,
    source_access_profile_id, requested_access_profile_id,
    requested_action, requested_valid_until, justification, ticket_reference,
    risk_level, required_approvals, requires_owner_approval
  )
  VALUES (
    target_client_request_id, actor_id, requested_target_id,
    source_profile_id, requested_profile.id,
    target_action, target_valid_until, normalized_justification,
    normalized_ticket_reference, requested_profile.risk_level,
    requested_profile.required_approvals, requested_profile.requires_owner_approval
  )
  RETURNING * INTO created_request;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.requested',
    created_request.id,
    'control_access_request',
    jsonb_build_object(
      'target_profile_id', requested_target_id,
      'requested_profile_key', requested_profile.profile_key,
      'requested_action', target_action,
      'risk_level', requested_profile.risk_level,
      'ticket_reference', normalized_ticket_reference,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'request_id', created_request.id,
    'request_number', created_request.request_number,
    'status', created_request.status,
    'version', created_request.version,
    'required_approvals', created_request.required_approvals
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_control_access_request(
  target_request_id uuid,
  target_expected_version integer,
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
  actor_id uuid := (SELECT auth.uid());
  normalized_reason text := btrim(coalesce(target_reason, ''));
  request_row public.control_access_requests%ROWTYPE;
  existing_decision public.control_access_request_approvals%ROWTYPE;
  actor_is_owner boolean;
  approval_count integer;
  owner_approval_count integer;
  next_status text;
BEGIN
  IF NOT public.current_control_has_permission('control.access.approve') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_request_id IS NULL
     OR target_expected_version IS NULL
     OR target_expected_version <= 0
     OR target_decision IS NULL
     OR target_decision NOT IN ('approve', 'reject')
     OR target_client_request_id IS NULL
     OR char_length(normalized_reason) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'invalid_access_decision';
  END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cutsync:decide_control_access_request:' || target_client_request_id::text,
      0
    )
  );

  SELECT request.*
  INTO request_row
  FROM public.control_access_requests AS request
  WHERE request.id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_request_not_found';
  END IF;

  SELECT approval.*
  INTO existing_decision
  FROM public.control_access_request_approvals AS approval
  WHERE approval.client_request_id = target_client_request_id;

  IF FOUND THEN
    IF existing_decision.request_id <> target_request_id
       OR existing_decision.approver_id <> actor_id
       OR existing_decision.decision IS DISTINCT FROM target_decision
       OR existing_decision.reason IS DISTINCT FROM normalized_reason
       OR existing_decision.expected_request_version IS DISTINCT FROM target_expected_version
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', request_row.status,
      'version', request_row.version
    );
  END IF;

  IF request_row.requested_by = actor_id
     OR request_row.target_profile_id = actor_id
  THEN
    RAISE EXCEPTION 'approval_separation_required';
  END IF;
  IF request_row.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'access_request_not_pending';
  END IF;
  IF request_row.version IS DISTINCT FROM target_expected_version THEN
    RAISE EXCEPTION 'approval_version_conflict';
  END IF;
  IF request_row.expires_at <= now() THEN
    UPDATE public.control_access_requests
    SET status = 'expired', version = version + 1, updated_at = now()
    WHERE id = request_row.id;
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', 'expired',
      'version', request_row.version + 1
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.governance_users AS governance
    WHERE governance.profile_id = actor_id
      AND governance.role = 'SaaS_Owner'
      AND governance.is_active
      AND governance.revoked_at IS NULL
      AND (governance.expires_at IS NULL OR governance.expires_at > now())
  ) INTO actor_is_owner;

  INSERT INTO public.control_access_request_approvals(
    request_id, approver_id, decision, reason,
    approver_was_owner, client_request_id, expected_request_version
  )
  VALUES (
    request_row.id, actor_id, target_decision, normalized_reason,
    actor_is_owner, target_client_request_id, target_expected_version
  );

  IF target_decision = 'reject' THEN
    next_status := 'rejected';
    UPDATE public.control_access_requests
    SET status = next_status,
        rejected_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE id = request_row.id
    RETURNING * INTO request_row;
  ELSE
    SELECT
      count(*) FILTER (WHERE approval.decision = 'approve'),
      count(*) FILTER (WHERE approval.decision = 'approve' AND approval.approver_was_owner)
    INTO approval_count, owner_approval_count
    FROM public.control_access_request_approvals AS approval
    WHERE approval.request_id = request_row.id;

    next_status := CASE
      WHEN approval_count >= request_row.required_approvals
       AND (NOT request_row.requires_owner_approval OR owner_approval_count >= 1)
      THEN 'approved'
      ELSE 'awaiting_approval'
    END;

    UPDATE public.control_access_requests
    SET status = next_status,
        approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE approved_at END,
        version = version + 1,
        updated_at = now()
    WHERE id = request_row.id
    RETURNING * INTO request_row;
  END IF;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.approval_' || target_decision,
    request_row.id,
    'control_access_request',
    jsonb_build_object(
      'status', request_row.status,
      'version', request_row.version,
      'approver_was_owner', actor_is_owner,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'request_id', request_row.id,
    'status', request_row.status,
    'version', request_row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.create_corporate_access_case(
  target_beneficiary_profile_id uuid,
  target_requested_profile_key text,
  target_action text,
  target_source_profile_key text,
  target_valid_until timestamptz,
  target_justification text,
  target_observer_profile_ids uuid[],
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid := (SELECT auth.uid());
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  normalized_profile_key text := btrim(coalesce(target_requested_profile_key, ''));
  normalized_source_profile_key text := nullif(btrim(coalesce(target_source_profile_key, '')), '');
  normalized_justification text := btrim(coalesce(target_justification, ''));
  normalized_observer_ids uuid[];
  existing_case record;
  case_type public.corporate_case_types%ROWTYPE;
  requested_profile public.control_access_profiles%ROWTYPE;
  source_profile_id uuid;
  routing_policy_id uuid;
  routing_policy_version integer;
  maximum_lifetime_minutes integer;
  initial_stage_order smallint;
  initial_group_id uuid;
  initial_sla_minutes integer;
  created_case public.corporate_cases%ROWTYPE;
  created_task public.corporate_case_tasks%ROWTYPE;
  created_event public.corporate_case_events%ROWTYPE;
  derived_priority text;
BEGIN
  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  IF actor_id IS NULL OR NOT ('control.cases.request' = ANY(actor_permissions)) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_client_request_id IS NULL OR target_beneficiary_profile_id IS NULL THEN
    RAISE EXCEPTION 'invalid_corporate_access_case';
  END IF;
  IF target_action IS NULL OR target_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'invalid_corporate_access_action';
  END IF;
  IF normalized_profile_key = '' THEN
    RAISE EXCEPTION 'corporate_access_profile_required';
  END IF;
  IF char_length(normalized_justification) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'corporate_access_justification_required';
  END IF;
  IF cardinality(coalesce(target_observer_profile_ids, ARRAY[]::uuid[])) > 10
     OR array_position(coalesce(target_observer_profile_ids, ARRAY[]::uuid[]), NULL) IS NOT NULL
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_observers';
  END IF;

  SELECT coalesce(array_agg(observer_id ORDER BY observer_id), ARRAY[]::uuid[])
  INTO normalized_observer_ids
  FROM (
    SELECT DISTINCT observer_id
    FROM unnest(coalesce(target_observer_profile_ids, ARRAY[]::uuid[])) AS observer(observer_id)
  ) AS normalized_observers;

  IF actor_id = ANY(normalized_observer_ids)
     OR target_beneficiary_profile_id = ANY(normalized_observer_ids)
  THEN
    RAISE EXCEPTION 'invalid_corporate_case_observers';
  END IF;

  -- This RPC creates several dependent rows. Serialize the idempotency key
  -- before the lookup so exactly one transaction can become the creator.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'cutsync:create_corporate_access_case:' || target_client_request_id::text,
      0
    )
  );

  SELECT
    corporate_case.id,
    corporate_case.protocol,
    corporate_case.status,
    corporate_case.version,
    corporate_case.created_at,
    corporate_case.requester_profile_id,
    corporate_case.beneficiary_profile_id,
    corporate_case.summary,
    access_projection.requested_action,
    access_projection.requested_valid_until,
    requested_access_profile.profile_key AS requested_profile_key,
    source_access_profile.profile_key AS source_profile_key,
    coalesce((
      SELECT array_agg(participant.profile_id ORDER BY participant.profile_id)
      FROM public.corporate_case_participants AS participant
      WHERE participant.case_id = corporate_case.id
        AND participant.participant_role = 'observer'
        AND participant.active
    ), ARRAY[]::uuid[]) AS observer_profile_ids
  INTO existing_case
  FROM public.corporate_cases AS corporate_case
  JOIN public.corporate_case_access_requests AS access_projection
    ON access_projection.case_id = corporate_case.id
  JOIN public.control_access_profiles AS requested_access_profile
    ON requested_access_profile.id = access_projection.requested_access_profile_id
  LEFT JOIN public.control_access_profiles AS source_access_profile
    ON source_access_profile.id = access_projection.source_access_profile_id
  WHERE corporate_case.client_request_id = target_client_request_id;

  IF FOUND THEN
    IF existing_case.requester_profile_id <> actor_id
       OR existing_case.beneficiary_profile_id <> target_beneficiary_profile_id
       OR existing_case.requested_action IS DISTINCT FROM target_action
       OR existing_case.requested_profile_key <> normalized_profile_key
       OR existing_case.source_profile_key IS DISTINCT FROM normalized_source_profile_key
       OR existing_case.requested_valid_until IS DISTINCT FROM target_valid_until
       OR existing_case.summary <> normalized_justification
       OR existing_case.observer_profile_ids IS DISTINCT FROM normalized_observer_ids
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'case_id', existing_case.id,
      'protocol', existing_case.protocol,
      'status', existing_case.status,
      'version', existing_case.version,
      'created_at', existing_case.created_at,
      'idempotent', true
    );
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.corporate_cases AS conflicting_case
    WHERE conflicting_case.client_request_id = target_client_request_id
  ) THEN
    RAISE EXCEPTION 'idempotency_conflict';
  END IF;

  IF target_valid_until IS NOT NULL
     AND (target_valid_until <= now() OR target_valid_until > now() + interval '366 days')
  THEN
    RAISE EXCEPTION 'corporate_access_expiry_invalid';
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  IF NOT runtime_settings.enabled THEN
    RAISE EXCEPTION 'corporate_cases_disabled';
  END IF;
  IF NOT runtime_settings.creation_enabled THEN
    RAISE EXCEPTION 'corporate_case_creation_disabled';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS beneficiary
    JOIN public.governance_users AS governance_user
      ON governance_user.profile_id = beneficiary.id
    WHERE beneficiary.id = target_beneficiary_profile_id
      AND beneficiary.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'corporate_case_beneficiary_not_found';
  END IF;

  IF cardinality(normalized_observer_ids) > 0 AND (
    SELECT count(*)
    FROM public.profiles AS observer_profile
    JOIN public.governance_users AS governance_user
      ON governance_user.profile_id = observer_profile.id
    WHERE observer_profile.id = ANY(normalized_observer_ids)
      AND observer_profile.deleted_at IS NULL
  ) <> cardinality(normalized_observer_ids) THEN
    RAISE EXCEPTION 'corporate_case_observer_not_found';
  END IF;

  SELECT access_profile.*
  INTO requested_profile
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.profile_key = normalized_profile_key
    AND access_profile.assignment_mode = 'delegated'
    AND access_profile.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'corporate_access_profile_not_found';
  END IF;
  IF target_action = 'grant'
     AND requested_profile.requires_expiry
     AND target_valid_until IS NULL
  THEN
    RAISE EXCEPTION 'corporate_access_expiry_required';
  END IF;

  IF normalized_source_profile_key IS NOT NULL THEN
    SELECT access_profile.id
    INTO source_profile_id
    FROM public.control_access_profiles AS access_profile
    WHERE access_profile.profile_key = normalized_source_profile_key
      AND access_profile.active;

    IF source_profile_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.control_user_access_assignments AS assignment
      WHERE assignment.target_profile_id = target_beneficiary_profile_id
        AND assignment.access_profile_id = source_profile_id
        AND assignment.active
        AND assignment.revoked_at IS NULL
        AND assignment.valid_from <= now()
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
    ) THEN
      RAISE EXCEPTION 'source_access_profile_not_active';
    END IF;
  END IF;

  IF target_action = 'grant' AND EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    WHERE assignment.target_profile_id = target_beneficiary_profile_id
      AND assignment.access_profile_id = requested_profile.id
      AND assignment.active
      AND assignment.revoked_at IS NULL
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
  ) THEN
    RAISE EXCEPTION 'control_assignment_already_active';
  END IF;

  IF target_action = 'revoke' AND NOT EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    WHERE assignment.target_profile_id = target_beneficiary_profile_id
      AND assignment.access_profile_id = requested_profile.id
      AND assignment.active
      AND assignment.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'control_assignment_not_active';
  END IF;

  SELECT case_type_row.*
  INTO case_type
  FROM public.corporate_case_types AS case_type_row
  WHERE case_type_row.type_key = 'access_release'
    AND case_type_row.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'corporate_access_case_type_unavailable';
  END IF;

  SELECT
    routing_policy.id,
    routing_policy.version,
    routing_policy.maximum_lifetime_minutes,
    initial_stage.stage_order,
    initial_stage.target_group_id,
    initial_stage.sla_minutes
  INTO
    routing_policy_id,
    routing_policy_version,
    maximum_lifetime_minutes,
    initial_stage_order,
    initial_group_id,
    initial_sla_minutes
  FROM public.corporate_case_routing_policies AS routing_policy
  JOIN public.corporate_case_routing_stages AS initial_stage
    ON initial_stage.routing_policy_id = routing_policy.id
   AND initial_stage.stage_order = 1
   AND initial_stage.task_type = 'triage'
  JOIN public.corporate_work_groups AS initial_group
    ON initial_group.id = initial_stage.target_group_id
   AND initial_group.active
  WHERE routing_policy.case_type_id = case_type.id
    AND routing_policy.risk_level = requested_profile.risk_level
    AND routing_policy.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'corporate_access_routing_unavailable';
  END IF;

  derived_priority := CASE requested_profile.risk_level
    WHEN 'critical' THEN 'critical'
    WHEN 'high' THEN 'high'
    ELSE 'normal'
  END;

  INSERT INTO public.corporate_cases(
    client_request_id,
    case_type_id,
    requester_profile_id,
    beneficiary_profile_id,
    routing_policy_id,
    routing_policy_version,
    risk_level,
    priority,
    sensitivity,
    status,
    current_stage_order,
    current_group_id,
    subject,
    summary,
    form_payload,
    expires_at
  )
  VALUES (
    target_client_request_id,
    case_type.id,
    actor_id,
    target_beneficiary_profile_id,
    routing_policy_id,
    routing_policy_version,
    requested_profile.risk_level,
    derived_priority,
    case_type.sensitivity,
    'submitted',
    initial_stage_order,
    initial_group_id,
    CASE target_action
      WHEN 'grant' THEN 'Concessão de acesso: ' || requested_profile.label
      ELSE 'Revogação de acesso: ' || requested_profile.label
    END,
    normalized_justification,
    jsonb_strip_nulls(jsonb_build_object(
      'form_key', case_type.form_key,
      'form_version', case_type.form_version,
      'requested_action', target_action,
      'requested_profile_key', requested_profile.profile_key,
      'source_profile_key', normalized_source_profile_key,
      'requested_valid_until', target_valid_until
    )),
    now() + make_interval(mins => maximum_lifetime_minutes)
  )
  RETURNING * INTO created_case;

  INSERT INTO public.corporate_case_access_requests(
    case_id,
    requested_access_profile_id,
    source_access_profile_id,
    requested_action,
    requested_valid_until
  )
  VALUES (
    created_case.id,
    requested_profile.id,
    source_profile_id,
    target_action,
    target_valid_until
  );

  INSERT INTO public.corporate_case_participants(
    case_id,
    profile_id,
    participant_role,
    notification_level,
    added_by
  )
  VALUES
    (created_case.id, actor_id, 'requester', 'all', actor_id),
    (created_case.id, target_beneficiary_profile_id, 'beneficiary', 'all', actor_id);

  INSERT INTO public.corporate_case_participants(
    case_id,
    profile_id,
    participant_role,
    notification_level,
    added_by
  )
  SELECT created_case.id, observer_id, 'observer', 'all', actor_id
  FROM unnest(normalized_observer_ids) AS observer(observer_id);

  INSERT INTO public.corporate_case_tasks(
    case_id,
    stage_order,
    task_type,
    assigned_group_id,
    status,
    due_at
  )
  VALUES (
    created_case.id,
    initial_stage_order,
    'triage',
    initial_group_id,
    'pending',
    now() + make_interval(mins => initial_sla_minutes)
  )
  RETURNING * INTO created_task;

  INSERT INTO public.corporate_case_sla_instances(
    case_id,
    task_id,
    metric_key,
    status,
    target_at
  )
  VALUES
    (created_case.id, NULL, 'case_lifetime', 'running', created_case.expires_at),
    (created_case.id, created_task.id, 'stage_response', 'running', created_task.due_at);

  INSERT INTO public.corporate_case_events(
    event_key,
    case_id,
    actor_profile_id,
    event_type,
    audience,
    payload
  )
  VALUES (
    target_client_request_id,
    created_case.id,
    actor_id,
    'corporate_case.created',
    'participants',
    jsonb_build_object(
      'case_type_key', case_type.type_key,
      'protocol', created_case.protocol,
      'priority', created_case.priority,
      'current_stage_order', created_case.current_stage_order,
      'current_group_id', created_case.current_group_id
    )
  )
  RETURNING * INTO created_event;

  WITH recipient_candidates(profile_id, reason_rank) AS (
    SELECT actor_id, 3
    UNION ALL
    SELECT target_beneficiary_profile_id, 2
    UNION ALL
    SELECT observer_id, 1
    FROM unnest(normalized_observer_ids) AS observer(observer_id)
    UNION ALL
    SELECT group_member.profile_id, 4
    FROM public.corporate_work_group_members AS group_member
    WHERE group_member.group_id = initial_group_id
      AND group_member.active
      AND group_member.can_receive
      AND group_member.valid_from <= now()
      AND (group_member.valid_until IS NULL OR group_member.valid_until > now())
  ), recipients AS (
    SELECT candidate.profile_id, max(candidate.reason_rank) AS reason_rank
    FROM recipient_candidates AS candidate
    GROUP BY candidate.profile_id
  )
  INSERT INTO public.corporate_notifications(
    event_id,
    recipient_profile_id,
    event_category,
    importance,
    title,
    body,
    route_payload
  )
  SELECT
    created_event.id,
    recipient.profile_id,
    'case_created',
    created_case.priority,
    'Chamado ' || created_case.protocol || ' criado',
    CASE recipient.reason_rank
      WHEN 4 THEN 'Uma nova ação foi atribuída à sua equipe. Acesse o CutSync Cloud para consultar.'
      ELSE 'O chamado foi registrado. Acesse o CutSync Cloud para acompanhar as atualizações.'
    END,
    jsonb_build_object('case_id', created_case.id)
  FROM recipients AS recipient
  ON CONFLICT (event_id, recipient_profile_id) DO NOTHING;

  IF runtime_settings.email_enabled THEN
    INSERT INTO public.corporate_notification_outbox(
      notification_id,
      channel,
      status,
      payload
    )
    SELECT
      notification.id,
      'email',
      'pending',
      jsonb_build_object(
        'template_key', 'corporate_case.assigned',
        'case_id', created_case.id,
        'event_id', created_event.id
      )
    FROM public.corporate_notifications AS notification
    JOIN public.corporate_work_group_members AS group_member
      ON group_member.profile_id = notification.recipient_profile_id
     AND group_member.group_id = initial_group_id
     AND group_member.active
     AND group_member.can_receive
     AND group_member.valid_from <= now()
     AND (group_member.valid_until IS NULL OR group_member.valid_until > now())
    WHERE notification.event_id = created_event.id
    ON CONFLICT (notification_id, channel) DO NOTHING;
  END IF;

  INSERT INTO public.security_audit_logs(
    actor_id,
    action,
    target_id,
    target_type,
    changes
  )
  VALUES (
    actor_id,
    'corporate_case.created',
    created_case.id,
    'corporate_case',
    jsonb_build_object(
      'case_type_key', case_type.type_key,
      'beneficiary_profile_id', target_beneficiary_profile_id,
      'requested_profile_key', requested_profile.profile_key,
      'requested_action', target_action,
      'risk_level', requested_profile.risk_level,
      'observer_count', cardinality(normalized_observer_ids),
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'case_id', created_case.id,
    'protocol', created_case.protocol,
    'status', created_case.status,
    'version', created_case.version,
    'created_at', created_case.created_at,
    'idempotent', false
  );
END;
$$;

ALTER FUNCTION public.create_control_access_request(
  uuid, text, text, text, timestamptz, text, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.decide_control_access_request(
  uuid, integer, text, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) OWNER TO postgres;

REVOKE ALL ON FUNCTION public.create_control_access_request(
  uuid, text, text, text, timestamptz, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.decide_control_access_request(
  uuid, integer, text, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.create_control_access_request(
  uuid, text, text, text, timestamptz, text, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_control_access_request(
  uuid, integer, text, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) TO authenticated, service_role;

ALTER TABLE public.corporate_case_events OWNER TO postgres;
ALTER TABLE public.corporate_case_events ENABLE ROW LEVEL SECURITY;
ALTER FUNCTION public.corporate_case_events_are_immutable() OWNER TO postgres;

DROP TRIGGER IF EXISTS corporate_case_events_truncate_immutable
  ON public.corporate_case_events;
CREATE TRIGGER corporate_case_events_truncate_immutable
BEFORE TRUNCATE ON public.corporate_case_events
FOR EACH STATEMENT
EXECUTE FUNCTION public.corporate_case_events_are_immutable();

-- Event writes and reads are already mediated by owner-controlled SECURITY
-- DEFINER RPCs. Remove the remaining service-role table bypass entirely.
REVOKE ALL PRIVILEGES ON TABLE public.corporate_case_events
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.corporate_case_events_are_immutable()
FROM PUBLIC, anon, authenticated, service_role;

COMMENT ON FUNCTION public.create_control_access_request(
  uuid, text, text, text, timestamptz, text, text, uuid
) IS
  'Creates a delegated Control access request with a complete idempotency fingerprint and transaction-scoped serialization.';
COMMENT ON FUNCTION public.decide_control_access_request(
  uuid, integer, text, text, uuid
) IS
  'Records an access approval decision; decision reason participates in the idempotency fingerprint.';
COMMENT ON FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) IS
  'Atomically creates an access-release case with a complete idempotency fingerprint and transaction-scoped serialization.';

COMMIT;
