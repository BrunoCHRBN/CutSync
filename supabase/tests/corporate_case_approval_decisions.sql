-- Execute after 20260824018000_corporate_case_approval_decisions.sql.
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
    'public.list_corporate_case_approval_candidates(uuid,uuid)',
    'public.get_corporate_case_approval_context(uuid)',
    'public.decide_corporate_case_approval(uuid,uuid,uuid,integer,integer,integer,text,text,uuid)'
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
  ('e0000000-0000-4000-8000-000000000001', 'approval-requester@example.test', '{"name":"Solicitante"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000002', 'approval-beneficiary@example.test', '{"name":"Beneficiário"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000003', 'approval-triager@example.test', '{"name":"Triagem"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000004', 'approval-reviewer@example.test', '{"name":"Validação"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000005', 'approval-owner@example.test', '{"name":"Aprovador Owner"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000006', 'approval-security@example.test', '{"name":"Aprovador Segurança"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000007', 'approval-fulfillment@example.test', '{"name":"Execução"}', now(), now(), now()),
  ('e0000000-0000-4000-8000-000000000008', 'approval-ineligible@example.test', '{"name":"Sem Capability"}', now(), now(), now());

SELECT set_config('cutsync.governance_access_reason', 'Fixture de decisões corporativas', true);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  ('e0000000-0000-4000-8000-000000000001', 'SaaS_Editor', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000002', 'SaaS_Viewer', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000003', 'SaaS_Editor', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000004', 'SaaS_Editor', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000005', 'SaaS_Owner', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000006', 'SaaS_Viewer', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000007', 'SaaS_Viewer', 'e0000000-0000-4000-8000-000000000001'),
  ('e0000000-0000-4000-8000-000000000008', 'SaaS_Viewer', 'e0000000-0000-4000-8000-000000000001');

INSERT INTO public.control_user_access_assignments(
  target_profile_id, access_profile_id, source_type, source_key, scope_type, granted_by
)
SELECT
  fixture.profile_id,
  access_profile.id,
  'migration',
  fixture.source_key,
  'global',
  'e0000000-0000-4000-8000-000000000001'
FROM (VALUES
  ('e0000000-0000-4000-8000-000000000006'::uuid, 'approval-security-capability', 'security_reviewer'),
  ('e0000000-0000-4000-8000-000000000007'::uuid, 'approval-fulfillment-capability', 'access_administrator')
) AS fixture(profile_id, source_key, profile_key)
JOIN public.control_access_profiles AS access_profile
  ON access_profile.profile_key = fixture.profile_key;

INSERT INTO public.corporate_work_group_members(
  group_id, profile_id, member_role, can_receive, active
)
SELECT work_group.id, fixture.profile_id, 'member', true, true
FROM (VALUES
  ('access_intake', 'e0000000-0000-4000-8000-000000000003'::uuid),
  ('access_review', 'e0000000-0000-4000-8000-000000000004'::uuid),
  ('access_approvers', 'e0000000-0000-4000-8000-000000000005'::uuid),
  ('access_approvers', 'e0000000-0000-4000-8000-000000000006'::uuid),
  ('access_approvers', 'e0000000-0000-4000-8000-000000000008'::uuid),
  ('access_fulfillment', 'e0000000-0000-4000-8000-000000000007'::uuid)
) AS fixture(group_key, profile_id)
JOIN public.corporate_work_groups AS work_group ON work_group.group_key = fixture.group_key;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('e0000000-0000-4000-8000-000000000005', 'aal2');
SELECT public.set_corporate_case_runtime_settings(
  true, true, true, false, false, false, 1,
  'Habilitação transacional do runtime para validar decisões corporativas.',
  'e2000000-0000-4000-8000-000000000001'
);
RESET ROLE;

