-- Execute after 20260723023000_client_booking.sql.
-- All fixtures and appointments are rolled back.
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
  ('85000000-0000-0000-0000-000000000001', 'client-booking-mobile@example.test', '{"name":"Client Booking Mobile"}'::jsonb, now(), now(), now()),
  ('85000000-0000-0000-0000-000000000002', 'professional-booking-mobile@example.test', '{"name":"Professional Booking Mobile"}'::jsonb, now(), now(), now());

UPDATE public.profiles
SET name = 'Profissional Mobile',
    role = 'professional',
    work_hours = '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"},{"day":1,"isOpen":true,"open":"09:00","close":"18:00"},{"day":2,"isOpen":true,"open":"09:00","close":"18:00"},{"day":3,"isOpen":true,"open":"09:00","close":"18:00"},{"day":4,"isOpen":true,"open":"09:00","close":"18:00"},{"day":5,"isOpen":true,"open":"09:00","close":"18:00"},{"day":6,"isOpen":true,"open":"09:00","close":"18:00"}]'
WHERE id = '85000000-0000-0000-0000-000000000002';

INSERT INTO public.establishments (
  id, name, slug, address, timezone, opening_hours, account_status, instant_booking_enabled
)
VALUES (
  '85000000-0000-0000-0000-000000000010',
  'Estúdio Booking Mobile',
  'estudio-booking-mobile',
  'Centro, São Paulo - SP',
  'America/Sao_Paulo',
  '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"},{"day":1,"isOpen":true,"open":"09:00","close":"18:00"},{"day":2,"isOpen":true,"open":"09:00","close":"18:00"},{"day":3,"isOpen":true,"open":"09:00","close":"18:00"},{"day":4,"isOpen":true,"open":"09:00","close":"18:00"},{"day":5,"isOpen":true,"open":"09:00","close":"18:00"},{"day":6,"isOpen":true,"open":"09:00","close":"18:00"}]',
  'active',
  true
);

INSERT INTO public.memberships (id, profile_id, establishment_id, role, status)
VALUES (
  '85000000-0000-0000-0000-000000000020',
  '85000000-0000-0000-0000-000000000002',
  '85000000-0000-0000-0000-000000000010',
  'professional',
  'active'
);

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active, sort_order)
VALUES ('booking-mobile-service', '85000000-0000-0000-0000-000000000010', 'Corte Mobile', 50, 30, true, 1);

INSERT INTO public.professional_services (
  id, establishment_id, professional_id, service_id, price, duration_minutes, is_active
)
VALUES (
  '85000000-0000-0000-0000-000000000030',
  '85000000-0000-0000-0000-000000000010',
  '85000000-0000-0000-0000-000000000002',
  'booking-mobile-service',
  65,
  45,
  true
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('85000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  options_row record;
  first_slot record;
  booking_row record;
  target_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 2;
BEGIN
  SELECT * INTO options_row
  FROM public.get_client_booking_options('estudio-booking-mobile');

  IF options_row.establishment_id <> '85000000-0000-0000-0000-000000000010'::uuid
    OR jsonb_array_length(options_row.services) <> 1
    OR jsonb_array_length(options_row.professionals) <> 1
    OR jsonb_array_length(options_row.professional_services) <> 1
  THEN
    RAISE EXCEPTION 'FAIL: booking options are incomplete';
  END IF;

  SELECT * INTO first_slot
  FROM public.get_available_slots(
    '85000000-0000-0000-0000-000000000010',
    '85000000-0000-0000-0000-000000000002',
    'booking-mobile-service',
    target_date,
    NULL
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;

  IF first_slot.starts_at IS NULL OR first_slot.duration_minutes <> 45 THEN
    RAISE EXCEPTION 'FAIL: real availability did not resolve the professional duration';
  END IF;

  SELECT * INTO booking_row
  FROM public.create_client_appointment(
    '85000000-0000-0000-0000-000000000010',
    '85000000-0000-0000-0000-000000000002',
    'booking-mobile-service',
    first_slot.starts_at
  );

  IF booking_row.appointment_id IS NULL OR booking_row.appointment_status <> 'confirmed' THEN
    RAISE EXCEPTION 'FAIL: client booking did not return its final status';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.appointments AS appointment
    WHERE appointment.id = booking_row.appointment_id
      AND appointment.client_id = '85000000-0000-0000-0000-000000000001'
  ) THEN
    RAISE EXCEPTION 'FAIL: appointment was not assigned to the authenticated client';
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_client_appointment(%L, %L, %L, %L)',
      '85000000-0000-0000-0000-000000000010',
      '85000000-0000-0000-0000-000000000002',
      'booking-mobile-service',
      first_slot.starts_at
    ),
    'appointment_conflict'
  );
END $$;

RESET ROLE;
UPDATE public.establishments
SET account_status = 'blocked'
WHERE id = '85000000-0000-0000-0000-000000000010';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('85000000-0000-0000-0000-000000000001');

SELECT pg_temp.expect_error(
  $$SELECT public.create_appointment(
    '85000000-0000-0000-0000-000000000010',
    '85000000-0000-0000-0000-000000000002',
    'booking-mobile-service',
    date_trunc('hour', now() + interval '2 days'),
    NULL,
    NULL
  )$$,
  'establishment_unavailable'
);

RESET ROLE;
SET LOCAL ROLE anon;

SELECT pg_temp.expect_error(
  $$SELECT public.get_client_booking_options('estudio-booking-mobile')$$,
  'permission denied'
);

RESET ROLE;
ROLLBACK;
