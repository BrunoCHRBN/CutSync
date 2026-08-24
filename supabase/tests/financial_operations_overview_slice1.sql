BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', actor_id, 'role', 'authenticated', 'aal', 'aal2'
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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(
  statement text,
  expected_fragment text,
  expected_sqlstate text DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF expected_sqlstate IS NOT NULL AND SQLSTATE <> expected_sqlstate THEN
    RAISE EXCEPTION 'FAIL: expected SQLSTATE %, got % (%)', expected_sqlstate, SQLSTATE, SQLERRM;
  END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected %, got %', expected_fragment, SQLERRM;
  END IF;
END;
$$;

DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  professional_a_id uuid := gen_random_uuid();
  professional_b_id uuid := gen_random_uuid();
  cashier_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  method_a_id uuid := gen_random_uuid();
  method_b_id uuid := gen_random_uuid();
  method_unit_b_id uuid := gen_random_uuid();
  order_a_id uuid := gen_random_uuid();
  order_b_id uuid := gen_random_uuid();
  order_old_id uuid := gen_random_uuid();
  order_unit_b_id uuid := gen_random_uuid();
  payment_b_id uuid := gen_random_uuid();
  local_day date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  payload jsonb;
BEGIN
  PERFORM pg_temp.clear_actor();

  INSERT INTO auth.users(id, email, email_confirmed_at) VALUES
    (owner_id, 'overview-owner@example.test', now()),
    (professional_a_id, 'overview-pro-a@example.test', now()),
    (professional_b_id, 'overview-pro-b@example.test', now()),
    (cashier_id, 'overview-cashier@example.test', now()),
    (outsider_id, 'overview-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, lifecycle_status, timezone,
    opening_hours, financial_ops_enabled
  ) VALUES
    (unit_a_id, 'Overview Unit A', 'overview-a-' || substr(unit_a_id::text, 1, 8),
      'active', 'active', 'America/Sao_Paulo', 'configured', true),
    (unit_b_id, 'Overview Unit B', 'overview-b-' || substr(unit_b_id::text, 1, 8),
      'active', 'active', 'America/Sao_Paulo', 'configured', true);

  INSERT INTO public.profiles(id, establishment_id, name, email, role) VALUES
    (owner_id, unit_a_id, 'Overview Owner', 'overview-owner@example.test', 'admin'),
    (professional_a_id, unit_a_id, 'Overview Pro A', 'overview-pro-a@example.test', 'professional'),
    (professional_b_id, unit_a_id, 'Overview Pro B', 'overview-pro-b@example.test', 'professional'),
    (cashier_id, unit_a_id, 'Overview Cashier', 'overview-cashier@example.test', 'client'),
    (outsider_id, NULL, 'Overview Outsider', 'overview-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name, email = EXCLUDED.email, role = EXCLUDED.role;

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Overview Organization', 'active', owner_id);
  INSERT INTO public.organization_members(organization_id, profile_id, role, status, created_by)
  VALUES (organization_id, owner_id, 'owner', 'active', owner_id);
  INSERT INTO public.organization_establishments(organization_id, establishment_id, status, linked_by)
  VALUES
    (organization_id, unit_a_id, 'active', owner_id),
    (organization_id, unit_b_id, 'active', owner_id);
  INSERT INTO public.memberships(id, profile_id, establishment_id, role, role_template, status) VALUES
    (gen_random_uuid(), owner_id, unit_a_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), owner_id, unit_b_id, 'admin', 'admin', 'active'),
    (gen_random_uuid(), professional_a_id, unit_a_id, 'professional', 'professional', 'active'),
    (gen_random_uuid(), professional_b_id, unit_a_id, 'professional', 'professional', 'active'),
    (gen_random_uuid(), cashier_id, unit_a_id, 'professional', 'cashier', 'active');

  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id,
      owner_resolution_status = 'confirmed',
      trial_started_at = now(),
      trial_ends_at = now() + interval '30 days'
  WHERE establishment_id IN (unit_a_id, unit_b_id);

  INSERT INTO public.services(id, establishment_id, name, price, duration_minutes, kind)
  VALUES
    ('overview-service-a', unit_a_id, 'Overview Service A', 100, 30, 'single'),
    ('overview-service-b', unit_b_id, 'Overview Service B', 100, 30, 'single');

  INSERT INTO public.establishment_payment_methods(
    id, establishment_id, method_type, display_name, active, requires_reference,
    created_by, updated_by
  ) VALUES
    (method_a_id, unit_a_id, 'external_pix', 'PIX', true, true, owner_id, owner_id),
    (method_b_id, unit_a_id, 'cash', 'Dinheiro', true, false, owner_id, owner_id),
    (method_unit_b_id, unit_b_id, 'external_pix', 'PIX', true, true, owner_id, owner_id);

  INSERT INTO public.service_orders(
    id, establishment_id, professional_id, status, currency,
    subtotal_cents, total_cents, opened_at, started_at, finished_at, started_by, finished_by,
    created_by, updated_by, created_at, updated_at
  ) VALUES
    (order_a_id, unit_a_id, professional_a_id, 'awaiting_payment', 'BRL',
      10000, 10000, now(), now(), now(), professional_a_id, professional_a_id,
      professional_a_id, professional_a_id, now(), now()),
    (order_b_id, unit_a_id, professional_b_id, 'awaiting_payment', 'BRL',
      8000, 8000, now(), now(), now(), professional_b_id, professional_b_id,
      professional_b_id, professional_b_id, now(), now()),
    (order_old_id, unit_a_id, professional_a_id, 'awaiting_payment', 'BRL',
      50000, 50000, now() - interval '2 days', now() - interval '2 days',
      now() - interval '2 days',
      professional_a_id, professional_a_id, professional_a_id, professional_a_id,
      now() - interval '2 days', now() - interval '2 days'),
    (order_unit_b_id, unit_b_id, owner_id, 'awaiting_payment', 'BRL',
      100000, 100000, now(), now(), now(), owner_id, owner_id, owner_id, owner_id,
      now(), now());

  INSERT INTO public.order_payment_entries(
    id, establishment_id, service_order_id, payment_method_id, entry_type, status,
    amount_cents, original_payment_entry_id, method_type_snapshot,
    method_name_snapshot, external_reference, reason, request_id, correlation_id, recorded_by
  ) VALUES
    (gen_random_uuid(), unit_a_id, order_a_id, method_a_id, 'payment', 'succeeded',
      4000, NULL, 'external_pix', 'PIX', 'A-4000', NULL,
      gen_random_uuid(), gen_random_uuid(), professional_a_id),
    (payment_b_id, unit_a_id, order_b_id, method_a_id, 'payment', 'succeeded',
      3000, NULL, 'external_pix', 'PIX', 'B-3000', NULL,
      gen_random_uuid(), gen_random_uuid(), professional_b_id),
    (gen_random_uuid(), unit_a_id, order_b_id, method_a_id, 'void', 'succeeded',
      1000, payment_b_id, 'external_pix', 'PIX', NULL, 'Correção operacional',
      gen_random_uuid(), gen_random_uuid(), owner_id),
    (gen_random_uuid(), unit_b_id, order_unit_b_id, method_unit_b_id, 'payment', 'succeeded',
      90000, NULL, 'external_pix', 'PIX', 'B-90000', NULL,
      gen_random_uuid(), gen_random_uuid(), owner_id);

  PERFORM pg_temp.set_actor(owner_id);
  PERFORM public.open_cash_session(unit_a_id, 10000, gen_random_uuid());
  UPDATE public.cash_sessions AS cash_session
  SET opened_at = (
    local_day::timestamp AT TIME ZONE 'America/Sao_Paulo'
  ) - interval '1 hour'
  FROM public.cash_registers AS cash_register
  WHERE cash_session.cash_register_id = cash_register.id
    AND cash_register.establishment_id = unit_a_id
    AND cash_session.status = 'open';
  payload := public.get_financial_operations_overview(unit_a_id, local_day);
  IF payload->>'scope' <> 'unit'
    OR (payload #>> '{payments,grossReceivedCents}')::bigint <> 7000
    OR (payload #>> '{payments,voidedCents}')::bigint <> 1000
    OR (payload #>> '{payments,netReceivedCents}')::bigint <> 6000
    OR (payload #>> '{payments,outstandingCents}')::bigint <> 12000
    OR (payload #>> '{readiness,ready}')::boolean IS NOT TRUE
  THEN RAISE EXCEPTION 'FAIL: owner overview invalid: %', payload; END IF;
  IF payload #>> '{cash,expectedCountVisibility}' <> 'visible'
  THEN RAISE EXCEPTION 'FAIL: owner carried cash session should remain visible'; END IF;
  payload := public.get_financial_operations_overview(unit_a_id);
  IF payload->>'localDate' <> local_day::text
  THEN RAISE EXCEPTION 'FAIL: establishment timezone fallback invalid: %', payload; END IF;

  PERFORM pg_temp.set_actor(professional_a_id);
  payload := public.get_financial_operations_overview(unit_a_id, local_day);
  IF payload->>'scope' <> 'own'
    OR (payload #>> '{payments,grossReceivedCents}')::bigint <> 4000
    OR (payload #>> '{payments,netReceivedCents}')::bigint <> 4000
    OR (payload #>> '{payments,outstandingCents}')::bigint <> 6000
  THEN RAISE EXCEPTION 'FAIL: professional own scope leaked data: %', payload; END IF;

  DELETE FROM public.business_role_template_capabilities
  WHERE role_template = 'cashier'
    AND capability = 'view_payments';

  PERFORM pg_temp.set_actor(cashier_id);
  payload := public.get_financial_operations_overview(unit_a_id, local_day);
  IF payload->>'scope' <> 'unit'
    OR payload #>> '{payments,canView}' <> 'false'
    OR (payload #>> '{payments,netReceivedCents}')::bigint <> 0
    OR payload #> '{readiness,activePaymentMethodTypes}' IS DISTINCT FROM '[]'::jsonb
    OR payload #>> '{cash,status}' <> 'open'
    OR payload #>> '{cash,expectedCountVisibility}' <> 'hidden'
    OR payload #> '{cash,expectedCountCents}' IS DISTINCT FROM 'null'::jsonb
  THEN RAISE EXCEPTION 'FAIL: cashier cash disclosure invalid: %', payload; END IF;

  PERFORM pg_temp.set_actor(outsider_id);
  PERFORM pg_temp.expect_error(format(
    'SELECT public.get_financial_operations_overview(%L::uuid,%L::date)', unit_a_id, local_day
  ), 'forbidden', '42501');
  PERFORM pg_temp.expect_error(format(
    'SELECT public.get_financial_operations_overview(%L::uuid,%L::date)', gen_random_uuid(), local_day
  ), 'forbidden', '42501');

  IF has_table_privilege('authenticated', 'public.order_payment_entries', 'SELECT')
    OR has_table_privilege('authenticated', 'public.cash_sessions', 'SELECT')
  THEN RAISE EXCEPTION 'FAIL: overview introduced direct ledger privileges'; END IF;
END;
$test$;

ROLLBACK;
