BEGIN;

-- ============================================================================
-- TEST SUITE: PS4-E3 / PS4-E3.1 Corporate Unit Scope Authority & Lifecycle Hardening
-- Validates:
-- 1. Explicit unit scope for organization members
-- 2. Operational capability separation (corporate scope != business capabilities)
-- 3. Aggregate leak prevention in reporting
-- 4. Invitation v2 atomicity and persistence
-- 5. Unit remove -> re-add stale scope prevention (no silent resurrection)
-- 6. Revoke -> reinvite scope isolation (old scopes never reactivated)
-- 7. Role transitions: manager -> finance (expansion audit), finance -> manager (remains all)
-- 8. Ownership transfer
-- 9. Invitation token idempotency
-- 10. Scope RPC idempotency
-- 11. Audit log scope & metadata leak protection
-- ============================================================================

CREATE OR REPLACE FUNCTION pg_temp.assert(condition boolean, message text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT condition THEN
    RAISE EXCEPTION 'ASSERTION FAILED: %', message;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text DEFAULT 'aal2')
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF actor_id IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', '', true);
    PERFORM set_config('request.jwt.claim.aal', '', true);
    PERFORM set_config('request.jwt.claims', '', true);
  ELSE
    PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config('request.jwt.claim.aal', actor_aal, true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
      true
    );
  END IF;
END;
$$;

DO $$
DECLARE
  org_a_id uuid := gen_random_uuid();
  org_b_id uuid := gen_random_uuid();

  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  unit_c_id uuid := gen_random_uuid();
  unit_d_id uuid := gen_random_uuid();
  unit_foreign_id uuid := gen_random_uuid();

  owner_id uuid := gen_random_uuid();
  mgr_all_id uuid := gen_random_uuid();
  mgr_sel_id uuid := gen_random_uuid();
  mgr_empty_id uuid := gen_random_uuid();
  finance_id uuid := gen_random_uuid();
  revoked_mgr_id uuid := gen_random_uuid();
  invited_user_id uuid := gen_random_uuid();
  dual_role_user_id uuid := gen_random_uuid();
  toctou_user_id uuid := gen_random_uuid();
  partial_user_id uuid := gen_random_uuid();
  cross_user_id uuid := gen_random_uuid();
  legacy_user_id uuid := gen_random_uuid();
  dup_user_id uuid := gen_random_uuid();
  unverified_user_id uuid := gen_random_uuid();
  returning_client_id uuid := gen_random_uuid();
  new_client_id uuid := gen_random_uuid();
  unit_future_id uuid := gen_random_uuid();

  svc_a_id uuid := gen_random_uuid();
  svc_b_id uuid := gen_random_uuid();
  svc_c_id uuid := gen_random_uuid();

  client_id uuid := gen_random_uuid();

  invite_record record;
  invite_record_2 record;
  invite_toctou record;
  invite_partial record;
  invite_cross record;
  invite_legacy record;
  invite_dup record;
  invite_unverified record;
  context_result jsonb;
  report_result jsonb;
  org_list_count bigint;
  audit_count integer;
  caught_error boolean;
  item_found boolean;
  test_request_id uuid := gen_random_uuid();
  audit_rec record;
  test_report_date date := current_date + 30;
