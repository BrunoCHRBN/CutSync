-- Execute after 20260824019000_corporate_case_access_fulfillment.sql.
-- Synthetic identities, access changes and runtime settings are rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
    IF position(expected_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
    END IF;
END;
$$;

DO $$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_corporate_case_fulfillment_context(uuid)',
    'public.list_corporate_case_fulfillment_queue(text,text,text,integer,timestamptz,uuid)',
    'public.claim_corporate_case_fulfillment(uuid,uuid,integer,integer,uuid)',
    'public.execute_corporate_access_fulfillment(uuid,uuid,integer,integer,text,text,uuid)'
  ] LOOP
    IF has_function_privilege('anon', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon can execute %', function_signature;
    END IF;
    IF NOT has_function_privilege('authenticated', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: authenticated cannot execute %', function_signature;
    END IF;
  END LOOP;
END;
$$;

INSERT INTO auth.users(id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('f0000000-0000-4000-8000-000000000001', 'fulfillment-requester@example.test', '{"name":"Solicitante"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000002', 'fulfillment-beneficiary@example.test', '{"name":"Beneficiário"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000003', 'fulfillment-triager@example.test', '{"name":"Triagem"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000004', 'fulfillment-reviewer@example.test', '{"name":"Validação"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000005', 'fulfillment-owner@example.test', '{"name":"Aprovador Owner"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000006', 'fulfillment-security@example.test', '{"name":"Aprovador Segurança"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000007', 'fulfillment-executor-a@example.test', '{"name":"Executor A"}', now(), now(), now()),
  ('f0000000-0000-4000-8000-000000000008', 'fulfillment-executor-b@example.test', '{"name":"Executor B"}', now(), now(), now());

SELECT set_config('cutsync.governance_access_reason', 'Fixture de execução corporativa', true);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  ('f0000000-0000-4000-8000-000000000001', 'SaaS_Editor', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000002', 'SaaS_Viewer', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000003', 'SaaS_Editor', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000004', 'SaaS_Editor', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000005', 'SaaS_Owner', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000006', 'SaaS_Viewer', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000007', 'SaaS_Viewer', 'f0000000-0000-4000-8000-000000000001'),
  ('f0000000-0000-4000-8000-000000000008', 'SaaS_Viewer', 'f0000000-0000-4000-8000-000000000001');

INSERT INTO public.control_user_access_assignments(
  target_profile_id, access_profile_id, source_type, source_key, scope_type, granted_by
)
SELECT fixture.profile_id, access_profile.id, 'migration', fixture.source_key, 'global',
       'f0000000-0000-4000-8000-000000000001'
FROM (VALUES
  ('f0000000-0000-4000-8000-000000000006'::uuid, 'fulfillment-security-capability', 'security_reviewer'),
  ('f0000000-0000-4000-8000-000000000007'::uuid, 'fulfillment-executor-a-capability', 'access_administrator'),
  ('f0000000-0000-4000-8000-000000000008'::uuid, 'fulfillment-executor-b-capability', 'access_administrator')
) AS fixture(profile_id, source_key, profile_key)
JOIN public.control_access_profiles AS access_profile
  ON access_profile.profile_key = fixture.profile_key;

INSERT INTO public.corporate_work_group_members(
  group_id, profile_id, member_role, can_receive, active
)
SELECT work_group.id, fixture.profile_id, 'member', true, true
FROM (VALUES
  ('access_intake', 'f0000000-0000-4000-8000-000000000003'::uuid),
  ('access_review', 'f0000000-0000-4000-8000-000000000004'::uuid),
  ('access_approvers', 'f0000000-0000-4000-8000-000000000005'::uuid),
  ('access_approvers', 'f0000000-0000-4000-8000-000000000006'::uuid),
  ('access_fulfillment', 'f0000000-0000-4000-8000-000000000007'::uuid),
  ('access_fulfillment', 'f0000000-0000-4000-8000-000000000008'::uuid)
) AS fixture(group_key, profile_id)
JOIN public.corporate_work_groups AS work_group ON work_group.group_key = fixture.group_key;

UPDATE public.corporate_case_runtime_settings
SET enabled = true,
    creation_enabled = true,
    workflow_enabled = true,
    automation_enabled = false,
    email_enabled = false,
    updated_by = 'f0000000-0000-4000-8000-000000000001'
WHERE singleton;

INSERT INTO public.corporate_cases(
  id, client_request_id, case_type_id, requester_profile_id, beneficiary_profile_id,
  routing_policy_id, routing_policy_version, risk_level, priority, sensitivity,
  status, current_stage_order, current_group_id, subject, summary, form_payload, expires_at
)
SELECT
  'f1000000-0000-4000-8000-000000000001',
  'f1100000-0000-4000-8000-000000000001',
  case_type.id,
  'f0000000-0000-4000-8000-000000000001',
  'f0000000-0000-4000-8000-000000000002',
  routing_policy.id,
  routing_policy.version,
  access_profile.risk_level,
  CASE access_profile.risk_level WHEN 'critical' THEN 'critical' WHEN 'high' THEN 'high' ELSE 'normal' END,
  case_type.sensitivity,
  'fulfillment',
  4,
  fulfillment_group.id,
  'Concessão de acesso financeiro gerencial',
  'Solicitação sintética aprovada para validar execução, falha e reprocessamento.',
  jsonb_build_object(
    'requested_action', 'grant',
    'requested_profile_key', access_profile.profile_key,
    'requested_valid_until', now() + interval '30 days'
  ),
  now() + interval '7 days'
FROM public.corporate_case_types AS case_type
JOIN public.control_access_profiles AS access_profile
  ON access_profile.profile_key = 'finance_manager'
JOIN public.corporate_case_routing_policies AS routing_policy
  ON routing_policy.case_type_id = case_type.id
 AND routing_policy.risk_level = access_profile.risk_level
 AND routing_policy.active
JOIN public.corporate_work_groups AS fulfillment_group
  ON fulfillment_group.group_key = 'access_fulfillment'
WHERE case_type.type_key = 'access_release';

INSERT INTO public.corporate_case_access_requests(
  case_id, requested_access_profile_id, requested_action, requested_valid_until
)
SELECT
  'f1000000-0000-4000-8000-000000000001',
  access_profile.id,
  'grant',
  now() + interval '30 days'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key = 'finance_manager';

INSERT INTO public.corporate_case_participants(
  case_id, profile_id, participant_role, notification_level, added_by
)
VALUES
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000001', 'requester', 'all', 'f0000000-0000-4000-8000-000000000001'),
  ('f1000000-0000-4000-8000-000000000001', 'f0000000-0000-4000-8000-000000000002', 'beneficiary', 'all', 'f0000000-0000-4000-8000-000000000001');

INSERT INTO public.corporate_case_tasks(
  id, case_id, stage_order, task_type, assigned_group_id, assigned_profile_id,
  status, due_at, completed_by, completed_at
)
VALUES
  (
    'f2000000-0000-4000-8000-000000000001',
    'f1000000-0000-4000-8000-000000000001', 1, 'triage',
    (SELECT id FROM public.corporate_work_groups WHERE group_key = 'access_intake'),
    'f0000000-0000-4000-8000-000000000003', 'completed', now() + interval '1 hour',
    'f0000000-0000-4000-8000-000000000003', now()
  ),
  (
    'f2000000-0000-4000-8000-000000000002',
    'f1000000-0000-4000-8000-000000000001', 2, 'review',
    (SELECT id FROM public.corporate_work_groups WHERE group_key = 'access_review'),
    'f0000000-0000-4000-8000-000000000004', 'completed', now() + interval '2 hours',
    'f0000000-0000-4000-8000-000000000004', now()
  ),
  (
    'f2000000-0000-4000-8000-000000000003',
    'f1000000-0000-4000-8000-000000000001', 3, 'approval',
    (SELECT id FROM public.corporate_work_groups WHERE group_key = 'access_approvers'),
    'f0000000-0000-4000-8000-000000000006', 'completed', now() + interval '3 hours',
    'f0000000-0000-4000-8000-000000000006', now()
  ),
  (
    'f2000000-0000-4000-8000-000000000004',
    'f1000000-0000-4000-8000-000000000001', 4, 'fulfillment',
    (SELECT id FROM public.corporate_work_groups WHERE group_key = 'access_fulfillment'),
    NULL, 'pending', now() + interval '4 hours', NULL, NULL
  );

INSERT INTO public.corporate_case_approval_slots(
  id, task_id, slot_order, requested_approver_profile_id, decision,
  decided_by, decision_reason, decided_at, due_at, approver_was_owner
)
VALUES
  (
    'f3000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000003', 1,
    'f0000000-0000-4000-8000-000000000005', 'approved',
    'f0000000-0000-4000-8000-000000000005', 'Aprovação Owner sintética.', now(),
    now() + interval '3 hours', true
  ),
  (
    'f3000000-0000-4000-8000-000000000002',
    'f2000000-0000-4000-8000-000000000003', 2,
    'f0000000-0000-4000-8000-000000000006', 'approved',
    'f0000000-0000-4000-8000-000000000006', 'Aprovação de segurança sintética.', now(),
    now() + interval '3 hours', false
  );

SET LOCAL ROLE authenticated;

SELECT pg_temp.set_actor('f0000000-0000-4000-8000-000000000003', 'aal2');
SELECT pg_temp.expect_error(
  'SELECT count(*) FROM public.list_corporate_case_fulfillment_queue()',
  'forbidden'
);

DO $$
DECLARE
  queue_row record;
  detail_payload jsonb;
  filtered_count integer;
  cursor_count integer;
BEGIN
  PERFORM pg_temp.set_actor('f0000000-0000-4000-8000-000000000007', 'aal2');

  SELECT *
  INTO STRICT queue_row
  FROM public.list_corporate_case_fulfillment_queue(
    NULL, 'due_soon', 'not_attempted', 50, NULL, NULL
  );

  IF queue_row.case_id <> 'f1000000-0000-4000-8000-000000000001'::uuid
     OR queue_row.task_id <> 'f2000000-0000-4000-8000-000000000004'::uuid
     OR queue_row.attempt_count <> 0
     OR queue_row.attempt_state <> 'not_attempted'
     OR NOT queue_row.can_claim
     OR queue_row.can_execute
  THEN
    RAISE EXCEPTION 'FAIL: fulfillment queue returned an invalid row %', row_to_json(queue_row);
  END IF;

  detail_payload := public.get_corporate_case_detail(queue_row.case_id);
  IF detail_payload->'case'->>'case_id' <> queue_row.case_id::text THEN
    RAISE EXCEPTION 'FAIL: eligible executor cannot open the queued case';
  END IF;

  SELECT count(*)::integer
  INTO filtered_count
  FROM public.list_corporate_case_fulfillment_queue(
    'low', NULL, NULL, 50, NULL, NULL
  );
  IF filtered_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: fulfillment priority filter leaked rows';
  END IF;

  SELECT count(*)::integer
  INTO cursor_count
  FROM public.list_corporate_case_fulfillment_queue(
    NULL, NULL, NULL, 50, queue_row.task_due_at, queue_row.task_id
  );
  IF cursor_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: fulfillment cursor repeated the last row';
  END IF;
END;
$$;

SELECT pg_temp.set_actor('f0000000-0000-4000-8000-000000000005', 'aal2');
SELECT pg_temp.expect_error(
  format(
    'SELECT public.claim_corporate_case_fulfillment(%L,%L,1,1,%L)',
    'f1000000-0000-4000-8000-000000000001'::uuid,
    'f2000000-0000-4000-8000-000000000004'::uuid,
    'f4000000-0000-4000-8000-000000000001'::uuid
  ),
  'corporate_case_fulfillment_separation_required'
);

DO $$
DECLARE
  context_payload jsonb;
  mutation jsonb;
  repeated jsonb;
BEGIN
  PERFORM pg_temp.set_actor('f0000000-0000-4000-8000-000000000007', 'aal2');
  context_payload := public.get_corporate_case_fulfillment_context(
    'f1000000-0000-4000-8000-000000000001'
  );
  IF NOT coalesce((context_payload->>'can_claim')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: eligible executor cannot claim %', context_payload;
  END IF;

  mutation := public.claim_corporate_case_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    1, 1, 'f4000000-0000-4000-8000-000000000002'
  );
  IF mutation->>'status' <> 'fulfillment' THEN
    RAISE EXCEPTION 'FAIL: claim did not preserve fulfillment %', mutation;
  END IF;

  mutation := public.execute_corporate_access_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    2, 2, 'defer',
    'Execução devolvida para validar reatribuição sem qualquer alteração de acesso.',
    'f4000000-0000-4000-8000-000000000003'
  );
  IF mutation->>'execution_status' <> 'deferred'
     OR mutation->>'status' <> 'fulfillment'
  THEN
    RAISE EXCEPTION 'FAIL: defer did not return execution to queue %', mutation;
  END IF;

  IF (
    SELECT count(*)
    FROM public.list_corporate_case_fulfillment_queue(
      NULL, NULL, 'deferred', 50, NULL, NULL
    )
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: deferred execution was not classified in the queue';
  END IF;

  repeated := public.execute_corporate_access_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    2, 2, 'defer',
    'Execução devolvida para validar reatribuição sem qualquer alteração de acesso.',
    'f4000000-0000-4000-8000-000000000003'
  );
  IF NOT coalesce((repeated->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: defer retry was not idempotent %', repeated;
  END IF;
END;
$$;

RESET ROLE;

INSERT INTO public.control_user_access_assignments(
  target_profile_id, access_profile_id, source_type, source_key, scope_type, granted_by
)
SELECT
  'f0000000-0000-4000-8000-000000000002', access_profile.id,
  'migration', 'fulfillment-conflicting-assignment', 'global',
  'f0000000-0000-4000-8000-000000000001'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key = 'finance_manager';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  mutation jsonb;
BEGIN
  PERFORM pg_temp.set_actor('f0000000-0000-4000-8000-000000000008', 'aal2');
  PERFORM public.claim_corporate_case_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    3, 3, 'f4000000-0000-4000-8000-000000000004'
  );
  mutation := public.execute_corporate_access_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    4, 4, 'apply',
    'Aplicação tentada para validar falha controlada e retorno seguro para reprocessamento.',
    'f4000000-0000-4000-8000-000000000005'
  );
  IF mutation->>'execution_status' <> 'failed'
     OR mutation->>'failure_code' <> 'control_assignment_already_active'
     OR mutation->>'status' <> 'fulfillment'
  THEN
    RAISE EXCEPTION 'FAIL: expected authority failure was not recorded %', mutation;
  END IF;
END;
$$;

RESET ROLE;

UPDATE public.control_user_access_assignments
SET active = false,
    revoked_at = now(),
    revoked_by = 'f0000000-0000-4000-8000-000000000001',
    updated_at = now()
WHERE target_profile_id = 'f0000000-0000-4000-8000-000000000002'
  AND source_key = 'fulfillment-conflicting-assignment';

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  mutation jsonb;
  repeated jsonb;
BEGIN
  PERFORM pg_temp.set_actor('f0000000-0000-4000-8000-000000000007', 'aal2');
  PERFORM public.claim_corporate_case_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    5, 5, 'f4000000-0000-4000-8000-000000000006'
  );
  mutation := public.execute_corporate_access_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    6, 6, 'apply',
    'Aplicação concluída após reconciliação da autoridade e conferência final da evidência.',
    'f4000000-0000-4000-8000-000000000007'
  );
  IF mutation->>'execution_status' <> 'applied'
     OR mutation->>'status' <> 'resolved'
     OR mutation->>'assignment_id' IS NULL
     OR mutation->>'legacy_access_request_id' IS NULL
  THEN
    RAISE EXCEPTION 'FAIL: reconciled execution was not applied %', mutation;
  END IF;

  repeated := public.execute_corporate_access_fulfillment(
    'f1000000-0000-4000-8000-000000000001',
    'f2000000-0000-4000-8000-000000000004',
    6, 6, 'apply',
    'Aplicação concluída após reconciliação da autoridade e conferência final da evidência.',
    'f4000000-0000-4000-8000-000000000007'
  );
  IF NOT coalesce((repeated->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: applied retry was not idempotent %', repeated;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.execute_corporate_access_fulfillment(%L,%L,6,6,%L,%L,%L)',
      'f1000000-0000-4000-8000-000000000001'::uuid,
      'f2000000-0000-4000-8000-000000000004'::uuid,
      'apply',
      'A mesma chave não pode aceitar uma justificativa de execução diferente.',
      'f4000000-0000-4000-8000-000000000007'::uuid
    ),
    'idempotency_conflict'
  );
