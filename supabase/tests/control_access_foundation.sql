-- Execute after 20260730000000_control_access_foundation.sql.
-- All fixtures and mutations are rolled back.

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

DO $$
DECLARE
  control_rpc regprocedure;
BEGIN
  FOREACH control_rpc IN ARRAY ARRAY[
    'public.get_control_context()'::regprocedure,
    'public.get_control_dashboard()'::regprocedure,
    'public.list_control_users()'::regprocedure,
    'public.set_control_user_access(uuid,public.governance_role_enum,timestamptz,text)'::regprocedure,
    'public.revoke_control_user_access(uuid,text)'::regprocedure,
    'public.list_control_billing_accounts()'::regprocedure,
    'public.list_identity_migration_conflicts()'::regprocedure,
    'public.list_control_billing_cutovers()'::regprocedure,
    'public.set_control_subscription_status(uuid,text,text)'::regprocedure,
    'public.configure_control_plan(text,integer,text)'::regprocedure,
    'public.activate_control_subscription(uuid,text,date)'::regprocedure,
    'public.issue_manual_billing_invoice(uuid,date)'::regprocedure,
    'public.set_control_subscription_enforcement(uuid,boolean,text)'::regprocedure,
    'public.finalize_organization_billing_cutover(uuid)'::regprocedure
  ]
  LOOP
    IF has_function_privilege('anon', control_rpc, 'EXECUTE') THEN
      RAISE EXCEPTION 'FAIL: anon can execute %', control_rpc;
    END IF;
  END LOOP;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('8c000000-0000-0000-0000-000000000001', 'control-owner@example.test', '{"name":"Control Owner"}'::jsonb, now(), now(), now()),
  ('8c000000-0000-0000-0000-000000000002', 'control-viewer@example.test', '{"name":"Control Viewer"}'::jsonb, now(), now(), now()),
  ('8c000000-0000-0000-0000-000000000003', 'control-outsider@example.test', '{"name":"Control Outsider"}'::jsonb, now(), now(), now());

SELECT set_config('cutsync.governance_access_reason', 'Fixture transacional do CutSync Control', true);
INSERT INTO public.governance_users (profile_id, role, granted_by)
VALUES
  (
    '8c000000-0000-0000-0000-000000000001',
    'SaaS_Owner',
    '8c000000-0000-0000-0000-000000000001'
  ),
  (
    '8c000000-0000-0000-0000-000000000002',
    'SaaS_Viewer',
    '8c000000-0000-0000-0000-000000000001'
  );

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(
  'SELECT public.get_control_context()',
  'permission denied'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('8c000000-0000-0000-0000-000000000003', 'aal2');
SELECT pg_temp.expect_error(
  'SELECT public.get_control_context()',
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('8c000000-0000-0000-0000-000000000002', 'aal1');
SELECT pg_temp.expect_error(
  'SELECT public.get_control_context()',
  'control_aal2_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('8c000000-0000-0000-0000-000000000002', 'aal2');
DO $$
DECLARE
  viewer_context jsonb;
BEGIN
  viewer_context := public.get_control_context();
  IF viewer_context->>'role' <> 'SaaS_Viewer' THEN
    RAISE EXCEPTION 'FAIL: viewer role missing from context';
  END IF;
  IF viewer_context->'permissions' ? 'control.access.manage' THEN
    RAISE EXCEPTION 'FAIL: viewer received owner permission';
  END IF;
END $$;
SELECT pg_temp.expect_error(
  'SELECT * FROM public.list_control_users()',
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('8c000000-0000-0000-0000-000000000001', 'aal2');
DO $$
DECLARE
  owner_context jsonb;
BEGIN
  owner_context := public.get_control_context();
  IF NOT owner_context->'permissions' ? 'control.access.manage' THEN
    RAISE EXCEPTION 'FAIL: owner permission missing';
  END IF;
  IF (SELECT count(*) FROM public.list_control_users()) <> 2 THEN
    RAISE EXCEPTION 'FAIL: owner could not list Control users';
  END IF;
END $$;
SELECT pg_temp.expect_error(
  format(
    'SELECT public.revoke_control_user_access(%L, %L)',
    '8c000000-0000-0000-0000-000000000001',
    'Tentativa de remover o último proprietário'
  ),
  'last_owner_protected'
);
SELECT pg_temp.expect_error(
  format(
    'SELECT public.set_control_user_access(%L, %L, NULL, %L)',
    '8c000000-0000-0000-0000-000000000001',
    'SaaS_Viewer',
    'Tentativa de rebaixar o último proprietário'
  ),
  'last_owner_protected'
);
RESET ROLE;

SELECT set_config('cutsync.governance_access_reason', 'Expiração simulada para teste transacional', true);
UPDATE public.governance_users
SET granted_at = now() - interval '2 days',
    expires_at = now() - interval '1 minute'
WHERE profile_id = '8c000000-0000-0000-0000-000000000002';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('8c000000-0000-0000-0000-000000000002', 'aal2');
SELECT pg_temp.expect_error(
  'SELECT public.get_control_context()',
  'forbidden'
);
RESET ROLE;

ROLLBACK;
