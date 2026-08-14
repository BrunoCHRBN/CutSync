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
  manager_denied_services_id uuid := gen_random_uuid();
  manager_denied_commission_id uuid := gen_random_uuid();
  reception_user_id uuid := gen_random_uuid();
  finance_user_id uuid := gen_random_uuid();
  prof_user_id uuid := gen_random_uuid();
  prof_other_id uuid := gen_random_uuid();
  revoked_admin_id uuid := gen_random_uuid();
  outsider_user_id uuid := gen_random_uuid();

  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  unit_readonly_id uuid := gen_random_uuid();
  unit_blocked_id uuid := gen_random_uuid();

  block_id uuid;
  test_error text;
  manager_membership_services_id uuid := gen_random_uuid();
  manager_membership_commission_id uuid := gen_random_uuid();
  prof_membership_id uuid := gen_random_uuid();
  prof_other_membership_id uuid := gen_random_uuid();
  admin_membership_id uuid := gen_random_uuid();

  combo_id text := 'combo-' || substr(gen_random_uuid()::text, 1, 8);
  service_a_id text := 'srv-a-' || substr(gen_random_uuid()::text, 1, 8);
  service_b_id text := 'srv-b-' || substr(gen_random_uuid()::text, 1, 8);
  invitation_id uuid := gen_random_uuid();
  approval_services_id uuid := gen_random_uuid();
  approval_comm_id uuid := gen_random_uuid();
