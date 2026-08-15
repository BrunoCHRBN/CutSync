-- ============================================================================
-- Test Suite: public_discovery_boundary_integrity.sql
-- Module: PS3-E1.3 Public Discovery Editorial Decoupling & Boundary Integrity
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

  unit_active_id uuid := gen_random_uuid();
  unit_configuring_id uuid := gen_random_uuid();
  unit_ready_id uuid := gen_random_uuid();
  unit_paused_id uuid := gen_random_uuid();
  unit_pending_id uuid := gen_random_uuid();
  unit_blocked_id uuid := gen_random_uuid();

  disc_count integer;
  pub_res record;
  req_json jsonb;
  initial_published_at timestamptz;
  current_est record;
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
    id, name, slug, address, account_status, lifecycle_status, lifecycle_version, discovery_status, timezone, opening_hours
  ) VALUES
    (unit_active_id, 'Studio Alpha Active', 'studio-alpha-act-' || substr(unit_active_id::text, 1, 8), 'Rua Alpha, 100', 'active', 'active', 2, 'published', 'America/Sao_Paulo', '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]'),
    (unit_configuring_id, 'Studio Beta Config', 'studio-beta-cfg-' || substr(unit_configuring_id::text, 1, 8), 'Rua Beta, 200', 'active', 'configuring', 1, 'published', 'America/Sao_Paulo', '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]'),
    (unit_ready_id, 'Studio Gamma Ready', 'studio-gamma-rdy-' || substr(unit_ready_id::text, 1, 8), 'Rua Gamma, 300', 'active', 'ready', 2, 'published', 'America/Sao_Paulo', '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]'),
    (unit_paused_id, 'Studio Delta Paused', 'studio-delta-paus-' || substr(unit_paused_id::text, 1, 8), 'Rua Delta, 400', 'active', 'paused', 3, 'published', 'America/Sao_Paulo', '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]'),
    (unit_pending_id, 'Studio Epsilon Pend', 'studio-eps-pend-' || substr(unit_pending_id::text, 1, 8), 'Rua Epsilon, 500', 'pending_verification', 'active', 2, 'published', 'America/Sao_Paulo', '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]'),
    (unit_blocked_id, 'Studio Zeta Block', 'studio-zeta-blk-' || substr(unit_blocked_id::text, 1, 8), 'Rua Zeta, 600', 'blocked', 'active', 2, 'published', 'America/Sao_Paulo', '[{"day":0,"isOpen":true,"open":"09:00","close":"18:00"}]');

  INSERT INTO public.profiles (id, establishment_id, name, email, role)
  VALUES
    (admin_user_id, unit_active_id, 'Admin User', 'discovery-admin@example.test', 'admin'),
    (outsider_user_id, NULL, 'Outsider User', 'discovery-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET establishment_id = EXCLUDED.establishment_id;

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
    RAISE EXCEPTION 'ASSERTION FAILED 1: unit_active_id should be present in public discovery';
  END IF;

  SELECT count(*) INTO disc_count
  FROM public.list_public_discovery_establishments(50)
  WHERE id IN (unit_configuring_id, unit_ready_id, unit_paused_id, unit_pending_id, unit_blocked_id);
  IF disc_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED 1: non-active units leaked into public discovery: count=%', disc_count;
  END IF;

  -- =========================================================================
  -- TEST 2: publish_establishment_discovery rejects non-active lifecycle or account
  -- =========================================================================
  PERFORM pg_temp.set_actor(admin_user_id);

  UPDATE public.establishments SET discovery_status = 'draft', published_at = NULL WHERE id = unit_active_id;

  -- Should succeed for active unit
  BEGIN
    SELECT * INTO pub_res FROM public.publish_establishment_discovery(unit_active_id);
    IF pub_res.discovery_status <> 'published' THEN
      RAISE EXCEPTION 'Expected published status, got %', pub_res.discovery_status;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'ASSERTION FAILED 2: publish_establishment_discovery failed on valid active unit: %', SQLERRM;
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
    RAISE EXCEPTION 'ASSERTION FAILED 2: expected FORBIDDEN when publishing unit in configuring lifecycle, got %', err_msg;
  END IF;

  -- =========================================================================
  -- TEST 3: Discovery Transition Test (Operational Pause & Resume does NOT unpublish)
  -- =========================================================================
  SELECT published_at INTO initial_published_at FROM public.establishments WHERE id = unit_active_id;

  -- Pause establishment via canonical lifecycle setter
  PERFORM public.set_establishment_lifecycle_status(
    unit_active_id, 'paused', 2, 'Pausa operacional para reforma', gen_random_uuid()
  );

  SELECT * INTO current_est FROM public.establishments WHERE id = unit_active_id;
  IF current_est.discovery_status <> 'published' THEN
    RAISE EXCEPTION 'ASSERTION FAILED 3: Operational pause must NOT mutate editorial discovery_status, got: %', current_est.discovery_status;
  END IF;
  IF current_est.published_at <> initial_published_at THEN
    RAISE EXCEPTION 'ASSERTION FAILED 3: Operational pause must NOT wipe published_at timestamp';
  END IF;

  -- Verify effective exclusion from public listing
  SELECT count(*) INTO disc_count
  FROM public.list_public_discovery_establishments(50)
  WHERE id = unit_active_id;
  IF disc_count <> 0 THEN
    RAISE EXCEPTION 'ASSERTION FAILED 3: Paused unit must not appear in public listing';
  END IF;

  -- Resume establishment to active
  PERFORM public.set_establishment_lifecycle_status(
    unit_active_id, 'active', 3, 'Retomando operacao da unidade', gen_random_uuid()
  );

  SELECT * INTO current_est FROM public.establishments WHERE id = unit_active_id;
  IF current_est.discovery_status <> 'published' THEN
    RAISE EXCEPTION 'ASSERTION FAILED 3: Resumed unit must retain published discovery_status';
  END IF;

  -- Verify unit automatically reappears in public listing
  SELECT count(*) INTO disc_count
  FROM public.list_public_discovery_establishments(50)
  WHERE id = unit_active_id;
  IF disc_count <> 1 THEN
    RAISE EXCEPTION 'ASSERTION FAILED 3: Resumed unit should automatically reappear in public listing';
  END IF;

  RAISE NOTICE 'SUCCESS: public_discovery_boundary_integrity passed all tests.';
END $test$;

ROLLBACK;
