-- ============================================================================
-- Test Suite: phase3_unit_closure_orchestration.sql
-- Module: PS3-E2 Atomic Unit Closure Orchestration
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
  manager_id uuid := gen_random_uuid();
  finance_id uuid := gen_random_uuid();
  admin_only_id uuid := gen_random_uuid();
  test_client_id uuid := gen_random_uuid();
  prof_id uuid := gen_random_uuid();

  reg_result record;
  unit_a_id uuid;
  unit_b_id uuid;
  unit_c_id uuid;
  org_id uuid;

  doc_fingerprint text := encode(extensions.digest('98765432100', 'sha256'), 'hex');
  doc_encrypted text := 'enc_doc_98765432100';

  opening_hours_json text := '[{"day":0,"name":"Domingo","isOpen":false,"open":"09:00","close":"18:00"},{"day":1,"name":"Segunda-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":2,"name":"Terça-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":3,"name":"Quarta-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":4,"name":"Quinta-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":5,"name":"Sexta-feira","isOpen":true,"open":"09:00","close":"18:00"},{"day":6,"name":"Sábado","isOpen":true,"open":"09:00","close":"18:00"}]';

  svc_a_id text := gen_random_uuid()::text;
  svc_b_id text := gen_random_uuid()::text;

  caught_error boolean;
  err_msg text;
  preview_res jsonb;
  close_res jsonb;
  replay_res jsonb;

  req_id uuid := gen_random_uuid();
  appt_future_pending text;
  appt_future_confirmed text;
  appt_past_unresolved text;
  appt_past_completed text;

  pending_invite_id uuid;
  order_id uuid;
  cutover_id uuid;
  sub_id uuid;
  account_id uuid;
