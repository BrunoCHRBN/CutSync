-- Security and contract smoke tests for 20260725000000_interactive_admin_reports.sql.
-- Run against an isolated database after the migration; all changes are rolled back.
\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_admin_report_v2'
      AND p.prosecdef = true AND p.proconfig::text LIKE '%search_path=%'
  ) THEN RAISE EXCEPTION 'FAIL: get_admin_report_v2 is not hardened'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_admin_report_details'
      AND p.prosecdef = true AND p.proconfig::text LIKE '%search_path=%'
  ) THEN RAISE EXCEPTION 'FAIL: get_admin_report_details is not hardened'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public'
      AND routine_name IN ('get_admin_report_v2', 'get_admin_report_details')
      AND grantee IN ('PUBLIC', 'anon')
  ) THEN RAISE EXCEPTION 'FAIL: report RPC executable by PUBLIC or anon'; END IF;
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

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '', true);
SELECT set_config('request.jwt.claims', '{"role":"authenticated"}', true);

SELECT pg_temp.expect_error(
  $$SELECT public.get_admin_report_v2('00000000-0000-0000-0000-000000000001', current_date, current_date, NULL, NULL, NULL)$$,
  'authentication_required'
);
SELECT pg_temp.expect_error(
  $$SELECT public.get_admin_report_details('00000000-0000-0000-0000-000000000001', current_date, current_date, 'raw_table', NULL, NULL, NULL, NULL, NULL, NULL, NULL, 100)$$,
  'authentication_required'
);

ROLLBACK;
