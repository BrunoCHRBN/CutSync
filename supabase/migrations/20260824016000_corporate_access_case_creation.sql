-- Controlled creation API for the first corporate case pilot: access release.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

CREATE TABLE public.corporate_case_access_requests (
  case_id uuid PRIMARY KEY
    REFERENCES public.corporate_cases(id) ON DELETE RESTRICT,
  requested_access_profile_id uuid NOT NULL
    REFERENCES public.control_access_profiles(id) ON DELETE RESTRICT,
  source_access_profile_id uuid
    REFERENCES public.control_access_profiles(id) ON DELETE RESTRICT,
  requested_action text NOT NULL CHECK (requested_action IN ('grant', 'revoke')),
  requested_valid_until timestamptz,
  legacy_access_request_id uuid UNIQUE
    REFERENCES public.control_access_requests(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT corporate_case_access_requests_validity CHECK (
    requested_valid_until IS NULL OR requested_valid_until > created_at
  )
);

CREATE INDEX corporate_case_access_requests_profile_idx
  ON public.corporate_case_access_requests(requested_access_profile_id, requested_action);
CREATE INDEX corporate_case_access_requests_source_profile_idx
  ON public.corporate_case_access_requests(source_access_profile_id)
  WHERE source_access_profile_id IS NOT NULL;

ALTER TABLE public.corporate_case_access_requests ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER corporate_case_access_requests_touch_updated_at
BEFORE UPDATE ON public.corporate_case_access_requests
FOR EACH ROW EXECUTE FUNCTION public.corporate_cases_touch_updated_at();

REVOKE ALL ON TABLE public.corporate_case_access_requests
FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.corporate_case_access_requests TO service_role;

INSERT INTO public.corporate_notification_templates(
  template_key,
  channel,
  version,
  subject_template,
  body_template,
  active
)
VALUES (
  'corporate_case.assigned',
  'email',
  1,
  'Nova ação pendente no CutSync Cloud',
  'Há uma nova ação atribuída à sua equipe. Acesse o CutSync Cloud para consultar o chamado. O conteúdo e a autorização serão carregados somente após autenticação.',
  true
)
ON CONFLICT (template_key, channel, version) DO UPDATE
SET subject_template = EXCLUDED.subject_template,
    body_template = EXCLUDED.body_template,
    active = true,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.list_corporate_access_request_profiles()
RETURNS TABLE (
  profile_id uuid,
  profile_key text,
  label text,
  description text,
  risk_level text,
  required_approvals smallint,
  requires_owner_approval boolean,
  requires_expiry boolean,
  review_interval_days smallint
)
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
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  IF NOT ('control.cases.request' = ANY(actor_permissions)) THEN
    RAISE EXCEPTION 'forbidden';
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

  RETURN QUERY
  SELECT
    access_profile.id,
    access_profile.profile_key,
    access_profile.label,
    access_profile.description,
    access_profile.risk_level,
    access_profile.required_approvals,
    access_profile.requires_owner_approval,
    access_profile.requires_expiry,
    access_profile.review_interval_days
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.assignment_mode = 'delegated'
    AND access_profile.active
  ORDER BY
    CASE access_profile.risk_level
      WHEN 'low' THEN 1
      WHEN 'moderate' THEN 2
      WHEN 'high' THEN 3
      ELSE 4
    END,
    access_profile.label,
    access_profile.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.find_corporate_case_participant_by_email(
  target_email text
)
RETURNS TABLE (
  profile_id uuid,
  name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_context jsonb;
  actor_permissions text[];
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  normalized_email text := lower(btrim(coalesce(target_email, '')));
BEGIN
  actor_context := public.get_control_context();

  SELECT coalesce(array_agg(permission_value), ARRAY[]::text[])
  INTO actor_permissions
  FROM jsonb_array_elements_text(actor_context->'permissions') AS permission(permission_value);

  IF NOT ('control.cases.request' = ANY(actor_permissions)) THEN
    RAISE EXCEPTION 'forbidden';
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
  IF normalized_email = '' OR char_length(normalized_email) > 320 THEN
    RAISE EXCEPTION 'corporate_case_email_required';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    coalesce(profile.name, 'Usuário'),
    profile.email
  FROM public.profiles AS profile
  JOIN public.governance_users AS governance_user
    ON governance_user.profile_id = profile.id
  WHERE lower(profile.email) = normalized_email
    AND profile.deleted_at IS NULL
  ORDER BY profile.id
  LIMIT 1;
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
  IF target_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'invalid_corporate_access_action';
  END IF;
  IF normalized_profile_key = '' THEN
    RAISE EXCEPTION 'corporate_access_profile_required';
  END IF;
  IF char_length(normalized_justification) NOT BETWEEN 20 AND 2000 THEN
    RAISE EXCEPTION 'corporate_access_justification_required';
  END IF;
  IF target_valid_until IS NOT NULL
     AND (target_valid_until <= now() OR target_valid_until > now() + interval '366 days')
  THEN
    RAISE EXCEPTION 'corporate_access_expiry_invalid';
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
       OR existing_case.requested_action <> target_action
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

REVOKE ALL ON FUNCTION public.list_corporate_access_request_profiles()
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.find_corporate_case_participant_by_email(text)
FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.list_corporate_access_request_profiles()
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_corporate_case_participant_by_email(text)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) TO authenticated, service_role;

COMMENT ON TABLE public.corporate_case_access_requests IS
  'Structured access-request projection for corporate cases; legacy linkage stays nullable until the controlled cutover.';
COMMENT ON FUNCTION public.list_corporate_access_request_profiles() IS
  'Lists delegated access packages available to a creation-enabled AAL2 corporate case requester.';
COMMENT ON FUNCTION public.find_corporate_case_participant_by_email(text) IS
  'Performs an exact-email lookup of an active Control identity for beneficiary or observer selection.';
COMMENT ON FUNCTION public.create_corporate_access_case(
  uuid, text, text, text, timestamptz, text, uuid[], uuid
) IS
  'Atomically creates an idempotent access-release case with participants, initial routing task, SLA, immutable event and notifications.';

COMMIT;
