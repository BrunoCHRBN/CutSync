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
  ('71000000-0000-0000-0000-000000000001', 'booking-client@example.test', '{"name":"Cliente Booking"}'::jsonb, now(), now(), now()),
  ('71000000-0000-0000-0000-000000000002', 'booking-prof@example.test', '{"name":"Profissional Booking"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug)
VALUES ('72000000-0000-0000-0000-000000000001', 'Booking Tenant', 'booking-tenant');

INSERT INTO public.memberships (profile_id, establishment_id, role, created_by)
VALUES ('71000000-0000-0000-0000-000000000002', '72000000-0000-0000-0000-000000000001', 'professional', '71000000-0000-0000-0000-000000000002');

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
VALUES ('booking-service', '72000000-0000-0000-0000-000000000001', 'Serviço Booking', 50, 60, true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('71000000-0000-0000-0000-000000000001');

SELECT public.create_appointment(
  '72000000-0000-0000-0000-000000000001',
  '71000000-0000-0000-0000-000000000002',
  'booking-service', now() + interval '2 days', NULL, NULL
);

SELECT pg_temp.expect_error(
  $$SELECT public.create_appointment(
    '72000000-0000-0000-0000-000000000001',
    '71000000-0000-0000-0000-000000000002',
    'booking-service', now() + interval '2 days 30 minutes', NULL, NULL
  )$$,
  'appointment_conflict'
);

DO $$
DECLARE function_result text;
BEGIN
  SELECT pg_get_function_result(procedure.oid)
  INTO function_result
  FROM pg_proc procedure
  JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'get_public_busy_slots'
    AND pg_get_function_identity_arguments(procedure.oid) =
      'target_professional_id uuid, range_start timestamp with time zone, range_end timestamp with time zone';

  IF function_result IS DISTINCT FROM
    'TABLE(date_time timestamp with time zone, duration_minutes integer)'
  THEN RAISE EXCEPTION 'FAIL: unexpected public busy slots output: %', function_result; END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_public_busy_slots(
      '71000000-0000-0000-0000-000000000002',
      now() + interval '1 day', now() + interval '3 days'
    ) slot
    WHERE slot.duration_minutes <= 0
  ) THEN RAISE EXCEPTION 'FAIL: invalid public busy slot'; END IF;
END $$;

RESET ROLE;
ROLLBACK;