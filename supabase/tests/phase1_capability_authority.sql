BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_capability_actor(actor_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
END;
$$;

DO $test$
DECLARE
  admin_user_id uuid := gen_random_uuid();
  manager_user_id uuid := gen_random_uuid();
  manager_denied_user_id uuid := gen_random_uuid();
  reception_user_id uuid := gen_random_uuid();
  finance_user_id uuid := gen_random_uuid();
  prof_user_id uuid := gen_random_uuid();
  prof_other_id uuid := gen_random_uuid();
  revoked_admin_id uuid := gen_random_uuid();

  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();

  block_id uuid;
  test_error text;
  manager_membership_id uuid := gen_random_uuid();
BEGIN
  -- Setup test users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_user_id, 'admin@example.test', now()),
    (manager_user_id, 'manager@example.test', now()),
    (manager_denied_user_id, 'managerdenied@example.test', now()),
    (reception_user_id, 'reception@example.test', now()),
    (finance_user_id, 'finance@example.test', now()),
    (prof_user_id, 'prof@example.test', now()),
    (prof_other_id, 'profother@example.test', now()),
    (revoked_admin_id, 'revokedadmin@example.test', now());

  INSERT INTO public.establishments(id, name, slug, account_status, timezone)
  VALUES
    (unit_a_id, 'Test Establishment A', 'test-unit-a-' || substr(unit_a_id::text, 1, 8), 'active', 'America/Sao_Paulo'),
    (unit_b_id, 'Test Establishment B', 'test-unit-b-' || substr(unit_b_id::text, 1, 8), 'active', 'America/Sao_Paulo');

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (admin_user_id, unit_a_id, 'Admin User', 'admin@example.test', 'admin'),
    (manager_user_id, unit_a_id, 'Manager User', 'manager@example.test', 'professional'),
    (manager_denied_user_id, unit_a_id, 'Manager Denied User', 'managerdenied@example.test', 'professional'),
    (reception_user_id, unit_a_id, 'Reception User', 'reception@example.test', 'client'),
    (finance_user_id, unit_a_id, 'Finance User', 'finance@example.test', 'client'),
    (prof_user_id, unit_a_id, 'Prof User', 'prof@example.test', 'professional'),
    (prof_other_id, unit_a_id, 'Prof Other User', 'profother@example.test', 'professional'),
    (revoked_admin_id, unit_a_id, 'Revoked Admin', 'revokedadmin@example.test', 'admin');

  -- Setup memberships
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status)
  VALUES
    (admin_user_id, unit_a_id, 'admin', 'admin', 'active'),
    (manager_user_id, unit_a_id, 'professional', 'manager', 'active'),
    (reception_user_id, unit_a_id, 'professional', 'reception', 'active'),
    (finance_user_id, unit_a_id, 'professional', 'finance', 'active'),
    (prof_user_id, unit_a_id, 'professional', 'professional', 'active'),
    (prof_other_id, unit_a_id, 'professional', 'professional', 'active');

  INSERT INTO public.memberships(id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (manager_membership_id, manager_denied_user_id, unit_a_id, 'professional', 'manager', 'active');

  -- Deny override on manager_denied_user_id for manage_services
  INSERT INTO public.membership_capability_overrides (
    membership_id, establishment_id, capability, effect, valid_from, created_by
  ) VALUES (
    manager_membership_id, unit_a_id, 'manage_services', 'deny', now(), admin_user_id
  );

  -- Revoked membership
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status, revoked_at)
  VALUES (revoked_admin_id, unit_a_id, 'admin', 'admin', 'revoked', now());

  -- -------------------------------------------------------------------------
  -- TEST 1: Admin has manage_services, manage_team, manage_admins
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(admin_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Test 1 Failed: Admin must have manage_services';
  END IF;
  IF NOT public.has_business_capability(unit_a_id, 'manage_team') THEN
    RAISE EXCEPTION 'Test 1 Failed: Admin must have manage_team';
  END IF;
  IF NOT public.has_business_capability(unit_a_id, 'manage_admins') THEN
    RAISE EXCEPTION 'Test 1 Failed: Admin must have manage_admins';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 2: Professional has manage_own_blocks, but NOT manage_services or manage_team
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'manage_own_blocks') THEN
    RAISE EXCEPTION 'Test 2 Failed: Professional must have manage_own_blocks';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Test 2 Failed: Professional must NOT have manage_services';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_team') THEN
    RAISE EXCEPTION 'Test 2 Failed: Professional must NOT have manage_team';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 3: Reception has create_team_walk_in & manage_clients, but NOT manage_services or manage_team
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(reception_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'create_team_walk_in') THEN
    RAISE EXCEPTION 'Test 3 Failed: Reception must have create_team_walk_in';
  END IF;
  IF NOT public.has_business_capability(unit_a_id, 'manage_clients') THEN
    RAISE EXCEPTION 'Test 3 Failed: Reception must have manage_clients';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Test 3 Failed: Reception must NOT have manage_services';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_team') THEN
    RAISE EXCEPTION 'Test 3 Failed: Reception must NOT have manage_team';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 4: Finance has view_unit_reports & view_financial_reports, but NOT manage_team
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(finance_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'view_unit_reports') THEN
    RAISE EXCEPTION 'Test 4 Failed: Finance must have view_unit_reports';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_team') THEN
    RAISE EXCEPTION 'Test 4 Failed: Finance must NOT have manage_team';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 5: Manager has manage_services and manage_team, but NOT manage_admins
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(manager_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Test 5 Failed: Manager must have manage_services';
  END IF;
  IF NOT public.has_business_capability(unit_a_id, 'manage_team') THEN
    RAISE EXCEPTION 'Test 5 Failed: Manager must have manage_team';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_admins') THEN
    RAISE EXCEPTION 'Test 5 Failed: Manager must NOT have manage_admins';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 6: Manager with deny override has manage_services revoked
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(manager_denied_user_id);
  IF public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Test 6 Failed: Manager with deny override must NOT have manage_services';
  END IF;
  -- But still has other manager capabilities
  IF NOT public.has_business_capability(unit_a_id, 'manage_team') THEN
    RAISE EXCEPTION 'Test 6 Failed: Manager with deny override must still have manage_team';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 7: Revoked membership has NO capabilities
  -- -------------------------------------------------------------------------
  PERFORM pg_temp.set_capability_actor(revoked_admin_id);
  IF public.has_business_capability(unit_a_id, 'manage_services')
    OR public.has_business_capability(unit_a_id, 'manage_team')
    OR public.has_business_capability(unit_a_id, 'view_own_agenda')
  THEN
    RAISE EXCEPTION 'Test 7 Failed: Revoked membership must have no capabilities';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 8: RPC schedule blocks enforcement
  -- -------------------------------------------------------------------------
  -- 8A: Professional creates own block -> SUCCESS
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  block_id := public.create_schedule_block(
    unit_a_id, prof_user_id, now() + interval '2 hours', now() + interval '3 hours', 'break', 'Almoco'
  );
  IF block_id IS NULL THEN
    RAISE EXCEPTION 'Test 8A Failed: Professional should create own block';
  END IF;

  -- 8B: Professional tries to create block for another professional -> FORBIDDEN
  test_error := NULL;
  BEGIN
    PERFORM public.create_schedule_block(
      unit_a_id, prof_other_id, now() + interval '4 hours', now() + interval '5 hours', 'break', 'Bloqueio alheio'
    );
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'Test 8B Failed: Expected forbidden when prof creates block for another prof, got %', test_error;
  END IF;

  -- 8C: Manager (has manage_team_blocks) creates block for another professional -> SUCCESS
  PERFORM pg_temp.set_capability_actor(manager_user_id);
  block_id := public.create_schedule_block(
    unit_a_id, prof_other_id, now() + interval '4 hours', now() + interval '5 hours', 'break', 'Bloqueio gerente'
  );
  IF block_id IS NULL THEN
    RAISE EXCEPTION 'Test 8C Failed: Manager should create block for team member';
  END IF;

  -- -------------------------------------------------------------------------
  -- TEST 9: IDOR protection (Unit A user operating on Unit B)
  -- -------------------------------------------------------------------------
  -- Admin of Unit A trying to manage Unit B -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(admin_user_id);
  IF public.has_business_capability(unit_b_id, 'manage_services') THEN
    RAISE EXCEPTION 'Test 9 Failed: Admin of Unit A must NOT have capabilities in Unit B';
  END IF;
  test_error := NULL;
  BEGIN
    PERFORM public.admin_update_professional(
      prof_user_id, unit_b_id, jsonb_build_object('commission_rate', 0.6)
    );
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'Test 9 IDOR Failed: Expected forbidden for Unit B update, got %', test_error;
  END IF;

END;
$test$;

ROLLBACK;
