-- ============================================================================
-- Test Suite: finalize_onboarding_v2_semantics.sql
-- Module: PS3-E1.2 Idempotency and Concurrency Semantics in Onboarding V2
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
  unit_id uuid := gen_random_uuid();
  service_id text := 'srv-' || substr(gen_random_uuid()::text, 1, 8);
  req_id uuid := gen_random_uuid();
  initial_version integer := 1;
  opening_hours_str text := '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]';

  finalize_res jsonb;
  updated_est record;
  caught_error boolean;
  err_msg text;
BEGIN
  -- 1. Setup user & establishment
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_user_id, 'onboard-admin@example.test', now()),
    (prof_user_id, 'onboard-prof@example.test', now());

  INSERT INTO public.establishments (
    id, name, slug, address, account_status, lifecycle_status, lifecycle_version, timezone
  ) VALUES (
    unit_id, 'Studio Onboarding V2', 'studio-onb-v2-' || substr(unit_id::text, 1, 8),
    'Rua Onboarding, 100', 'pending_verification', 'configuring', initial_version, 'America/Sao_Paulo'
  );

  INSERT INTO public.profiles (id, establishment_id, name, email, role)
  VALUES
    (admin_user_id, unit_id, 'Admin User', 'onboard-admin@example.test', 'admin'),
    (prof_user_id, unit_id, 'Prof User', 'onboard-prof@example.test', 'professional')
  ON CONFLICT (id) DO UPDATE SET establishment_id = EXCLUDED.establishment_id;

  INSERT INTO public.memberships (id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (gen_random_uuid(), admin_user_id, unit_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), prof_user_id, unit_id, 'professional', 'professional', 'active');

  -- Add active service & professional assignment so configuration readiness passes
  INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
  VALUES (service_id, unit_id, 'Corte Essencial', 50, 30, true);

  INSERT INTO public.professional_services (establishment_id, professional_id, service_id, price, duration_minutes, is_active)
  VALUES (unit_id, prof_user_id, service_id, 50, 30, true);

  PERFORM pg_temp.set_actor(admin_user_id);

  -- =========================================================================
  -- TEST 1: Rejects version mismatch (concurrency guard)
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.finalize_establishment_onboarding_v2(
      unit_id, opening_hours_str, initial_version + 99, req_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%lifecycle_version_conflict%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected lifecycle_version_conflict on stale version, got %', err_msg;
  END IF;

  -- =========================================================================
  -- TEST 2: Successful finalization updates status to ready, preserves pending_verification, and increments version
  -- =========================================================================
  finalize_res := public.finalize_establishment_onboarding_v2(
    unit_id, opening_hours_str, initial_version, req_id
  );

  IF finalize_res->>'lifecycleStatus' <> 'ready' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected lifecycleStatus ready, got %', finalize_res->>'lifecycleStatus';
  END IF;

  IF (finalize_res->>'version')::integer <> initial_version + 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected version %, got %', initial_version + 1, finalize_res->>'version';
  END IF;

  IF finalize_res->>'accountStatus' <> 'pending_verification' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected accountStatus pending_verification, got %', finalize_res->>'accountStatus';
  END IF;

  IF (finalize_res->>'replayed')::boolean <> false THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected replayed = false for initial call';
  END IF;

  -- =========================================================================
  -- TEST 3: Idempotency replay with identical request_id returns replayed: true
  -- =========================================================================
  finalize_res := public.finalize_establishment_onboarding_v2(
    unit_id, opening_hours_str, initial_version + 1, req_id
  );

  IF (finalize_res->>'replayed')::boolean <> true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: Expected replayed = true on replay';
  END IF;

  RAISE NOTICE 'SUCCESS: finalize_onboarding_v2_semantics passed all tests.';
END $test$;

ROLLBACK;
