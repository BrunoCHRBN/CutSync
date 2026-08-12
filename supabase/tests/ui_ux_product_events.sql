-- Execute after 20260812161020_ui_ux_product_events.sql.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(target_actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', target_actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', target_actor_id, 'role', 'authenticated')::text, true);
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

INSERT INTO auth.users(id, email, email_confirmed_at, created_at, updated_at)
VALUES ('76000000-0000-0000-0000-000000000001', 'ux-events@example.test', now(), now(), now());

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('76000000-0000-0000-0000-000000000001');

DO $$
DECLARE first_id bigint; replay_id bigint; stored record;
BEGIN
  first_id := public.record_product_event(
    '76000000-0000-0000-0000-000000000101', 'booking_started', 'client_mobile',
    'client', '/booking', 'ui-ux-v2', '{"establishmentHash":"est_123"}'
  );
  replay_id := public.record_product_event(
    '76000000-0000-0000-0000-000000000101', 'booking_started', 'client_mobile',
    'client', '/booking', 'ui-ux-v2', '{"establishmentHash":"est_123"}'
  );
  IF first_id <> replay_id THEN RAISE EXCEPTION 'FAIL: event replay was not idempotent'; END IF;

  SELECT actor_hash, identifiers INTO stored FROM public.product_events WHERE id = first_id;
  IF stored.actor_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'FAIL: actor was not pseudonymized'; END IF;
  IF stored.identifiers <> '{"establishmentHash":"est_123"}'::jsonb THEN
    RAISE EXCEPTION 'FAIL: safe identifiers were not preserved';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.record_product_event(gen_random_uuid(), 'booking_started', 'client_mobile', 'client', '/booking', 'ui-ux-v2', '{"email":"person@example.test"}')$$,
  'unsafe_product_event_identifier'
);
SELECT pg_temp.expect_error(
  $$SELECT public.record_product_event(gen_random_uuid(), 'unknown_event', 'client_mobile', 'client', '/booking', 'ui-ux-v2', '{}')$$,
  'invalid_product_event'
);
SELECT pg_temp.expect_error(
  $$SELECT public.record_product_event('76000000-0000-0000-0000-000000000101', 'booking_failed', 'client_mobile', 'client', '/booking', 'ui-ux-v2', '{}')$$,
  'product_event_idempotency_conflict'
);
SELECT pg_temp.expect_error($$SELECT count(*) FROM public.product_events$$, 'permission denied');

ROLLBACK;