CREATE OR REPLACE FUNCTION pg_temp.prepare_review(target_client_request_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  created jsonb;
  context_payload jsonb;
  mutation jsonb;
  case_id uuid;
  task_id uuid;
BEGIN
  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000001', 'aal2');
  created := public.create_corporate_access_case(
    'e0000000-0000-4000-8000-000000000002',
    'finance_manager',
    'grant',
    NULL,
    now() + interval '30 days',
    'Acesso financeiro gerencial solicitado para validar o fluxo nominal de aprovações.',
    ARRAY[]::uuid[],
    target_client_request_id
  );
  case_id := (created->>'case_id')::uuid;

  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000003', 'aal2');
  context_payload := public.get_corporate_case_action_context(case_id);
  task_id := (context_payload->'task'->>'task_id')::uuid;
  PERFORM public.claim_corporate_case_task(case_id, task_id, 1, 1, gen_random_uuid());
  mutation := public.advance_corporate_case_task(
    case_id, task_id, 2, 2, 'advance',
    'Triagem concluída após conferência da identidade e do pacote solicitado.',
    ARRAY[]::uuid[], gen_random_uuid()
  );

  task_id := (mutation->>'next_task_id')::uuid;
  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000004', 'aal2');
  PERFORM public.claim_corporate_case_task(case_id, task_id, 3, 1, gen_random_uuid());

  RETURN jsonb_build_object('case_id', case_id, 'review_task_id', task_id);
END;
$$;

SET LOCAL ROLE authenticated;

DO $$
DECLARE
  prepared jsonb;
  mutation jsonb;
  approval_context jsonb;
  repeated jsonb;
  case_id uuid;
  review_task_id uuid;
  approval_task_id uuid;
  owner_slot_id uuid;
  security_slot_id uuid;
BEGIN
  prepared := pg_temp.prepare_review('e1000000-0000-4000-8000-000000000001');
  case_id := (prepared->>'case_id')::uuid;
  review_task_id := (prepared->>'review_task_id')::uuid;

  IF (
    SELECT count(*)
    FROM public.list_corporate_case_approval_candidates(case_id, review_task_id)
  ) <> 2 THEN
    RAISE EXCEPTION 'FAIL: candidates must exclude group members without approval capability';
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.advance_corporate_case_task(%L,%L,4,2,%L,%L,ARRAY[%L,%L]::uuid[],%L)',
      case_id,
      review_task_id,
      'advance',
      'Seleção sintética contendo uma pessoa sem a capability corporativa de aprovação.',
      'e0000000-0000-4000-8000-000000000005'::uuid,
      'e0000000-0000-4000-8000-000000000008'::uuid,
      'e2000000-0000-4000-8000-000000000001'::uuid
    ),
    'approver_ineligible'
  );

  mutation := public.advance_corporate_case_task(
    case_id,
    review_task_id,
    4,
    2,
    'advance',
    'Necessidade validada e encaminhada aos dois aprovadores nominais elegíveis.',
    ARRAY[
      'e0000000-0000-4000-8000-000000000005',
      'e0000000-0000-4000-8000-000000000006'
    ]::uuid[],
    'e2000000-0000-4000-8000-000000000002'
  );
  approval_task_id := (mutation->>'next_task_id')::uuid;

  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000005', 'aal2');
  approval_context := public.get_corporate_case_approval_context(case_id);
  owner_slot_id := (approval_context->'approval'->>'approval_id')::uuid;
  IF NOT coalesce((approval_context->>'can_decide')::boolean, false)
     OR owner_slot_id IS NULL
  THEN
    RAISE EXCEPTION 'FAIL: owner approval context is invalid %', approval_context;
  END IF;

  mutation := public.decide_corporate_case_approval(
    case_id,
    approval_task_id,
    owner_slot_id,
    5,
    1,
    1,
    'approve',
    'Aprovação Owner registrada após avaliação do risco e do menor privilégio.',
    'e3000000-0000-4000-8000-000000000001'
  );
  IF mutation->>'status' <> 'awaiting_approval'
     OR (mutation->>'approved_count')::integer <> 1
  THEN
    RAISE EXCEPTION 'FAIL: first approval must remain partial %', mutation;
  END IF;

  repeated := public.decide_corporate_case_approval(
    case_id,
    approval_task_id,
    owner_slot_id,
    5,
    1,
    1,
    'approve',
    'Aprovação Owner registrada após avaliação do risco e do menor privilégio.',
    'e3000000-0000-4000-8000-000000000001'
  );
  IF NOT coalesce((repeated->>'idempotent')::boolean, false) THEN
    RAISE EXCEPTION 'FAIL: approval retry was not idempotent %', repeated;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.decide_corporate_case_approval(%L,%L,%L,5,1,1,%L,%L,%L)',
      case_id,
      approval_task_id,
      owner_slot_id,
      'approve',
      'A mesma chave não pode aceitar uma justificativa diferente da decisão original.',
      'e3000000-0000-4000-8000-000000000001'::uuid
    ),
    'idempotency_conflict'
  );

  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000006', 'aal2');
  approval_context := public.get_corporate_case_approval_context(case_id);
  security_slot_id := (approval_context->'approval'->>'approval_id')::uuid;
  mutation := public.decide_corporate_case_approval(
    case_id,
    approval_task_id,
    security_slot_id,
    (approval_context->>'case_version')::integer,
    (approval_context->'task'->>'task_version')::integer,
    (approval_context->'approval'->>'approval_version')::integer,
    'approve',
    'Aprovação de segurança registrada após conferência da necessidade e segregação.',
    'e3000000-0000-4000-8000-000000000002'
  );
  IF mutation->>'status' <> 'fulfillment'
     OR mutation->>'next_task_id' IS NULL
     OR (mutation->>'approved_count')::integer <> 2
  THEN
    RAISE EXCEPTION 'FAIL: approvals were not consolidated into fulfillment %', mutation;
  END IF;
