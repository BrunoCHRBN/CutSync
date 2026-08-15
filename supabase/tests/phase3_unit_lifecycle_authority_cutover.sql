-- ============================================================================
-- Test Suite: phase3_unit_lifecycle_authority_cutover.sql
-- Module: PS3-E1 Unit Lifecycle Authority Cutover & Onboarding/Governance Separation
-- ============================================================================

BEGIN;

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
  PERFORM set_config('role', 'postgres', true);
END;
$$;

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

DO $$
DECLARE
  owner_id uuid := gen_random_uuid();
  mgr_sel_id uuid := gen_random_uuid();
  gov_user_id uuid := gen_random_uuid();
  client_id uuid := gen_random_uuid();
  prof_id uuid := gen_random_uuid();

  reg_result record;
  unit_a_id uuid;
  org_a_id uuid;

  unit_b_id uuid := gen_random_uuid();
  unit_c_id uuid := gen_random_uuid();

  svc_a_id uuid := gen_random_uuid();
  svc_c_id uuid := gen_random_uuid();

  doc_fingerprint text := encode(extensions.digest('12345678901', 'sha256'), 'hex');
  doc_encrypted text := 'enc_doc_12345678901';

  caught_error boolean;
  err_msg text;
  readiness_result jsonb;
  finalize_result jsonb;
  lifecycle_result jsonb;
  public_exp jsonb;
  appt_id text;
  req_id uuid;
  booking_time timestamptz := ((date_trunc('week', now() + interval '1 week')::date)::text || ' 10:00:00-03')::timestamptz;

  opening_hours_json text := '[{"day":0,"name":"Domingo","isOpen":false,"open":"09:00","close":"18:00"},{"day":1,"name":"Segunda-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":2,"name":"Terça-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":3,"name":"Quarta-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":4,"name":"Quinta-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":5,"name":"Sexta-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":6,"name":"Sábado","isOpen":true,"open":"09:00","close":"18:00"}]';
