-- Execute after 20260722000000_multi_app_identity_and_push_devices.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
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
  ('81000000-0000-0000-0000-000000000001', 'multi-app-one@example.test', '{"name":"Multi App One"}'::jsonb, now(), now(), now()),
  ('81000000-0000-0000-0000-000000000002', 'multi-app-two@example.test', '{"name":"Multi App Two"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug)
VALUES
  ('82000000-0000-0000-0000-000000000001', 'Multi App Tenant A', 'multi-app-tenant-a'),
  ('82000000-0000-0000-0000-000000000002', 'Multi App Tenant B', 'multi-app-tenant-b');

INSERT INTO public.memberships (profile_id, establishment_id, role, created_by)
VALUES
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000001', 'admin', '81000000-0000-0000-0000-000000000001'),
  ('81000000-0000-0000-0000-000000000001', '82000000-0000-0000-0000-000000000002', 'professional', '81000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('81000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  device_id uuid;
  context_count integer;
BEGIN
  device_id := public.register_push_device(
    'client',
    'android',
    'ExpoPushToken[multi-app-user-one-client]'
  );
  IF device_id IS NULL THEN RAISE EXCEPTION 'FAIL: client push device was not registered'; END IF;

  device_id := public.register_push_device(
    'business',
    'ios',
    'ExpoPushToken[multi-app-user-one-business]'
  );
  IF device_id IS NULL THEN RAISE EXCEPTION 'FAIL: business push device was not registered'; END IF;

  SELECT count(*) INTO context_count FROM public.get_my_operational_contexts();
  IF context_count <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected two operational contexts, got %', context_count;
  END IF;

  IF (SELECT count(*) FROM public.push_devices WHERE enabled) <> 2 THEN
    RAISE EXCEPTION 'FAIL: user cannot read both of their enabled devices';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$INSERT INTO public.push_devices(profile_id, app_kind, platform, expo_push_token)
    VALUES ('81000000-0000-0000-0000-000000000001', 'client', 'android', 'ExpoPushToken[direct-write-must-fail]')$$,
  'permission denied'
);

SELECT pg_temp.set_actor('81000000-0000-0000-0000-000000000002');

DO $$
DECLARE
  visible_devices integer;
  visible_contexts integer;
BEGIN
  SELECT count(*) INTO visible_devices FROM public.push_devices;
  IF visible_devices <> 0 THEN RAISE EXCEPTION 'FAIL: user can read another profile push devices'; END IF;

  SELECT count(*) INTO visible_contexts FROM public.get_my_operational_contexts();
  IF visible_contexts <> 0 THEN RAISE EXCEPTION 'FAIL: user can read another profile operational contexts'; END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.register_push_device('client', 'android', 'ExpoPushToken[multi-app-user-one-client]')$$,
  'push_token_registered'
);

DO $$
DECLARE
  disabled boolean;
BEGIN
  PERFORM public.register_push_device(
    'client',
    'android',
    'ExpoPushToken[multi-app-user-two-client]'
  );
  disabled := public.unregister_push_device('ExpoPushToken[multi-app-user-two-client]');
  IF NOT disabled THEN RAISE EXCEPTION 'FAIL: user could not unregister own push device'; END IF;
END $$;

RESET ROLE;
ROLLBACK;
