-- Execute after 20260824017000_corporate_case_workflow.sql.
-- Synthetic identities, cases and runtime changes are rolled back.

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
    'public.get_corporate_case_action_context(uuid)',
    'public.claim_corporate_case_task(uuid,uuid,integer,integer,uuid)',
    'public.advance_corporate_case_task(uuid,uuid,integer,integer,text,text,uuid[],uuid)'
  ] LOOP
    IF has_function_privilege('anon', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon can execute %', function_signature;
    END IF;
    IF NOT has_function_privilege('authenticated', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: authenticated cannot execute %', function_signature;
    END IF;
  END LOOP;

  IF (SELECT workflow_enabled FROM public.corporate_case_runtime_settings WHERE singleton) THEN
    RAISE EXCEPTION 'FAIL: workflow must remain disabled by default';
  END IF;
END;
$$;

INSERT INTO auth.users(id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'workflow-owner@example.test', '{"name":"Owner"}', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000002', 'workflow-beneficiary@example.test', '{"name":"Beneficiário"}', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000003', 'workflow-triager@example.test', '{"name":"Triagem"}', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000004', 'workflow-reviewer@example.test', '{"name":"Validação"}', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000005', 'workflow-approver-one@example.test', '{"name":"Aprovador Um"}', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000006', 'workflow-approver-two@example.test', '{"name":"Aprovador Dois"}', now(), now(), now()),
  ('c0000000-0000-4000-8000-000000000007', 'workflow-approver-three@example.test', '{"name":"Aprovador Três"}', now(), now(), now());

SELECT set_config('cutsync.governance_access_reason', 'Fixture de workflow corporativo', true);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  ('c0000000-0000-4000-8000-000000000001', 'SaaS_Editor', 'c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000002', 'SaaS_Viewer', 'c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000003', 'SaaS_Editor', 'c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000004', 'SaaS_Editor', 'c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000005', 'SaaS_Owner', 'c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000006', 'SaaS_Viewer', 'c0000000-0000-4000-8000-000000000001'),
  ('c0000000-0000-4000-8000-000000000007', 'SaaS_Viewer', 'c0000000-0000-4000-8000-000000000001');

INSERT INTO public.control_user_access_assignments(
  target_profile_id,
  access_profile_id,
  source_type,
  source_key,
  scope_type,
  granted_by
)
SELECT
  fixture.profile_id,
  access_profile.id,
  'migration',
  fixture.source_key,
  'global',
  'c0000000-0000-4000-8000-000000000001'
FROM (VALUES
  ('c0000000-0000-4000-8000-000000000006'::uuid, 'workflow-approver-two-capability'),
  ('c0000000-0000-4000-8000-000000000007'::uuid, 'workflow-approver-three-capability')
) AS fixture(profile_id, source_key)
CROSS JOIN public.control_access_profiles AS access_profile
WHERE access_profile.profile_key = 'security_reviewer';

INSERT INTO public.corporate_work_group_members(
  group_id, profile_id, member_role, can_receive, active
)
SELECT work_group.id, fixture.profile_id, 'member', true, true
FROM (VALUES
  ('access_intake', 'c0000000-0000-4000-8000-000000000003'::uuid),
  ('access_review', 'c0000000-0000-4000-8000-000000000004'::uuid),
  ('access_approvers', 'c0000000-0000-4000-8000-000000000005'::uuid),
  ('access_approvers', 'c0000000-0000-4000-8000-000000000006'::uuid),
  ('access_approvers', 'c0000000-0000-4000-8000-000000000007'::uuid)
) AS fixture(group_key, profile_id)
JOIN public.corporate_work_groups AS work_group ON work_group.group_key = fixture.group_key;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('c0000000-0000-4000-8000-000000000005', 'aal2');
SELECT public.set_corporate_case_runtime_settings(
  true, true, true, false, false, false, 1,
  'Habilitação transacional do runtime para validar o workflow corporativo.',
  'c2000000-0000-4000-8000-000000000001'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('c0000000-0000-4000-8000-000000000001', 'aal2');

DO $$
DECLARE
  created jsonb;
  action_context jsonb;
  mutation jsonb;
  repeated jsonb;
  case_id uuid;
  task_id uuid;
  next_task_id uuid;
BEGIN
  created := public.create_corporate_access_case(
    'c0000000-0000-4000-8000-000000000002',
    'access_administrator',
    'grant',
    NULL,
    now() + interval '30 days',
    'Acesso financeiro necessário para conciliação e acompanhamento operacional controlado.',
    ARRAY[]::uuid[],
    'c1000000-0000-4000-8000-000000000001'
  );
  case_id := (created->>'case_id')::uuid;

  PERFORM pg_temp.set_actor('c0000000-0000-4000-8000-000000000003', 'aal2');
  action_context := public.get_corporate_case_action_context(case_id);
  IF NOT coalesce((action_context->>'can_claim')::boolean, false)
     OR action_context->'eligible_approvers' <> '[]'::jsonb
  THEN
    RAISE EXCEPTION 'FAIL: triage action context is invalid %', action_context;
  END IF;
  task_id := (action_context->'task'->>'task_id')::uuid;

  mutation := public.claim_corporate_case_task(
    case_id, task_id, 1, 1, 'c2000000-0000-4000-8000-000000000001'
  );
  IF mutation->>'status' <> 'triage' OR (mutation->>'case_version')::integer <> 2 THEN
    RAISE EXCEPTION 'FAIL: triage claim failed %', mutation;
  END IF;

  repeated := public.claim_corporate_case_task(
    case_id, task_id, 1, 1, 'c2000000-0000-4000-8000-000000000001'
  );
  IF NOT coalesce((repeated->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: claim retry was not idempotent %', repeated;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.claim_corporate_case_task(%L,%L,1,1,%L)',
      case_id, task_id, 'c2000000-0000-4000-8000-000000000002'::uuid
    ),
    'version_conflict'
  );

  mutation := public.advance_corporate_case_task(
    case_id,
    task_id,
    2,
    2,
    'advance',
    'Triagem concluída; identidade, pacote solicitado e justificativa foram conferidos.',
    ARRAY[]::uuid[],
    'c3000000-0000-4000-8000-000000000001'
  );
  IF mutation->>'status' <> 'review' THEN
    RAISE EXCEPTION 'FAIL: triage did not advance to review %', mutation;
  END IF;
  next_task_id := (mutation->>'next_task_id')::uuid;

  PERFORM pg_temp.set_actor('c0000000-0000-4000-8000-000000000004', 'aal2');
  action_context := public.get_corporate_case_action_context(case_id);
  IF (action_context->'task'->>'task_id')::uuid <> next_task_id
     OR NOT coalesce((action_context->>'can_claim')::boolean, false)
  THEN
    RAISE EXCEPTION 'FAIL: review action context is invalid %', action_context;
  END IF;

  mutation := public.claim_corporate_case_task(
    case_id, next_task_id, 3, 1, 'c2000000-0000-4000-8000-000000000003'
  );
  IF mutation->>'status' <> 'review' THEN
    RAISE EXCEPTION 'FAIL: review claim failed %', mutation;
  END IF;

  action_context := public.get_corporate_case_action_context(case_id);
  IF NOT coalesce((action_context->>'can_advance')::boolean, false)
     OR (action_context->'next_stage'->>'required_approvals')::integer <> 2
     OR NOT coalesce((action_context->'next_stage'->>'requires_owner_approval')::boolean, false)
     OR jsonb_array_length(action_context->'eligible_approvers') <> 3
  THEN
    RAISE EXCEPTION 'FAIL: nominal approval context is invalid %', action_context;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.advance_corporate_case_task(%L,%L,4,2,%L,%L,ARRAY[%L]::uuid[],%L)',
      case_id,
      next_task_id,
      'advance',
      'Apenas uma pessoa foi selecionada, portanto a cardinalidade deve ser rejeitada.',
      'c0000000-0000-4000-8000-000000000005'::uuid,
      'c3000000-0000-4000-8000-000000000002'::uuid
    ),
    'approver_count_invalid'
  );

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.advance_corporate_case_task(%L,%L,4,2,%L,%L,ARRAY[%L,%L]::uuid[],%L)',
      case_id,
      next_task_id,
      'advance',
      'A seleção contém duas pessoas válidas, mas nenhuma possui o papel obrigatório de Owner.',
      'c0000000-0000-4000-8000-000000000006'::uuid,
      'c0000000-0000-4000-8000-000000000007'::uuid,
      'c3000000-0000-4000-8000-000000000005'::uuid
    ),
    'owner_approver_required'
  );

  mutation := public.advance_corporate_case_task(
    case_id,
    next_task_id,
    4,
    2,
    'advance',
    'Necessidade validada e encaminhada aos aprovadores independentes definidos nominalmente.',
    ARRAY[
      'c0000000-0000-4000-8000-000000000005',
      'c0000000-0000-4000-8000-000000000006'
    ]::uuid[],
    'c3000000-0000-4000-8000-000000000003'
  );
  IF mutation->>'status' <> 'awaiting_approval' OR (mutation->>'case_version')::integer <> 5 THEN
    RAISE EXCEPTION 'FAIL: review did not advance to approval %', mutation;
  END IF;

  repeated := public.advance_corporate_case_task(
    case_id,
    next_task_id,
    4,
    2,
    'advance',
    'Necessidade validada e encaminhada aos aprovadores independentes definidos nominalmente.',
    ARRAY[
      'c0000000-0000-4000-8000-000000000005',
      'c0000000-0000-4000-8000-000000000006'
    ]::uuid[],
    'c3000000-0000-4000-8000-000000000003'
  );
  IF NOT coalesce((repeated->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: advance retry was not idempotent %', repeated;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.advance_corporate_case_task(%L,%L,4,2,%L,%L,ARRAY[%L,%L]::uuid[],%L)',
      case_id,
      next_task_id,
      'advance',
      'A mesma chave não pode ser reutilizada com uma justificativa diferente da original.',
      'c0000000-0000-4000-8000-000000000005'::uuid,
      'c0000000-0000-4000-8000-000000000006'::uuid,
      'c3000000-0000-4000-8000-000000000003'::uuid
    ),
    'idempotency_conflict'
  );
  PERFORM set_config('test.routed_case_id', case_id::text, true);