BEGIN
  -- 1. SEED TEST USERS
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (owner_id, 'owner@lifecycle.test', now()),
    (mgr_sel_id, 'mgrsel@lifecycle.test', now()),
    (gov_user_id, 'gov@lifecycle.test', now()),
    (client_id, 'client@lifecycle.test', now()),
    (prof_id, 'prof@lifecycle.test', now());

  UPDATE public.profiles SET name = 'Owner User', email = 'owner@lifecycle.test' WHERE id = owner_id;
  UPDATE public.profiles SET name = 'Manager Selected', email = 'mgrsel@lifecycle.test' WHERE id = mgr_sel_id;
  UPDATE public.profiles SET name = 'Gov User', email = 'gov@lifecycle.test' WHERE id = gov_user_id;
  UPDATE public.profiles SET name = 'Client User', email = 'client@lifecycle.test' WHERE id = client_id;
  UPDATE public.profiles SET name = 'Professional User', email = 'prof@lifecycle.test', work_hours = opening_hours_json, titulo_profissional = 'Barbeiro' WHERE id = prof_id;

  -- Seed governance membership
  PERFORM set_config('cutsync.governance_access_reason', 'Teste de governança', true);
  INSERT INTO public.governance_users (profile_id, role, granted_by)
  VALUES (gov_user_id, 'SaaS_Owner', gov_user_id);

  -- =========================================================================
  -- SCENARIO A: NEW BUSINESS REGISTRATION
  -- =========================================================================
  SELECT * INTO reg_result
  FROM public.register_business_identity_atomic(
    owner_id,
    'CPF',
    doc_fingerprint,
    doc_encrypted,
    'iv12345678901234',
    'v1',
    '8901',
    'Barbearia Alfa',
    'barbearia-alfa-' || substr(owner_id::text, 1, 8),
    'Rua das Flores, 123',
    '11999990001',
    '#1A1A1A'
  );

  unit_a_id := reg_result.establishment_id;
  org_a_id := reg_result.organization_id;

  PERFORM pg_temp.set_actor(owner_id);

  PERFORM pg_temp.assert(unit_a_id IS NOT NULL, 'Registration must return establishment_id');
  PERFORM pg_temp.assert(org_a_id IS NOT NULL, 'Registration must return organization_id');

  -- Verify initial state: lifecycle_status = 'configuring', account_status = 'pending_verification'
  PERFORM pg_temp.assert(
    EXISTS (
      SELECT 1 FROM public.establishments
      WHERE id = unit_a_id
        AND lifecycle_status = 'configuring'
        AND lifecycle_version = 1
        AND account_status = 'pending_verification'
    ),
    'New unit must be created with lifecycle_status = configuring and account_status = pending_verification'
  );

  -- Verify owner has operational membership AND organization owner role
  PERFORM pg_temp.assert(
    EXISTS (
      SELECT 1 FROM public.memberships
      WHERE profile_id = owner_id
        AND establishment_id = unit_a_id
        AND role_template = 'admin'
        AND status = 'active'
    ),
    'Owner must have active admin membership'
  );

  PERFORM pg_temp.assert(
    EXISTS (
      SELECT 1 FROM public.organization_members
      WHERE profile_id = owner_id
        AND organization_id = org_a_id
        AND role = 'owner'
        AND scope_mode = 'all'
    ),
    'Owner must have organization owner membership with scope_mode all'
  );

  -- =========================================================================
  -- SCENARIO B: ONBOARDING CONFIGURED & FINALIZED (V2)
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);

  -- Attempt finalize before services -> must fail with establishment_not_operationally_configured
  caught_error := false;
  BEGIN
    PERFORM public.finalize_establishment_onboarding_v2(
      unit_a_id,
      opening_hours_json,
      1,
      gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE 'Caught SQLERRM: %', SQLERRM;
    IF SQLERRM = 'establishment_not_operationally_configured' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Finalize without service must fail with establishment_not_operationally_configured');

  -- Seed active service on Unit A
  INSERT INTO public.services (id, establishment_id, name, duration_minutes, price, is_active)
  VALUES (svc_a_id::text, unit_a_id, 'Corte Cabelo', 30, 50.00, true);

  -- Add professional membership
  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status, commission_rate, created_by)
  VALUES (prof_id, unit_a_id, 'professional', 'professional', 'active', 0.50, owner_id);

  INSERT INTO public.professional_services (establishment_id, professional_id, service_id, price, duration_minutes, is_active)
  VALUES (unit_a_id, prof_id, svc_a_id::text, 50.00, 30, true);

  -- Now finalize onboarding with v2
  req_id := gen_random_uuid();
  finalize_result := public.finalize_establishment_onboarding_v2(
    unit_a_id,
    opening_hours_json,
    1,
    req_id
  );

  PERFORM pg_temp.assert(
    finalize_result->>'lifecycleStatus' = 'ready',
    'Finalize v2 must advance lifecycleStatus to ready'
  );
  PERFORM pg_temp.assert(
    (finalize_result->>'version')::int = 2,
    'Finalize v2 must increment version to 2'
  );
  PERFORM pg_temp.assert(
    finalize_result->>'accountStatus' = 'pending_verification',
    'Finalize v2 must NOT mutate accountStatus (must remain pending_verification)'
  );

  -- Idempotency check: replay with same req_id
  finalize_result := public.finalize_establishment_onboarding_v2(
    unit_a_id,
    opening_hours_json,
    2,
    req_id
  );
  PERFORM pg_temp.assert(
    (finalize_result->>'replayed')::boolean = true,
    'Replaying finalize with same request_id must return replayed: true'
  );

  -- =========================================================================
  -- SCENARIO C: NO GOVERNANCE BYPASS
  -- =========================================================================
  -- Business actor cannot promote account_status
  caught_error := false;
  BEGIN
    PERFORM public.update_governance_establishment_status(
      unit_a_id,
      'active',
      'Business trying to approve himself'
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
  END;
  PERFORM pg_temp.assert(caught_error, 'Business actor cannot call update_governance_establishment_status');

  -- =========================================================================
  -- SCENARIO F: ACTIVATION BEFORE GOVERNANCE APPROVAL FORBIDDEN
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  caught_error := false;
  BEGIN
    PERFORM public.set_establishment_lifecycle_status(
      unit_a_id,
      'active',
      2,
      'Activating unit before governance',
      gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'governance_not_active' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Activating lifecycle while governance is pending_verification must fail with governance_not_active');

  -- =========================================================================
  -- SCENARIO D: GOVERNANCE APPROVES (account_status -> active)
  -- =========================================================================
  PERFORM pg_temp.set_actor(gov_user_id);
  PERFORM public.update_governance_establishment_status(
    unit_a_id,
    'active',
    'Documentacao aprovada pela governanca'
  );

  -- Verify: account_status is now active, BUT lifecycle_status REMAINS ready
  PERFORM pg_temp.assert(
    EXISTS (
      SELECT 1 FROM public.establishments
      WHERE id = unit_a_id
        AND account_status = 'active'
        AND lifecycle_status = 'ready'
        AND lifecycle_version = 2
    ),
    'Governance approval sets account_status = active while lifecycle_status remains ready'
  );

  -- =========================================================================
  -- SCENARIO E: ACTIVATION (ready -> active)
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  lifecycle_result := public.set_establishment_lifecycle_status(
    unit_a_id,
    'active',
    2,
    'Ativando unidade operacional',
    gen_random_uuid()
  );

  PERFORM pg_temp.assert(
    lifecycle_result->>'lifecycleStatus' = 'active',
    'set_establishment_lifecycle_status must advance to active'
  );
  PERFORM pg_temp.assert(
    (lifecycle_result->>'version')::int = 3,
    'set_establishment_lifecycle_status must increment version to 3'
  );

  -- =========================================================================
  -- SCENARIO G: PAUSE (active -> paused)
  -- =========================================================================
  lifecycle_result := public.set_establishment_lifecycle_status(
    unit_a_id,
    'paused',
    3,
    'Pausando unidade para reforma',
    gen_random_uuid()
  );

  PERFORM pg_temp.assert(
    lifecycle_result->>'lifecycleStatus' = 'paused',
    'Lifecycle status must be paused'
  );

  -- Invariants preserved: account_status is STILL active, org link active, membership active
  PERFORM pg_temp.assert(
    EXISTS (
      SELECT 1 FROM public.establishments
      WHERE id = unit_a_id
        AND account_status = 'active'
        AND lifecycle_status = 'paused'
    ),
    'Pause is purely operational; account_status remains active'
  );

  -- Public discovery must NOT return paused unit
  UPDATE public.establishments SET discovery_status = 'published' WHERE id = unit_a_id;
  caught_error := false;
  BEGIN
    SELECT * INTO public_exp
    FROM public.get_public_establishment_experience(
      (SELECT slug FROM public.establishments WHERE id = unit_a_id)
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'public_establishment_not_found' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Public discovery must fail closed for paused unit');

  -- Client booking must NOT be allowed on paused unit
  PERFORM pg_temp.set_actor(client_id);
  caught_error := false;
  BEGIN
    PERFORM public.create_appointment(
      unit_a_id,
      prof_id,
      svc_a_id::text,
      booking_time,
      'Cliente Teste',
      client_id
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'establishment_unavailable' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Client booking must fail closed on paused unit');

  -- =========================================================================
  -- SCENARIO H: RESUME (paused -> active)
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id);
  lifecycle_result := public.set_establishment_lifecycle_status(
    unit_a_id,
    'active',
    4,
    'Retomando operacao da unidade',
    gen_random_uuid()
  );

  PERFORM pg_temp.assert(
    lifecycle_result->>'lifecycleStatus' = 'active',
    'Resumed lifecycle status must be active'
  );

  -- Public discovery now works for active published unit
  SELECT * INTO public_exp
  FROM public.get_public_establishment_experience(
    (SELECT slug FROM public.establishments WHERE id = unit_a_id)
  );
  PERFORM pg_temp.assert(public_exp IS NOT NULL, 'Public discovery succeeds for active published unit');

  -- Client booking now succeeds for active unit
  PERFORM pg_temp.set_actor(client_id);
  appt_id := public.create_appointment(
    unit_a_id,
    prof_id,
    svc_a_id::text,
    booking_time,
    'Cliente Teste',
    client_id
  );
  PERFORM pg_temp.assert(appt_id IS NOT NULL, 'Client booking succeeds for active unit');

  -- =========================================================================
  -- SCENARIO J: CORPORATE SCOPE READINESS
  -- =========================================================================
  -- Seed Unit C in Org A
  INSERT INTO public.establishments (id, name, slug, address, phone, account_status, timezone, currency, lifecycle_status, lifecycle_version, opening_hours)
  VALUES (unit_c_id, 'Unit C', 'unit-c-' || substr(unit_c_id::text, 1, 8), 'Street C', '11999990003', 'active', 'America/Sao_Paulo', 'BRL', 'configuring', 1, opening_hours_json);

  INSERT INTO public.services (id, establishment_id, name, duration_minutes, price, is_active)
  VALUES (svc_c_id::text, unit_c_id, 'Service C', 30, 40.00, true);

  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status, commission_rate, created_by)
  VALUES (owner_id, unit_c_id, 'admin', 'admin', 'active', 0.50, owner_id);

  INSERT INTO public.organization_establishments (organization_id, establishment_id, status, effective_from)
  VALUES (org_a_id, unit_c_id, 'active', CURRENT_DATE);

  -- Set mgr_sel_id to selected on Unit A only
  INSERT INTO public.organization_members (organization_id, profile_id, role, scope_mode, status)
  VALUES (org_a_id, mgr_sel_id, 'manager', 'selected', 'active');

  INSERT INTO public.organization_member_establishment_scopes (organization_id, organization_member_id, establishment_id, granted_by)
  VALUES (org_a_id, (SELECT id FROM public.organization_members WHERE organization_id = org_a_id AND profile_id = mgr_sel_id), unit_a_id, owner_id);

  -- Manager selected on Unit A can read Unit A readiness
  PERFORM pg_temp.set_actor(mgr_sel_id);
  readiness_result := public.get_establishment_readiness(unit_a_id);
  PERFORM pg_temp.assert(readiness_result IS NOT NULL, 'Manager selected on Unit A can view Unit A readiness');

  -- Manager selected on Unit A CANNOT read Unit C readiness
  caught_error := false;
  BEGIN
    PERFORM public.get_establishment_readiness(unit_c_id);
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'forbidden' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Manager selected on Unit A cannot view Unit C readiness (corporate scope enforced)');

  -- =========================================================================
  -- SCENARIO K: CORPORATE SCOPE DOES NOT MUTATE LIFECYCLE
  -- =========================================================================
  -- Manager selected on Unit A has corporate scope, but NO establishment membership on Unit A
  caught_error := false;
  BEGIN
    PERFORM public.set_establishment_lifecycle_status(
      unit_a_id,
      'paused',
      5,
      'Manager trying to pause without capability',
      gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM = 'forbidden' THEN
      caught_error := true;
    END IF;
  END;
  PERFORM pg_temp.assert(caught_error, 'Corporate manager without establishment capability cannot mutate lifecycle');

  -- =========================================================================
  -- SCENARIO L: LEGACY FINALIZE ADAPTER
  -- =========================================================================
  PERFORM pg_temp.set_actor(NULL);

  -- Seed Unit B in configuring
  INSERT INTO public.establishments (id, name, slug, address, phone, account_status, timezone, currency, lifecycle_status, lifecycle_version)
  VALUES (unit_b_id, 'Unit B', 'unit-b-' || substr(unit_b_id::text, 1, 8), 'Street B', '11999990002', 'pending_verification', 'America/Sao_Paulo', 'BRL', 'configuring', 1);

  INSERT INTO public.organization_establishments (organization_id, establishment_id, status, effective_from)
  VALUES (org_a_id, unit_b_id, 'active', CURRENT_DATE);

  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status, commission_rate, created_by)
  VALUES (owner_id, unit_b_id, 'admin', 'admin', 'active', 0.50, owner_id);

  INSERT INTO public.services (id, establishment_id, name, duration_minutes, price, is_active)
  VALUES (gen_random_uuid()::text, unit_b_id, 'Service B', 45, 60.00, true);

  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.finalize_establishment_onboarding(unit_b_id, opening_hours_json);

  -- Verify: lifecycle_status became ready, BUT account_status REMAINS pending_verification
  PERFORM pg_temp.assert(
    EXISTS (
      SELECT 1 FROM public.establishments
      WHERE id = unit_b_id
        AND lifecycle_status = 'ready'
        AND lifecycle_version = 2
        AND account_status = 'pending_verification'
    ),
    'Legacy finalize adapter sets lifecycle_status = ready WITHOUT touching account_status'
  );

  RAISE NOTICE 'ALL PS3-E1 UNIT LIFECYCLE AUTHORITY CUTOVER TESTS PASSED CLEANLY!';
END;
$$;

ROLLBACK;
