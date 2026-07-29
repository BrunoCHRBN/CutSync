-- Execute after 20260802000000_support_center_foundation.sql.
-- All fixtures and mutations are rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text DEFAULT 'aal1')
RETURNS void LANGUAGE plpgsql AS $$
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
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %',
      expected_fragment,
      SQLERRM;
  END IF;
END $$;

DO $$
DECLARE
  settings public.support_runtime_settings%ROWTYPE;
BEGIN
  SELECT * INTO settings FROM public.support_runtime_settings WHERE id;
  IF settings.enabled OR settings.allow_new_tickets OR settings.sync_enabled THEN
    RAISE EXCEPTION 'FAIL: support must start disabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.support_teams
    WHERE code = 'SUPORTE_GERAL' AND active AND is_default
  ) THEN
    RAISE EXCEPTION 'FAIL: default support team missing';
  END IF;
END $$;

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(
  'SELECT public.list_my_support_tickets()',
  'permission denied'
);
SELECT pg_temp.expect_error(
  $sql$SELECT public.create_support_ticket_internal(
    '8d000000-0000-4000-8000-000000000001',
    'other',
    'normal',
    'Assunto de teste',
    'Mensagem de teste suficientemente longa.',
    NULL,
    '8d100000-0000-4000-8000-000000000001'
  )$sql$,
  'permission denied'
);
RESET ROLE;

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
    '8d000000-0000-4000-8000-000000000001',
    'support-requester-one@example.test',
    '{"name":"Requester One"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8d000000-0000-4000-8000-000000000002',
    'support-requester-two@example.test',
    '{"name":"Requester Two"}'::jsonb,
    now(),
    now(),
    now()
  );

UPDATE public.support_runtime_settings
SET enabled = true,
    allow_new_tickets = true,
    sync_enabled = true
WHERE id;

DO $$
DECLARE
  first_result jsonb;
  repeated_result jsonb;
  failure_result jsonb;
  created_ticket_id uuid;
  created_operation_id uuid;
BEGIN
  first_result := public.create_support_ticket_internal(
    '8d000000-0000-4000-8000-000000000001',
    'other',
    'normal',
    'Ajuda com o aplicativo',
    'Preciso de ajuda para concluir uma ação no aplicativo.',
    NULL,
    '8d100000-0000-4000-8000-000000000001'
  );
  repeated_result := public.create_support_ticket_internal(
    '8d000000-0000-4000-8000-000000000001',
    'other',
    'normal',
    'Ajuda com o aplicativo',
    'Preciso de ajuda para concluir uma ação no aplicativo.',
    NULL,
    '8d100000-0000-4000-8000-000000000001'
  );
  created_ticket_id := (first_result->'ticket'->>'id')::uuid;

  IF created_ticket_id IS NULL
    OR repeated_result->'ticket'->>'id' <> created_ticket_id::text
    OR coalesce((repeated_result->>'idempotent')::boolean, false) IS NOT true
  THEN
    RAISE EXCEPTION 'FAIL: ticket creation is not idempotent';
  END IF;
  IF first_result->'ticket'->>'team_code' <> 'SUPORTE_GERAL' THEN
    RAISE EXCEPTION 'FAIL: fallback routing did not select SUPORTE_GERAL';
  END IF;
  PERFORM set_config(
    'cutsync.support_test_ticket_id',
    created_ticket_id::text,
    true
  );
  IF (
    SELECT count(*)
    FROM public.support_sync_operations
    WHERE support_sync_operations.ticket_id = created_ticket_id
      AND operation_type = 'create_ticket'
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: outbox create operation was duplicated';
  END IF;

  SELECT id
  INTO created_operation_id
  FROM public.support_sync_operations
  WHERE ticket_id = created_ticket_id
    AND operation_type = 'create_ticket';
  IF NOT public.claim_support_sync_operation(created_operation_id) THEN
    RAISE EXCEPTION 'FAIL: specific support operation was not claimed';
  END IF;
  failure_result := public.fail_support_sync_operation(
    created_operation_id,
    'support_creation_unknown',
    60
  );
  IF failure_result->>'status' <> 'retry'
    OR NOT coalesce(
      (
        SELECT (payload->>'creation_unknown')::boolean
        FROM public.support_sync_operations
        WHERE id = created_operation_id
      ),
      false
    )
  THEN
    RAISE EXCEPTION 'FAIL: ambiguous JSM creation was not made lookup-only';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('8d000000-0000-4000-8000-000000000001');
DO $$
DECLARE
  listed jsonb := public.list_my_support_tickets();
  ticket_id uuid;
  detail jsonb;
  public_ticket jsonb;
BEGIN
  ticket_id := (listed->'tickets'->0->>'id')::uuid;
  detail := public.get_my_support_ticket(ticket_id);
  public_ticket := detail->'ticket';
  IF jsonb_array_length(listed->'tickets') <> 1 THEN
    RAISE EXCEPTION 'FAIL: requester did not receive exactly one ticket';
  END IF;
  IF public_ticket ?| ARRAY[
    'jsm_issue_key',
    'jsm_issue_url',
    'team_id',
    'assignee_profile_id',
    'last_sync_error_code'
  ] THEN
    RAISE EXCEPTION 'FAIL: requester payload exposes operational fields';
  END IF;
  IF (detail->'messages'->0) ? 'jsm_comment_id' THEN
    RAISE EXCEPTION 'FAIL: requester message exposes JSM comment id';
  END IF;
END $$;

SELECT pg_temp.set_actor('8d000000-0000-4000-8000-000000000002');
SELECT pg_temp.expect_error(
  $sql$SELECT public.get_my_support_ticket(
    current_setting('cutsync.support_test_ticket_id')::uuid
  )$sql$,
  'support_ticket_not_found'
);
RESET ROLE;

ROLLBACK;
