-- ============================================================================
-- Test Suite: public_discovery_boundary_integrity.sql
-- Module: PS3-E1.2 Public Discovery Lifecycle & Account Boundary Integrity
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
  outsider_user_id uuid := gen_random_uuid();

  -- Active & Active unit (fully eligible)
  unit_active_id uuid := gen_random_uuid();
  -- Configuring unit
  unit_configuring_id uuid := gen_random_uuid();
  -- Ready unit
  unit_ready_id uuid := gen_random_uuid();
  -- Paused unit
  unit_paused_id uuid := gen_random_uuid();
  -- Pending verification unit
  unit_pending_id uuid := gen_random_uuid();
  -- Blocked unit
  unit_blocked_id uuid := gen_random_uuid();

  disc_count integer;
  pub_res record;
  req_json jsonb;
  caught_error boolean;
  err_msg text;
BEGIN
  -- 1. Create test users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_user_id, 'discovery-admin@example.test', now()),
    (outsider_user_id, 'discovery-outsider@example.test', now());

  -- 2. Setup establishments across different lifecycle and account states
  INSERT INTO public.establishments (
    id, name, slug, address, account_status, lifecycle_status, discovery_status, timezone
  ) VALUES
    (unit_active_id, 'Studio Alpha Active', 'studio-alpha-act-' || substr(unit_active_id::text, 1, 8), 'Rua Alpha, 100', 'active', 'active', 'published', 'America/Sao_Paulo'),
    (unit_configuring_id, 'Studio Beta Config', 'studio-beta-cfg-' || substr(unit_configuring_id::text, 1, 8), 'Rua Beta, 200', 'active', 'configuring', 'published', 'America/Sao_Paulo'),
    (unit_ready_id, 'Studio Gamma Ready', 'studio-gamma-rdy-' || substr(unit_ready_id::text, 1, 8), 'Rua Gamma, 300', 'active', 'ready', 'published', 'America/Sao_Paulo'),
    (unit_paused_id, 'Studio Delta Paused', 'studio-delta-paus-' || substr(unit_paused_id::text, 1, 8), 'Rua Delta, 400', 'active', 'paused', 'published', 'America/Sao_Paulo'),
    (unit_pending_id, 'Studio Epsilon Pend', 'studio-eps-pend-' || substr(unit_pending_id::text, 1, 8), 'Rua Epsilon, 500', 'pending_verification', 'active', 'published', 'America/Sao_Paulo'),
    (unit_blocked_id, 'Studio Zeta Block', 'studio-zeta-blk-' || substr(unit_blocked_id::text, 1, 8), 'Rua Zeta, 600', 'blocked', 'active', 'published', 'America/Sao_Paulo');

  -- Active services for all test units
  INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
  VALUES
    (gen_random_uuid(), unit_active_id, 'Corte Cabelo', 50, 30, true),
    (gen_random_uuid(), unit_configuring_id, 'Corte Cabelo', 50, 30, true),
    (gen_random_uuid(), unit_ready_id, 'Corte Cabelo', 50, 30, true),
    (gen_random_uuid(), unit_paused_id, 'Corte Cabelo', 50, 30, true),
    (gen_random_uuid(), unit_pending_id, 'Corte Cabelo', 50, 30, true),
    (gen_random_uuid(), unit_blocked_id, 'Corte Cabelo', 50, 30, true);

  -- Setup admin membership
  INSERT INTO public.memberships (id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (gen_random_uuid(), admin_user_id, unit_active_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), admin_user_id, unit_configuring_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), admin_user_id, unit_ready_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), admin_user_id, unit_paused_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), admin_user_id, unit_pending_id, 'admin', 'admin', 'active');

  -- =========================================================================
  -- TEST 1: list_public_discovery_establishments filters out non-active lifecycle / account
  -- =========================================================================
  SELECT count(*) INTO disc_count
  FROM public.list_public_discovery_establishments(50)
  WHERE id = unit_active_id;
  IF disc_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: unit_active_id should be present in public discovery';
  END IF;

  SELECT count(*) INTO disc_count
  FROM public.list_public_discovery_establishments(50)
  WHERE id IN (unit_configuring_id, unit_ready_id, unit_paused_id, unit_pending_id, unit_blocked_id);
  IF disc_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED: non-active units leaked into public discovery: count=%', disc_count;
  END IF;

  -- =========================================================================
  -- TEST 2: establishment_discovery_requirements checks both account_active and lifecycle_active
  -- =========================================================================
  req_json := public.establishment_discovery_requirements(unit_active_id);
  IF (req_json->>'account_active')::boolean <> true OR (req_json->>'lifecycle_active')::boolean <> true THEN
    RAISE EXCEPTION 'ASSERTION FAILED: active unit requirements expected true, got %', req_json;
  END IF;

  req_json := public.establishment_discovery_requirements(unit_configuring_id);
  IF (req_json->>'lifecycle_active')::boolean <> false THEN
    RAISE EXCEPTION 'ASSERTION FAILED: configuring unit should have lifecycle_active = false';
  END IF;

  -- =========================================================================
  -- TEST 3: publish_establishment_discovery rejects non-active lifecycle or account
  -- =========================================================================
  PERFORM pg_temp.set_actor(admin_user_id);

  -- Reset discovery status of unit_active_id to draft for testing publication
  UPDATE public.establishments SET discovery_status = 'draft', published_at = NULL WHERE id = unit_active_id;

  -- Should succeed for active unit
  BEGIN
    SELECT * INTO pub_res FROM public.publish_establishment_discovery(unit_active_id);
    IF pub_res.discovery_status <> 'published' THEN
      RAISE EXCEPTION 'Expected published status, got %', pub_res.discovery_status;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ASSERTION FAILED: publish_establishment_discovery failed on valid active unit: %', SQLERRM;
  END;

  -- Attempt to publish unit with configuring lifecycle -> MUST FAIL
  caught_error := false;
  BEGIN
    PERFORM public.publish_establishment_discovery(unit_configuring_id);
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%FORBIDDEN%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected FORBIDDEN when publishing unit in configuring lifecycle, got %', err_msg;
  END IF;

  -- Attempt to publish unit with pending_verification account_status -> MUST FAIL
  caught_error := false;
  BEGIN
    PERFORM public.publish_establishment_discovery(unit_pending_id);
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  IF NOT caught_error OR err_msg NOT LIKE '%FORBIDDEN%' THEN
    RAISE EXCEPTION 'ASSERTION FAILED: expected FORBIDDEN when publishing unit in pending_verification status, got %', err_msg;
  END IF;

  RAISE NOTICE 'SUCCESS: public_discovery_boundary_integrity passed all tests.';
END $test$;

ROLLBACK;