BEGIN
  -- 1. SEED TEST USERS
  INSERT INTO auth.users (id, email, email_confirmed_at)
  VALUES
    (owner_id, 'owner@closure.test', now()),
    (manager_id, 'manager@closure.test', now()),
    (finance_id, 'finance@closure.test', now()),
    (admin_only_id, 'adminonly@closure.test', now()),
    (test_client_id, 'client@closure.test', now()),
    (prof_id, 'prof@closure.test', now());

  UPDATE public.profiles SET name = 'Owner User', email = 'owner@closure.test' WHERE id = owner_id;
  UPDATE public.profiles SET name = 'Manager User', email = 'manager@closure.test' WHERE id = manager_id;
  UPDATE public.profiles SET name = 'Finance User', email = 'finance@closure.test' WHERE id = finance_id;
  UPDATE public.profiles SET name = 'Admin Only User', email = 'adminonly@closure.test' WHERE id = admin_only_id;
  UPDATE public.profiles SET name = 'Client User', email = 'client@closure.test' WHERE id = test_client_id;
  UPDATE public.profiles SET name = 'Professional User', email = 'prof@closure.test', work_hours = opening_hours_json, titulo_profissional = 'Barbeiro' WHERE id = prof_id;

  -- 2. REGISTER BUSINESS (Unit A in configuring)
  SELECT * INTO reg_result
  FROM public.register_business_identity_atomic(
    owner_id,
    'CPF',
    doc_fingerprint,
    doc_encrypted,
    'iv12345678901234',
    'v1',
    '2100',
    'Barbearia Matriz',
    'barbearia-matriz-closure',
    'Rua das Flores 123',
    '11999990001',
    '#D4AF37'
  );

  unit_a_id := reg_result.establishment_id;
  org_id := reg_result.organization_id;

  -- Add corporate manager and finance members to Organization
  DECLARE
    mgr_member_id uuid;
  BEGIN
    INSERT INTO public.organization_members (organization_id, profile_id, role, scope_mode, created_by)
    VALUES (org_id, manager_id, 'manager', 'selected', owner_id)
    RETURNING id INTO mgr_member_id;

    INSERT INTO public.organization_members (organization_id, profile_id, role, scope_mode, created_by)
    VALUES (org_id, finance_id, 'finance', 'all', owner_id);

    INSERT INTO public.organization_member_establishment_scopes (organization_id, organization_member_id, establishment_id, granted_by)
    VALUES (org_id, mgr_member_id, unit_a_id, owner_id);
  END;

  -- Seed services & professional for Unit A
  INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
  VALUES (svc_a_id, unit_a_id, 'Corte Cabelo', 50.00, 30, true);

  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status, commission_rate, created_by)
  VALUES (prof_id, unit_a_id, 'professional', 'professional', 'active', 0.50, owner_id);

  -- Finalize onboarding Unit A -> ready
  PERFORM pg_temp.set_actor(owner_id, 'aal2');
  PERFORM public.finalize_establishment_onboarding_v2(unit_a_id, opening_hours_json, 1, gen_random_uuid());

  -- Approve governance -> active account_status
  PERFORM set_config('cutsync.governance_status_reason', 'Aprovacao governanca teste', true);
  UPDATE public.establishments SET account_status = 'active' WHERE id = unit_a_id;

  -- =========================================================================
  -- SCENARIO A: DIRECT GENERIC SETTER -> closed REJECTED
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.set_establishment_lifecycle_status(
      unit_a_id, 'closed', 2, 'Tentando fechar direto', gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'closure_orchestration_required',
    'A: set_establishment_lifecycle_status to closed must fail with closure_orchestration_required, got: ' || COALESCE(err_msg, 'none'));

  -- =========================================================================
  -- SCENARIO B: DIRECT GENERIC SETTER closed -> archived REJECTED
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.set_establishment_lifecycle_status(
      unit_a_id, 'archived', 2, 'Tentando arquivar direto', gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'closure_orchestration_required',
    'B: set_establishment_lifecycle_status to archived must fail with closure_orchestration_required');

  -- Advance Unit A to active
  PERFORM public.set_establishment_lifecycle_status(
    unit_a_id, 'active', 2, 'Ativando unidade para testes', gen_random_uuid()
  );

  -- Publish discovery for Unit A
  PERFORM public.publish_establishment_discovery(unit_a_id);

  -- =========================================================================
  -- SCENARIO C: MANAGER / FINANCE / ADMIN CANNOT CLOSE
  -- =========================================================================
  -- Corporate Manager attempt
  PERFORM pg_temp.set_actor(manager_id, 'aal2');
  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Manager tentando fechar', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'organization_owner_required',
    'C1: Corporate manager cannot close unit');

  -- Corporate Finance attempt
  PERFORM pg_temp.set_actor(finance_id, 'aal2');
  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Finance tentando fechar', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'organization_owner_required',
    'C2: Corporate finance cannot close unit');

  -- Operational Admin without Org Owner attempt
  INSERT INTO public.memberships (profile_id, establishment_id, role, role_template, status, commission_rate, created_by)
  VALUES (admin_only_id, unit_a_id, 'admin', 'admin', 'active', 0.50, owner_id);

  PERFORM pg_temp.set_actor(admin_only_id, 'aal2');
  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Admin operational tentando fechar', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'organization_owner_required',
    'C3: Operational admin without org owner cannot close unit');

  -- Owner without AAL2
  PERFORM pg_temp.set_actor(owner_id, 'aal1');
  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Owner sem AAL2 tentando fechar', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'aal2_required',
    'C4: Organization owner without AAL2 must fail with aal2_required');

  -- =========================================================================
  -- SCENARIO H: CONFIGURING -> CLOSED REJECTED
  -- =========================================================================
  PERFORM pg_temp.set_actor(owner_id, 'aal2');

  -- Create Unit C in configuring
  INSERT INTO public.establishments (
    name, slug, address, phone, primary_color, account_status, verification_level,
    lifecycle_status, lifecycle_version
  ) VALUES (
    'Unidade C Setup', 'unidade-c-setup', 'Rua C 123', '11999990003', '#D4AF37',
    'pending_verification', 1, 'configuring', 1
  ) RETURNING id INTO unit_c_id;

  INSERT INTO public.organization_establishments (organization_id, establishment_id, linked_by)
  VALUES (org_id, unit_c_id, owner_id);

  PERFORM pg_temp.set_actor(owner_id, 'aal2');
  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_c_id, 1, 'Tentando fechar em configuring', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'invalid_lifecycle_transition',
    'H: Configuring unit cannot be closed via close_establishment_unit');

  -- =========================================================================
  -- SCENARIO K: UNRESOLVED PAST APPOINTMENTS BLOCKS CLOSURE
  -- =========================================================================
  -- Insert past unresolved appointment (pending with date in the past)
  INSERT INTO public.appointments (
    id, establishment_id, professional_id, service_id, client_id, client_name,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    'appt-past-unresolved-1', unit_a_id, prof_id, svc_a_id, test_client_id, 'Client Past',
    now() - interval '2 days', 30, now() - interval '2 days' + interval '30 minutes', 'pending'
  );

  preview_res := public.get_establishment_closure_preview(unit_a_id);
  PERFORM pg_temp.assert((preview_res->>'canClose')::boolean = false,
    'K1: Closure preview canClose must be false when unresolved past appointments exist');
  PERFORM pg_temp.assert(preview_res->'blockers' ? 'unresolved_past_appointments',
    'K2: Closure preview must report unresolved_past_appointments blocker');

  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Fechando com agendamento passado', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'unresolved_past_appointments',
    'K3: close_establishment_unit must fail with unresolved_past_appointments');

  -- Regularize past appointment -> mark completed
  UPDATE public.appointments SET status = 'completed' WHERE id = 'appt-past-unresolved-1';

  -- =========================================================================
  -- SCENARIO W: PENDING BILLING CUTOVER BLOCKS CLOSURE
  -- =========================================================================
  -- Create billing account & subscription for Org
  SELECT account.id INTO account_id
  FROM public.organization_billing_accounts AS account
  WHERE account.organization_id = org_id;

  DECLARE
    plan_rec_id uuid;
  BEGIN
    SELECT id INTO plan_rec_id FROM public.organization_billing_plans WHERE active = true LIMIT 1;
    IF plan_rec_id IS NULL THEN
      INSERT INTO public.organization_billing_plans (code, name, base_price_cents)
      VALUES ('pro_multi', 'Plano Pro Multi', 4990)
      RETURNING id INTO plan_rec_id;
    END IF;

    INSERT INTO public.organization_subscriptions (
      id, billing_account_id, plan_id, status, current_period_start, current_period_end
    ) VALUES (
      gen_random_uuid(), account_id, plan_rec_id, 'active', CURRENT_DATE, CURRENT_DATE + 30
    ) RETURNING id INTO sub_id;
  END;

  INSERT INTO public.billing_cutover_requests (
    organization_subscription_id, status, cutover_at, establishment_ids, requested_by
  ) VALUES (
    sub_id, 'scheduled', now() + interval '5 days', ARRAY[unit_a_id], owner_id
  ) RETURNING id INTO cutover_id;

  preview_res := public.get_establishment_closure_preview(unit_a_id);
  PERFORM pg_temp.assert((preview_res->>'canClose')::boolean = false,
    'W1: Closure preview canClose must be false when pending cutover exists');
  PERFORM pg_temp.assert(preview_res->'blockers' ? 'pending_billing_cutover',
    'W2: Closure preview must report pending_billing_cutover');

  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Fechando com cutover pendente', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'pending_billing_cutover',
    'W3: close_establishment_unit must fail with pending_billing_cutover');

  -- Cancel cutover request to continue
  UPDATE public.billing_cutover_requests SET status = 'cancelled' WHERE id = cutover_id;

  -- =========================================================================
  -- SCENARIO X: OPEN FINANCIAL / SERVICE ORDER BLOCKS CLOSURE
  -- =========================================================================
  INSERT INTO public.service_orders (
    id, establishment_id, professional_id, status, currency, subtotal_cents, discount_cents,
    total_cents, created_by, updated_by
  ) VALUES (
    gen_random_uuid(), unit_a_id, prof_id, 'open', 'BRL', 5000, 0, 5000, owner_id, owner_id
  ) RETURNING id INTO order_id;

  preview_res := public.get_establishment_closure_preview(unit_a_id);
  PERFORM pg_temp.assert((preview_res->>'canClose')::boolean = false,
    'X1: Closure preview canClose must be false when open service order exists');
  PERFORM pg_temp.assert(preview_res->'blockers' ? 'closure_financial_blockers',
    'X2: Closure preview must report closure_financial_blockers');

  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(unit_a_id, 3, 'Fechando com comanda aberta', gen_random_uuid());
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'closure_financial_blockers',
    'X3: close_establishment_unit must fail with closure_financial_blockers');

  -- Close the service order
  UPDATE public.service_orders
  SET status = 'voided',
      voided_at = now(),
      voided_by = owner_id,
      void_reason = 'Comanda cancelada para encerramento'
  WHERE id = order_id;

  -- =========================================================================
  -- SEEDING RESOURCES FOR UNIT A CLOSURE (Scenarios I, J, M, N, O, P, Q, R, S, T, V)
  -- =========================================================================
  -- Future pending appointment
  INSERT INTO public.appointments (
    id, establishment_id, professional_id, service_id, client_id, client_name,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    'appt-future-pending-1', unit_a_id, prof_id, svc_a_id, test_client_id, 'Client Future Pending',
    now() + interval '2 days', 30, now() + interval '2 days' + interval '30 minutes', 'pending'
  );

  -- Future confirmed appointment
  INSERT INTO public.appointments (
    id, establishment_id, professional_id, service_id, client_id, client_name,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    'appt-future-confirmed-1', unit_a_id, prof_id, svc_a_id, test_client_id, 'Client Future Confirmed',
    now() + interval '3 days', 30, now() + interval '3 days' + interval '30 minutes', 'confirmed'
  );

  -- Historical cancelled & no_show appointments
  INSERT INTO public.appointments (
    id, establishment_id, professional_id, service_id, client_id, client_name,
    date_time, duration_minutes, ends_at, status
  ) VALUES
    ('appt-hist-cancelled-1', unit_a_id, prof_id, svc_a_id, test_client_id, 'Client Hist Cancelled',
     now() - interval '5 days', 30, now() - interval '5 days' + interval '30 minutes', 'cancelled'),
    ('appt-hist-noshow-1', unit_a_id, prof_id, svc_a_id, test_client_id, 'Client Hist NoShow',
     now() - interval '6 days', 30, now() - interval '6 days' + interval '30 minutes', 'no_show');

  -- Pending invitation
  INSERT INTO public.invitations (
    id, establishment_id, invited_email, role, token_hash, status, expires_at, created_by
  ) VALUES (
    gen_random_uuid(), unit_a_id, 'invitee@closure.test', 'professional',
    encode(extensions.digest('invite-token-1', 'sha256'), 'hex'), 'pending',
    now() + interval '7 days', owner_id
  ) RETURNING id INTO pending_invite_id;

  -- Active user contexts
  INSERT INTO public.user_app_active_contexts (profile_id, app_id, context_kind, establishment_id, version)
  VALUES
    (owner_id, 'web', 'establishment', unit_a_id, 1),
    (prof_id, 'business', 'establishment', unit_a_id, 1)
  ON CONFLICT (profile_id, app_id) DO UPDATE
  SET context_kind = 'establishment', establishment_id = unit_a_id;

  -- Set legacy profile establishment_id hint
  UPDATE public.profiles SET establishment_id = unit_a_id WHERE id IN (prof_id, admin_only_id);

  -- Update existing active coverage and insert scheduled coverage for Unit A
  UPDATE public.billing_coverage_assignments
  SET organization_subscription_id = sub_id,
      billing_account_id = NULL,
      source_scope = 'organization'
  WHERE establishment_id = unit_a_id AND status = 'active';

  INSERT INTO public.billing_coverage_assignments (
    establishment_id, source_scope, organization_subscription_id, status, effective_from, reason
  ) VALUES
    (unit_a_id, 'organization', sub_id, 'scheduled', now() + interval '30 days', 'scheduled_test_coverage');

  -- Verify preview before close
  preview_res := public.get_establishment_closure_preview(unit_a_id);
  PERFORM pg_temp.assert((preview_res->>'canClose')::boolean = true,
    'Preview: Unit A should be ready to close');
  PERFORM pg_temp.assert((preview_res->'futureAppointments'->>'total')::integer = 2,
    'Preview: Future appointments total must be 2');
  PERFORM pg_temp.assert((preview_res->>'activeMemberships')::integer >= 2,
    'Preview: Active memberships count must be >= 2');
  PERFORM pg_temp.assert((preview_res->>'pendingInvitations')::integer = 1,
    'Preview: Pending invitations count must be 1');
  PERFORM pg_temp.assert((preview_res->>'activeContexts')::integer >= 2,
    'Preview: Active contexts count must be >= 2');

  -- =========================================================================
  -- SCENARIO D & F: ACTIVE -> CLOSED ATOMIC EXECUTION (Org Owner + AAL2)
  -- =========================================================================
  req_id := gen_random_uuid();
  close_res := public.close_establishment_unit(
    unit_a_id, 3, 'Encerramento estrutural da unidade matriz por decisão societária', req_id
  );

  PERFORM pg_temp.assert((close_res->>'lifecycleStatus') = 'closed',
    'F1: Unit A lifecycleStatus must be closed');
  PERFORM pg_temp.assert((close_res->>'version')::integer = 4,
    'F2: Unit A version must be incremented to 4');
  PERFORM pg_temp.assert((close_res->>'cancelledAppointments')::integer = 2,
    'F3: 2 future appointments cancelled');
  PERFORM pg_temp.assert((close_res->>'revokedInvitations')::integer = 1,
    'F4: 1 invitation revoked');
  PERFORM pg_temp.assert((close_res->>'replayed')::boolean = false,
    'F5: First execution replayed must be false');

  -- =========================================================================
  -- SCENARIO I: FUTURE APPOINTMENTS CANCELLED (NOT DELETED)
  -- =========================================================================
  PERFORM pg_temp.assert((SELECT status FROM public.appointments WHERE id = 'appt-future-pending-1') = 'cancelled',
    'I1: Future pending appointment must be cancelled');
  PERFORM pg_temp.assert((SELECT cancellation_reason_code FROM public.appointments WHERE id = 'appt-future-pending-1') = 'establishment_cancelled',
    'I2: Future pending appointment cancellation_reason_code must be establishment_cancelled');
  PERFORM pg_temp.assert((SELECT status FROM public.appointments WHERE id = 'appt-future-confirmed-1') = 'cancelled',
    'I3: Future confirmed appointment must be cancelled');

  -- =========================================================================
  -- SCENARIO J: COMPLETED / CANCELLED / NO_SHOW HISTORY UNCHANGED
  -- =========================================================================
  PERFORM pg_temp.assert((SELECT status FROM public.appointments WHERE id = 'appt-past-unresolved-1') = 'completed',
    'J1: Completed past appointment remains completed');
  PERFORM pg_temp.assert((SELECT status FROM public.appointments WHERE id = 'appt-hist-cancelled-1') = 'cancelled',
    'J2: Hist cancelled appointment remains cancelled');
  PERFORM pg_temp.assert((SELECT status FROM public.appointments WHERE id = 'appt-hist-noshow-1') = 'no_show',
    'J3: Hist noshow appointment remains no_show');

  -- =========================================================================
  -- SCENARIO L: CLIENT CAN STILL READ CANCELLED HISTORICAL APPOINTMENT
  -- =========================================================================
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.appointments WHERE appointments.client_id = test_client_id AND appointments.establishment_id = unit_a_id),
    'L: Client appointment records remain intact in database'
  );

  -- =========================================================================
  -- SCENARIO M: DISCOVERY DRAFT & PUBLISHED_AT NULL
  -- =========================================================================
  PERFORM pg_temp.assert(
    (SELECT discovery_status FROM public.establishments WHERE id = unit_a_id) = 'draft'
    AND (SELECT published_at FROM public.establishments WHERE id = unit_a_id) IS NULL,
    'M: Discovery must be draft and published_at NULL'
  );

  -- =========================================================================
  -- SCENARIO N: PENDING INVITATIONS REVOKED
  -- =========================================================================
  PERFORM pg_temp.assert(
    (SELECT status FROM public.invitations WHERE id = pending_invite_id) = 'revoked'
    AND (SELECT revoked_at FROM public.invitations WHERE id = pending_invite_id) IS NOT NULL,
    'N: Pending invitation must be revoked'
  );

  -- =========================================================================
  -- SCENARIO O: OPERATIONAL MEMBERSHIPS REVOKED
  -- =========================================================================
  PERFORM pg_temp.assert(
    NOT EXISTS (
      SELECT 1 FROM public.memberships
      WHERE establishment_id = unit_a_id AND status = 'active'
    ),
    'O: All operational memberships on closed unit must be revoked'
  );

  -- =========================================================================
  -- SCENARIO P: ORGANIZATION MEMBERSHIP PRESERVED
  -- =========================================================================
  PERFORM pg_temp.assert(
    (SELECT status FROM public.organization_members WHERE organization_id = org_id AND profile_id = owner_id) = 'active'
    AND (SELECT status FROM public.organization_members WHERE organization_id = org_id AND profile_id = manager_id) = 'active'
    AND (SELECT status FROM public.organization_members WHERE organization_id = org_id AND profile_id = finance_id) = 'active',
    'P: Organization memberships must remain active'
  );

  -- =========================================================================
  -- SCENARIO Q: ACTIVE ESTABLISHMENT CONTEXTS INVALIDATED
  -- =========================================================================
  PERFORM pg_temp.assert(
    NOT EXISTS (
      SELECT 1 FROM public.user_app_active_contexts
      WHERE establishment_id = unit_a_id AND context_kind = 'establishment'
    ),
    'Q: Active establishment contexts for closed unit must be deleted'
  );

  -- =========================================================================
  -- SCENARIO R: PROFILES.ESTABLISHMENT_ID HINT CLEARED, ROLE UNTOUCHED
  -- =========================================================================
  PERFORM pg_temp.assert(
    (SELECT establishment_id FROM public.profiles WHERE id = prof_id) IS NULL
    AND (SELECT role FROM public.profiles WHERE id = prof_id) = 'client',
    'R: profiles.establishment_id hint cleared to NULL and profiles.role untouched'
  );

  -- =========================================================================
  -- SCENARIO S: ORGANIZATION LINK REMOVED
  -- =========================================================================
  PERFORM pg_temp.assert(
    (SELECT status FROM public.organization_establishments WHERE organization_id = org_id AND establishment_id = unit_a_id) = 'removed',
    'S: organization_establishments status must be removed'
  );

  -- =========================================================================
  -- SCENARIO T: SELECTED CORPORATE SCOPES REVOKED
  -- =========================================================================
  PERFORM pg_temp.assert(
    NOT EXISTS (
      SELECT 1 FROM public.organization_member_establishment_scopes
      WHERE organization_id = org_id AND establishment_id = unit_a_id AND revoked_at IS NULL
    ),
    'T: Member scopes for closed establishment must be revoked'
  );

  -- =========================================================================
  -- SCENARIO U: LAST UNIT IN ORGANIZATION CLOSURE PRESERVES ORGANIZATION
  -- =========================================================================
  PERFORM pg_temp.assert(
    EXISTS (SELECT 1 FROM public.organizations WHERE id = org_id),
    'U: Organization remains active even when 0 active units remain'
  );

  -- =========================================================================
  -- SCENARIO V: ACTIVE & SCHEDULED BILLING COVERAGE ENDED
  -- =========================================================================
  PERFORM pg_temp.assert(
    NOT EXISTS (
      SELECT 1 FROM public.billing_coverage_assignments
      WHERE establishment_id = unit_a_id AND status IN ('active', 'scheduled')
    ),
    'V: Billing coverage must be ended for closed unit'
  );

  -- =========================================================================
  -- SCENARIO Y: EXACT IDEMPOTENT REPLAY
  -- =========================================================================
  replay_res := public.close_establishment_unit(
    unit_a_id, 3, 'Encerramento estrutural da unidade matriz por decisão societária', req_id
  );
  PERFORM pg_temp.assert((replay_res->>'replayed')::boolean = true,
    'Y1: Idempotent replay replayed must be true');
  PERFORM pg_temp.assert((replay_res->>'lifecycleStatus') = 'closed',
    'Y2: Idempotent replay lifecycleStatus must be closed');
  PERFORM pg_temp.assert((replay_res->>'version')::integer = 4,
    'Y3: Idempotent replay version must be 4');
  PERFORM pg_temp.assert((replay_res->>'cancelledAppointments')::integer = 2,
    'Y4: Idempotent replay preserves original cancelled appointment count');

  -- =========================================================================
  -- SCENARIO Z: CONFLICTING IDEMPOTENCY KEY REJECTED
  -- =========================================================================
  caught_error := false;
  BEGIN
    PERFORM public.close_establishment_unit(
      unit_a_id, 4, 'Outro motivo conflitante', req_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'idempotency_key_reused',
    'Z: Conflicting request payload with same request_id must fail with idempotency_key_reused');

  -- =========================================================================
  -- SCENARIO E: READY -> CLOSED
  -- =========================================================================
  -- Create Unit B, promote configuring -> ready, then close from ready
  PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
  PERFORM set_config('cutsync.governance_status_reason', 'Setup de teste', true);

  INSERT INTO public.establishments (
    name, slug, address, phone, primary_color, account_status, verification_level,
    lifecycle_status, lifecycle_version
  ) VALUES (
    'Unidade B Filial', 'unidade-b-filial-closure', 'Av Paulista 1000', '11999990002', '#D4AF37',
    'active', 1, 'ready', 2
  ) RETURNING id INTO unit_b_id;

  PERFORM set_config('app.lifecycle_rpc', '', true);

  INSERT INTO public.organization_establishments (organization_id, establishment_id, linked_by)
  VALUES (org_id, unit_b_id, owner_id);

  close_res := public.close_establishment_unit(
    unit_b_id, 2, 'Fechando unidade B a partir do estado ready', gen_random_uuid()
  );
  PERFORM pg_temp.assert((close_res->>'previousStatus') = 'ready' AND (close_res->>'lifecycleStatus') = 'closed',
    'E: Closing unit from ready status must succeed');

  -- =========================================================================
  -- SCENARIO G: PAUSED -> CLOSED
  -- =========================================================================
  -- Create another unit, activate, pause, then close from paused
  DECLARE
    unit_d_id uuid;
  BEGIN
    PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
    PERFORM set_config('cutsync.governance_status_reason', 'Setup de teste', true);

    INSERT INTO public.establishments (
      name, slug, address, phone, primary_color, account_status, verification_level,
      lifecycle_status, lifecycle_version
    ) VALUES (
      'Unidade D Paused', 'unidade-d-paused-closure', 'Rua D 500', '11999990004', '#D4AF37',
      'active', 1, 'paused', 4
    ) RETURNING id INTO unit_d_id;

    PERFORM set_config('app.lifecycle_rpc', '', true);

    INSERT INTO public.organization_establishments (organization_id, establishment_id, linked_by)
    VALUES (org_id, unit_d_id, owner_id);

    close_res := public.close_establishment_unit(
      unit_d_id, 4, 'Fechando unidade D a partir do estado paused', gen_random_uuid()
    );
    PERFORM pg_temp.assert((close_res->>'previousStatus') = 'paused' AND (close_res->>'lifecycleStatus') = 'closed',
      'G: Closing unit from paused status must succeed');
  END;

  -- =========================================================================
  -- SCENARIO AB: BOOKING VS CLOSURE LOCK & FAIL-CLOSED
  -- =========================================================================
  -- Booking attempt on closed Unit A must fail with establishment_unavailable
  caught_error := false;
  BEGIN
    PERFORM public.create_appointment(
      unit_a_id, prof_id, svc_a_id, now() + interval '5 days', 'Client Late', test_client_id
    );
  EXCEPTION WHEN OTHERS THEN
    caught_error := true;
    err_msg := SQLERRM;
  END;
  PERFORM pg_temp.assert(caught_error AND err_msg = 'establishment_unavailable',
    'AB: Booking on closed establishment must fail with establishment_unavailable');

  RAISE NOTICE 'SUCCESS: phase3_unit_closure_orchestration passed all tests.';
END;
$$;

ROLLBACK;
