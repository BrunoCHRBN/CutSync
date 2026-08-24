-- Execute after 20260824016000_corporate_access_case_creation.sql.
-- Synthetic identities and runtime changes are rolled back.

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
    IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN
      RAISE;
    END IF;
    IF position(expected_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.assert_created_case_state(target_case_id uuid)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  requested_valid_until timestamptz;
BEGIN
  SELECT access_request.requested_valid_until
  INTO STRICT requested_valid_until
  FROM public.corporate_case_access_requests AS access_request
  WHERE access_request.case_id = target_case_id;

  IF (SELECT count(*) FROM public.corporate_case_participants WHERE case_id = target_case_id) <> 3 THEN
    RAISE EXCEPTION 'FAIL: requester, beneficiary and observer were not registered';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_tasks WHERE case_id = target_case_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: creation must materialize only the active triage task';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_sla_instances WHERE case_id = target_case_id) <> 2 THEN
    RAISE EXCEPTION 'FAIL: case and task SLA instances missing';
  END IF;
  IF (SELECT count(*) FROM public.corporate_case_events WHERE case_id = target_case_id) <> 1 THEN
    RAISE EXCEPTION 'FAIL: immutable creation event missing';
  END IF;
  IF (
    SELECT count(*)
    FROM public.corporate_notifications AS notification
    JOIN public.corporate_case_events AS event ON event.id = notification.event_id
    WHERE event.case_id = target_case_id
  ) <> 4 THEN
    RAISE EXCEPTION 'FAIL: expected in-app audience was not materialized';
  END IF;
  IF (
    SELECT count(*)
    FROM public.corporate_notification_outbox AS outbox
    JOIN public.corporate_notifications AS notification ON notification.id = outbox.notification_id
    JOIN public.corporate_case_events AS event ON event.id = notification.event_id
    WHERE event.case_id = target_case_id AND outbox.channel = 'email'
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: assigned-team email outbox was not materialized';
  END IF;

  RETURN requested_valid_until;
END;
$$;

DO $$
DECLARE
  function_signature text;
BEGIN
  FOREACH function_signature IN ARRAY ARRAY[
    'public.list_corporate_access_request_profiles()',
    'public.find_corporate_case_participant_by_email(text)',
    'public.create_corporate_access_case(uuid,text,text,text,timestamp with time zone,text,uuid[],uuid)'
  ] LOOP
    IF has_function_privilege('anon', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon can execute %', function_signature;
    END IF;
    IF NOT has_function_privilege('authenticated', function_signature, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: authenticated cannot execute %', function_signature;
    END IF;
  END LOOP;

  IF has_table_privilege('authenticated', 'public.corporate_case_access_requests', 'SELECT')
     OR has_table_privilege('authenticated', 'public.corporate_case_access_requests', 'INSERT')
  THEN
    RAISE EXCEPTION 'FAIL: authenticated has direct projection-table access';
  END IF;
END;
$$;

INSERT INTO auth.users(id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'case-requester@example.test', '{"name":"Solicitante"}', now(), now(), now()),
  ('b0000000-0000-4000-8000-000000000002', 'case-beneficiary@example.test', '{"name":"Beneficiário"}', now(), now(), now()),
  ('b0000000-0000-4000-8000-000000000003', 'case-observer@example.test', '{"name":"Observador"}', now(), now(), now()),
  ('b0000000-0000-4000-8000-000000000004', 'case-triager@example.test', '{"name":"Triagem"}', now(), now(), now());

SELECT set_config('cutsync.governance_access_reason', 'Fixture de abertura corporativa', true);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  ('b0000000-0000-4000-8000-000000000001', 'SaaS_Owner', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000002', 'SaaS_Viewer', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000003', 'SaaS_Viewer', 'b0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000004', 'SaaS_Editor', 'b0000000-0000-4000-8000-000000000001');

INSERT INTO public.corporate_work_group_members(
  group_id, profile_id, member_role, can_receive, active
)
SELECT work_group.id, 'b0000000-0000-4000-8000-000000000004', 'member', true, true
FROM public.corporate_work_groups AS work_group
WHERE work_group.group_key = 'access_intake';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('b0000000-0000-4000-8000-000000000001', 'aal2');
SELECT public.set_corporate_case_runtime_settings(
  true, true, false, true, true, false, 1,
  'Habilitação transacional do runtime para validar a abertura corporativa.',
  'b2000000-0000-4000-8000-000000000001'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('b0000000-0000-4000-8000-000000000001', 'aal2');

DO $$
DECLARE
  result jsonb;
  repeated jsonb;
  created_case_id uuid;
  requested_valid_until timestamptz;
BEGIN
  IF (SELECT count(*) FROM public.find_corporate_case_participant_by_email('CASE-BENEFICIARY@EXAMPLE.TEST')) <> 1 THEN
    RAISE EXCEPTION 'FAIL: exact Control identity lookup failed';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.list_corporate_access_request_profiles() AS profile
    WHERE profile.profile_key = 'finance_analyst'
  ) THEN
    RAISE EXCEPTION 'FAIL: delegated access profile was not listed';
  END IF;

  result := public.create_corporate_access_case(
    'b0000000-0000-4000-8000-000000000002',
    'finance_analyst',
    'grant',
    NULL,
    now() + interval '30 days',
    'Necessidade financeira válida para conciliação e acompanhamento operacional.',
    ARRAY['b0000000-0000-4000-8000-000000000003']::uuid[],
    'b1000000-0000-4000-8000-000000000001'
  );
  created_case_id := (result->>'case_id')::uuid;

  IF result->>'status' <> 'submitted' OR coalesce((result->>'idempotent')::boolean, true) THEN
    RAISE EXCEPTION 'FAIL: unexpected creation result %', result;
  END IF;
  requested_valid_until := pg_temp.assert_created_case_state(created_case_id);

  repeated := public.create_corporate_access_case(
    'b0000000-0000-4000-8000-000000000002',
    'finance_analyst',
    'grant',
    NULL,
    requested_valid_until,
    'Necessidade financeira válida para conciliação e acompanhamento operacional.',
    ARRAY['b0000000-0000-4000-8000-000000000003']::uuid[],
    'b1000000-0000-4000-8000-000000000001'
  );
  IF NOT coalesce((repeated->>'idempotent')::boolean, false)
     OR repeated->>'case_id' <> created_case_id::text
  THEN
    RAISE EXCEPTION 'FAIL: idempotent retry did not return the original case';
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_corporate_access_case(%L,%L,%L,NULL,NULL,%L,ARRAY[]::uuid[],%L)',
      'b0000000-0000-4000-8000-000000000002'::uuid,
      'finance_analyst',
      'grant',
      'Justificativa conflitante para a mesma chave idempotente.',
      'b1000000-0000-4000-8000-000000000001'::uuid
    ),
    'idempotency_conflict'
  );
END;
$$;

RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('b0000000-0000-4000-8000-000000000001', 'aal1');
SELECT pg_temp.expect_error(
  'SELECT * FROM public.list_corporate_access_request_profiles()',
  'aal2_required'
);
RESET ROLE;

ROLLBACK;
