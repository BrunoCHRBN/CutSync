BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
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

CREATE OR REPLACE FUNCTION pg_temp.clear_actor()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.set_actor_aal1(actor_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', 'aal1')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected %, got %', expected_fragment, SQLERRM;
  END IF;
END;
$$;

DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  order_paid_id uuid := gen_random_uuid();
  order_void_id uuid := gen_random_uuid();
  cash_method_id uuid;
  pix_method_id uuid;
  first_payment_id uuid;
  order_version bigint;
  request_id uuid;
  payload jsonb;
  replay jsonb;
  summary jsonb;
  entry_count integer;
BEGIN
  IF to_regclass('public.establishment_payment_methods') IS NULL
    OR to_regclass('public.order_payment_entries') IS NULL
    OR to_regclass('public.order_payment_events') IS NULL
  THEN RAISE EXCEPTION 'FAIL: Phase 4 ledger tables missing'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'service_orders'
      AND column_name = 'payment_status'
  ) THEN RAISE EXCEPTION 'FAIL: payment_status must remain calculated'; END IF;

  PERFORM pg_temp.clear_actor();
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'p4-owner@example.test', now()),
    (outsider_id, 'p4-outsider@example.test', now());

  INSERT INTO public.establishments(id, name, slug, account_status, timezone)
  VALUES
    (unit_a_id, 'P4 Unit A', 'p4-a-' || substr(unit_a_id::text, 1, 8), 'active', 'America/Sao_Paulo'),
    (unit_b_id, 'P4 Unit B', 'p4-b-' || substr(unit_b_id::text, 1, 8), 'active', 'America/Sao_Paulo');

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_a_id, 'P4 Owner', 'p4-owner@example.test', 'admin'),
    (outsider_id, NULL, 'P4 Outsider', 'p4-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET
    establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'P4 Org', 'active', owner_id);
  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  ) VALUES (organization_id, owner_id, 'owner', 'active', owner_id);
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  ) VALUES
    (organization_id, unit_a_id, 'active', owner_id),
    (organization_id, unit_b_id, 'active', owner_id);
  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, created_by
  ) VALUES
    (owner_id, unit_a_id, 'admin', 'active', owner_id),
    (owner_id, unit_b_id, 'admin', 'active', owner_id);

  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id, owner_resolution_status = 'confirmed'
  WHERE establishment_id IN (unit_a_id, unit_b_id);
  UPDATE public.establishments SET financial_ops_enabled = true
  WHERE id = unit_a_id;

  INSERT INTO public.service_orders(
    id, establishment_id, professional_id, status, currency,
    created_by, updated_by
  ) VALUES
    (order_paid_id, unit_a_id, owner_id, 'open', 'BRL', owner_id, owner_id),
    (order_void_id, unit_a_id, owner_id, 'open', 'BRL', owner_id, owner_id);
  INSERT INTO public.service_order_items(
    service_order_id, establishment_id, professional_id, description_snapshot,
    quantity, unit_price_cents, created_by, updated_by
  ) VALUES
    (order_paid_id, unit_a_id, owner_id, 'Service 100', 1, 10000, owner_id, owner_id),
    (order_void_id, unit_a_id, owner_id, 'Service 50', 1, 5000, owner_id, owner_id);
  UPDATE public.service_orders
  SET status = 'awaiting_payment', started_at = now(), started_by = owner_id,
      finished_at = now(), finished_by = owner_id, version = version + 1
  WHERE id IN (order_paid_id, order_void_id);

  PERFORM pg_temp.set_actor(owner_id);
  request_id := gen_random_uuid();
  payload := public.configure_establishment_payment_method(
    unit_a_id, 'cash', 'Dinheiro', true, false, NULL, request_id
  );
  cash_method_id := (payload->>'paymentMethodId')::uuid;
  IF cash_method_id IS NULL OR (payload->>'version')::bigint <> 1 THEN
    RAISE EXCEPTION 'FAIL: cash method response invalid: %', payload;
  END IF;

  payload := public.configure_establishment_payment_method(
    unit_a_id, 'external_pix', 'PIX externo', true, true, NULL, gen_random_uuid()
  );
  pix_method_id := (payload->>'paymentMethodId')::uuid;
  IF jsonb_array_length(public.list_establishment_payment_methods(unit_a_id)->'methods') <> 2 THEN
    RAISE EXCEPTION 'FAIL: expected two configured payment methods';
  END IF;

  SELECT version INTO order_version FROM public.service_orders WHERE id = order_paid_id;
  request_id := gen_random_uuid();
  payload := public.record_order_payment(
    unit_a_id, order_paid_id, cash_method_id, 4000, NULL, order_version, request_id
  );
  first_payment_id := (payload->>'paymentEntryId')::uuid;
  IF payload->>'paymentStatus' <> 'partially_paid'
    OR (payload->>'paidCents')::bigint <> 4000
    OR (payload->>'balanceCents')::bigint <> 6000
  THEN RAISE EXCEPTION 'FAIL: partial payment summary invalid: %', payload; END IF;

  replay := public.record_order_payment(
    unit_a_id, order_paid_id, cash_method_id, 4000, NULL, order_version, request_id
  );
  IF replay IS DISTINCT FROM payload THEN
    RAISE EXCEPTION 'FAIL: payment replay changed response';
  END IF;
  SELECT count(*) INTO entry_count FROM public.order_payment_entries
  WHERE service_order_id = order_paid_id;
  IF entry_count <> 1 THEN RAISE EXCEPTION 'FAIL: replay duplicated ledger entry'; END IF;

  PERFORM pg_temp.expect_error(format(
    'SELECT public.record_order_payment(%L::uuid,%L::uuid,%L::uuid,4001,NULL,%s,%L::uuid)',
    unit_a_id, order_paid_id, cash_method_id, order_version, request_id
  ), 'idempotency_conflict');

  order_version := (payload->>'version')::bigint;
  PERFORM pg_temp.expect_error(format(
    'SELECT public.record_order_payment(%L::uuid,%L::uuid,%L::uuid,7000,NULL,%s,%L::uuid)',
    unit_a_id, order_paid_id, cash_method_id, order_version, gen_random_uuid()
  ), 'payment_exceeds_order_balance');

  payload := public.record_order_payment(
    unit_a_id, order_paid_id, pix_method_id, 6000, 'PIX-P4-TEST',
    order_version, gen_random_uuid()
  );
  IF payload->>'paymentStatus' <> 'paid' OR (payload->>'balanceCents')::bigint <> 0 THEN
    RAISE EXCEPTION 'FAIL: mixed payment did not settle order: %', payload;
  END IF;

  payload := public.close_service_order(
    unit_a_id, order_paid_id, (payload->>'version')::bigint, gen_random_uuid()
  );
  IF payload->>'status' <> 'closed' THEN RAISE EXCEPTION 'FAIL: paid order not closed'; END IF;

  SELECT version INTO order_version FROM public.service_orders WHERE id = order_void_id;
  payload := public.record_order_payment(
    unit_a_id, order_void_id, cash_method_id, 5000, NULL,
    order_version, gen_random_uuid()
  );
  first_payment_id := (payload->>'paymentEntryId')::uuid;
  PERFORM pg_temp.set_actor_aal1(owner_id);
  PERFORM pg_temp.expect_error(format(
    'SELECT public.void_order_payment(%L::uuid,%L::uuid,%L::uuid,%L,%s,%L::uuid)',
    unit_a_id, order_void_id, first_payment_id, 'Operador corrigiu lançamento',
    (payload->>'version')::bigint, gen_random_uuid()
  ), 'aal2_required');
  PERFORM pg_temp.set_actor(owner_id);
  payload := public.void_order_payment(
    unit_a_id, order_void_id, first_payment_id, 'Operador corrigiu lançamento',
    (payload->>'version')::bigint, gen_random_uuid()
  );
  IF payload->>'paymentStatus' <> 'unpaid'
    OR (payload->>'paidCents')::bigint <> 0
    OR (payload->>'balanceCents')::bigint <> 5000
  THEN RAISE EXCEPTION 'FAIL: void compensation invalid: %', payload; END IF;

  SELECT public.get_service_order_payment_summary(unit_a_id, order_void_id)
  INTO summary;
  IF jsonb_array_length(summary->'entries') <> 2 THEN
    RAISE EXCEPTION 'FAIL: ledger is not reconstructable from two entries';
  END IF;
  PERFORM pg_temp.expect_error(format(
    'SELECT public.close_service_order(%L::uuid,%L::uuid,%s,%L::uuid)',
    unit_a_id, order_void_id, (payload->>'version')::bigint, gen_random_uuid()
  ), 'service_order_balance_unresolved');

  PERFORM pg_temp.expect_error(format(
    'DELETE FROM public.order_payment_entries WHERE id = %L::uuid', first_payment_id
  ), 'order_payment_ledger_append_only');

  PERFORM pg_temp.expect_error(format(
    'SELECT public.get_service_order_payment_summary(%L::uuid,%L::uuid)',
    unit_b_id, order_void_id
  ), 'financial_ops_disabled');

  PERFORM pg_temp.set_actor(outsider_id);
  PERFORM pg_temp.expect_error(format(
    'SELECT public.list_establishment_payment_methods(%L::uuid)', unit_a_id
  ), 'forbidden');

  IF has_table_privilege('authenticated', 'public.order_payment_entries', 'SELECT')
    OR has_table_privilege('authenticated', 'public.order_payment_entries', 'INSERT')
    OR has_table_privilege('authenticated', 'public.establishment_payment_methods', 'UPDATE')
  THEN RAISE EXCEPTION 'FAIL: app role has direct POS table privileges'; END IF;
END;
$test$;

ROLLBACK;
