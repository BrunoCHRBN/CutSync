BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, assurance text DEFAULT 'aal2')
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', actor_id, 'role', 'authenticated', 'aal', assurance
  )::text, true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.clear_actor()
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
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
  unit_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  order_id uuid := gen_random_uuid();
  cash_method_id uuid;
  payment_id uuid;
  session_id uuid;
  session_version bigint;
  order_version bigint;
  request_id uuid;
  payload jsonb;
  replay jsonb;
  snapshot jsonb;
  expected_cents bigint;
  movement_count integer;
BEGIN
  IF to_regclass('public.cash_registers') IS NULL
    OR to_regclass('public.cash_sessions') IS NULL
    OR to_regclass('public.cash_movements') IS NULL
    OR to_regclass('public.cash_session_events') IS NULL
  THEN RAISE EXCEPTION 'FAIL: Phase 5 cash tables missing'; END IF;

  PERFORM pg_temp.clear_actor();
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (owner_id, 'p5-owner@example.test', now());
  INSERT INTO public.establishments(id, name, slug, account_status, timezone)
  VALUES (unit_id, 'P5 Unit', 'p5-' || substr(unit_id::text, 1, 8), 'active', 'America/Sao_Paulo');
  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES (owner_id, unit_id, 'P5 Owner', 'p5-owner@example.test', 'admin')
  ON CONFLICT (id) DO UPDATE SET establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role;
  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'P5 Org', 'active', owner_id);
  INSERT INTO public.organization_members(organization_id, profile_id, role, status, created_by)
  VALUES (organization_id, owner_id, 'owner', 'active', owner_id);
  INSERT INTO public.organization_establishments(organization_id, establishment_id, status, linked_by)
  VALUES (organization_id, unit_id, 'active', owner_id);
  INSERT INTO public.memberships(profile_id, establishment_id, role, status, created_by)
  VALUES (owner_id, unit_id, 'admin', 'active', owner_id);
  UPDATE public.billing_accounts SET billing_owner_profile_id = owner_id,
    owner_resolution_status = 'confirmed' WHERE establishment_id = unit_id;
  UPDATE public.establishments SET financial_ops_enabled = true WHERE id = unit_id;

  IF (SELECT count(*) FROM public.cash_registers WHERE establishment_id = unit_id) <> 1
  THEN RAISE EXCEPTION 'FAIL: main cash register was not created automatically'; END IF;

  PERFORM pg_temp.set_actor(owner_id);
  snapshot := public.get_cash_register_snapshot(unit_id);
  IF snapshot->'session' IS DISTINCT FROM 'null'::jsonb
  THEN RAISE EXCEPTION 'FAIL: new register must not have a session'; END IF;

  request_id := gen_random_uuid();
  payload := public.open_cash_session(unit_id, 10000, request_id);
  session_id := (payload->>'cashSessionId')::uuid;
  session_version := (payload->>'version')::bigint;
  replay := public.open_cash_session(unit_id, 10000, request_id);
  IF replay IS DISTINCT FROM payload THEN RAISE EXCEPTION 'FAIL: open replay changed'; END IF;
  PERFORM pg_temp.expect_error(format(
    'SELECT public.open_cash_session(%L::uuid,10001,%L::uuid)', unit_id, request_id
  ), 'idempotency_conflict');

  payload := public.record_cash_movement(unit_id, session_id, 'cash_in', 2000,
    'Fundo adicional', session_version, gen_random_uuid());
  session_version := (payload->>'version')::bigint;
  IF (payload->>'expectedCountCents')::bigint <> 12000
  THEN RAISE EXCEPTION 'FAIL: cash in expected count invalid: %', payload; END IF;
  payload := public.record_cash_movement(unit_id, session_id, 'cash_out', 1000,
    'Compra emergencial', session_version, gen_random_uuid());
  session_version := (payload->>'version')::bigint;
  IF (payload->>'expectedCountCents')::bigint <> 11000
  THEN RAISE EXCEPTION 'FAIL: cash out expected count invalid: %', payload; END IF;

  payload := public.configure_establishment_payment_method(
    unit_id, 'cash', 'Dinheiro', true, false, NULL, gen_random_uuid()
  );
  cash_method_id := (payload->>'paymentMethodId')::uuid;
  INSERT INTO public.service_orders(id, establishment_id, professional_id, status, currency, created_by, updated_by)
  VALUES (order_id, unit_id, owner_id, 'open', 'BRL', owner_id, owner_id);
  INSERT INTO public.service_order_items(service_order_id, establishment_id, professional_id,
    description_snapshot, quantity, unit_price_cents, created_by, updated_by)
  VALUES (order_id, unit_id, owner_id, 'Service 50', 1, 5000, owner_id, owner_id);
  UPDATE public.service_orders SET status = 'awaiting_payment', started_at = now(), started_by = owner_id,
    finished_at = now(), finished_by = owner_id, version = version + 1 WHERE id = order_id;
  SELECT version INTO order_version FROM public.service_orders WHERE id = order_id;
  payload := public.record_order_payment(unit_id, order_id, cash_method_id, 5000, NULL,
    order_version, gen_random_uuid());
  payment_id := (payload->>'paymentEntryId')::uuid;
  SELECT version INTO session_version FROM public.cash_sessions WHERE id = session_id;
  SELECT public.calculate_cash_session_expected_count(session_id) INTO expected_cents;
  IF expected_cents <> 16000 THEN RAISE EXCEPTION 'FAIL: cash sale was not projected'; END IF;

  payload := public.void_order_payment(unit_id, order_id, payment_id, 'Correção operacional',
    (payload->>'version')::bigint, gen_random_uuid());
  SELECT public.calculate_cash_session_expected_count(session_id) INTO expected_cents;
  IF expected_cents <> 11000 THEN RAISE EXCEPTION 'FAIL: cash void was not compensating'; END IF;
  SELECT count(*) INTO movement_count FROM public.cash_movements WHERE cash_session_id = session_id;
  IF movement_count <> 4 THEN RAISE EXCEPTION 'FAIL: expected four cash movements, got %', movement_count; END IF;

  SELECT version INTO session_version FROM public.cash_sessions WHERE id = session_id;
  payload := public.close_cash_session(unit_id, session_id, 10900, session_version, gen_random_uuid());
  IF payload->>'status' <> 'closed' OR (payload->>'varianceCents')::bigint <> -100
  THEN RAISE EXCEPTION 'FAIL: close variance invalid: %', payload; END IF;

  PERFORM pg_temp.set_actor(owner_id, 'aal1');
  PERFORM pg_temp.expect_error(format(
    'SELECT public.reopen_cash_session(%L::uuid,%L::uuid,%s,%L::uuid)',
    unit_id, session_id, (payload->>'version')::bigint, gen_random_uuid()
  ), 'aal2_required');
  PERFORM pg_temp.set_actor(owner_id);
  payload := public.reopen_cash_session(unit_id, session_id,
    (payload->>'version')::bigint, gen_random_uuid());
  IF payload->>'status' <> 'open' OR (payload->>'expectedCountCents')::bigint <> 10900
  THEN RAISE EXCEPTION 'FAIL: reopen did not carry declared count: %', payload; END IF;

  PERFORM pg_temp.expect_error(format(
    'UPDATE public.cash_movements SET amount_cents = 1 WHERE cash_session_id = %L::uuid', session_id
  ), 'cash_ledger_append_only');
  IF has_table_privilege('authenticated', 'public.cash_movements', 'SELECT')
    OR has_table_privilege('authenticated', 'public.cash_sessions', 'UPDATE')
  THEN RAISE EXCEPTION 'FAIL: authenticated role received direct cash table access'; END IF;
END;
$test$;

ROLLBACK;
