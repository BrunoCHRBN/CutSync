-- Execute after 20260724020000_client_account_deletion.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text DEFAULT 'aal1')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
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
    RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
  END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('89000000-0000-0000-0000-000000000001', 'deletion-client-one@example.test', '{"name":"Deletion One"}'::jsonb, now(), now(), now()),
  ('89000000-0000-0000-0000-000000000002', 'deletion-client-two@example.test', '{"name":"Deletion Two"}'::jsonb, now(), now(), now());

UPDATE public.profiles
SET role = 'client'
WHERE id IN (
  '89000000-0000-0000-0000-000000000001',
  '89000000-0000-0000-0000-000000000002'
);

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(
  'SELECT public.submit_client_account_deletion_request()',
  'authentication_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000001');
SELECT public.submit_client_account_deletion_request();
SELECT public.submit_client_account_deletion_request();
RESET ROLE;

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.governance_privacy_requests
    WHERE target_profile_id = '89000000-0000-0000-0000-000000000001'
      AND status = 'pending'
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: repeated submission created more than one active request';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000002');
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.get_client_account_deletion_request()) THEN
    RAISE EXCEPTION 'FAIL: another client enumerated the request';
  END IF;
END $$;
RESET ROLE;

SELECT set_config('cutsync.governance_access_reason', 'Fixture transacional de exclusão de conta', true);
INSERT INTO public.governance_users (profile_id, role, granted_by)
VALUES (
  '89000000-0000-0000-0000-000000000002',
  'SaaS_Editor',
  '89000000-0000-0000-0000-000000000002'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000002', 'aal1');
SELECT pg_temp.expect_error(
  format(
    'SELECT public.begin_client_account_deletion_execution(%L, %L)',
    (SELECT id FROM public.governance_privacy_requests WHERE target_profile_id = '89000000-0000-0000-0000-000000000001'),
    'Execução validada pela governança.'
  ),
  'governance_aal2_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000002', 'aal2');
SELECT public.begin_client_account_deletion_execution(
  (SELECT id FROM public.governance_privacy_requests WHERE target_profile_id = '89000000-0000-0000-0000-000000000001'),
  'Execução validada pela governança.'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT public.anonymize_client_account_deletion(
  (SELECT id FROM public.governance_privacy_requests WHERE target_profile_id = '89000000-0000-0000-0000-000000000001')
);
SELECT public.anonymize_client_account_deletion(
  (SELECT id FROM public.governance_privacy_requests WHERE target_profile_id = '89000000-0000-0000-0000-000000000001')
);
SELECT public.complete_client_account_deletion(
  (SELECT id FROM public.governance_privacy_requests WHERE target_profile_id = '89000000-0000-0000-0000-000000000001')
);
SELECT public.complete_client_account_deletion(
  (SELECT id FROM public.governance_privacy_requests WHERE target_profile_id = '89000000-0000-0000-0000-000000000001')
);
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = '89000000-0000-0000-0000-000000000001'
      AND deleted_at IS NOT NULL
      AND phone IS NULL
      AND push_token IS NULL
      AND email LIKE 'deleted+%@anon.cutsync.invalid'
  ) THEN
    RAISE EXCEPTION 'FAIL: profile was not anonymized';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.governance_privacy_requests
    WHERE target_profile_id = '89000000-0000-0000-0000-000000000001'
      AND status = 'executed'
      AND attempt_count = 1
      AND profile_anonymized_at IS NOT NULL
      AND auth_deleted_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: request was not completed consistently';
  END IF;
END $$;

ROLLBACK;
