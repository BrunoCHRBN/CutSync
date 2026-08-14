-- ===========================================================================
-- Test Suite: PS1-E1B.2 Service Order Capability Authority & Scope Validation
-- Verifies pure capability-driven authorization for Service Orders (comandas):
-- view_orders, view_team_orders, manage_own_orders, manage_team_orders,
-- void_orders, and approve_sensitive_actions.
-- ===========================================================================

BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_so_actor(
  actor_id uuid,
  actor_aal text DEFAULT 'aal2'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  IF actor_id IS NULL THEN
    PERFORM set_config('request.jwt.claim.sub', '', true);
    PERFORM set_config('request.jwt.claim.role', 'anon', true);
    PERFORM set_config('request.jwt.claims', '{}', true);
  ELSE
    PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
    PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
    PERFORM set_config(
      'request.jwt.claims',
      json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
      true
    );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_so_error(
  statement text,
  expected_fragment text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN
    RAISE;
  END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected %, got %', expected_fragment, SQLERRM;
  END IF;
END;
$$;

DO $test$
DECLARE
  admin_user_id uuid := gen_random_uuid();
  manager_user_id uuid := gen_random_uuid();
  manager_denied_void_id uuid := gen_random_uuid();
  manager_denied_approve_id uuid := gen_random_uuid();
  reception_user_id uuid := gen_random_uuid();
  cashier_user_id uuid := gen_random_uuid();
  finance_user_id uuid := gen_random_uuid();
  prof_a_id uuid := gen_random_uuid();
  prof_b_id uuid := gen_random_uuid();
  revoked_user_id uuid := gen_random_uuid();
  client_user_id uuid := gen_random_uuid();

  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  unit_readonly_id uuid := gen_random_uuid();
  unit_blocked_id uuid := gen_random_uuid();

  manager_membership_void_id uuid := gen_random_uuid();
  manager_membership_approve_id uuid := gen_random_uuid();
  approval_void_id uuid := gen_random_uuid();
  approval_approve_id uuid := gen_random_uuid();

  service_a_id text := 'srv-a-' || substr(gen_random_uuid()::text, 1, 8);
  local_day date := current_date;

  default_plan_id uuid := (SELECT id FROM public.billing_plans LIMIT 1);

  order_pro_a_id uuid;
  order_pro_b_id uuid;
  order_unit_b_id uuid;
  order_void_target_id uuid;
  order_ro_pro_a_id uuid;

  order_receipt jsonb;
  detail jsonb;
  list_payload jsonb;
  item_found boolean;
BEGIN
  -- 1. Setup Auth Users
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_user_id, 'admin_so@example.test', now()),
    (manager_user_id, 'manager_so@example.test', now()),
    (manager_denied_void_id, 'mgrdeniedvoid@example.test', now()),
    (manager_denied_approve_id, 'mgrdeniedapprove@example.test', now()),
    (reception_user_id, 'reception_so@example.test', now()),
    (cashier_user_id, 'cashier_so@example.test', now()),
    (finance_user_id, 'finance_so@example.test', now()),
    (prof_a_id, 'prof_a_so@example.test', now()),
    (prof_b_id, 'prof_b_so@example.test', now()),
    (revoked_user_id, 'revoked_so@example.test', now()),
    (client_user_id, 'client_so@example.test', now());

  -- 2. Setup Establishments (initially active for seeding, blocked initialized directly)
  INSERT INTO public.establishments(id, name, slug, account_status, timezone, financial_ops_enabled)
  VALUES
    (unit_a_id, 'SO Unit A', 'unit-a-so-' || substr(unit_a_id::text, 1, 8), 'active', 'America/Sao_Paulo', true),
    (unit_b_id, 'SO Unit B', 'unit-b-so-' || substr(unit_b_id::text, 1, 8), 'active', 'America/Sao_Paulo', true),
    (unit_readonly_id, 'SO Unit ReadOnly', 'unit-ro-so-' || substr(unit_readonly_id::text, 1, 8), 'active', 'America/Sao_Paulo', true),
    (unit_blocked_id, 'SO Unit Blocked', 'unit-bl-so-' || substr(unit_blocked_id::text, 1, 8), 'blocked', 'America/Sao_Paulo', true);

  -- Billing accounts
  INSERT INTO public.billing_accounts(establishment_id, billing_owner_profile_id, plan_id, owner_resolution_status, trial_started_at, trial_ends_at)
  VALUES
    (unit_a_id, admin_user_id, default_plan_id, 'confirmed', now(), now() + interval '30 days'),
    (unit_b_id, admin_user_id, default_plan_id, 'confirmed', now(), now() + interval '30 days'),
    (unit_readonly_id, admin_user_id, default_plan_id, 'confirmed', now(), now() + interval '30 days'),
    (unit_blocked_id, admin_user_id, default_plan_id, 'confirmed', now() - interval '30 days', now() - interval '10 days')
  ON CONFLICT (establishment_id) DO UPDATE SET
    billing_owner_profile_id = EXCLUDED.billing_owner_profile_id,
    plan_id = EXCLUDED.plan_id,
    owner_resolution_status = EXCLUDED.owner_resolution_status,
    trial_started_at = EXCLUDED.trial_started_at,
    trial_ends_at = EXCLUDED.trial_ends_at;

  -- Ensure profiles
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'admin' WHERE id = admin_user_id;
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'professional' WHERE id IN (manager_user_id, manager_denied_void_id, manager_denied_approve_id, prof_a_id, prof_b_id);
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'client' WHERE id IN (reception_user_id, cashier_user_id, finance_user_id, client_user_id);
  UPDATE public.profiles SET establishment_id = unit_a_id, role = 'admin' WHERE id = revoked_user_id;

  -- 3. Memberships
  INSERT INTO public.memberships(id, profile_id, establishment_id, role, role_template, status)
  VALUES
    (gen_random_uuid(), admin_user_id, unit_a_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), manager_user_id, unit_a_id, 'professional', 'manager', 'active'),
    (manager_membership_void_id, manager_denied_void_id, unit_a_id, 'professional', 'manager', 'active'),
    (manager_membership_approve_id, manager_denied_approve_id, unit_a_id, 'professional', 'manager', 'active'),
    (gen_random_uuid(), reception_user_id, unit_a_id, 'professional', 'reception', 'active'),
    (gen_random_uuid(), cashier_user_id, unit_a_id, 'professional', 'cashier', 'active'),
    (gen_random_uuid(), finance_user_id, unit_a_id, 'professional', 'finance', 'active'),
    (gen_random_uuid(), prof_a_id, unit_a_id, 'professional', 'professional', 'active'),
    (gen_random_uuid(), prof_b_id, unit_a_id, 'professional', 'professional', 'active'),
    -- Unit B memberships
    (gen_random_uuid(), admin_user_id, unit_b_id, 'admin', 'admin', 'active'),
    -- ReadOnly Unit memberships
    (gen_random_uuid(), prof_a_id, unit_readonly_id, 'professional', 'professional', 'active'),
    (gen_random_uuid(), reception_user_id, unit_readonly_id, 'professional', 'reception', 'active'),
    (gen_random_uuid(), manager_user_id, unit_readonly_id, 'professional', 'manager', 'active'),
    -- Blocked Unit memberships
    (gen_random_uuid(), admin_user_id, unit_blocked_id, 'admin', 'admin', 'active');

  -- Revoked membership on Unit A
  INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status, revoked_at)
  VALUES (revoked_user_id, unit_a_id, 'admin', 'admin', 'revoked', now());

  -- 4. Overrides for Manager tests
  INSERT INTO public.approval_requests(id, establishment_id, request_type, requested_by, subject_membership_id, capability, requested_effect, justification, status, request_id)
  VALUES
    (approval_void_id, unit_a_id, 'capability_override', admin_user_id, manager_membership_void_id, 'void_orders', 'deny', 'Deny void orders', 'approved', gen_random_uuid()),
    (approval_approve_id, unit_a_id, 'capability_override', admin_user_id, manager_membership_approve_id, 'approve_sensitive_actions', 'deny', 'Deny approve sensitive actions', 'approved', gen_random_uuid());

  INSERT INTO public.membership_capability_overrides(membership_id, establishment_id, capability, effect, valid_from, granted_by, approval_request_id, justification, request_id)
  VALUES
    (manager_membership_void_id, unit_a_id, 'void_orders', 'deny', now(), admin_user_id, approval_void_id, 'Deny void orders', gen_random_uuid()),
    (manager_membership_approve_id, unit_a_id, 'approve_sensitive_actions', 'deny', now(), admin_user_id, approval_approve_id, 'Deny approve sensitive actions', gen_random_uuid());

  -- 5. Seed Services
  INSERT INTO public.services(id, establishment_id, name, price, duration_minutes, kind)
  VALUES
    (service_a_id, unit_a_id, 'Service A', 50, 30, 'single'),
    (service_a_id || '-ro', unit_readonly_id, 'Service RO', 50, 30, 'single');

  -- 6. Open Seed Service Orders
  -- Order 1: Pro A on Unit A
  PERFORM pg_temp.set_so_actor(prof_a_id);
  order_receipt := public.open_service_order(
    unit_a_id, gen_random_uuid(), NULL, prof_a_id, NULL, 'Pro A order note'
  );
  order_pro_a_id := (order_receipt->>'serviceOrderId')::uuid;

  -- Order 2: Pro B on Unit A
  PERFORM pg_temp.set_so_actor(prof_b_id);
  order_receipt := public.open_service_order(
    unit_a_id, gen_random_uuid(), NULL, prof_b_id, NULL, 'Pro B order note'
  );
  order_pro_b_id := (order_receipt->>'serviceOrderId')::uuid;

  -- Order 3: Unit B
  PERFORM pg_temp.set_so_actor(admin_user_id);
  order_receipt := public.open_service_order(
    unit_b_id, gen_random_uuid(), NULL, admin_user_id, NULL, 'Unit B order note'
  );
  order_unit_b_id := (order_receipt->>'serviceOrderId')::uuid;

  -- Order 4: For Voiding on Unit A (Pro A assigned)
  PERFORM pg_temp.set_so_actor(prof_a_id);
  order_receipt := public.open_service_order(
    unit_a_id, gen_random_uuid(), NULL, prof_a_id, NULL, 'Order to be voided'
  );
  order_void_target_id := (order_receipt->>'serviceOrderId')::uuid;

  -- Order 5: ReadOnly Unit (seeded before setting expired trial)
  PERFORM pg_temp.set_so_actor(prof_a_id);
  order_receipt := public.open_service_order(
    unit_readonly_id, gen_random_uuid(), NULL, prof_a_id, NULL, 'ReadOnly order'
  );
  order_ro_pro_a_id := (order_receipt->>'serviceOrderId')::uuid;

  -- Now configure ReadOnly and Blocked access modes via billing accounts
  UPDATE public.billing_accounts
  SET trial_started_at = now() - interval '15 days',
      trial_ends_at = now() - interval '1 day',
      transition_ends_at = NULL,
      courtesy_ends_at = NULL
  WHERE establishment_id = unit_readonly_id;

  -- =========================================================================
  -- TEST GROUP 1: PROFESSIONAL
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(prof_a_id);

  -- 1.1 View own order -> ALLOWED
  detail := public.get_service_order(unit_a_id, order_pro_a_id);
  IF detail->'order'->>'id' <> order_pro_a_id::text THEN
    RAISE EXCEPTION 'Test 1.1 Failed: Pro A should view own order';
  END IF;

  -- 1.2 View teammate order -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.get_service_order(%L::uuid, %L::uuid)', unit_a_id, order_pro_b_id),
    'forbidden'
  );

  -- 1.3 List scope 'own' -> ALLOWED (only own order returned)
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'own');
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_pro_a_id
  ) INTO item_found;
  IF NOT item_found THEN
    RAISE EXCEPTION 'Test 1.3 Failed: list own scope missing own order';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_pro_b_id
  ) INTO item_found;
  IF item_found THEN
    RAISE EXCEPTION 'Test 1.3 Failed: list own scope leaked teammate order';
  END IF;

  -- 1.4 List scope 'team' -> FORBIDDEN (professional lacks view_team_orders)
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)', unit_a_id, local_day, 'team'),
    'forbidden'
  );

  -- 1.5 Mutate own order (upsert item) -> ALLOWED
  PERFORM public.upsert_service_order_item(
    unit_a_id, order_pro_a_id, 1, gen_random_uuid(), NULL, service_a_id, prof_a_id, 'Item A', 1, 0, NULL
  );

  -- 1.6 Mutate teammate order -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, 1, %L::uuid, NULL, %L, %L::uuid, %L, 1, 0, NULL)',
      unit_a_id, order_pro_b_id, gen_random_uuid(), service_a_id, prof_b_id, 'Item B'
    ),
    'forbidden'
  );

  -- 1.7 Void order -> FORBIDDEN (professional lacks void_orders)
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 2, %L, %L::uuid)',
      unit_a_id, order_pro_a_id, 'Void attempt by pro', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 2: RECEPTION
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(reception_user_id);

  -- 2.1 Team read via get_service_order on any pro -> ALLOWED (holds view_team_orders)
  detail := public.get_service_order(unit_a_id, order_pro_a_id);
  IF detail->'order'->>'id' <> order_pro_a_id::text THEN
    RAISE EXCEPTION 'Test 2.1 Failed: Reception should view team order';
  END IF;

  -- 2.2 List scope 'team' -> ALLOWED (includes both pro A and pro B)
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'team');
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_pro_a_id
  ) INTO item_found;
  IF NOT item_found THEN
    RAISE EXCEPTION 'Test 2.2 Failed: Reception list team missing pro A order';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_pro_b_id
  ) INTO item_found;
  IF NOT item_found THEN
    RAISE EXCEPTION 'Test 2.2 Failed: Reception list team missing pro B order';
  END IF;

  -- 2.3 Team mutation (open order for pro A) -> ALLOWED (holds manage_team_orders)
  PERFORM public.open_service_order(
    unit_a_id, gen_random_uuid(), NULL, prof_a_id, NULL, 'Opened by reception'
  );

  -- 2.4 Void order -> FORBIDDEN (reception lacks void_orders)
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 2, %L, %L::uuid)',
      unit_a_id, order_pro_a_id, 'Reception void attempt', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 3: CASHIER
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(cashier_user_id);

  -- 3.1 Team read via get_service_order -> ALLOWED (holds view_team_orders)
  detail := public.get_service_order(unit_a_id, order_pro_b_id);
  IF detail->'order'->>'id' <> order_pro_b_id::text THEN
    RAISE EXCEPTION 'Test 3.1 Failed: Cashier should view team order';
  END IF;

  -- 3.2 List scope 'team' -> ALLOWED
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'team');
  IF jsonb_array_length(list_payload->'items') < 2 THEN
    RAISE EXCEPTION 'Test 3.2 Failed: Cashier should see team orders';
  END IF;

  -- 3.3 Void order -> FORBIDDEN (Cashier holds void_payments, NOT void_orders)
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 2, %L, %L::uuid)',
      unit_a_id, order_pro_a_id, 'Cashier void attempt', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 4: MANAGER & SENSITIVE CAPABILITY OVERRIDES
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(manager_user_id);

  -- 4.1 Team read -> ALLOWED
  detail := public.get_service_order(unit_a_id, order_void_target_id);
  IF detail->'order'->>'id' <> order_void_target_id::text THEN
    RAISE EXCEPTION 'Test 4.1 Failed: Manager should view order';
  END IF;

  -- 4.2 Void order -> ALLOWED (Manager holds void_orders)
  order_receipt := public.void_service_order(
    unit_a_id, order_void_target_id, 1, 'Voided by manager', gen_random_uuid()
  );
  IF order_receipt->>'status' <> 'voided' THEN
    RAISE EXCEPTION 'Test 4.2 Failed: Manager voiding order failed, got %', order_receipt;
  END IF;

  -- 4.3 Reopen voided order -> ALLOWED (Manager holds void_orders + manage_team_orders + approve_sensitive_actions)
  order_receipt := public.reopen_voided_service_order(
    unit_a_id, order_void_target_id, 2, 'Reopened by manager', gen_random_uuid()
  );
  IF order_receipt->>'status' <> 'open' THEN
    RAISE EXCEPTION 'Test 4.3 Failed: Manager reopening order failed, got %', order_receipt;
  END IF;

  -- 4.4 Manager with deny override on void_orders -> FORBIDDEN
  PERFORM pg_temp.set_so_actor(manager_denied_void_id);
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 3, %L, %L::uuid)',
      unit_a_id, order_void_target_id, 'Void attempt by manager with deny void_orders', gen_random_uuid()
    ),
    'forbidden'
  );

  -- Re-void for reopen test with manager
  PERFORM pg_temp.set_so_actor(manager_user_id);
  PERFORM public.void_service_order(
    unit_a_id, order_void_target_id, 3, 'Voided again by manager', gen_random_uuid()
  );

  -- 4.5 Manager with deny override on approve_sensitive_actions trying to reopen -> FORBIDDEN
  PERFORM pg_temp.set_so_actor(manager_denied_approve_id);
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.reopen_voided_service_order(%L::uuid, %L::uuid, 4, %L, %L::uuid)',
      unit_a_id, order_void_target_id, 'Reopen attempt without approve_sensitive_actions', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 5: FINANCE
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(finance_user_id);

  -- 5.1 Team read on service orders -> FORBIDDEN (Finance lacks view_team_orders)
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)', unit_a_id, local_day, 'team'),
    'forbidden'
  );

  -- 5.2 Get service order of other pro -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.get_service_order(%L::uuid, %L::uuid)', unit_a_id, order_pro_a_id),
    'forbidden'
  );

  -- 5.3 Void service order -> FORBIDDEN (Finance lacks void_orders)
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 2, %L, %L::uuid)',
      unit_a_id, order_pro_a_id, 'Finance void attempt', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 6: REVOKED MEMBERSHIP
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(revoked_user_id);

  -- 6.1 Get service order -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.get_service_order(%L::uuid, %L::uuid)', unit_a_id, order_pro_a_id),
    'forbidden'
  );

  -- 6.2 List service orders -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)', unit_a_id, local_day, 'own'),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 7: IDOR (CROSS-UNIT ISOLATION)
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(manager_user_id);

  -- 7.1 Get order of Unit B -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.get_service_order(%L::uuid, %L::uuid)', unit_b_id, order_unit_b_id),
    'forbidden'
  );

  -- 7.2 List orders of Unit B -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format('SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)', unit_b_id, local_day, 'team'),
    'forbidden'
  );

  -- 7.3 Void order of Unit B -> FORBIDDEN
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 1, %L, %L::uuid)',
      unit_b_id, order_unit_b_id, 'Cross-unit void', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 8: READ_ONLY MODE (REAL BILLING ACCESS MODE)
  -- =========================================================================
  -- 8.1 Professional read_only: view own order -> ALLOWED (view_orders has read_only_allowed=true)
  PERFORM pg_temp.set_so_actor(prof_a_id);
  detail := public.get_service_order(unit_readonly_id, order_ro_pro_a_id);
  IF detail->'order'->>'id' <> order_ro_pro_a_id::text THEN
    RAISE EXCEPTION 'Test 8.1 Failed: Pro A should view own order in read_only unit';
  END IF;

  -- 8.2 Professional read_only: mutation (upsert item) -> FORBIDDEN (manage_own_orders has read_only_allowed=false)
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, 1, %L::uuid, NULL, %L, %L::uuid, %L, 1, 0, NULL)',
      unit_readonly_id, order_ro_pro_a_id, gen_random_uuid(), service_a_id || '-ro', prof_a_id, 'Item RO'
    ),
    'forbidden'
  );

  -- 8.3 Reception read_only: list team -> ALLOWED (view_team_orders has read_only_allowed=true)
  PERFORM pg_temp.set_so_actor(reception_user_id);
  list_payload := public.list_service_orders_for_day(unit_readonly_id, local_day, 'team');
  IF jsonb_typeof(list_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Test 8.3 Failed: Reception team list in read_only unit should be allowed';
  END IF;

  -- 8.4 Manager read_only: void -> FORBIDDEN (void_orders has read_only_allowed=false)
  PERFORM pg_temp.set_so_actor(manager_user_id);
  PERFORM pg_temp.expect_so_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, 1, %L, %L::uuid)',
      unit_readonly_id, order_ro_pro_a_id, 'Void in read_only', gen_random_uuid()
    ),
    'forbidden'
  );

  -- =========================================================================
  -- TEST GROUP 9: BLOCKED UNIT
  -- =========================================================================
  PERFORM pg_temp.set_so_actor(admin_user_id);

  PERFORM pg_temp.expect_so_error(
    format('SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)', unit_blocked_id, local_day, 'team'),
    'forbidden'
  );

END;
$test$;

ROLLBACK;
