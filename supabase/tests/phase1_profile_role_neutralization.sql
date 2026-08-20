BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_neutralization_actor(actor_id uuid)
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
  revoked_user_id uuid := gen_random_uuid();
  reception_user_id uuid := gen_random_uuid();
  manager_user_id uuid := gen_random_uuid();
  client_user_id uuid := gen_random_uuid();
  prof_active_user_id uuid := gen_random_uuid();
  org_member_user_id uuid := gen_random_uuid();

  unit_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  org_id uuid := gen_random_uuid();

  profile_result record;
  reception_caps text[];
  manager_caps text[];
  self_escalate_denied boolean := false;
  context_receipt jsonb;
  deletion_error text;
  deletion_result record;
BEGIN
  -- Setup test users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (revoked_user_id, 'revoked@example.test', now()),
    (reception_user_id, 'reception@example.test', now()),
    (manager_user_id, 'manager@example.test', now()),
    (client_user_id, 'client@example.test', now()),
    (prof_active_user_id, 'profactive@example.test', now()),
    (org_member_user_id, 'orgmember@example.test', now());

  INSERT INTO public.establishments(id, name, slug, account_status, timezone)
  VALUES
    (unit_id, 'Test Unit A', 'unit-a-' || substr(unit_id::text, 1, 8), 'active', 'America/Sao_Paulo'),
    (unit_b_id, 'Test Unit B', 'unit-b-' || substr(unit_b_id::text, 1, 8), 'active', 'America/Sao_Paulo');

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (org_id, 'Test Org A', 'active', org_member_user_id);

  -- Profiles setup with various legacy role values
  UPDATE public.profiles SET establishment_id = unit_id, name = 'Revoked User', role = 'admin' WHERE id = revoked_user_id;
  UPDATE public.profiles SET establishment_id = unit_id, name = 'Reception User', role = 'client' WHERE id = reception_user_id;
  UPDATE public.profiles SET establishment_id = unit_id, name = 'Manager User', role = 'client' WHERE id = manager_user_id;
  UPDATE public.profiles SET establishment_id = NULL, name = 'Pure Client', role = 'admin' WHERE id = client_user_id;
  UPDATE public.profiles SET establishment_id = unit_id, name = 'Active Professional', role = 'professional' WHERE id = prof_active_user_id;
  UPDATE public.profiles SET establishment_id = NULL, name = 'Org Member', role = 'client' WHERE id = org_member_user_id;

  -- Memberships setup
  -- 1. Revoked membership (was admin)
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status, revoked_at)
  VALUES (revoked_user_id, unit_id, 'admin', 'admin', 'revoked', now());

  -- 2. Reception membership (role_template = reception)
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status)
  VALUES (reception_user_id, unit_id, 'professional', 'reception', 'active');

  -- 3. Manager membership (role_template = manager)
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status)
  VALUES (manager_user_id, unit_id, 'professional', 'manager', 'active');
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status)
  VALUES (manager_user_id, unit_b_id, 'professional', 'professional', 'active');

  -- 4. Active professional
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status)
  VALUES (prof_active_user_id, unit_id, 'professional', 'professional', 'active');

  -- 5. Active organization member
  INSERT INTO public.organization_members(organization_id, profile_id, role, status, created_by)
  VALUES (org_id, org_member_user_id, 'manager', 'active', org_member_user_id);

  -- -------------------------------------------------------------
  -- CASE 1: Revoked membership with stale profiles.role = 'admin'
  -- -------------------------------------------------------------
  PERFORM pg_temp.set_neutralization_actor(revoked_user_id);

  SELECT * INTO profile_result FROM public.get_my_profile();
  IF profile_result.role <> 'client' THEN
    RAISE EXCEPTION 'Case 1 Failed: get_my_profile must return client for revoked membership, got %', profile_result.role;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.get_my_authorized_contexts('business')
  ) OR EXISTS (
    SELECT 1 FROM public.get_my_authorized_contexts('web') AS ctx
    WHERE (ctx->>'contextKind') = 'establishment'
  ) THEN
    RAISE EXCEPTION 'Case 1 Failed: revoked user must have no authorized establishment contexts';
  END IF;

  IF public.is_context_target_authorized(revoked_user_id, 'web', 'establishment', unit_id, NULL) THEN
    RAISE EXCEPTION 'Case 1 Failed: revoked target context must not be authorized';
  END IF;

  -- -------------------------------------------------------------
  -- CASE 2: Limited role template 'reception'
  -- -------------------------------------------------------------
  PERFORM pg_temp.set_neutralization_actor(reception_user_id);

  reception_caps := public.resolve_business_operational_capabilities(unit_id, reception_user_id, 'full');
  IF NOT ('view_team_agenda' = ANY(reception_caps))
    OR NOT ('create_team_walk_in' = ANY(reception_caps))
    OR NOT ('manage_clients' = ANY(reception_caps))
  THEN
    RAISE EXCEPTION 'Case 2 Failed: reception must have desk capabilities, got %', reception_caps;
  END IF;

  IF ('manage_services' = ANY(reception_caps))
    OR ('manage_team' = ANY(reception_caps))
    OR ('manage_operational_settings' = ANY(reception_caps))
  THEN
    RAISE EXCEPTION 'Case 2 Failed: reception must NOT have sensitive admin capabilities, got %', reception_caps;
  END IF;

  -- -------------------------------------------------------------
  -- CASE 3: Role template 'manager'
  -- -------------------------------------------------------------
  PERFORM pg_temp.set_neutralization_actor(manager_user_id);

  manager_caps := public.resolve_business_operational_capabilities(unit_id, manager_user_id, 'full');
  IF NOT ('manage_services' = ANY(manager_caps))
    OR NOT ('manage_team' = ANY(manager_caps))
    OR NOT ('view_unit_reports' = ANY(manager_caps))
  THEN
    RAISE EXCEPTION 'Case 3 Failed: manager must have management capabilities, got %', manager_caps;
  END IF;

  -- -------------------------------------------------------------
  -- CASE 4: Pure user without membership
  -- -------------------------------------------------------------
  PERFORM pg_temp.set_neutralization_actor(client_user_id);

  SELECT * INTO profile_result FROM public.get_my_profile();
  IF profile_result.role <> 'client' THEN
    RAISE EXCEPTION 'Case 4 Failed: get_my_profile must return client for user without membership, got %', profile_result.role;
  END IF;

  -- -------------------------------------------------------------
  -- CASE 5: Context switch does not rely on profiles.role
  -- -------------------------------------------------------------
  PERFORM pg_temp.set_neutralization_actor(manager_user_id);

  context_receipt := public.set_my_active_context('business', 'establishment', unit_b_id, NULL, gen_random_uuid());
  IF context_receipt->>'establishmentId' <> unit_b_id::text THEN
    RAISE EXCEPTION 'Case 5 Failed: context switch to unit_b failed, got %', context_receipt;
  END IF;

  -- -------------------------------------------------------------
  -- CASE 6: Tampered profiles.role = 'admin' has zero operational authority
  -- -------------------------------------------------------------
  PERFORM pg_temp.set_neutralization_actor(client_user_id);
  UPDATE public.profiles SET role = 'admin' WHERE id = client_user_id;

  SELECT * INTO profile_result FROM public.get_my_profile();
  IF profile_result.role <> 'client' THEN
    RAISE EXCEPTION 'Case 6 Failed: get_my_profile must return client regardless of profiles.role, got %', profile_result.role;
  END IF;

  IF public.has_business_capability(unit_id, 'manage_services') THEN
    RAISE EXCEPTION 'Case 6 Failed: tampered profiles.role=admin must not grant manage_services';
  END IF;

  -- -------------------------------------------------------------
  -- CASE 7: Account deletion fail-closed verification
  -- -------------------------------------------------------------
  -- 7A: Active professional cannot delete account directly
  PERFORM pg_temp.set_neutralization_actor(prof_active_user_id);
  deletion_error := NULL;
  BEGIN
    PERFORM public.submit_client_account_deletion_request();
  EXCEPTION WHEN OTHERS THEN
    deletion_error := SQLERRM;
  END;
  IF deletion_error <> 'active_business_relationship_requires_offboarding' THEN
    RAISE EXCEPTION 'Case 7A Failed: expected active_business_relationship_requires_offboarding, got %', deletion_error;
  END IF;

  -- 7B: Active organization member cannot delete account directly
  PERFORM pg_temp.set_neutralization_actor(org_member_user_id);
  deletion_error := NULL;
  BEGIN
    PERFORM public.submit_client_account_deletion_request();
  EXCEPTION WHEN OTHERS THEN
    deletion_error := SQLERRM;
  END;
  IF deletion_error <> 'active_business_relationship_requires_offboarding' THEN
    RAISE EXCEPTION 'Case 7B Failed: expected active_business_relationship_requires_offboarding, got %', deletion_error;
  END IF;

  -- 7C: Pure client with stale legacy profile.role = 'admin' CAN submit deletion because they have no active relationships
  PERFORM pg_temp.set_neutralization_actor(client_user_id);
  SELECT * INTO deletion_result FROM public.submit_client_account_deletion_request();
  IF deletion_result.id IS NULL OR deletion_result.status <> 'pending' THEN
    RAISE EXCEPTION 'Case 7C Failed: client without active relationships must be permitted to request deletion';
  END IF;
END;
$test$;

ROLLBACK;
