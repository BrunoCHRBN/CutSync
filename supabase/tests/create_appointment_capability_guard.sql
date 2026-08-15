-- ============================================================================
-- Test Suite: create_appointment_capability_guard.sql
-- Module: PS3-E1.2 Capability-Based Appointment Authority
-- ============================================================================

BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_actor(
  actor_id uuid,
  actor_aal text DEFAULT 'aal2'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
    true
  );
END;
$$;

DO $test$
DECLARE
  superadmin_user_id uuid := gen_random_uuid();
  manager_user_id uuid := gen_random_uuid();
  prof_user_id uuid := gen_random_uuid();
  client_user_id uuid := gen_random_uuid();
  outsider_user_id uuid := gen_random_uuid();

  unit_id uuid := gen_random_uuid();
  service_id text := 'srv-' || substr(gen_random_uuid()::text, 1, 8);
  created_appt_id text;
  caught_error boolean;
  err_msg text;

  opening_hours_json text := '[{"day":0,"name":"Domingo","isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"name":"Segunda-feira","isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"name":"Terça-feira","isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"name":"Quarta-feira","isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"name":"Quinta-feira","isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"name":"Sexta-feira","isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"name":"Sábado","isOpen":true,"open":"08:00","close":"20:00"}]';
  booking_time timestamptz := ((date_trunc('week', now() + interval '1 week')::date + 1)::text || ' 10:00:00-03')::timestamptz;
  booking_time_2 timestamptz := ((date_trunc('week', now() + interval '1 week')::date + 1)::text || ' 11:00:00-03')::timestamptz;
  booking_time_3 timestamptz := ((date_trunc('week', now() + interval '1 week')::date + 1)::text || ' 14:00:00-03')::timestamptz;
  booking_time_4 timestamptz := ((date_trunc('week', now() + interval '1 week')::date + 1)::text || ' 15:00:00-03')::timestamptz;
BEGIN
  -- 1. Setup users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (superadmin_user_id, 'superadmin@example.test', now()),
    (manager_user_id, 'manager@example.test', now()),
    (prof_user_id, 'prof@example.test', now()),
    (client_user_id, 'client@example.test', now()),
    (outsider_user_id, 'outsider@example.test', now());

  -- 2. Setup establishment
  INSERT INTO public.establishments (
    id, name, slug, address, account_status, lifecycle_status, timezone, opening_hours
  ) VALUES (
    unit_id, 'Studio Capability Guard', 'studio-cap-guard-' || substr(unit_id::text, 1, 8),
    'Rua das Flores, 100', 'active', 'active', 'America/Sao_Paulo', opening_hours_json
  );

  INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
  VALUES (service_id, unit_id, 'Corte Cabelo', 50, 30, true);

  -- 3. Setup profiles
  INSERT INTO public.profiles (id, establishment_id, name, email, role, work_hours)
  VALUES
    (superadmin_user_id, unit_id, 'Super Admin', 'superadmin@example.test', 'admin', opening_hours_json),
    (manager_user_id, unit_id, 'Manager User', 'manager@example.test', 'professional', opening_hours_json),
    (prof_user_id, unit_id, 'Prof User', 'prof@example.test', 'professional', opening_hours_json),
    (client_user_id, NULL, 'Client User', 'client@example.test', 'client', NULL),
    (outsider_user_id, NULL, 'Outsider User', 'outsider@example.test', 'client', NULL)
  ON CONFLICT (id) DO UPDATE SET
    establishment_id = EXCLUDED.establishment_id,
    work_hours = EXCLUDED.work_hours;

  -- 4. Setup memberships
  INSERT INTO public.memberships (id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (gen_random_uuid(), superadmin_user_id, unit_id, 'superadmin', 'admin', 'active'),
    (gen_random_uuid(), manager_user_id, unit_id, 'professional', 'manager', 'active'),
    (gen_random_uuid(), prof_user_id, unit_id, 'professional', 'professional', 'active');

  -- Professional service association
  INSERT INTO public.professional_services (establishment_id, professional_id, service_id, price, duration_minutes, is_active)
  VALUES (unit_id, prof_user_id, service_id, 50, 30, true);

  -- =========================================================================
  -- TEST 1: Manager with appointment capability can operate appointment
  -- =========================================================================
  PERFORM pg_temp.set_actor(manager_user_id);
  created_appt_id := public.create_appointment(
    unit_id, prof_user_id, service_id, booking_time, 'Cliente Balcao', client_user_id
  );
  IF created_appt_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Manager was unable to create appointment';
  END IF;

  -- =========================================================================
  -- TEST 2: Professional self-walk-in capability
  -- =========================================================================
  PERFORM pg_temp.set_actor(prof_user_id);
  created_appt_id := public.create_appointment(
    unit_id, prof_user_id, service_id, booking_time_2, 'Cliente Direto', client_user_id
  );
  IF created_appt_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Professional was unable to create appointment for self';
  END IF;

  -- =========================================================================
  -- TEST 3: Client booking with active establishment
  -- =========================================================================
  PERFORM pg_temp.set_actor(client_user_id);
  created_appt_id := public.create_appointment(
    unit_id, prof_user_id, service_id, booking_time_3, 'Cliente Online', client_user_id
  );
  IF created_appt_id IS NULL THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Client was unable to book appointment on active establishment';
  END IF;

  -- =========================================================================
  -- TEST 4: Non-active establishment blocks client booking
  -- =========================================================================
  PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
  UPDATE public.establishments SET lifecycle_status = 'paused' WHERE id = unit_id;
  PERFORM set_config('app.lifecycle_rpc', '', true);
  PERFORM pg_temp.set_actor(client_user_id);

  caught_error := false;
  BEGIN
    PERFORM public.create_appointment(
      unit_id, prof_user_id, service_id, booking_time_4, 'Tentativa Pausada', client_user_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;

  IF NOT caught_error OR err_msg NOT LIKE '%establishment_unavailable%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected establishment_unavailable for paused unit, got %', err_msg;
  END IF;

  RAISE NOTICE 'SUCCESS: create_appointment_capability_guard passed all tests.';
END $test$;

ROLLBACK;