END;
$$;

SELECT pg_temp.set_actor('c0000000-0000-4000-8000-000000000001', 'aal2');

DO $$
DECLARE
  created jsonb;
  action_context jsonb;
  case_id uuid;
  task_id uuid;
  mutation jsonb;
BEGIN
  created := public.create_corporate_access_case(
    'c0000000-0000-4000-8000-000000000002',
    'commercial_analyst',
    'grant',
    NULL,
    NULL,
    'Acesso comercial solicitado para cenário sintético de rejeição controlada do chamado.',
    ARRAY[]::uuid[],
    'c1000000-0000-4000-8000-000000000002'
  );
  case_id := (created->>'case_id')::uuid;

  PERFORM pg_temp.set_actor('c0000000-0000-4000-8000-000000000003', 'aal2');
  action_context := public.get_corporate_case_action_context(case_id);
  task_id := (action_context->'task'->>'task_id')::uuid;
  PERFORM public.claim_corporate_case_task(
    case_id, task_id, 1, 1, 'c2000000-0000-4000-8000-000000000004'
  );
  mutation := public.advance_corporate_case_task(
    case_id,
    task_id,
    2,
    2,
    'reject',
    'Solicitação rejeitada porque a necessidade apresentada não atende ao princípio do menor privilégio.',
    ARRAY[]::uuid[],
    'c3000000-0000-4000-8000-000000000004'
  );
  IF mutation->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL: rejection failed %', mutation;
  END IF;
