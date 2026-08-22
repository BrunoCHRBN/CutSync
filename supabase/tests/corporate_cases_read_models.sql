-- Execute after 20260824015000_corporate_cases_read_models.sql.
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
    json_build_object(
      'sub', actor_id,
      'role', 'authenticated',
      'aal', actor_aal
    )::text,
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
    IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN
      RAISE;
    END IF;
    IF position(expected_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION
        'FAIL: expected error containing %, got %',
        expected_fragment,
        SQLERRM;
    END IF;
END;
$$;

DO $$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.get_corporate_cases_read_context()',
    'public.list_corporate_case_types()',
    'public.list_corporate_cases(text,text,integer,timestamp with time zone,uuid)',
    'public.get_corporate_case_detail(uuid)',
    'public.list_corporate_notifications(boolean,integer,timestamp with time zone,uuid)'
  ] LOOP
    IF has_function_privilege('anon', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon can execute %', function_signature;
    END IF;
    IF NOT has_function_privilege('authenticated', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: authenticated cannot execute %', function_signature;
    END IF;
  END LOOP;

  IF has_schema_privilege('authenticated', 'corporate_private', 'USAGE') THEN
    RAISE EXCEPTION 'FAIL: authenticated can use corporate_private';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'corporate_private.actor_can_view_case(uuid,uuid,text[])',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated can execute private visibility helper';
  END IF;
END;
$$;

INSERT INTO auth.users (
  id,
  email,
  raw_user_meta_data,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'corporate-owner@example.test',
    '{"name":"Owner Corporativo"}'::jsonb,
    now(), now(), now()
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'corporate-requester@example.test',
    '{"name":"Solicitante Corporativo"}'::jsonb,
    now(), now(), now()
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'corporate-observer@example.test',
    '{"name":"Observador Corporativo"}'::jsonb,
    now(), now(), now()
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'corporate-operator@example.test',
    '{"name":"Operador Corporativo"}'::jsonb,
    now(), now(), now()
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'corporate-outsider@example.test',
    '{"name":"Usuário Sem Vínculo"}'::jsonb,
    now(), now(), now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture transacional de leitura de chamados',
  true
);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  (
    'a0000000-0000-0000-0000-000000000001',
    'SaaS_Owner',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000002',
    'SaaS_Viewer',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000003',
    'SaaS_Viewer',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000004',
    'SaaS_Viewer',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a0000000-0000-0000-0000-000000000005',
    'SaaS_Viewer',
    'a0000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.control_user_access_assignments(
  target_profile_id,
  access_profile_id,
  source_type,
  source_key,
  granted_by
)
SELECT
  'a0000000-0000-0000-0000-000000000004',
  access_profile.id,
  'migration',
  'corporate-read-operator',
  'a0000000-0000-0000-0000-000000000001'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key = 'support_analyst';

INSERT INTO public.corporate_work_group_members(
  group_id,
  profile_id,
  member_role,
  can_receive,
  active
)
SELECT
  work_group.id,
  'a0000000-0000-0000-0000-000000000004',
  'member',
  true,
  true
FROM public.corporate_work_groups AS work_group
WHERE work_group.group_key = 'access_intake';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000001', 'aal2');
DO $$
DECLARE
  context_payload jsonb;
BEGIN
  context_payload := public.get_corporate_cases_read_context();
  IF coalesce((context_payload->>'enabled')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: read context did not preserve disabled runtime';
  END IF;
  PERFORM pg_temp.expect_error(
    'SELECT * FROM public.list_corporate_case_types()',
    'corporate_cases_disabled'
  );
END;
$$;
RESET ROLE;

UPDATE public.corporate_case_runtime_settings
SET enabled = true,
    updated_by = 'a0000000-0000-0000-0000-000000000001'
WHERE singleton;

INSERT INTO public.corporate_cases(
  id,
  protocol,
  client_request_id,
  case_type_id,
  requester_profile_id,
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
  expires_at,
  created_at,
  updated_at
)
SELECT
  seed.case_id,
  seed.protocol,
  seed.client_request_id,
  case_type.id,
  seed.requester_profile_id,
  routing_policy.id,
  routing_policy.version,
  'moderate',
  'normal',
  seed.sensitivity,
  'triage',
  1,
  intake_group.id,
  seed.subject,
  seed.summary,
  jsonb_build_object('requested_profile_key', 'finance_analyst'),
  now() + interval '5 days',
  seed.created_at,
  seed.updated_at
FROM (VALUES
  (
    'a1000000-0000-0000-0000-000000000001'::uuid,
    'CI-A10000000001',
    'a2000000-0000-0000-0000-000000000001'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'restricted',
    'Acesso ao financeiro',
    'Solicitação para conciliação financeira.',
    now() - interval '2 hours',
    now() - interval '30 minutes'
  ),
  (
    'a1000000-0000-0000-0000-000000000002'::uuid,
    'CI-A10000000002',
    'a2000000-0000-0000-0000-000000000002'::uuid,
    'a0000000-0000-0000-0000-000000000002'::uuid,
    'restricted',
    'Acesso ao comercial',
    'Solicitação para consulta comercial.',
    now() - interval '3 hours',
    now() - interval '90 minutes'
  ),
  (
    'a1000000-0000-0000-0000-000000000003'::uuid,
    'CI-A10000000003',
    'a2000000-0000-0000-0000-000000000003'::uuid,
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'confidential',
    'Investigação confidencial',
    'Caso confidencial não pode ser aberto apenas por vínculo ao grupo.',
    now() - interval '4 hours',
    now() - interval '2 hours'
  )
) AS seed(
  case_id,
  protocol,
  client_request_id,
  requester_profile_id,
  sensitivity,
  subject,
  summary,
  created_at,
  updated_at
)
JOIN public.corporate_case_types AS case_type
  ON case_type.type_key = 'access_release'
JOIN public.corporate_case_routing_policies AS routing_policy
  ON routing_policy.case_type_id = case_type.id
 AND routing_policy.risk_level = 'moderate'
 AND routing_policy.active
JOIN public.corporate_work_groups AS intake_group
  ON intake_group.group_key = 'access_intake';

INSERT INTO public.corporate_case_participants(
  case_id,
  profile_id,
  participant_role,
  notification_level,
  added_by
)
VALUES
  (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'requester',
    'all',
    'a0000000-0000-0000-0000-000000000001'
  ),
  (
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003',
    'observer',
    'all',
    'a0000000-0000-0000-0000-000000000002'
  ),
  (
    'a1000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000002',
    'requester',
    'all',
    'a0000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.corporate_case_tasks(
  id,
  case_id,
  stage_order,
  task_type,
  assigned_group_id,
  status,
  due_at
)
SELECT
  'a3000000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  1,
  'triage',
  work_group.id,
  'pending',
  now() + interval '4 hours'
FROM public.corporate_work_groups AS work_group
WHERE work_group.group_key = 'access_intake';

INSERT INTO public.corporate_case_tasks(
  id,
  case_id,
  stage_order,
  task_type,
  assigned_group_id,
  status,
  due_at
)
SELECT
  'a3000000-0000-0000-0000-000000000002',
  'a1000000-0000-0000-0000-000000000001',
  3,
  'approval',
  work_group.id,
  'pending',
  now() + interval '1 day'
FROM public.corporate_work_groups AS work_group
WHERE work_group.group_key = 'access_approvers';

INSERT INTO public.corporate_case_approval_slots(
  id,
  task_id,
  slot_order,
  requested_approver_profile_id,
  decision,
  due_at
)
VALUES (
  'a4000000-0000-0000-0000-000000000001',
  'a3000000-0000-0000-0000-000000000002',
  1,
  'a0000000-0000-0000-0000-000000000001',
  'pending',
  now() + interval '1 day'
);

INSERT INTO public.corporate_case_messages(
  id,
  case_id,
  author_profile_id,
  client_message_id,
  visibility,
  body
)
VALUES
  (
    'a5000000-0000-0000-0000-000000000001',
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'a5100000-0000-0000-0000-000000000001',
    'participants',
    'Mensagem visível aos participantes.'
  ),
  (
    'a5000000-0000-0000-0000-000000000002',
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'a5100000-0000-0000-0000-000000000002',
    'internal',
    'Nota interna da triagem.'
  ),
  (
    'a5000000-0000-0000-0000-000000000003',
    'a1000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000001',
    'a5100000-0000-0000-0000-000000000003',
    'restricted',
    'Nota restrita da aprovação.'
  );

INSERT INTO public.corporate_case_events(
  id,
  event_key,
  case_id,
  actor_profile_id,
  event_type,
  audience,
  payload
)
VALUES (
  'a6000000-0000-0000-0000-000000000001',
  'a6100000-0000-0000-0000-000000000001',
  'a1000000-0000-0000-0000-000000000001',
  'a0000000-0000-0000-0000-000000000001',
  'corporate_case.assigned',
  'participants',
  '{"stage_order":1}'::jsonb
);

INSERT INTO public.corporate_notifications(
  id,
  event_id,
  recipient_profile_id,
  event_category,
  importance,
  title,
  body,
  route_payload
)
VALUES
  (
    'a7000000-0000-0000-0000-000000000001',
    'a6000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000003',
    'case_assignment',
    'high',
    'Atualização no chamado',
    'Acesse o CutSync para consultar a atualização.',
    '{"caseId":"a1000000-0000-0000-0000-000000000001"}'::jsonb
  ),
  (
    'a7000000-0000-0000-0000-000000000002',
    'a6000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000005',
    'case_assignment',
    'high',
    'Atualização sem vínculo',
    'Esta notificação deve ser ocultada após reautorização.',
    '{"caseId":"a1000000-0000-0000-0000-000000000001"}'::jsonb
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000002', 'aal1');
SELECT pg_temp.expect_error(
  'SELECT * FROM public.list_corporate_cases()',
  'control_aal2_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000002', 'aal2');
DO $$
DECLARE
  result_count integer;
  first_case record;
  detail_payload jsonb;
BEGIN
  SELECT count(*) INTO result_count FROM public.list_corporate_cases('mine');
  IF result_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: requester expected 2 own cases, got %', result_count;
  END IF;

  SELECT * INTO first_case FROM public.list_corporate_cases('mine', NULL, 1);
  SELECT count(*)
  INTO result_count
  FROM public.list_corporate_cases(
    'mine', NULL, 10, first_case.updated_at, first_case.case_id
  );
  IF result_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: cursor page expected 1 remaining case, got %', result_count;
  END IF;

  detail_payload := public.get_corporate_case_detail(
    'a1000000-0000-0000-0000-000000000001'
  );
  IF jsonb_array_length(detail_payload->'messages') <> 1 THEN
    RAISE EXCEPTION 'FAIL: requester received internal or restricted messages';
  END IF;
  IF jsonb_array_length(detail_payload->'approvals') <> 1
     OR detail_payload->'approvals'->0->>'requested_approver_name' <> 'Owner Corporativo'
  THEN
    RAISE EXCEPTION 'FAIL: requester cannot identify the required approver';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000003', 'aal2');
DO $$
DECLARE
  result_count integer;
  detail_payload jsonb;
BEGIN
  SELECT count(*) INTO result_count FROM public.list_corporate_cases('observing');
  IF result_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: observer expected 1 case, got %', result_count;
  END IF;

  detail_payload := public.get_corporate_case_detail(
    'a1000000-0000-0000-0000-000000000001'
  );
  IF jsonb_array_length(detail_payload->'messages') <> 1 THEN
    RAISE EXCEPTION 'FAIL: observer received internal or restricted messages';
  END IF;

  SELECT count(*) INTO result_count FROM public.list_corporate_notifications();
  IF result_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: observer expected 1 authorized notification, got %', result_count;
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000004', 'aal2');
DO $$
DECLARE
  result_count integer;
  detail_payload jsonb;
BEGIN
  SELECT count(*) INTO result_count FROM public.list_corporate_cases('queue');
  IF result_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: intake operator expected 2 queued cases, got %', result_count;
  END IF;

  detail_payload := public.get_corporate_case_detail(
    'a1000000-0000-0000-0000-000000000001'
  );
  IF jsonb_array_length(detail_payload->'messages') <> 2 THEN
    RAISE EXCEPTION 'FAIL: group operator visibility is not internal-only';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000001', 'aal2');
DO $$
DECLARE
  result_count integer;
  detail_payload jsonb;
BEGIN
  SELECT count(*) INTO result_count FROM public.list_corporate_cases('all');
  IF result_count <> 3 THEN
    RAISE EXCEPTION 'FAIL: owner expected all 3 cases, got %', result_count;
  END IF;

  detail_payload := public.get_corporate_case_detail(
    'a1000000-0000-0000-0000-000000000001'
  );
  IF jsonb_array_length(detail_payload->'messages') <> 3 THEN
    RAISE EXCEPTION 'FAIL: owner did not receive restricted detail';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('a0000000-0000-0000-0000-000000000005', 'aal2');
DO $$
DECLARE
  result_count integer;
BEGIN
  SELECT count(*) INTO result_count FROM public.list_corporate_cases('mine');
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: unrelated reader can enumerate cases';
  END IF;

  PERFORM pg_temp.expect_error(
    $statement$
      SELECT public.get_corporate_case_detail(
        'a1000000-0000-0000-0000-000000000001'
      )
    $statement$,
    'corporate_case_not_found'
  );

  SELECT count(*) INTO result_count FROM public.list_corporate_notifications();
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: stale notification bypassed current case authorization';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