END;
$$;

SELECT pg_temp.set_actor('f0000000-0000-4000-8000-000000000007', 'aal1');
SELECT pg_temp.expect_error(
  format(
    'SELECT public.get_corporate_case_fulfillment_context(%L)',
    'f1000000-0000-4000-8000-000000000001'::uuid
  ),
  'aal2_required'
);
SELECT pg_temp.expect_error(
  'SELECT count(*) FROM public.list_corporate_case_fulfillment_queue()',
  'aal2_required'
);

RESET ROLE;

DO $$
DECLARE
  legacy_request_id uuid;
BEGIN
  IF (SELECT status FROM public.corporate_cases
      WHERE id = 'f1000000-0000-4000-8000-000000000001') <> 'resolved' THEN
    RAISE EXCEPTION 'FAIL: applied case is not resolved';
  END IF;
  IF (SELECT status FROM public.corporate_case_tasks
      WHERE id = 'f2000000-0000-4000-8000-000000000004') <> 'completed' THEN
    RAISE EXCEPTION 'FAIL: fulfillment task is not completed';
  END IF;

  SELECT access_request.legacy_access_request_id
  INTO STRICT legacy_request_id
  FROM public.corporate_case_access_requests AS access_request
  WHERE access_request.case_id = 'f1000000-0000-4000-8000-000000000001';

  IF legacy_request_id IS NULL
     OR (SELECT status FROM public.control_access_requests WHERE id = legacy_request_id) <> 'applied'
  THEN
    RAISE EXCEPTION 'FAIL: legacy authority projection is not applied';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    JOIN public.control_access_profiles AS access_profile
      ON access_profile.id = assignment.access_profile_id
    WHERE assignment.target_profile_id = 'f0000000-0000-4000-8000-000000000002'
      AND access_profile.profile_key = 'finance_manager'
      AND assignment.source_type = 'approved_request'
      AND assignment.source_request_id = legacy_request_id
      AND assignment.active
      AND assignment.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: approved assignment was not created by the authority';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_events
      WHERE case_id = 'f1000000-0000-4000-8000-000000000001'
        AND event_type IN (
          'corporate_case.fulfillment_deferred',
          'corporate_case.fulfillment_failed',
          'corporate_case.fulfillment_applied'
        )) <> 3 THEN
    RAISE EXCEPTION 'FAIL: immutable fulfillment attempt history mismatch';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.corporate_case_events
    WHERE case_id = 'f1000000-0000-4000-8000-000000000001'
      AND payload ? 'reason'
  ) THEN
    RAISE EXCEPTION 'FAIL: fulfillment event leaked an internal reason';
  END IF;
END;
$$;

ROLLBACK;
