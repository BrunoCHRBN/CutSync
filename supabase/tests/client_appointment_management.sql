-- Execute after 20260723040000_client_appointment_management.sql.
-- All fixtures and appointment mutations are rolled back.
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
  ('86000000-0000-0000-0000-000000000001', 'client-agenda-one@example.test', '{"name":"Client Agenda One"}'::jsonb, now(), now(), now()),
  ('86000000-0000-0000-0000-000000000002', 'client-agenda-two@example.test', '{"name":"Client Agenda Two"}'::jsonb, now(), now(), now()),
  ('86000000-0000-0000-0000-000000000003', 'professional-agenda@example.test', '{"name":"Professional Agenda"}'::jsonb, now(), now(), now());

UPDATE public.profiles
SET name = 'Profissional Agenda',
    role = 'professional',
    work_hours = '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"isOpen":true,"open":"08:00","close":"20:00"}]'
WHERE id = '86000000-0000-0000-0000-000000000003';

INSERT INTO public.establishments (
  id, name, slug, address, phone, timezone, currency, opening_hours,
  account_status, instant_booking_enabled, min_cancellation_hours
)
VALUES (
  '86000000-0000-0000-0000-000000000010',
  'Estúdio Agenda Client',
  'estudio-agenda-client',
  'Centro, São Paulo - SP',
  '5511999999999',
  'America/Sao_Paulo',
  'BRL',
  '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"isOpen":true,"open":"08:00","close":"20:00"}]',
  'active',
  true,
  24
);

INSERT INTO public.memberships (id, profile_id, establishment_id, role, status)
VALUES (
  '86000000-0000-0000-0000-000000000020',
  '86000000-0000-0000-0000-000000000003',
  '86000000-0000-0000-0000-000000000010',
  'professional',
  'active'
);

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active, sort_order)
VALUES ('agenda-client-service', '86000000-0000-0000-0000-000000000010', 'Corte Agenda', 60, 30, true, 1);

INSERT INTO public.professional_services (
  id, establishment_id, professional_id, service_id, price, duration_minutes, is_active
)
VALUES (
  '86000000-0000-0000-0000-000000000030',
  '86000000-0000-0000-0000-000000000010',
  '86000000-0000-0000-0000-000000000003',
  'agenda-client-service',
  60,
  30,
  true
);

