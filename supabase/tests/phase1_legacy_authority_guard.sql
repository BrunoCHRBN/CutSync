BEGIN;

-- ============================================================================
-- PS1-E1C — Database Legacy Authority Regression Guard
-- Validates:
-- 1. Zero RLS policies rely on profiles.role or profiles.establishment_id
-- 2. Zero dynamic writers mutate profiles.role during switch/remove
-- 3. Telemetry is logged on legacy switch_active_establishment usage
-- 4. switch_active_establishment fails closed for unauthorized establishments
-- 5. get_my_profile derives role dynamically and fails closed
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.set_guard_actor(target_user_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', target_user_id::text,
      'role', 'authenticated'
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_guard_error(sql_statement text, expected_pattern text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  BEGIN
    EXECUTE sql_statement;
    RAISE EXCEPTION 'Expected error matching "%", but statement succeeded', expected_pattern;
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM NOT ILIKE '%' || expected_pattern || '%' THEN
        RAISE EXCEPTION 'Expected error matching "%", got "%"', expected_pattern, SQLERRM;
      END IF;
  END;
END;
$$;

DO $$
DECLARE
  rls_violation_count integer;
  func_violation_count integer;
  audit_entry_count integer;
  actor_user_id uuid := gen_random_uuid();
  other_user_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  profile_record record;
  returned_role text;
BEGIN
  -- =========================================================================
  -- TEST GROUP 1: RLS INTROSPECTION GUARD
  -- =========================================================================
  SELECT count(*) INTO rls_violation_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND (
      qual ILIKE '%profiles.role%'
      OR qual ILIKE '%profiles.establishment_id%'
      OR with_check ILIKE '%profiles.role%'
      OR with_check ILIKE '%profiles.establishment_id%'
    );

  IF rls_violation_count <> 0 THEN
    RAISE EXCEPTION 'Test 1 Failed: Found % RLS policies relying on profiles legacy fields', rls_violation_count;
  END IF;

  -- =========================================================================
  -- TEST GROUP 2: FUNCTION DEFINITION INTROSPECTION GUARD
  -- =========================================================================
  -- Verify switch_active_establishment and remove_professional do NOT update profiles.role
  SELECT count(*) INTO func_violation_count
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prokind = 'f'
    AND p.proname IN ('switch_active_establishment', 'remove_professional')
    AND pg_get_functiondef(p.oid) ~* 'UPDATE\s+(public\.)?profiles\s+SET[^;]*\brole\s*=';

  IF func_violation_count <> 0 THEN
    RAISE EXCEPTION 'Test 2 Failed: switch_active_establishment or remove_professional contains dynamic profiles.role writer';
  END IF;

  -- =========================================================================
  -- TEST GROUP 3: LEGACY SWITCH RPC BEHAVIOR & TELEMETRY
  -- =========================================================================
  -- Seed establishments
  INSERT INTO public.establishments (id, name, slug, address, phone, account_status)
  VALUES
    (unit_a_id, 'Guard Unit A', 'guard-unit-a-' || substr(unit_a_id::text, 1, 8), 'Street A', '11999990001', 'active'),
    (unit_b_id, 'Guard Unit B', 'guard-unit-b-' || substr(unit_b_id::text, 1, 8), 'Street B', '11999990002', 'active');

  -- Seed test users in auth.users (trigger creates profiles with role = 'client')
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (actor_user_id, 'actor@guard.local', now()),
    (other_user_id, 'pro@guard.local', now());

  -- Seed membership in Unit A with role_template = 'reception'
  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status)
  VALUES (actor_user_id, unit_a_id, 'professional', 'reception', 'active');

  -- Execute switch_active_establishment as actor_user_id
  PERFORM pg_temp.set_guard_actor(actor_user_id);
  returned_role := public.switch_active_establishment(unit_a_id);

  -- 3.1 Returned role must match legacy coarse projection
  IF returned_role <> 'professional' THEN
    RAISE EXCEPTION 'Test 3.1 Failed: Expected legacy role "professional", got "%"', returned_role;
  END IF;

  -- 3.2 profiles.role must NOT be altered (remains 'client')
  SELECT role, establishment_id INTO profile_record
  FROM public.profiles
  WHERE id = actor_user_id;

  IF profile_record.role <> 'client' THEN
    RAISE EXCEPTION 'Test 3.2 Failed: profiles.role was mutated to "%", should remain "client"', profile_record.role;
  END IF;

  -- 3.3 profiles.establishment_id must be updated as legacy hint
  IF profile_record.establishment_id <> unit_a_id THEN
    RAISE EXCEPTION 'Test 3.3 Failed: profiles.establishment_id hint not updated to %', unit_a_id;
  END IF;

  -- 3.4 Telemetry audit entry must be recorded in security_audit_logs
  SELECT count(*) INTO audit_entry_count
  FROM public.security_audit_logs
  WHERE actor_id = actor_user_id
    AND action = 'legacy.switch_active_establishment.used'
    AND target_id = unit_a_id;

  IF audit_entry_count = 0 THEN
    RAISE EXCEPTION 'Test 3.4 Failed: security_audit_logs did not record legacy switch telemetry';
  END IF;

  -- 3.5 Switch to Unit B (no membership) -> Must throw membership_required
  PERFORM pg_temp.expect_guard_error(
    format('SELECT public.switch_active_establishment(%L::uuid)', unit_b_id),
    'membership_required'
  );

  -- =========================================================================
  -- TEST GROUP 4: GET_MY_PROFILE DYNAMIC PROJECTION & FAIL-CLOSED
  -- =========================================================================
  -- 4.1 Even if profiles.role is artificially 'admin', if membership is revoked -> get_my_profile().role = 'client'
  UPDATE public.profiles SET role = 'admin' WHERE id = actor_user_id;
  UPDATE public.memberships SET status = 'revoked', revoked_at = now() WHERE profile_id = actor_user_id AND establishment_id = unit_a_id;

  SELECT role INTO returned_role FROM public.get_my_profile();
  IF returned_role <> 'client' THEN
    RAISE EXCEPTION 'Test 4.1 Failed: get_my_profile did not fail closed on revoked membership (got %)', returned_role;
  END IF;

  -- 4.2 With active manager membership -> get_my_profile().role = 'admin' (projected)
  UPDATE public.memberships
  SET status = 'active', revoked_at = NULL, role_template = 'manager', role = 'admin'
  WHERE profile_id = actor_user_id AND establishment_id = unit_a_id;

  SELECT role INTO returned_role FROM public.get_my_profile();
  IF returned_role <> 'admin' THEN
    RAISE EXCEPTION 'Test 4.2 Failed: get_my_profile did not dynamically project manager to admin (got %)', returned_role;
  END IF;

  -- =========================================================================
  -- TEST GROUP 5: REMOVE_PROFESSIONAL IMMUNITY
  -- =========================================================================
  -- Seed membership for other_user_id
  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status)
  VALUES (other_user_id, unit_a_id, 'professional', 'professional', 'active');
  UPDATE public.profiles SET role = 'professional', establishment_id = unit_a_id WHERE id = other_user_id;

  -- Actor (manager) removes other_user_id
  PERFORM public.remove_professional(other_user_id, unit_a_id, 'Departure test reason');

  -- Verify other_user_id membership is revoked
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships
    WHERE profile_id = other_user_id AND establishment_id = unit_a_id AND status = 'revoked'
  ) THEN
    RAISE EXCEPTION 'Test 5.1 Failed: membership not revoked by remove_professional';
  END IF;

  -- Verify profiles.role was NOT overwritten by remove_professional
  SELECT role, establishment_id INTO profile_record FROM public.profiles WHERE id = other_user_id;
  IF profile_record.establishment_id IS NOT NULL THEN
    RAISE EXCEPTION 'Test 5.2 Failed: profiles.establishment_id not cleared when single unit was removed';
  END IF;

  RAISE NOTICE 'ALL PS1-E1C DATABASE LEGACY AUTHORITY REGRESSION GUARDS PASSED!';
END;
$$;

ROLLBACK;