END;
$$;

DO $$
DECLARE
  prepared jsonb;
  mutation jsonb;
  approval_context jsonb;
  case_id uuid;
  review_task_id uuid;
  approval_task_id uuid;
  security_slot_id uuid;
BEGIN
  prepared := pg_temp.prepare_review('e1000000-0000-4000-8000-000000000002');
  case_id := (prepared->>'case_id')::uuid;
  review_task_id := (prepared->>'review_task_id')::uuid;

  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000004', 'aal2');
  mutation := public.advance_corporate_case_task(
    case_id,
    review_task_id,
    4,
    2,
    'advance',
    'Segunda necessidade validada para exercitar a rejeição nominal do fluxo.',
    ARRAY[
      'e0000000-0000-4000-8000-000000000005',
      'e0000000-0000-4000-8000-000000000006'
    ]::uuid[],
    'e2000000-0000-4000-8000-000000000003'
  );
  approval_task_id := (mutation->>'next_task_id')::uuid;

  PERFORM pg_temp.set_actor('e0000000-0000-4000-8000-000000000006', 'aal2');
  approval_context := public.get_corporate_case_approval_context(case_id);
  security_slot_id := (approval_context->'approval'->>'approval_id')::uuid;
  mutation := public.decide_corporate_case_approval(
    case_id,
    approval_task_id,
    security_slot_id,
    5,
    1,
    1,
    'reject',
    'Solicitação rejeitada porque a justificativa não demonstrou necessidade suficiente.',
    'e3000000-0000-4000-8000-000000000003'
  );
  IF mutation->>'status' <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL: nominal rejection did not reject the case %', mutation;
  END IF;
  PERFORM set_config('test.rejected_case_id', case_id::text, true);
END;
$$;

SELECT pg_temp.set_actor('e0000000-0000-4000-8000-000000000006', 'aal1');
SELECT pg_temp.expect_error(
  format(
    'SELECT public.get_corporate_case_approval_context(%L)',
    current_setting('test.rejected_case_id')::uuid
  ),
  'aal2_required'
);

RESET ROLE;

DO $$
DECLARE
  fulfilled_case_id uuid;
  rejected_case_id uuid;
BEGIN
  SELECT id INTO STRICT fulfilled_case_id
  FROM public.corporate_cases
  WHERE client_request_id = 'e1000000-0000-4000-8000-000000000001';
  SELECT id INTO STRICT rejected_case_id
  FROM public.corporate_cases
  WHERE client_request_id = 'e1000000-0000-4000-8000-000000000002';

  IF (SELECT status FROM public.corporate_cases WHERE id = fulfilled_case_id) <> 'fulfillment' THEN
    RAISE EXCEPTION 'FAIL: fulfilled case status mismatch';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_tasks WHERE case_id = fulfilled_case_id AND task_type = 'fulfillment') <> 1 THEN
    RAISE EXCEPTION 'FAIL: fulfillment task missing';
  END IF;
  IF (SELECT status FROM public.corporate_cases WHERE id = rejected_case_id) <> 'rejected' THEN
    RAISE EXCEPTION 'FAIL: rejected case status mismatch';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_approval_slots AS slot
      JOIN public.corporate_case_tasks AS task ON task.id = slot.task_id
      WHERE task.case_id = rejected_case_id AND slot.decision = 'cancelled') <> 1 THEN
    RAISE EXCEPTION 'FAIL: rejection did not cancel the remaining slot';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.corporate_case_sla_instances
    WHERE case_id = rejected_case_id AND status IN ('pending', 'running', 'paused')
  ) THEN
    RAISE EXCEPTION 'FAIL: rejection left active SLA instances';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.corporate_case_events
    WHERE case_id IN (fulfilled_case_id, rejected_case_id) AND payload ? 'reason'
  ) THEN
    RAISE EXCEPTION 'FAIL: immutable approval event leaked a reason';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.control_access_requests
    WHERE client_request_id IN (
      'e1000000-0000-4000-8000-000000000001',
      'e1000000-0000-4000-8000-000000000002'
    )
  ) THEN
    RAISE EXCEPTION 'FAIL: approval cut must not create legacy access requests';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    JOIN public.control_access_profiles AS access_profile ON access_profile.id = assignment.access_profile_id
    WHERE assignment.target_profile_id = 'e0000000-0000-4000-8000-000000000002'
      AND access_profile.profile_key = 'finance_manager'
      AND assignment.active
  ) THEN
    RAISE EXCEPTION 'FAIL: approval cut must not apply the requested access';
  END IF;
END;
$$;

ROLLBACK;