END;
$$;

SELECT pg_temp.set_actor('c0000000-0000-4000-8000-000000000003', 'aal1');
SELECT pg_temp.expect_error(
  format(
    'SELECT public.get_corporate_case_action_context(%L)',
    current_setting('test.routed_case_id')::uuid
  ),
  'aal2_required'
);

RESET ROLE;

DO $$
DECLARE
  routed_case_id uuid;
  rejected_case_id uuid;
  approval_task_id uuid;
BEGIN
  SELECT id INTO STRICT routed_case_id
  FROM public.corporate_cases
  WHERE client_request_id = 'c1000000-0000-4000-8000-000000000001';

  SELECT id INTO STRICT rejected_case_id
  FROM public.corporate_cases
  WHERE client_request_id = 'c1000000-0000-4000-8000-000000000002';

  SELECT id INTO STRICT approval_task_id
  FROM public.corporate_case_tasks
  WHERE case_id = routed_case_id AND task_type = 'approval';

  IF (SELECT status FROM public.corporate_cases WHERE id = routed_case_id) <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'FAIL: routed case status mismatch';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_approval_slots WHERE task_id = approval_task_id) <> 2 THEN
    RAISE EXCEPTION 'FAIL: exact nominal approval slots were not created';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.corporate_case_approval_slots
    WHERE task_id = approval_task_id
      AND requested_approver_profile_id NOT IN (
        'c0000000-0000-4000-8000-000000000005',
        'c0000000-0000-4000-8000-000000000006'
      )
  ) THEN
    RAISE EXCEPTION 'FAIL: unexpected nominal approver';
  END IF;
  IF (SELECT status FROM public.corporate_cases WHERE id = rejected_case_id) <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL: rejected case status mismatch';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.corporate_case_messages
    WHERE case_id = rejected_case_id AND visibility = 'internal'
  ) THEN
    RAISE EXCEPTION 'FAIL: rejection reason was not kept as an internal note';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.corporate_case_events
    WHERE case_id IN (routed_case_id, rejected_case_id)
      AND payload ? 'reason'
  ) THEN
    RAISE EXCEPTION 'FAIL: immutable event leaked a reason';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.corporate_case_sla_instances
    WHERE case_id = rejected_case_id AND status IN ('pending', 'running', 'paused')
  ) THEN
    RAISE EXCEPTION 'FAIL: rejection left an active SLA';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.control_access_requests
    WHERE client_request_id IN (
      'c1000000-0000-4000-8000-000000000001',
      'c1000000-0000-4000-8000-000000000002'
    )
  ) THEN
    RAISE EXCEPTION 'FAIL: workflow must not create legacy access requests';
  END IF;
END;
$$;

ROLLBACK;