BEGIN
  -- Setup test users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_user_id, 'admin@example.test', now()),
    (manager_user_id, 'manager@example.test', now()),
    (manager_denied_services_id, 'managerdeniedservices@example.test', now()),
    (manager_denied_commission_id, 'managerdeniedcomm@example.test', now()),
    (reception_user_id, 'reception@example.test', now()),
    (finance_user_id, 'finance@example.test', now()),
    (prof_user_id, 'prof@example.test', now()),
    (prof_other_id, 'profother@example.test', now()),
    (revoked_admin_id, 'revokedadmin@example.test', now()),
    (outsider_user_id, 'outsider@example.test', now());

  INSERT INTO public.establishments(id, name, slug, account_status, timezone)
  VALUES
    (unit_a_id, 'Test Establishment A', 'test-unit-a-' || substr(unit_a_id::text, 1, 8), 'active', 'America/Sao_Paulo'),
    (unit_b_id, 'Test Establishment B', 'test-unit-b-' || substr(unit_b_id::text, 1, 8), 'active', 'America/Sao_Paulo'),
    (unit_readonly_id, 'Test Establishment ReadOnly', 'test-unit-ro-' || substr(unit_readonly_id::text, 1, 8), 'delinquent', 'America/Sao_Paulo'),
    (unit_blocked_id, 'Test Establishment Blocked', 'test-unit-bl-' || substr(unit_blocked_id::text, 1, 8), 'blocked', 'America/Sao_Paulo');

  -- Ensure profiles point to unit_a
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'admin' WHERE id = admin_user_id;
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'professional' WHERE id IN (manager_user_id, manager_denied_services_id, manager_denied_commission_id, prof_user_id, prof_other_id);
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'client' WHERE id IN (reception_user_id, finance_user_id);
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'admin' WHERE id = revoked_admin_id;
  UPDATE public.profiles SET establishment_id = NULL, role = 'client' WHERE id = outsider_user_id;

  -- Setup memberships
  INSERT INTO public.memberships(id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (admin_membership_id, admin_user_id, unit_a_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), admin_user_id, unit_blocked_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), manager_user_id, unit_a_id, 'professional', 'manager', 'active'),
    (gen_random_uuid(), reception_user_id, unit_a_id, 'professional', 'reception', 'active'),
    (gen_random_uuid(), finance_user_id, unit_a_id, 'professional', 'finance', 'active'),
    (prof_membership_id, prof_user_id, unit_a_id, 'professional', 'professional', 'active'),
    (prof_other_membership_id, prof_other_id, unit_a_id, 'professional', 'professional', 'active');

  INSERT INTO public.memberships(id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (manager_membership_services_id, manager_denied_services_id, unit_a_id, 'professional', 'manager', 'active'),
    (manager_membership_commission_id, manager_denied_commission_id, unit_a_id, 'professional', 'manager', 'active');

  -- Approval requests for overrides
  INSERT INTO public.approval_requests (
    id, establishment_id, request_type, requested_by, subject_membership_id, capability,
    requested_effect, justification, status, request_id
  ) VALUES
    (approval_services_id, unit_a_id, 'capability_override', admin_user_id, manager_membership_services_id, 'manage_services', 'deny', 'Deny services justification', 'approved', gen_random_uuid()),
    (approval_comm_id, unit_a_id, 'capability_override', admin_user_id, manager_membership_commission_id, 'manage_commission_policies', 'deny', 'Deny commission justification', 'approved', gen_random_uuid());

  -- Deny overrides
  INSERT INTO public.membership_capability_overrides (
    membership_id, establishment_id, capability, effect, valid_from, granted_by, approval_request_id, justification, request_id
  ) VALUES
    (manager_membership_services_id, unit_a_id, 'manage_services', 'deny', now(), admin_user_id, approval_services_id, 'Deny services justification', gen_random_uuid()),
    (manager_membership_commission_id, unit_a_id, 'manage_commission_policies', 'deny', now(), admin_user_id, approval_comm_id, 'Deny commission justification', gen_random_uuid());

  -- Revoked membership
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status, revoked_at)
  VALUES (revoked_admin_id, unit_a_id, 'admin', 'admin', 'revoked', now());

  -- Setup services for combo tests
  INSERT INTO public.services(id, establishment_id, name, price, duration_minutes, kind)
  VALUES
    (service_a_id, unit_a_id, 'Service A', 50, 30, 'single'),
    (service_b_id, unit_a_id, 'Service B', 60, 30, 'single'),
    (combo_id, unit_a_id, 'Combo AB', 100, 60, 'combo');

  -- Setup invitation for revoke test
  INSERT INTO public.invitations(id, establishment_id, role, invited_email, token_hash, expires_at, status, created_by)
  VALUES (invitation_id, unit_a_id, 'professional', 'newprof@example.test', 'testhash', now() + interval '24 hours', 'pending', admin_user_id);

  -- -------------------------------------------------------------------------
  -- 1. RUNTIME CAPABILITY PRIMITIVE TESTS
  -- -------------------------------------------------------------------------

  -- 1.1 Anonymous actor -> false
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claim.role', 'anon', true);
  IF public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Runtime Test 1.1 Failed: Anonymous must return false';
  END IF;

  -- 1.2 Authenticated without membership -> false
  PERFORM pg_temp.set_capability_actor(outsider_user_id);
  IF public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Runtime Test 1.2 Failed: Outsider without membership must return false';
  END IF;

  -- 1.3 Revoked membership -> false for all capabilities
  PERFORM pg_temp.set_capability_actor(revoked_admin_id);
  IF public.has_business_capability(unit_a_id, 'manage_services')
    OR public.has_business_capability(unit_a_id, 'manage_team')
    OR public.has_business_capability(unit_a_id, 'view_own_agenda')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.3 Failed: Revoked membership must return false';
  END IF;

  -- 1.4 Unknown / Invalid / NULL capability -> false
  PERFORM pg_temp.set_capability_actor(admin_user_id);
  IF public.has_business_capability(unit_a_id, 'invalid_unknown_capability_xyz') THEN
    RAISE EXCEPTION 'Runtime Test 1.4A Failed: Unknown capability must return false';
  END IF;
  IF public.has_business_capability(unit_a_id, NULL) THEN
    RAISE EXCEPTION 'Runtime Test 1.4B Failed: NULL capability must return false';
  END IF;
  IF public.has_business_capability(NULL, 'manage_services') THEN
    RAISE EXCEPTION 'Runtime Test 1.4C Failed: NULL establishment must return false';
  END IF;

  -- 1.5 IDOR (Unit A admin checking Unit B) -> false
  IF public.has_business_capability(unit_b_id, 'manage_services') THEN
    RAISE EXCEPTION 'Runtime Test 1.5 Failed: IDOR cross-unit check must return false';
  END IF;

  -- 1.6 Role template positive and negative matrix
  -- Admin
  PERFORM pg_temp.set_capability_actor(admin_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'manage_services')
    OR NOT public.has_business_capability(unit_a_id, 'manage_team')
    OR NOT public.has_business_capability(unit_a_id, 'manage_operational_settings')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6A Failed: Admin must have manage_services, manage_team, manage_operational_settings';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_admins') THEN
    RAISE EXCEPTION 'Runtime Test 1.6A Failed: Admin must NOT have manage_admins (reserved for owner)';
  END IF;

  -- Professional
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'manage_own_blocks')
    OR NOT public.has_business_capability(unit_a_id, 'view_own_agenda')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6B Failed: Professional must have manage_own_blocks, view_own_agenda';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_services')
    OR public.has_business_capability(unit_a_id, 'manage_team')
    OR public.has_business_capability(unit_a_id, 'manage_team_blocks')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6C Failed: Professional must NOT have manage_services, manage_team, manage_team_blocks';
  END IF;

  -- Reception
  PERFORM pg_temp.set_capability_actor(reception_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'create_team_walk_in')
    OR NOT public.has_business_capability(unit_a_id, 'manage_clients')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6D Failed: Reception must have create_team_walk_in, manage_clients';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_services')
    OR public.has_business_capability(unit_a_id, 'manage_team')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6E Failed: Reception must NOT have manage_services, manage_team';
  END IF;

  -- Finance
  PERFORM pg_temp.set_capability_actor(finance_user_id);
  IF NOT public.has_business_capability(unit_a_id, 'view_unit_reports')
    OR NOT public.has_business_capability(unit_a_id, 'view_financial_reports')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6F Failed: Finance must have view_unit_reports, view_financial_reports';
  END IF;
  IF public.has_business_capability(unit_a_id, 'manage_team')
    OR public.has_business_capability(unit_a_id, 'manage_services')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.6G Failed: Finance must NOT have manage_team, manage_services';
  END IF;

  -- Manager with deny override on manage_services
  PERFORM pg_temp.set_capability_actor(manager_denied_services_id);
  IF public.has_business_capability(unit_a_id, 'manage_services') THEN
    RAISE EXCEPTION 'Runtime Test 1.6H Failed: Deny override must revoke manage_services';
  END IF;
  -- 1.7 Blocked establishment -> false for ALL capabilities
  PERFORM pg_temp.set_capability_actor(admin_user_id);
  IF public.has_business_capability(unit_blocked_id, 'manage_services')
    OR public.has_business_capability(unit_blocked_id, 'view_services')
    OR public.has_business_capability(unit_blocked_id, 'view_unit_reports')
  THEN
    RAISE EXCEPTION 'Runtime Test 1.7 Failed: Blocked establishment must return false for all capabilities';
  END IF;

  -- -------------------------------------------------------------------------
  -- 2. RPC INTEGRATION TESTS (CALLING ACTUAL RPCs)
  -- -------------------------------------------------------------------------

  -- 2.1 admin_update_professional — Split de Autoridade
  -- 2.1.A Manager with manage_team + manage_commission_policies -> can update both
  PERFORM pg_temp.set_capability_actor(manager_user_id);
  PERFORM public.admin_update_professional(
    prof_user_id, unit_a_id, jsonb_build_object('commission_rate', 0.55, 'specialties', 'Barba e Cabelo')
  );

  -- 2.1.B Manager with deny manage_commission_policies -> can update operational fields
  PERFORM pg_temp.set_capability_actor(manager_denied_commission_id);
  PERFORM public.admin_update_professional(
    prof_user_id, unit_a_id, jsonb_build_object('specialties', 'Corte Degradê', 'instagram', 'prof_cortes')
  );

  -- 2.1.C Manager with deny manage_commission_policies trying to update commission_rate -> FORBIDDEN
  test_error := NULL;
  BEGIN
    PERFORM public.admin_update_professional(
      prof_user_id, unit_a_id, jsonb_build_object('commission_rate', 0.60)
    );
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.1.C Failed: Expected forbidden when manager with deny commission updates rate, got: %', test_error;
  END IF;

  -- 2.1.D Finance without manage_team -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(finance_user_id);
  test_error := NULL;
  BEGIN
    PERFORM public.admin_update_professional(
      prof_user_id, unit_a_id, jsonb_build_object('specialties', 'Novo Titulo')
    );
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.1.D Failed: Expected forbidden for Finance updating professional, got: %', test_error;
  END IF;

  -- 2.1.E Professional trying to update other professional -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  test_error := NULL;
  BEGIN
    PERFORM public.admin_update_professional(
      prof_other_id, unit_a_id, jsonb_build_object('specialties', 'Tentativa de Hack')
    );
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.1.E Failed: Expected forbidden for Prof updating another prof, got: %', test_error;
  END IF;

  -- 2.2 remove_professional
  -- 2.2.A Professional trying to remove another prof -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  test_error := NULL;
  BEGIN
    PERFORM public.remove_professional(prof_other_id, unit_a_id, 'Tentativa indevida');
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.2.A Failed: Expected forbidden for prof removing another prof, got: %', test_error;
  END IF;

  -- 2.3 revoke_invitation
  -- 2.3.A Professional trying to revoke invite -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  test_error := NULL;
  BEGIN
    PERFORM public.revoke_invitation(invitation_id, 'Revogacao sem autorizacao');
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.3.A Failed: Expected forbidden for prof revoking invite, got: %', test_error;
  END IF;

  -- 2.3.B Manager (has manage_team) revokes staff invite -> SUCCESS
  PERFORM pg_temp.set_capability_actor(manager_user_id);
  PERFORM public.revoke_invitation(invitation_id, 'Revogacao autorizada pelo gerente');

  -- 2.4 Schedule Blocks
  -- 2.4.A Professional creates own block -> SUCCESS
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  block_id := public.create_schedule_block(
    unit_a_id, prof_user_id, now() + interval '1 hour', now() + interval '2 hours', 'break', 'Intervalo pessoal'
  );
  IF block_id IS NULL THEN
    RAISE EXCEPTION 'RPC Test 2.4.A Failed: Professional should create own block';
  END IF;

  -- 2.4.B Professional tries to create block for another prof -> FORBIDDEN
  test_error := NULL;
  BEGIN
    PERFORM public.create_schedule_block(
      unit_a_id, prof_other_id, now() + interval '3 hours', now() + interval '4 hours', 'break', 'Bloqueio indevido'
    );
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.4.B Failed: Expected forbidden when prof creates block for another prof, got: %', test_error;
  END IF;

  -- 2.4.C Manager creates block for team member -> SUCCESS
  PERFORM pg_temp.set_capability_actor(manager_user_id);
  block_id := public.create_schedule_block(
    unit_a_id, prof_other_id, now() + interval '3 hours', now() + interval '4 hours', 'time_off', 'Treinamento'
  );
  IF block_id IS NULL THEN
    RAISE EXCEPTION 'RPC Test 2.4.C Failed: Manager should create block for team member';
  END IF;

  -- 2.4.D Professional deletes own block -> SUCCESS
  PERFORM pg_temp.set_capability_actor(prof_other_id);
  PERFORM public.delete_schedule_block(block_id);

  -- 2.5 replace_service_combo_items
  -- 2.5.A Reception trying to replace combo items -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(reception_user_id);
  test_error := NULL;
  BEGIN
    PERFORM public.replace_service_combo_items(combo_id, ARRAY[service_a_id, service_b_id]);
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.5.A Failed: Expected forbidden for reception replacing combo items, got: %', test_error;
  END IF;

  -- 2.5.B Manager with manage_services -> SUCCESS
  PERFORM pg_temp.set_capability_actor(manager_user_id);
  PERFORM public.replace_service_combo_items(combo_id, ARRAY[service_a_id, service_b_id]);

  -- 2.6 get_admin_report_v2
  -- 2.6.A Finance (has view_unit_reports) -> SUCCESS
  PERFORM pg_temp.set_capability_actor(finance_user_id);
  IF public.get_admin_report_v2(unit_a_id, CURRENT_DATE - 7, CURRENT_DATE) IS NULL THEN
    RAISE EXCEPTION 'RPC Test 2.6.A Failed: Finance should be able to get admin report';
  END IF;

  -- 2.6.B Reception (lacks view_unit_reports) -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(reception_user_id);
  test_error := NULL;
  BEGIN
    PERFORM public.get_admin_report_v2(unit_a_id, CURRENT_DATE - 7, CURRENT_DATE);
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.6.B Failed: Expected forbidden for reception accessing report, got: %', test_error;
  END IF;

  -- 2.7 get_establishment_client_contacts
  -- 2.7.A Reception (has view_clients) -> SUCCESS
  PERFORM pg_temp.set_capability_actor(reception_user_id);
  PERFORM * FROM public.get_establishment_client_contacts(unit_a_id);

  -- 2.7.B Professional (lacks view_clients) -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  test_error := NULL;
  BEGIN
    PERFORM * FROM public.get_establishment_client_contacts(unit_a_id);
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error <> 'forbidden' THEN
    RAISE EXCEPTION 'RPC Test 2.7.B Failed: Expected forbidden for prof accessing client contacts, got: %', test_error;
  END IF;

  -- 2.8 publish_establishment_discovery
  -- 2.8.A Professional -> FORBIDDEN
  PERFORM pg_temp.set_capability_actor(prof_user_id);
  test_error := NULL;
  BEGIN
    PERFORM * FROM public.publish_establishment_discovery(unit_a_id);
  EXCEPTION WHEN OTHERS THEN
    test_error := SQLERRM;
  END;
  IF test_error NOT IN ('not_authorized', 'forbidden') THEN
    RAISE EXCEPTION 'RPC Test 2.8.A Failed: Expected not_authorized for prof publishing discovery, got: %', test_error;
  END IF;

END;
$test$;

ROLLBACK;