BEGIN
  -- 1. SEED TEST USERS (in auth.users so handle_new_user trigger creates profiles)
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (owner_id, 'owner@corpscope.test', now()),
    (mgr_all_id, 'mgrall@corpscope.test', now()),
    (mgr_sel_id, 'mgrsel@corpscope.test', now()),
    (mgr_empty_id, 'mgrempty@corpscope.test', now()),
    (finance_id, 'finance@corpscope.test', now()),
    (revoked_mgr_id, 'revokedmgr@corpscope.test', now()),
    (invited_user_id, 'invited@corpscope.test', now()),
    (dual_role_user_id, 'dualrole@corpscope.test', now()),
    (toctou_user_id, 'toctou@corpscope.test', now()),
    (partial_user_id, 'partial@corpscope.test', now()),
    (cross_user_id, 'cross@corpscope.test', now()),
    (legacy_user_id, 'legacy@corpscope.test', now()),
    (dup_user_id, 'dup@corpscope.test', now()),
    (unverified_user_id, 'unverified@corpscope.test', NULL), -- unconfirmed email!
    (client_id, 'client@corpscope.test', now()),
    (returning_client_id, 'returningclient@corpscope.test', now()),
    (new_client_id, 'newclient@corpscope.test', now());

  -- Update profiles with names
  UPDATE public.profiles SET name = 'Owner User' WHERE id = owner_id;
  UPDATE public.profiles SET name = 'Manager All' WHERE id = mgr_all_id;
  UPDATE public.profiles SET name = 'Manager Selected' WHERE id = mgr_sel_id;
  UPDATE public.profiles SET name = 'Manager Empty' WHERE id = mgr_empty_id;
  UPDATE public.profiles SET name = 'Finance User' WHERE id = finance_id;
  UPDATE public.profiles SET name = 'Revoked Manager' WHERE id = revoked_mgr_id;
  UPDATE public.profiles SET name = 'Invited User' WHERE id = invited_user_id;
  UPDATE public.profiles SET name = 'Dual Role User' WHERE id = dual_role_user_id;
  UPDATE public.profiles SET name = 'TOCTOU User' WHERE id = toctou_user_id;
  UPDATE public.profiles SET name = 'Partial User' WHERE id = partial_user_id;
  UPDATE public.profiles SET name = 'Cross User' WHERE id = cross_user_id;
  UPDATE public.profiles SET name = 'Legacy User' WHERE id = legacy_user_id;
  UPDATE public.profiles SET name = 'Dup User' WHERE id = dup_user_id;
  UPDATE public.profiles SET name = 'Unverified User' WHERE id = unverified_user_id;
  UPDATE public.profiles SET name = 'Client User' WHERE id = client_id;
  UPDATE public.profiles SET name = 'Returning Client' WHERE id = returning_client_id;
  UPDATE public.profiles SET name = 'New Client' WHERE id = new_client_id;

  -- 2. SEED ORGANIZATIONS
  INSERT INTO public.organizations (id, name, status, created_by)
  VALUES
    (org_a_id, 'Corporate Org A', 'active', owner_id),
    (org_b_id, 'Corporate Org B', 'active', owner_id);

  -- 3. SEED ESTABLISHMENTS
  INSERT INTO public.establishments (id, name, slug, address, phone, account_status, timezone, currency)
  VALUES
    (unit_a_id, 'Unit A', 'unit-a-' || substr(unit_a_id::text, 1, 8), 'Street A', '11999990001', 'active', 'America/Sao_Paulo', 'BRL'),
    (unit_b_id, 'Unit B', 'unit-b-' || substr(unit_b_id::text, 1, 8), 'Street B', '11999990002', 'active', 'America/Sao_Paulo', 'BRL'),
    (unit_c_id, 'Unit C', 'unit-c-' || substr(unit_c_id::text, 1, 8), 'Street C', '11999990003', 'active', 'America/Sao_Paulo', 'BRL'),
    (unit_d_id, 'Unit D', 'unit-d-' || substr(unit_d_id::text, 1, 8), 'Street D', '11999990004', 'active', 'America/Sao_Paulo', 'BRL'),
    (unit_foreign_id, 'Unit Foreign', 'unit-f-' || substr(unit_foreign_id::text, 1, 8), 'Street F', '11999990005', 'active', 'America/Sao_Paulo', 'BRL');

  -- 4. SEED SERVICES
  INSERT INTO public.services (id, establishment_id, name, duration_minutes, price, is_active)
  VALUES
    (svc_a_id::text, unit_a_id, 'Service A', 30, 100.00, true),
    (svc_b_id::text, unit_b_id, 'Service B', 45, 200.00, true),
    (svc_c_id::text, unit_c_id, 'Service C', 60, 999999.00, true);

  -- 5. SEED APPOINTMENTS WITH DISPARATE REVENUE FOR LEAK TESTING
  -- Unit A: 1 completed appointment = 100.00
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, client_id, timezone('utc', now()), 30, timezone('utc', now()) + interval '30 minutes', 'completed', 100.00);

  -- Unit B: 1 completed appointment = 200.00
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_b_id, owner_id, svc_b_id::text, client_id, timezone('utc', now()), 45, timezone('utc', now()) + interval '45 minutes', 'completed', 200.00);

  -- Unit C: 1 completed appointment = 999999.00
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_c_id, owner_id, svc_c_id::text, client_id, timezone('utc', now()), 60, timezone('utc', now()) + interval '60 minutes', 'completed', 999999.00);

  -- 6. LINK UNITS TO ORGS
  -- Org A has Unit A, Unit B, Unit C
  INSERT INTO public.organization_establishments (organization_id, establishment_id, status)
  VALUES
    (org_a_id, unit_a_id, 'active'),
    (org_a_id, unit_b_id, 'active'),
    (org_a_id, unit_c_id, 'active'),
    (org_b_id, unit_foreign_id, 'active');

  -- Owner has admin memberships on units (required for add_organization_establishment)
  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status)
  VALUES
    (owner_id, unit_a_id, 'admin', 'admin', 'active'),
    (owner_id, unit_b_id, 'admin', 'admin', 'active'),
    (owner_id, unit_c_id, 'admin', 'admin', 'active'),
    (owner_id, unit_d_id, 'admin', 'admin', 'active');

  -- 7. SEED ORGANIZATION MEMBERS
  INSERT INTO public.organization_members (organization_id, profile_id, role, scope_mode, status)
  VALUES
    (org_a_id, owner_id, 'owner', 'all', 'active'),
    (org_b_id, owner_id, 'owner', 'all', 'active'),
    (org_a_id, mgr_all_id, 'manager', 'all', 'active'),
    (org_a_id, mgr_sel_id, 'manager', 'selected', 'active'),
    (org_a_id, mgr_empty_id, 'manager', 'selected', 'active'),
    (org_a_id, finance_id, 'finance', 'all', 'active'),
    (org_a_id, revoked_mgr_id, 'manager', 'selected', 'revoked'),
    (org_a_id, dual_role_user_id, 'manager', 'selected', 'active');

  -- Seed selected scopes:
  -- mgr_sel has Unit A and Unit B
  INSERT INTO public.organization_member_establishment_scopes (organization_id, organization_member_id, establishment_id, granted_by)
  VALUES
    (org_a_id, (SELECT id FROM public.organization_members WHERE organization_id = org_a_id AND profile_id = mgr_sel_id), unit_a_id, owner_id),
    (org_a_id, (SELECT id FROM public.organization_members WHERE organization_id = org_a_id AND profile_id = mgr_sel_id), unit_b_id, owner_id),
    (org_a_id, (SELECT id FROM public.organization_members WHERE organization_id = org_a_id AND profile_id = dual_role_user_id), unit_a_id, owner_id);

  -- Dual role user also has establishment membership in Unit B as 'professional'
  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status)
  VALUES (dual_role_user_id, unit_b_id, 'professional', 'professional', 'active');

  -- =========================================================================
  -- TEST GROUP 1: OWNER SCOPE & VISIBILITY
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Owner must have scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Owner must have scope on Unit B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Owner must have scope on Unit C'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_foreign_id) = false,
    'Owner must not have scope on foreign org unit'
  );

  context_result := public.get_organization_context(org_a_id);
  PERFORM pg_temp.assert(
    jsonb_array_length(context_result->'establishments') = 3,
    'Owner context must contain all 3 active establishments'
  );

  report_result := public.get_organization_report(org_a_id, CURRENT_DATE - 7, CURRENT_DATE + 7);
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 1000299.00,
    'Owner report must aggregate all units (100 + 200 + 999999 = 1000299)'
  );

  -- =========================================================================
  -- TEST GROUP 2: MANAGER ALL SCOPE & VISIBILITY
  -- =========================================================================
  PERFORM pg_temp.set_actor(mgr_all_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Manager All must have scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Manager All must have scope on Unit B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Manager All must have scope on Unit C'
  );

  context_result := public.get_organization_context(org_a_id);
  PERFORM pg_temp.assert(
    jsonb_array_length(context_result->'establishments') = 3,
    'Manager All context must return 3 establishments'
  );

  report_result := public.get_organization_report(org_a_id, CURRENT_DATE - 7, CURRENT_DATE + 7);
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 1000299.00,
    'Manager All report must aggregate all 3 units'
  );

  -- =========================================================================
  -- TEST GROUP 3: MANAGER SELECTED (A + B) & AGGREGATE LEAK PREVENTION
  -- =========================================================================
  PERFORM pg_temp.set_actor(mgr_sel_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Manager Selected must have scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Manager Selected must have scope on Unit B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = false,
    'Manager Selected must NOT have scope on Unit C'
  );

  context_result := public.get_organization_context(org_a_id);
  PERFORM pg_temp.assert(
    jsonb_array_length(context_result->'establishments') = 2,
    'Manager Selected context must contain ONLY 2 scoped establishments'
  );

  -- Report aggregate leak verification:
  -- Must return EXACTLY 300.00 (100 from A + 200 from B). Never 1000299.00!
  report_result := public.get_organization_report(org_a_id, CURRENT_DATE - 7, CURRENT_DATE + 7);
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 300.00,
    'Manager Selected report must aggregate ONLY units A and B (100 + 200 = 300)'
  );
  PERFORM pg_temp.assert(
    jsonb_array_length(report_result->'units') = 2,
    'Manager Selected report units array must only contain 2 units'
  );

  -- get_my_organizations establishment_count must report 2, not 3
  SELECT establishment_count INTO org_list_count
  FROM public.get_my_organizations()
  WHERE organization_id = org_a_id;
  PERFORM pg_temp.assert(
    org_list_count = 2,
    'Manager Selected get_my_organizations establishment_count must be 2'
  );

  -- =========================================================================
  -- TEST GROUP 4: MANAGER SELECTED EMPTY (0 SCOPED UNITS)
  -- =========================================================================
  PERFORM pg_temp.set_actor(mgr_empty_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = false,
    'Manager Empty has no scope on A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = false,
    'Manager Empty has no scope on B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = false,
    'Manager Empty has no scope on C'
  );

  context_result := public.get_organization_context(org_a_id);
  PERFORM pg_temp.assert(
    jsonb_array_length(context_result->'establishments') = 0,
    'Manager Empty context must return empty establishments array'
  );

  report_result := public.get_organization_report(org_a_id, CURRENT_DATE - 7, CURRENT_DATE + 7);
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 0,
    'Manager Empty report production realized must be 0'
  );
  PERFORM pg_temp.assert(
    jsonb_array_length(report_result->'units') = 0,
    'Manager Empty report units array must be empty'
  );

  -- =========================================================================
  -- TEST GROUP 5: FINANCE POLICY (ALL ONLY)
  -- =========================================================================
  PERFORM pg_temp.set_actor(finance_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Finance must have scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Finance must have scope on Unit B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Finance must have scope on Unit C'
  );

  -- Owner attempts to mutate Finance to selected scope => MUST FAIL
  PERFORM pg_temp.set_actor(owner_id);
  caught_error := false;
  BEGIN
    PERFORM public.set_organization_member_unit_scope(
      org_a_id,
      finance_id,
      'selected',
      ARRAY[unit_a_id]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'finance_scope_requires_all' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Setting finance to selected scope must fail with finance_scope_requires_all');

  -- =========================================================================
  -- TEST GROUP 6: REVOKED MEMBER SCOPE
  -- =========================================================================
  PERFORM pg_temp.set_actor(revoked_mgr_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = false,
    'Revoked member has no scope on A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = false,
    'Revoked member has no scope on B'
  );

  caught_error := false;
  BEGIN
    PERFORM public.get_organization_context(org_a_id);
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
  END;
  PERFORM pg_temp.assert(caught_error, 'Revoked member get_organization_context must fail');

  -- =========================================================================
  -- TEST GROUP 7: CROSS-ORG SCOPE REJECTION
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  caught_error := false;
  BEGIN
    PERFORM public.set_organization_member_unit_scope(
      org_a_id,
      mgr_sel_id,
      'selected',
      ARRAY[unit_a_id, unit_foreign_id]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'establishment_not_in_organization' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Assigning foreign unit to org member must fail with establishment_not_in_organization');

  -- =========================================================================
  -- TEST GROUP 8: UNIT REMOVE -> RE-ADD STALE SCOPE PREVENTION
  -- Removal of Unit B must revoke member scopes.
  -- Re-adding Unit B must NOT resurrect Manager Selected's scope on Unit B.
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  -- Manager currently has scope on Unit B
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Manager Selected has scope on B before removal'
  );

  -- Owner removes Unit B via remove_organization_establishment
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.remove_organization_establishment(org_a_id, unit_b_id);

  -- Manager scope on B is now false
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = false,
    'Manager Selected has NO scope on B after removal'
  );

  -- Owner re-adds the SAME Unit B to the organization
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.add_organization_establishment(org_a_id, unit_b_id);

  -- MANDATORY RESULT: Manager Selected must NOT regain Unit B automatically!
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = false,
    'Stale authorization resurrection prevented: Re-added Unit B must evaluate to false for Manager Selected'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Manager Selected retains scope on Unit A'
  );

  -- Owner explicitly re-grants Unit B to Manager Selected
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.set_organization_member_unit_scope(
    org_a_id,
    mgr_sel_id,
    'selected',
    ARRAY[unit_a_id, unit_b_id]
  );

  -- Now Manager Selected has Unit B again
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Manager Selected has scope on B after explicit re-grant'
  );

  -- =========================================================================
  -- TEST GROUP 9: NEW UNIT ADDED TO ORGANIZATION
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  -- Owner adds Unit D to Org A
  INSERT INTO public.organization_establishments (organization_id, establishment_id, status)
  VALUES (org_a_id, unit_d_id, 'active');

  -- Manager All automatically sees Unit D
  PERFORM pg_temp.set_actor(mgr_all_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_d_id) = true,
    'Manager All must automatically get scope on new Unit D'
  );

  -- Manager Selected does NOT see Unit D
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_d_id) = false,
    'Manager Selected must NOT get scope on new Unit D without explicit assignment'
  );

  -- =========================================================================
  -- TEST GROUP 10: OPERATIONAL CAPABILITY ISOLATION
  -- Corporate manager on Unit A has NO establishment membership in Unit A.
  -- Must NOT have business capabilities in Unit A!
  -- =========================================================================
  PERFORM pg_temp.set_actor(mgr_sel_id);

  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Manager Selected has corporate scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_business_capability(unit_a_id, 'manage_services') = false,
    'Corporate scope on Unit A must NOT grant manage_services in Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_business_capability(unit_a_id, 'manage_team') = false,
    'Corporate scope on Unit A must NOT grant manage_team in Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_business_capability(unit_a_id, 'manage_team_orders') = false,
    'Corporate scope on Unit A must NOT grant manage_team_orders in Unit A'
  );

  -- Attempt to set active context to Unit A establishment context without membership
  caught_error := false;
  BEGIN
    PERFORM public.set_my_active_context(
      'business',
      'establishment',
      unit_a_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
  END;
  PERFORM pg_temp.assert(caught_error, 'Corporate manager cannot set establishment context without establishment membership');

  -- =========================================================================
  -- TEST GROUP 11: INDEPENDENT UNIT MEMBERSHIP
  -- Dual role user has corporate scope on Unit A, but establishment membership on Unit B.
  -- =========================================================================
  PERFORM pg_temp.set_actor(dual_role_user_id);

  -- Corporate scope on A is true, on B is false
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Dual role user has corporate scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = false,
    'Dual role user does NOT have corporate scope on Unit B'
  );

  -- Corporate report includes only Unit A
  report_result := public.get_organization_report(org_a_id, CURRENT_DATE - 7, CURRENT_DATE + 7);
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 100.00,
    'Dual role user corporate report includes Unit A only (100.00), excluding Unit B'
  );

  -- But operational capability in Unit B exists via establishment membership
  PERFORM pg_temp.assert(
    public.has_business_capability(unit_b_id, 'view_orders') = true,
    'Dual role user has operational view_orders in Unit B from establishment membership'
  );

  -- =========================================================================
  -- TEST GROUP 12: INVITATION V2 ATOMICITY & SCOPING
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  SELECT * INTO invite_record
  FROM public.invite_organization_member_v2(
    org_a_id,
    'invited@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_a_id, unit_b_id]
  );

  -- Before acceptance: invited user has no access
  PERFORM pg_temp.set_actor(invited_user_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = false,
    'Unaccepted invite has no scope on A'
  );

  -- Accept invitation
  PERFORM public.accept_organization_invitation(invite_record.invitation_token);

  -- After acceptance: immediately scoped to A and B, never C
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Accepted invite has scope on A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Accepted invite has scope on B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = false,
    'Accepted invite does NOT have scope on C'
  );

  -- =========================================================================
  -- TEST GROUP 13: INVITATION TOKEN IDEMPOTENCY
  -- Attempting to accept the same token again must fail closed.
  -- =========================================================================
  PERFORM pg_temp.set_actor(invited_user_id);
  caught_error := false;
  BEGIN
    PERFORM public.accept_organization_invitation(invite_record.invitation_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid_or_expired_invitation' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Accepting already used invitation token must fail with invalid_or_expired_invitation');

  -- =========================================================================
  -- TEST GROUP 14: SCOPE RPC IDEMPOTENCY
  -- set_organization_member_unit_scope with request_id
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  -- 1st call with test_request_id: succeeds
  PERFORM public.set_organization_member_unit_scope(
    org_a_id,
    invited_user_id,
    'selected',
    ARRAY[unit_a_id, unit_b_id],
    test_request_id
  );

  -- Count audit rows for this request_id
  SELECT count(*) INTO audit_count
  FROM public.organization_audit_log
  WHERE organization_id = org_a_id
    AND action = 'organization.member_unit_scope_updated'
    AND metadata->>'request_id' = test_request_id::text;
  PERFORM pg_temp.assert(audit_count = 1, 'Exactly 1 audit log created for test_request_id');

  -- 2nd call with identical request_id and identical payload: safe replay (no duplicate audit)
  PERFORM public.set_organization_member_unit_scope(
    org_a_id,
    invited_user_id,
    'selected',
    ARRAY[unit_a_id, unit_b_id],
    test_request_id
  );

  SELECT count(*) INTO audit_count
  FROM public.organization_audit_log
  WHERE organization_id = org_a_id
    AND action = 'organization.member_unit_scope_updated'
    AND metadata->>'request_id' = test_request_id::text;
  PERFORM pg_temp.assert(audit_count = 1, 'Replay of same request_id does NOT create duplicate audit log');

  -- 3rd call with same request_id but conflicting payload: MUST FAIL with idempotency_key_reused
  caught_error := false;
  BEGIN
    PERFORM public.set_organization_member_unit_scope(
      org_a_id,
      invited_user_id,
      'selected',
      ARRAY[unit_a_id, unit_c_id],
      test_request_id
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'idempotency_key_reused' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Conflicting payload on same request_id must fail with idempotency_key_reused');

  -- =========================================================================
  -- TEST GROUP 15: REVOKE -> REINVITE SCOPE ISOLATION
  -- User was selected [A, B] -> revoked -> reinvite as Manager selected [C].
  -- Old scopes [A, B] must NEVER be resurrected upon acceptance.
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.revoke_organization_member(org_a_id, invited_user_id, 'testing reinvite');

  -- Reinvite invited_user as manager on Unit C only
  SELECT * INTO invite_record_2
  FROM public.invite_organization_member_v2(
    org_a_id,
    'invited@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_c_id]
  );

  -- Accept new invitation
  PERFORM pg_temp.set_actor(invited_user_id);
  PERFORM public.accept_organization_invitation(invite_record_2.invitation_token);

  -- Verify scopes: C is true, A and B are FALSE
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Reinvited user has scope on C'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = false,
    'Reinvited user does NOT have old scope on A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = false,
    'Reinvited user does NOT have old scope on B'
  );

  -- =========================================================================
  -- TEST GROUP 16: ROLE TRANSITION — MANAGER SELECTED -> FINANCE (SCOPE EXPANSION)
  -- Manager selected [C] -> Owner promotes to Finance.
  -- Finance is all-only: scope_mode becomes 'all', old scopes revoked, audit logged.
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.update_organization_member_role(org_a_id, invited_user_id, 'finance');

  PERFORM pg_temp.set_actor(invited_user_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Promoted Finance has scope on Unit A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Promoted Finance has scope on Unit B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Promoted Finance has scope on Unit C'
  );

  -- Verify audit log metadata for role transition
  SELECT * INTO audit_rec
  FROM public.organization_audit_log
  WHERE organization_id = org_a_id
    AND action = 'organization.member_role_updated'
    AND target_profile_id = invited_user_id
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM pg_temp.assert(audit_rec.metadata->>'previous_role' = 'manager', 'Audit previous_role is manager');
  PERFORM pg_temp.assert(audit_rec.metadata->>'new_role' = 'finance', 'Audit new_role is finance');
  PERFORM pg_temp.assert(audit_rec.metadata->>'previous_scope_mode' = 'selected', 'Audit previous_scope_mode is selected');
  PERFORM pg_temp.assert(audit_rec.metadata->>'new_scope_mode' = 'all', 'Audit new_scope_mode is all');
  PERFORM pg_temp.assert((audit_rec.metadata->>'scope_expanded')::boolean = true, 'Audit scope_expanded is true');

  -- =========================================================================
  -- TEST GROUP 17: ROLE TRANSITION — FINANCE -> MANAGER (REMAINS ALL)
  -- Owner changes Finance back to Manager.
  -- Manager remains scope_mode = 'all' by default (not empty selected).
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.update_organization_member_role(org_a_id, invited_user_id, 'manager');

  PERFORM pg_temp.set_actor(invited_user_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Manager changed from Finance retains all scope on A'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_b_id) = true,
    'Manager changed from Finance retains all scope on B'
  );
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Manager changed from Finance retains all scope on C'
  );

  -- =========================================================================
  -- TEST GROUP 18: OWNERSHIP TRANSFER
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  PERFORM public.transfer_organization_ownership(org_a_id, mgr_sel_id);

  -- New owner (mgr_sel) now has scope_mode = 'all'
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'New owner must have scope on all units including C'
  );

  -- Former owner now manager with scope_mode = 'all'
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_c_id) = true,
    'Former owner (now manager) retains scope on all units'
  );

  -- Transfer ownership back to owner_id for remaining test groups
  PERFORM pg_temp.set_actor(mgr_sel_id);
  PERFORM public.transfer_organization_ownership(org_a_id, owner_id);

  -- =========================================================================
  -- TEST GROUP 19: AUDIT LOG SCOPE & METADATA LEAK PROTECTION
  -- Manager Selected [A] querying organization_audit_log
  -- =========================================================================
  -- Seed distinct audit events under owner
  PERFORM pg_temp.set_actor(owner_id);

  -- Event on Unit A
  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, establishment_id)
  VALUES (org_a_id, owner_id, 'unit_a_event', unit_a_id);

  -- Event on Unit C
  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, establishment_id)
  VALUES (org_a_id, owner_id, 'unit_c_event', unit_c_id);

  -- Org event with metadata referencing Unit C
  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, metadata)
  VALUES (org_a_id, owner_id, 'org_metadata_c', jsonb_build_object('establishment_id', unit_c_id));

  -- Org event without establishment references
  INSERT INTO public.organization_audit_log (organization_id, actor_id, action, metadata)
  VALUES (org_a_id, owner_id, 'org_general_event', jsonb_build_object('key', 'val'));

  -- Set actor to dual_role_user (Manager Selected on Unit A only)
  PERFORM pg_temp.set_actor(dual_role_user_id);
  SET LOCAL ROLE authenticated;

  -- Can see Unit A event
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.organization_audit_log WHERE organization_id = org_a_id AND action = 'unit_a_event'),
    'Manager Selected on A can see Unit A audit event'
  );

  -- CANNOT see Unit C event
  PERFORM pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.organization_audit_log WHERE organization_id = org_a_id AND action = 'unit_c_event'),
    'Manager Selected on A CANNOT see Unit C audit event (leak blocked)'
  );

  -- CANNOT see Org event with metadata referencing Unit C
  PERFORM pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.organization_audit_log WHERE organization_id = org_a_id AND action = 'org_metadata_c'),
    'Manager Selected on A CANNOT see Org event with Unit C in metadata (metadata leak blocked)'
  );

  -- CAN see general org event
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.organization_audit_log WHERE organization_id = org_a_id AND action = 'org_general_event'),
    'Manager Selected on A CAN see general org-level event'
  );

  RESET ROLE;

  -- =========================================================================
  -- TEST GROUP 20: TOCTOU — UNIT REMOVED BEFORE ACCEPT (FAIL CLOSED)
  -- Invite for Unit D -> Owner removes Unit D -> User attempts accept -> FAILS
  -- Prove remove -> accept -> re-add yields has_scope = false
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  SELECT * INTO invite_toctou
  FROM public.invite_organization_member_v2(
    org_a_id,
    'toctou@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_d_id]
  );

  -- Owner removes Unit D before acceptance
  PERFORM public.remove_organization_establishment(org_a_id, unit_d_id);

  -- TOCTOU User attempts to accept invitation
  PERFORM pg_temp.set_actor(toctou_user_id);
  caught_error := false;
  BEGIN
    PERFORM public.accept_organization_invitation(invite_toctou.invitation_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invitation_scope_no_longer_valid' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Accepting invitation with removed unit must fail with invitation_scope_no_longer_valid');

  -- Verify membership was NOT created/activated
  PERFORM pg_temp.assert(
    NOT EXISTS (SELECT 1 FROM public.organization_members WHERE organization_id = org_a_id AND profile_id = toctou_user_id AND status = 'active'),
    'TOCTOU user membership must NOT be active'
  );

  -- Owner re-adds Unit D to the organization
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.add_organization_establishment(org_a_id, unit_d_id);

  -- Prove that has_organization_establishment_scope remains FALSE
  PERFORM pg_temp.set_actor(toctou_user_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_d_id) = false,
    'TOCTOU: has_organization_establishment_scope must remain false after re-adding Unit D'
  );

  -- =========================================================================
  -- TEST GROUP 21: TOCTOU — PARTIALLY STALE SELECTION (ATOMIC FAIL CLOSED)
  -- Invite for [Unit A, Unit D] -> Unit D removed -> User attempts accept -> FAILS CLOSED
  -- Prove user does NOT gain Unit A partially
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  SELECT * INTO invite_partial
  FROM public.invite_organization_member_v2(
    org_a_id,
    'partial@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_a_id, unit_d_id]
  );

  -- Owner removes Unit D
  PERFORM public.remove_organization_establishment(org_a_id, unit_d_id);

  -- Partial user attempts accept
  PERFORM pg_temp.set_actor(partial_user_id);
  caught_error := false;
  BEGIN
    PERFORM public.accept_organization_invitation(invite_partial.invitation_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invitation_scope_no_longer_valid' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Accepting partially stale invite must fail with invitation_scope_no_longer_valid');

  -- Verify partial user does NOT gain Unit A
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = false,
    'Partial user must NOT gain Unit A when set is partially stale'
  );

  -- Re-add Unit D for subsequent tests
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.add_organization_establishment(org_a_id, unit_d_id);

  -- =========================================================================
  -- TEST GROUP 22: TOCTOU — UNIT MOVED TO ANOTHER ORGANIZATION
  -- Unit D invited in Org A -> Unit D removed from Org A & added to Org B -> Accept fails
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  SELECT * INTO invite_cross
  FROM public.invite_organization_member_v2(
    org_a_id,
    'cross@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_d_id]
  );

  -- Remove Unit D from Org A and add to Org B
  PERFORM public.remove_organization_establishment(org_a_id, unit_d_id);
  PERFORM pg_temp.set_actor(owner_id); -- owner of Org B
  PERFORM public.add_organization_establishment(org_b_id, unit_d_id);

  -- Cross user attempts to accept Org A invitation
  PERFORM pg_temp.set_actor(cross_user_id);
  caught_error := false;
  BEGIN
    PERFORM public.accept_organization_invitation(invite_cross.invitation_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invitation_scope_no_longer_valid' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Accepting invite for unit moved to another org must fail with invitation_scope_no_longer_valid');

  -- =========================================================================
  -- TEST GROUP 23: ARRAY INTEGRITY (DUPLICATES, NULLS, EMPTY)
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  -- 1. Duplicate IDs [Unit A, Unit A] -> deduplicated cleanly and accepted
  SELECT * INTO invite_dup
  FROM public.invite_organization_member_v2(
    org_a_id,
    'dup@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_a_id, unit_a_id]
  );
  PERFORM pg_temp.set_actor(dup_user_id);
  PERFORM public.accept_organization_invitation(invite_dup.invitation_token);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_a_id) = true,
    'Duplicate IDs invite must deduplicate cleanly and grant scope on Unit A'
  );

  -- 2. NULL element in array -> rejected at invite time
  PERFORM pg_temp.set_actor(owner_id);
  caught_error := false;
  BEGIN
    PERFORM public.invite_organization_member_v2(
      org_a_id,
      'nulltest@corpscope.test',
      'manager',
      'selected',
      ARRAY[unit_a_id, NULL::uuid]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid_target_establishment_id' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Invite with NULL element in array must fail with invalid_target_establishment_id');

  -- 3. Empty array with selected scope -> rejected at invite time
  caught_error := false;
  BEGIN
    PERFORM public.invite_organization_member_v2(
      org_a_id,
      'emptytest@corpscope.test',
      'manager',
      'selected',
      ARRAY[]::uuid[]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'target_establishments_required_for_selected_scope' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Selected invite with empty array must fail with target_establishments_required_for_selected_scope');

  -- =========================================================================
  -- TEST GROUP 24: LEGACY INVITATION CONTRACT (V1)
  -- invite_organization_member (v1) defaults to scope_mode = 'all'
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  SELECT * INTO invite_legacy
  FROM public.invite_organization_member(
    org_a_id,
    'legacy@corpscope.test',
    'manager'
  );

  PERFORM pg_temp.set_actor(legacy_user_id);
  PERFORM public.accept_organization_invitation(invite_legacy.invitation_token);

  -- =========================================================================
  -- TEST GROUP 25: REPORT METRICS CONTRACT & SEMANTIC PRESERVATION
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  -- 1. Invalid range checks
  caught_error := false;
  BEGIN
    PERFORM public.get_organization_report(org_a_id, current_date, current_date - 1);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid_report_range' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Report end < start must fail with invalid_report_range');

  caught_error := false;
  BEGIN
    PERFORM public.get_organization_report(org_a_id, current_date, current_date + 367);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'invalid_report_range' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Report range > 366 days must fail with invalid_report_range');

  -- 2. Seed appointments on test_report_date for Unit A
  -- Prior completed appointment for returning_client (before test_report_date)
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, returning_client_id, (test_report_date - 5)::timestamp AT TIME ZONE 'America/Sao_Paulo', 30, (test_report_date - 5)::timestamp AT TIME ZONE 'America/Sao_Paulo' + interval '30 minutes', 'completed', 50.00);

  -- Pending appointment on test_report_date: 30 min, $100
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '9 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '9 hours 30 minutes', 'pending', 100.00);

  -- Confirmed appointment on test_report_date: 30 min, $100
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '10 hours 30 minutes', 'confirmed', 100.00);

  -- Completed appointment on test_report_date for new client: 30 min, $100
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, new_client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '11 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '11 hours 30 minutes', 'completed', 100.00);

  -- Completed appointment on test_report_date for returning client: 30 min, $100
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, returning_client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '12 hours 30 minutes', 'completed', 100.00);

  -- Cancelled appointment on test_report_date: 30 min, $100
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '13 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '13 hours 30 minutes', 'cancelled', 100.00);

  -- Soft-deleted appointment on test_report_date: 30 min, $100 (MUST BE COMPLETELY EXCLUDED)
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged, deleted_at)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '14 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '14 hours 30 minutes', 'completed', 100.00, now());

  -- Timezone boundary appointment: 23:00 Sao Paulo (which is 02:00 next day UTC) -> 30 min, $100 completed
  INSERT INTO public.appointments (id, establishment_id, professional_id, service_id, client_id, date_time, duration_minutes, ends_at, status, price_charged)
  VALUES (gen_random_uuid()::text, unit_a_id, owner_id, svc_a_id::text, new_client_id, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '23 hours', 30, (test_report_date::timestamp AT TIME ZONE 'America/Sao_Paulo') + interval '23 hours 30 minutes', 'completed', 100.00);

  -- 3. Query report for test_report_date as Owner
  report_result := public.get_organization_report(org_a_id, test_report_date, test_report_date);

  -- appointment_count = 6 (pending, confirmed, 3 completed, cancelled; deleted excluded)
  PERFORM pg_temp.assert(
    (report_result->>'appointment_count')::int = 6,
    'Report appointment_count must be 6'
  );

  -- scheduled_count = 2 (pending + confirmed)
  PERFORM pg_temp.assert(
    (report_result->>'scheduled_count')::int = 2,
    'Report scheduled_count must be 2 (pending + confirmed)'
  );

  -- scheduled_value = 200.00 (100 + 100)
  PERFORM pg_temp.assert(
    (report_result->>'scheduled_value')::numeric = 200.00,
    'Report scheduled_value must be 200.00'
  );

  -- completed_count = 3 (100 + 100 + 100)
  PERFORM pg_temp.assert(
    (report_result->>'completed_count')::int = 3,
    'Report completed_count must be 3'
  );

  -- production_realized = 300.00 (100 + 100 + 100)
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 300.00,
    'Report production_realized must be 300.00'
  );

  -- occupied_minutes = 150 (5 * 30 min: pending + confirmed + 3 completed)
  PERFORM pg_temp.assert(
    (report_result->>'occupied_minutes')::int = 150,
    'Report occupied_minutes must be 150 (pending + confirmed + 3 completed)'
  );

  -- new_clients = 1 (new_client_id has no completed before test_report_date)
  PERFORM pg_temp.assert(
    (report_result->>'new_clients')::int = 1,
    'Report new_clients must be 1'
  );

  -- returning_clients = 1 (returning_client_id has completed prior to test_report_date)
  PERFORM pg_temp.assert(
    (report_result->>'returning_clients')::int = 1,
    'Report returning_clients must be 1'
  );

  -- available_minutes matches public.admin_report_available_minutes
  PERFORM pg_temp.assert(
    (report_result->>'available_minutes')::numeric = (
      public.admin_report_available_minutes(unit_a_id, test_report_date, test_report_date, NULL)
      + public.admin_report_available_minutes(unit_b_id, test_report_date, test_report_date, NULL)
      + public.admin_report_available_minutes(unit_c_id, test_report_date, test_report_date, NULL)
      + public.admin_report_available_minutes(unit_d_id, test_report_date, test_report_date, NULL)
    ),
    'Report available_minutes must match public.admin_report_available_minutes'
  );

  -- 4. Query report as Manager Selected on Unit A (scoped aggregation)
  PERFORM pg_temp.set_actor(dual_role_user_id); -- Manager selected on Unit A
  report_result := public.get_organization_report(org_a_id, test_report_date, test_report_date);

  PERFORM pg_temp.assert(
    jsonb_array_length(report_result->'units') = 1,
    'Manager Selected on Unit A must only see 1 unit in report'
  );
  PERFORM pg_temp.assert(
    (report_result->'units'->0->>'id')::uuid = unit_a_id,
    'Manager Selected on Unit A must see Unit A metrics'
  );
  PERFORM pg_temp.assert(
    (report_result->>'production_realized')::numeric = 300.00,
    'Manager Selected on Unit A sees identical Unit A production math'
  );

  -- =========================================================================
  -- TEST GROUP 26: MEMBER SCOPE DISCLOSURE LEAK PREVENTION IN CONTEXT
  -- =========================================================================
  -- Set mgr_sel_id to selected on Unit A only
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.set_organization_member_unit_scope(org_a_id, mgr_sel_id, 'selected', ARRAY[unit_a_id]);

  -- Set revoked_mgr_id to active manager with selected on Unit C
  UPDATE public.organization_members
  SET status = 'active', revoked_at = NULL
  WHERE organization_id = org_a_id AND profile_id = revoked_mgr_id;
  PERFORM public.set_organization_member_unit_scope(org_a_id, revoked_mgr_id, 'selected', ARRAY[unit_c_id]);

  -- mgr_sel_id (scoped only to Unit A) calls get_organization_context
  PERFORM pg_temp.set_actor(mgr_sel_id);
  context_result := public.get_organization_context(org_a_id);

  -- Establishments only contains Unit A
  PERFORM pg_temp.assert(
    jsonb_array_length(context_result->'establishments') = 1
    AND (context_result->'establishments'->0->>'id')::uuid = unit_a_id,
    'Manager Selected on A must only see Unit A in establishments'
  );

  -- Members list contains members, but scoped_establishment_ids for other manager (revoked_mgr_id) is NULL
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(context_result->'members') AS m
    WHERE (m->>'profileId')::uuid = revoked_mgr_id
      AND (m->'scoped_establishment_ids' IS NULL OR m->>'scoped_establishment_ids' IS NULL)
  ) INTO item_found;
  PERFORM pg_temp.assert(
    item_found,
    'Manager Selected on A must receive NULL scoped_establishment_ids for other members (Unit C privacy preserved)'
  );

  -- Caller's own scoped_establishment_ids is visible to himself
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(context_result->'members') AS m
    WHERE (m->>'profileId')::uuid = mgr_sel_id
      AND (m->'scoped_establishment_ids') = to_jsonb(ARRAY[unit_a_id])
  ) INTO item_found;
  PERFORM pg_temp.assert(
    item_found,
    'Manager Selected on A can see his own scoped_establishment_ids'
  );

  -- Owner calls get_organization_context: sees full topology for all members
  PERFORM pg_temp.set_actor(owner_id);
  context_result := public.get_organization_context(org_a_id);
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(context_result->'members') AS m
    WHERE (m->>'profileId')::uuid = revoked_mgr_id
      AND (m->'scoped_establishment_ids') = to_jsonb(ARRAY[unit_c_id])
  ) INTO item_found;
  PERFORM pg_temp.assert(
    item_found,
    'Owner can see full delegation scoped_establishment_ids for all members'
  );

  -- =========================================================================
  -- TEST GROUP 27: UNCONFIRMED / UNVERIFIED EMAIL REJECTED AT ACCEPT
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  SELECT * INTO invite_unverified
  FROM public.invite_organization_member_v2(
    org_a_id,
    'unverified@corpscope.test',
    'manager',
    'selected',
    ARRAY[unit_a_id]
  );

  -- Unverified user attempts to accept
  PERFORM pg_temp.set_actor(unverified_user_id);
  caught_error := false;
  BEGIN
    PERFORM public.accept_organization_invitation(invite_unverified.invitation_token);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'verified_email_required' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Unverified email user must fail with verified_email_required');

  -- =========================================================================
  -- TEST GROUP 28: TEMPORAL EFFECTIVE_FROM VALIDITY
  -- =========================================================================
  -- Seed future unit
  INSERT INTO public.establishments (id, name, slug, address, phone, account_status, timezone, currency)
  VALUES (unit_future_id, 'Unit Future', 'unit-fut-' || substr(unit_future_id::text, 1, 8), 'Street Future', '11999990099', 'active', 'America/Sao_Paulo', 'BRL');

  INSERT INTO public.organization_establishments (organization_id, establishment_id, status, effective_from)
  VALUES (org_a_id, unit_future_id, 'active', CURRENT_DATE + interval '7 days');

  -- Owner should NOT have corporate scope on future unit today
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM pg_temp.assert(
    public.has_organization_establishment_scope(org_a_id, unit_future_id) = false,
    'Future effective_from unit must NOT grant scope before effective_from'
  );

  -- Future unit must NOT appear in get_organization_context
  context_result := public.get_organization_context(org_a_id);
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(context_result->'establishments') AS est
    WHERE (est->>'id')::uuid = unit_future_id
  ) INTO item_found;
  PERFORM pg_temp.assert(
    NOT item_found,
    'Future effective_from unit must not be listed in get_organization_context'
  );

  -- Invite with future unit must fail closed
  caught_error := false;
  BEGIN
    PERFORM public.invite_organization_member_v2(
      org_a_id,
      'futuretest@corpscope.test',
      'manager',
      'selected',
      ARRAY[unit_future_id]
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'establishment_not_in_organization' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Inviting with future establishment must fail with establishment_not_in_organization');

  RAISE NOTICE 'ALL PS4-E3 / PS4-E3.1 / PS4-E3.2 / PS4-E3.3 CORPORATE UNIT SCOPE LIFECYCLE & CONTRACT TESTS PASSED CLEANLY!';
END;
$$;

ROLLBACK;
