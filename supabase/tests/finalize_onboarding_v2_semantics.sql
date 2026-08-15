-- ============================================================================
-- Test Suite: finalize_onboarding_v2_semantics.sql
-- Module: PS3-E1.3 Idempotency and Concurrency Semantics in Onboarding V2
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
  admin_user_id uuid := gen_random_uuid();
  prof_user_id uuid := gen_random_uuid();

  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  unit_tracker_id uuid := gen_random_uuid();

  service_a_id text := 'srv-' || substr(gen_random_uuid()::text, 1, 8);
  service_b_id text := 'srv-' || substr(gen_random_uuid()::text, 1, 8);
  service_trk_id text := 'srv-' || substr(gen_random_uuid()::text, 1, 8);

  req_id uuid := gen_random_uuid();
  req_b_id uuid := gen_random_uuid();
  req_trk_id uuid := gen_random_uuid();
  initial_version integer := 1;

  opening_hours_str text := '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]';
  different_hours_str text := '[{"day":0,"isOpen":true,"open":"10:00","close":"19:00"}]';

  finalize_res jsonb;
  tracker_event record;
  tracker_row record;
  caught_error boolean;
  err_msg text;
BEGIN
  -- 1. Setup users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_user_id, 'onboard-admin@example.test', now()),
    (prof_user_id, 'onboard-prof@example.test', now());

  -- 2. Setup establishments (configuring, pending_verification)
  INSERT INTO public.establishments (
    id, name, slug, address, account_status, lifecycle_status, lifecycle_version, timezone
  ) VALUES
    (unit_a_id, 'Studio Onboarding A', 'studio-onb-a-' || substr(unit_a_id::text, 1, 8), 'Rua A, 100', 'pending_verification', 'configuring', initial_version, 'America/Sao_Paulo'),
    (unit_b_id, 'Studio Onboarding B', 'studio-onb-b-' || substr(unit_b_id::text, 1, 8), 'Rua B, 200', 'pending_verification', 'configuring', initial_version, 'America/Sao_Paulo'),
    (unit_tracker_id, 'Studio Onboarding Tracker', 'studio-onb-trk-' || substr(unit_tracker_id::text, 1, 8), 'Rua Trk, 300', 'pending_verification', 'configuring', initial_version, 'America/Sao_Paulo');

  INSERT INTO public.profiles (id, establishment_id, name, email, role)
  VALUES
    (admin_user_id, unit_a_id, 'Admin User', 'onboard-admin@example.test', 'admin'),
    (prof_user_id, unit_a_id, 'Prof User', 'onboard-prof@example.test', 'professional')
  ON CONFLICT (id) DO UPDATE SET establishment_id = EXCLUDED.establishment_id;

  INSERT INTO public.memberships (id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (gen_random_uuid(), admin_user_id, unit_a_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), prof_user_id, unit_a_id, 'professional', 'professional', 'active'),
    (gen_random_uuid(), admin_user_id, unit_b_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), prof_user_id, unit_b_id, 'professional', 'professional', 'active'),
    (gen_random_uuid(), admin_user_id, unit_tracker_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), prof_user_id, unit_tracker_id, 'professional', 'professional', 'active');

  -- Add active services & professional associations for readiness
  INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
  VALUES
    (service_a_id, unit_a_id, 'Corte A', 50, 30, true),
    (service_b_id, unit_b_id, 'Corte B', 50, 30, true),
    (service_trk_id, unit_tracker_id, 'Corte Trk', 50, 30, true);

  INSERT INTO public.professional_services (establishment_id, professional_id, service_id, price, duration_minutes, is_active)
  VALUES
    (unit_a_id, prof_user_id, service_a_id, 50, 30, true),
    (unit_b_id, prof_user_id, service_b_id, 50, 30, true),
    (unit_tracker_id, prof_user_id, service_trk_id, 50, 30, true);

  PERFORM pg_temp.set_actor(admin_user_id);

  -- =========================================================================
  -- TEST A: request_id NULL is rejected (invalid_onboarding_request)
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.finalize_establishment_onboarding_v2(
      unit_a_id, opening_hours_str, initial_version, NULL
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%invalid_onboarding_request%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED A: Expected invalid_onboarding_request on NULL request_id, got %', err_msg;
  END IF;

  -- =========================================================================
  -- TEST B: expected_version NULL or <= 0 is rejected (invalid_onboarding_request)
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.finalize_establishment_onboarding_v2(
      unit_a_id, opening_hours_str, 0, req_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%invalid_onboarding_request%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED B: Expected invalid_onboarding_request on expected_version <= 0, got %', err_msg;
  END IF;

  -- =========================================================================
  -- TEST C & I: Successful finalize without existing progress:
  -- - does not fabricate arbitrary user_onboarding_progress
  -- - advances to ready, version 2
  -- - accounts status preserved
  -- =========================================================================
  finalize_res := public.finalize_establishment_onboarding_v2(
    unit_a_id, opening_hours_str, initial_version, req_id
  );

  IF finalize_res->>'lifecycleStatus' <> 'ready'
    OR (finalize_res->>'version')::integer <> 2
    OR finalize_res->>'accountStatus' <> 'pending_verification'
    OR (finalize_res->>'replayed')::boolean <> false
  THEN
    RAISE EXCEPTION 'ASSERTION FAILED C: Unexpected finalize result: %', finalize_res;
  END IF;

  -- Verify no artificial user_onboarding_progress row was created
  IF EXISTS (
    SELECT 1 FROM public.user_onboarding_progress
    WHERE profile_id = admin_user_id AND establishment_id = unit_a_id
  ) THEN
    RAISE EXCEPTION 'ASSERTION FAILED I: Fabricated user_onboarding_progress row found when none existed previously';
  END IF;

  -- =========================================================================
  -- TEST C (Replay): Same request + same payload => safe replay
  -- =========================================================================
  finalize_res := public.finalize_establishment_onboarding_v2(
    unit_a_id, opening_hours_str, 2, req_id
  );

  IF (finalize_res->>'replayed')::boolean <> true
    OR finalize_res->>'lifecycleStatus' <> 'ready'
    OR (finalize_res->>'version')::integer <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION FAILED C (Replay): Expected replay true with original version 2, got %', finalize_res;
  END IF;

  -- =========================================================================
  -- TEST D: Same request + different opening_hours => idempotency_key_reused
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.finalize_establishment_onboarding_v2(
      unit_a_id, different_hours_str, 2, req_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%idempotency_key_reused%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED D: Expected idempotency_key_reused on modified payload, got %', err_msg;
  END IF;

  -- =========================================================================
  -- TEST E: Replay after unit is later transitioned to active
  -- Replay must return ORIGINAL result (ready, version 2), NOT active / version 3
  -- =========================================================================
  -- Approve account status via governance simulation & activate lifecycle
  PERFORM set_config('cutsync.governance_status_reason', 'Aprovacao de governanca para teste E', true);
  UPDATE public.establishments SET account_status = 'active' WHERE id = unit_a_id;
  PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
  UPDATE public.establishments SET lifecycle_status = 'active', lifecycle_version = 3 WHERE id = unit_a_id;
  PERFORM set_config('app.lifecycle_rpc', '', true);

  finalize_res := public.finalize_establishment_onboarding_v2(
    unit_a_id, opening_hours_str, 3, req_id
  );

  IF (finalize_res->>'replayed')::boolean <> true
    OR finalize_res->>'lifecycleStatus' <> 'ready'
    OR (finalize_res->>'version')::integer <> 2
  THEN
    RAISE EXCEPTION 'ASSERTION FAILED E: Stable replay must return original ready / version 2, got: %', finalize_res;
  END IF;

  -- =========================================================================
  -- TEST F: New request_id on already ready/active establishment => rejected
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.finalize_establishment_onboarding_v2(
      unit_a_id, opening_hours_str, 3, gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%onboarding_already_finalized%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED F: Expected onboarding_already_finalized on new request after unit is active, got %', err_msg;
  END IF;

  -- =========================================================================
  -- TEST G: Existing onboarding progress is completed through canonical state machine
  -- =========================================================================
  -- Seed existing user_onboarding_progress
  INSERT INTO public.user_onboarding_progress(
    profile_id, app_id, intent, context_kind, establishment_id,
    current_step, status, version, last_request_id
  ) VALUES (
    admin_user_id, 'web', 'establishment_operations', 'establishment', unit_tracker_id,
    'schedule_setup', 'in_progress', 3, gen_random_uuid()
  );

  finalize_res := public.finalize_establishment_onboarding_v2(
    unit_tracker_id, opening_hours_str, initial_version, req_trk_id
  );

  IF finalize_res->>'lifecycleStatus' <> 'ready' THEN
    RAISE EXCEPTION 'ASSERTION FAILED G: Finalize failed on tracker unit: %', finalize_res;
  END IF;

  SELECT * INTO tracker_row
  FROM public.user_onboarding_progress
  WHERE profile_id = admin_user_id AND establishment_id = unit_tracker_id;

  IF tracker_row.status <> 'completed'
    OR tracker_row.current_step <> 'completed'
    OR tracker_row.version <> 4
    OR tracker_row.last_request_id <> req_trk_id
  THEN
    RAISE EXCEPTION 'ASSERTION FAILED G: user_onboarding_progress not canonically updated: %', tracker_row;
  END IF;

  SELECT * INTO tracker_event
  FROM public.user_onboarding_events
  WHERE progress_id = tracker_row.id AND request_id = req_trk_id;

  IF NOT FOUND
    OR tracker_event.previous_step <> 'schedule_setup'
    OR tracker_event.resulting_step <> 'completed'
    OR tracker_event.previous_version <> 3
    OR tracker_event.resulting_version <> 4
  THEN
    RAISE EXCEPTION 'ASSERTION FAILED G: user_onboarding_events record missing or invalid: %', tracker_event;
  END IF;

  RAISE NOTICE 'SUCCESS: finalize_onboarding_v2_semantics passed all tests.';
END $test$;

ROLLBACK;