INSERT INTO public.appointments (
  id, establishment_id, client_id, client_name, professional_id, service_id,
  date_time, ends_at, duration_minutes, status, reschedule_count
)
VALUES
  ('86000000-0000-0000-0000-000000000101', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000001', 'Client Agenda One', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '3 days'), date_trunc('hour', now() + interval '3 days') + interval '30 minutes', 30, 'confirmed', 0),
  ('86000000-0000-0000-0000-000000000102', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000001', 'Client Agenda One', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '4 hours'), date_trunc('hour', now() + interval '4 hours') + interval '30 minutes', 30, 'confirmed', 0),
  ('86000000-0000-0000-0000-000000000103', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000001', 'Client Agenda One', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '5 days'), date_trunc('hour', now() + interval '5 days') + interval '30 minutes', 30, 'cancelled', 0),
  ('86000000-0000-0000-0000-000000000104', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000002', 'Client Agenda Two', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '6 days'), date_trunc('hour', now() + interval '6 days') + interval '30 minutes', 30, 'confirmed', 0),
  ('86000000-0000-0000-0000-000000000105', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000001', 'Client Agenda One', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '7 days'), date_trunc('hour', now() + interval '7 days') + interval '30 minutes', 30, 'confirmed', 2),
  ('86000000-0000-0000-0000-000000000106', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000001', 'Client Agenda One', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '8 days'), date_trunc('hour', now() + interval '8 days') + interval '30 minutes', 30, 'confirmed', 0),
  ('86000000-0000-0000-0000-000000000107', '86000000-0000-0000-0000-000000000010', '86000000-0000-0000-0000-000000000001', 'Client Agenda One', '86000000-0000-0000-0000-000000000003', 'agenda-client-service', date_trunc('hour', now() + interval '9 days'), date_trunc('hour', now() + interval '9 days') + interval '30 minutes', 30, 'confirmed', 0);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('86000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  own_count integer;
  other_count integer;
  late_policy record;
BEGIN
  SELECT count(*) INTO own_count FROM public.get_client_appointments();
  IF own_count <> 6 THEN RAISE EXCEPTION 'FAIL: client list returned % rows instead of 6', own_count; END IF;

  SELECT count(*) INTO other_count
  FROM public.get_client_appointment('86000000-0000-0000-0000-000000000104');
  IF other_count <> 0 THEN RAISE EXCEPTION 'FAIL: other client must not read the appointment'; END IF;

  SELECT * INTO late_policy
  FROM public.get_client_appointment('86000000-0000-0000-0000-000000000102');
  IF late_policy.can_cancel OR late_policy.can_reschedule
    OR late_policy.cancel_block_reason <> 'cancellation_window_closed'
  THEN RAISE EXCEPTION 'FAIL: cancellation policy was not returned'; END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.update_appointment_status('86000000-0000-0000-0000-000000000102', 'cancelled', 'Outro')$$,
  'cancellation_window_closed'
);
SELECT pg_temp.expect_error(
  $$SELECT public.update_appointment_status('86000000-0000-0000-0000-000000000101', 'cancelled', 'Texto livre')$$,
  'invalid_cancellation_reason'
);
SELECT pg_temp.expect_error(
  $$SELECT public.reschedule_appointment('86000000-0000-0000-0000-000000000103', now() + interval '10 days', '86000000-0000-0000-0000-000000000003', 'agenda-client-service')$$,
  'appointment_status_immutable'
);
SELECT pg_temp.expect_error(
  $$SELECT public.reschedule_appointment('86000000-0000-0000-0000-000000000105', now() + interval '10 days', '86000000-0000-0000-0000-000000000003', 'agenda-client-service')$$,
  'reschedule_limit_reached'
);

SELECT public.update_appointment_status(
  '86000000-0000-0000-0000-000000000101',
  'cancelled',
  'Imprevisto de trabalho'
);

DO $$
DECLARE
  selected_slot record;
BEGIN
  SELECT * INTO selected_slot
  FROM public.get_available_slots(
    '86000000-0000-0000-0000-000000000010',
    '86000000-0000-0000-0000-000000000003',
    'agenda-client-service',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date + 12,
    '86000000-0000-0000-0000-000000000106'
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;

  PERFORM public.reschedule_appointment(
    '86000000-0000-0000-0000-000000000106',
    selected_slot.starts_at,
    '86000000-0000-0000-0000-000000000003',
    'agenda-client-service'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = '86000000-0000-0000-0000-000000000106'
      AND status = 'confirmed'
      AND reschedule_count = 1
  ) THEN RAISE EXCEPTION 'FAIL: instant reschedule was not confirmed'; END IF;
END $$;

RESET ROLE;
UPDATE public.establishments
SET instant_booking_enabled = false
WHERE id = '86000000-0000-0000-0000-000000000010';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('86000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  selected_slot record;
BEGIN
  SELECT * INTO selected_slot
  FROM public.get_available_slots(
    '86000000-0000-0000-0000-000000000010',
    '86000000-0000-0000-0000-000000000003',
    'agenda-client-service',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date + 13,
    '86000000-0000-0000-0000-000000000107'
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;

  PERFORM public.reschedule_appointment(
    '86000000-0000-0000-0000-000000000107',
    selected_slot.starts_at,
    '86000000-0000-0000-0000-000000000003',
    'agenda-client-service'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.appointments
    WHERE id = '86000000-0000-0000-0000-000000000107'
      AND status = 'pending'
      AND reschedule_count = 1
  ) THEN RAISE EXCEPTION 'FAIL: non-instant reschedule was not left pending'; END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('86000000-0000-0000-0000-000000000002');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.get_client_appointment('86000000-0000-0000-0000-000000000106')
  ) THEN RAISE EXCEPTION 'FAIL: other client must not read the appointment'; END IF;
END $$;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.expect_error($$SELECT * FROM public.get_client_appointments()$$, 'permission denied');
SELECT pg_temp.expect_error($$SELECT * FROM public.get_client_appointment('86000000-0000-0000-0000-000000000101')$$, 'permission denied');

RESET ROLE;
ROLLBACK;
