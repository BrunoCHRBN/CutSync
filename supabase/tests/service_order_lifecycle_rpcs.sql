BEGIN;

\set ON_ERROR_STOP on

-- P0 Etapa 3 — transactional checks for service order lifecycle RPCs.
-- Covers flag/access, open/start/items/finish/close/void/reopen, reads, frontiers.
-- No payments, cash, or commissions (those tables must not exist).

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

CREATE OR REPLACE FUNCTION pg_temp.expect_error(
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
<<service_order_lifecycle>>
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  pro_a_id uuid := gen_random_uuid();
  pro_b_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  client_a_id uuid := gen_random_uuid();
  service_cut_id text := 'solc-cut-' || substr(gen_random_uuid()::text, 1, 8);
  service_extra_id text := 'solc-extra-' || substr(gen_random_uuid()::text, 1, 8);
  appt_main_id text := 'solc-appt-main-' || substr(gen_random_uuid()::text, 1, 8);
  appt_pending_id text := 'solc-appt-pend-' || substr(gen_random_uuid()::text, 1, 8);
  appt_pro_b_id text := 'solc-appt-prob-' || substr(gen_random_uuid()::text, 1, 8);
  open_req_id uuid := gen_random_uuid();
  start_req_id uuid := gen_random_uuid();
  upsert_req_id uuid := gen_random_uuid();
  custom_req_id uuid := gen_random_uuid();
  discount_req_id uuid := gen_random_uuid();
  finish_req_id uuid := gen_random_uuid();
  close_req_id uuid := gen_random_uuid();
  void_req_id uuid := gen_random_uuid();
  reopen_req_id uuid := gen_random_uuid();
  walk1_req_id uuid := gen_random_uuid();
  walk2_req_id uuid := gen_random_uuid();
  walk_empty_req uuid := gen_random_uuid();
  walk_zero_req uuid := gen_random_uuid();
  walk_zero_start uuid := gen_random_uuid();
  walk_zero_item uuid := gen_random_uuid();
  walk_zero_finish uuid := gen_random_uuid();
  walk_zero_close uuid := gen_random_uuid();
  pro_b_open_req uuid := gen_random_uuid();
  remove_req_id uuid := gen_random_uuid();
  remove_other_item_req uuid := gen_random_uuid();
  remove_pro_own_req uuid := gen_random_uuid();
  remove_admin_req uuid := gen_random_uuid();
  order_main_id uuid;
  order_pro_b_id uuid;
  order_walk1_id uuid;
  order_walk2_id uuid;
  order_empty_id uuid;
  order_zero_id uuid;
  order_remove_id uuid;
  item_seed_id uuid;
  item_extra_id uuid;
  item_remove_id uuid;
  item_keep_id uuid;
  item_other_order_id uuid;
  version_v bigint;
  previous_version bigint;
  previous_subtotal bigint;
  previous_discount bigint;
  previous_total bigint;
  removed_events integer;
  result jsonb;
  replay jsonb;
  detail jsonb;
  list_payload jsonb;
  event_types text[];
  unit_price bigint;
  price_charged_v numeric;
  appt_status text;
  completed_events integer;
  local_day date;
  flag_value boolean;
  context_record record;
  col_exists boolean;
BEGIN
  -- Frontiers: payment/cash/commission tables must not exist yet
  IF to_regclass('public.order_payment_entries') IS NOT NULL
    OR to_regclass('public.cash_registers') IS NOT NULL
    OR to_regclass('public.commission_entries') IS NOT NULL
  THEN
    RAISE EXCEPTION 'payment/cash/commission tables must not exist in Etapa 3';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'appointments'
      AND column_name = 'price_charged'
  ) THEN
    RAISE EXCEPTION 'appointments.price_charged missing';
  END IF;

  PERFORM pg_temp.clear_actor();

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'solc-owner@example.test', now()),
    (admin_id, 'solc-admin@example.test', now()),
    (pro_a_id, 'solc-pro-a@example.test', now()),
    (pro_b_id, 'solc-pro-b@example.test', now()),
    (outsider_id, 'solc-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  )
  VALUES
    (
      unit_a_id,
      'SOLC Unit A',
      'solc-unit-a-' || substr(unit_a_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      true
    ),
    (
      unit_b_id,
      'SOLC Unit B',
      'solc-unit-b-' || substr(unit_b_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      false
    );

  -- Billing accounts are auto-created by establishment trigger (trial).
  -- Mirror financial_ops_foundation fixtures so capabilities resolve as full.
  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_a_id, 'Owner', 'solc-owner@example.test', 'admin'),
    (admin_id, unit_a_id, 'Admin', 'solc-admin@example.test', 'admin'),
    (pro_a_id, unit_a_id, 'Pro A', 'solc-pro-a@example.test', 'professional'),
    (pro_b_id, unit_a_id, 'Pro B', 'solc-pro-b@example.test', 'professional'),
    (outsider_id, NULL, 'Outsider', 'solc-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE
  SET establishment_id = EXCLUDED.establishment_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      deleted_at = NULL,
      updated_at = now();

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'SOLC Org', 'active', owner_id);

  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  )
  VALUES (organization_id, owner_id, 'owner', 'active', owner_id);

  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  )
  VALUES
    (organization_id, unit_a_id, 'active', owner_id),
    (organization_id, unit_b_id, 'active', owner_id);

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, created_by
  )
  VALUES
    (owner_id, unit_a_id, 'admin', 'active', owner_id),
    (admin_id, unit_a_id, 'admin', 'active', owner_id),
    (pro_a_id, unit_a_id, 'professional', 'active', owner_id),
    (pro_b_id, unit_a_id, 'professional', 'active', owner_id),
    (owner_id, unit_b_id, 'admin', 'active', owner_id);

  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id,
      owner_resolution_status = 'confirmed'
  WHERE establishment_id IN (unit_a_id, unit_b_id);

  -- CRITICAL: enable financial ops on A only (privileged / clear_actor path)
  PERFORM pg_temp.clear_actor();
  UPDATE public.establishments
  SET financial_ops_enabled = true
  WHERE id = unit_a_id;

  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'unit A financial_ops_enabled must be true';
  END IF;
  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments WHERE id = unit_b_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unit B financial_ops_enabled must remain false';
  END IF;

  INSERT INTO public.establishment_clients(
    id, establishment_id, display_name, created_by, updated_by
  )
  VALUES (client_a_id, unit_a_id, 'SOLC Client', owner_id, owner_id);

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active, sort_order
  )
  VALUES
    (service_cut_id, unit_a_id, 'Cut 75', 75.00, 30, true, 10),
    (service_extra_id, unit_a_id, 'Beard 40', 40.00, 15, true, 20);

  INSERT INTO public.appointments(
    id, establishment_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  )
  VALUES
    (
      appt_main_id, unit_a_id, 'Main Client', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '1 day', 30, now() + interval '1 day 30 minutes',
      'confirmed'
    ),
    (
      appt_pending_id, unit_a_id, 'Pending Client', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '2 days', 30, now() + interval '2 days 30 minutes',
      'pending'
    ),
    (
      appt_pro_b_id, unit_a_id, 'Pro B Client', client_a_id,
      pro_b_id, service_cut_id,
      now() + interval '3 days', 30, now() + interval '3 days 30 minutes',
      'confirmed'
    );

  -- Prefer an explicit snapshot when the column is writable without catalog reset
  UPDATE public.appointments
  SET price_charged = 75.00
  WHERE id = appt_main_id;

  SELECT price_charged INTO price_charged_v
  FROM public.appointments WHERE id = appt_main_id;
  IF price_charged_v IS DISTINCT FROM 75.00 THEN
    RAISE EXCEPTION 'expected price_charged 75, got %', price_charged_v;
  END IF;

  ------------------------------------------------------------------
  -- Flag / access
  ------------------------------------------------------------------

  -- flag off → financial_ops_disabled on open
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, NULL, %L::uuid, NULL, NULL)',
      unit_b_id, gen_random_uuid(), owner_id
    ),
    'financial_ops_disabled'
  );

  -- unauthenticated rejected
  PERFORM pg_temp.clear_actor();
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid(), appt_main_id
    ),
    'authentication_required'
  );

  -- outsider forbidden
  PERFORM pg_temp.set_actor(outsider_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid(), appt_main_id
    ),
    'forbidden'
  );

  -- professional cannot operate other's appointment
  PERFORM pg_temp.set_actor(pro_a_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid(), appt_pro_b_id
    ),
    'forbidden'
  );

  ------------------------------------------------------------------
  -- Open
  ------------------------------------------------------------------

  -- reject pending appointment
  PERFORM pg_temp.set_actor(pro_a_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid(), appt_pending_id
    ),
    'service_order_invalid_appointment_status'
  );

  -- walk-in without professional → required
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, NULL, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid()
    ),
    'service_order_professional_required'
  );

  -- open confirmed appointment; seed item; price_charged → cents; events
  result := public.open_service_order(
    unit_a_id, open_req_id, appt_main_id, NULL, NULL, NULL
  );
  order_main_id := (result->>'serviceOrderId')::uuid;
  version_v := (result->>'version')::bigint;
  IF order_main_id IS NULL OR version_v IS NULL THEN
    RAISE EXCEPTION 'open_service_order missing id/version: %', result;
  END IF;
  IF result->>'status' IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'open status expected open, got %', result;
  END IF;

  SELECT unit_price_cents, id INTO unit_price, item_seed_id
  FROM public.service_order_items
  WHERE service_order_id = order_main_id
  ORDER BY sort_order, id
  LIMIT 1;
  IF unit_price IS DISTINCT FROM 7500 THEN
    RAISE EXCEPTION 'seeded unit_price_cents expected 7500, got %', unit_price;
  END IF;

  SELECT array_agg(event_type ORDER BY created_at, id) INTO event_types
  FROM public.service_order_events
  WHERE service_order_id = order_main_id;
  IF NOT (
    'opened' = ANY (event_types)
    AND 'item_upserted' = ANY (event_types)
  ) THEN
    RAISE EXCEPTION 'expected opened+item_upserted events, got %', event_types;
  END IF;

  -- replay same request_id returns same
  replay := public.open_service_order(
    unit_a_id, open_req_id, appt_main_id, NULL, NULL, NULL
  );
  IF replay IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'open replay mismatch: % vs %', replay, result;
  END IF;

  -- different payload → idempotency_conflict
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, %L)',
      unit_a_id, open_req_id, appt_main_id, 'different notes'
    ),
    'idempotency_conflict'
  );

  -- second open same appointment → already_exists
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid(), appt_main_id
    ),
    'service_order_already_exists'
  );

  -- two walk-ins allowed
  result := public.open_service_order(
    unit_a_id, walk1_req_id, NULL, pro_a_id, client_a_id, NULL
  );
  order_walk1_id := (result->>'serviceOrderId')::uuid;
  result := public.open_service_order(
    unit_a_id, walk2_req_id, NULL, pro_a_id, client_a_id, NULL
  );
  order_walk2_id := (result->>'serviceOrderId')::uuid;
  IF order_walk1_id IS NULL OR order_walk2_id IS NULL
     OR order_walk1_id = order_walk2_id
  THEN
    RAISE EXCEPTION 'two walk-ins must produce distinct orders';
  END IF;

  -- admin operates team: open pro B appointment
  PERFORM pg_temp.set_actor(admin_id);
  result := public.open_service_order(
    unit_a_id, pro_b_open_req, appt_pro_b_id, NULL, NULL, NULL
  );
  order_pro_b_id := (result->>'serviceOrderId')::uuid;
  IF order_pro_b_id IS NULL THEN
    RAISE EXCEPTION 'admin failed to open team appointment order';
  END IF;

  ------------------------------------------------------------------
  -- Start / items
  ------------------------------------------------------------------

  PERFORM pg_temp.set_actor(pro_a_id);
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_main_id;

  -- bad version conflict
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.start_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_main_id, version_v + 99, gen_random_uuid()
    ),
    'service_order_version_conflict'
  );

  -- start open → in_service; version bump
  result := public.start_service_order(
    unit_a_id, order_main_id, version_v, start_req_id
  );
  IF result->>'status' IS DISTINCT FROM 'in_service' THEN
    RAISE EXCEPTION 'start status expected in_service, got %', result;
  END IF;
  IF (result->>'version')::bigint <= version_v THEN
    RAISE EXCEPTION 'start must bump version';
  END IF;
  version_v := (result->>'version')::bigint;

  -- finish while needing items on empty walk-in
  result := public.open_service_order(
    unit_a_id, walk_empty_req, NULL, pro_a_id, NULL, NULL
  );
  order_empty_id := (result->>'serviceOrderId')::uuid;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.finish_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_empty_id, 1, gen_random_uuid()
    ),
    'service_order_invalid_transition'
  );
  result := public.start_service_order(
    unit_a_id, order_empty_id, 1, gen_random_uuid()
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.finish_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_empty_id, (result->>'version')::bigint, gen_random_uuid()
    ),
    'service_order_items_required'
  );

  -- upsert catalog service item
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_main_id;
  result := public.upsert_service_order_item(
    unit_a_id,
    order_main_id,
    version_v,
    upsert_req_id,
    NULL,
    service_extra_id,
    pro_a_id,
    NULL,
    1,
    0,
    NULL
  );
  item_extra_id := (result->>'serviceOrderItemId')::uuid;
  IF item_extra_id IS NULL THEN
    RAISE EXCEPTION 'upsert missing serviceOrderItemId: %', result;
  END IF;
  version_v := (result->>'version')::bigint;

  -- price override forbidden on catalog service
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, %s::bigint, %L::uuid, NULL, %L, NULL, NULL, 1, 0, %s::bigint)',
      unit_a_id, order_main_id, version_v, gen_random_uuid(),
      service_extra_id, 999
    ),
    'service_order_item_price_override_forbidden'
  );

  -- professional custom item forbidden
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, %s::bigint, %L::uuid, NULL, NULL, %L::uuid, %L, 1, 0, %s::bigint)',
      unit_a_id, order_main_id, version_v, gen_random_uuid(),
      pro_a_id, 'Custom trim', 1000
    ),
    'service_order_custom_item_forbidden'
  );

  -- discount without capability forbidden for professional
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, %s::bigint, %L::uuid, %L::uuid, %L, NULL, NULL, 1, %s::bigint, NULL)',
      unit_a_id, order_main_id, version_v, gen_random_uuid(),
      item_seed_id, service_cut_id, 500
    ),
    'service_order_discount_forbidden'
  );

  -- admin custom item ok
  PERFORM pg_temp.set_actor(admin_id);
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_main_id;
  result := public.upsert_service_order_item(
    unit_a_id,
    order_main_id,
    version_v,
    custom_req_id,
    NULL,
    NULL,
    pro_a_id,
    'Admin custom product',
    1,
    0,
    1500
  );
  IF (result->>'serviceOrderItemId') IS NULL THEN
    RAISE EXCEPTION 'admin custom item failed: %', result;
  END IF;
  version_v := (result->>'version')::bigint;

  -- admin can discount
  result := public.upsert_service_order_item(
    unit_a_id,
    order_main_id,
    version_v,
    discount_req_id,
    item_seed_id,
    service_cut_id,
    pro_a_id,
    NULL,
    1,
    500,
    NULL
  );
  version_v := (result->>'version')::bigint;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_order_items
    WHERE id = item_seed_id AND discount_cents = 500
  ) THEN
    RAISE EXCEPTION 'admin discount not persisted';
  END IF;

  ------------------------------------------------------------------
  -- remove_service_order_item (named args + replay/authz/freeze)
  ------------------------------------------------------------------

  -- dedicated open order with two catalog items for removal checks
  PERFORM pg_temp.set_actor(pro_a_id);
  result := public.open_service_order(
    unit_a_id, gen_random_uuid(), NULL, pro_a_id, client_a_id, NULL
  );
  order_remove_id := (result->>'serviceOrderId')::uuid;
  version_v := (result->>'version')::bigint;

  result := public.upsert_service_order_item(
    unit_a_id, order_remove_id, version_v, gen_random_uuid(),
    NULL, service_cut_id, pro_a_id, NULL, 1, 0, NULL
  );
  item_remove_id := (result->>'serviceOrderItemId')::uuid;
  version_v := (result->>'version')::bigint;

  result := public.upsert_service_order_item(
    unit_a_id, order_remove_id, version_v, gen_random_uuid(),
    NULL, service_extra_id, pro_a_id, NULL, 1, 0, NULL
  );
  item_keep_id := (result->>'serviceOrderItemId')::uuid;
  version_v := (result->>'version')::bigint;

  SELECT subtotal_cents, discount_cents, total_cents, version
  INTO previous_subtotal, previous_discount, previous_total, previous_version
  FROM public.service_orders
  WHERE id = order_remove_id;

  -- professional removes own item with named arguments
  result := public.remove_service_order_item(
    target_establishment_id => unit_a_id,
    target_service_order_id => order_remove_id,
    target_service_order_item_id => item_remove_id,
    target_expected_version => previous_version,
    target_request_id => remove_req_id
  );
  IF result->>'serviceOrderId' IS DISTINCT FROM order_remove_id::text THEN
    RAISE EXCEPTION 'named remove returned unexpected order: %', result;
  END IF;
  version_v := (result->>'version')::bigint;
  IF version_v IS DISTINCT FROM previous_version + 1 THEN
    RAISE EXCEPTION 'remove must bump version by exactly 1: % -> %',
      previous_version, version_v;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.service_order_items WHERE id = item_remove_id
  ) THEN
    RAISE EXCEPTION 'removed item still exists';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.service_orders
    WHERE id = order_remove_id
      AND total_cents = previous_total - 7500
      AND subtotal_cents = previous_subtotal - 7500
      AND discount_cents = previous_discount
  ) THEN
    RAISE EXCEPTION 'remove did not recalculate totals correctly';
  END IF;

  SELECT count(*)::integer INTO removed_events
  FROM public.service_order_events
  WHERE service_order_id = order_remove_id
    AND event_type = 'item_removed';
  IF removed_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'expected one item_removed event, got %', removed_events;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.service_order_events
    WHERE service_order_id = order_remove_id
      AND event_type = 'item_removed'
      AND metadata->>'itemId' = item_remove_id::text
      AND metadata->>'serviceId' = service_cut_id
  ) THEN
    RAISE EXCEPTION 'item_removed metadata missing itemId/serviceId';
  END IF;

  -- replay same request_id: no new event
  replay := public.remove_service_order_item(
    target_establishment_id => unit_a_id,
    target_service_order_id => order_remove_id,
    target_service_order_item_id => item_remove_id,
    target_expected_version => previous_version,
    target_request_id => remove_req_id
  );
  IF replay IS DISTINCT FROM result THEN
    RAISE EXCEPTION 'remove replay mismatch: % vs %', replay, result;
  END IF;
  SELECT count(*)::integer INTO removed_events
  FROM public.service_order_events
  WHERE service_order_id = order_remove_id
    AND event_type = 'item_removed';
  IF removed_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'remove replay duplicated item_removed event';
  END IF;

  -- same request_id with different item → idempotency_conflict
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_remove_id, item_keep_id, version_v, remove_req_id
    ),
    'idempotency_conflict'
  );

  -- wrong version
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_remove_id, item_keep_id, version_v + 99, gen_random_uuid()
    ),
    'service_order_version_conflict'
  );

  -- item from another order
  SELECT id INTO item_other_order_id
  FROM public.service_order_items
  WHERE service_order_id = order_main_id
  LIMIT 1;
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_remove_id, item_other_order_id, version_v, gen_random_uuid()
    ),
    'service_order_item_not_found'
  );

  -- professional cannot remove from another professional's order
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_pro_b_id;
  SELECT id INTO item_other_order_id
  FROM public.service_order_items
  WHERE service_order_id = order_pro_b_id
  LIMIT 1;
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_pro_b_id, item_other_order_id, version_v, remove_other_item_req
    ),
    'forbidden'
  );

  -- admin can remove team item
  PERFORM pg_temp.set_actor(admin_id);
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_remove_id;
  result := public.remove_service_order_item(
    target_establishment_id => unit_a_id,
    target_service_order_id => order_remove_id,
    target_service_order_item_id => item_keep_id,
    target_expected_version => version_v,
    target_request_id => remove_admin_req
  );
  IF EXISTS (SELECT 1 FROM public.service_order_items WHERE id = item_keep_id) THEN
    RAISE EXCEPTION 'admin team remove failed to delete item';
  END IF;

  ------------------------------------------------------------------
  -- Finish / freeze / close
  ------------------------------------------------------------------

  -- finish requires in_service+items; completes appointment via trigger only
  PERFORM pg_temp.set_actor(pro_a_id);
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_main_id;
  result := public.finish_service_order(
    unit_a_id, order_main_id, version_v, finish_req_id
  );
  IF result->>'status' IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'finish status expected awaiting_payment, got %', result;
  END IF;
  version_v := (result->>'version')::bigint;

  SELECT status INTO appt_status
  FROM public.appointments WHERE id = appt_main_id;
  IF appt_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION 'appointment status expected completed, got %', appt_status;
  END IF;

  SELECT count(*)::integer INTO completed_events
  FROM public.appointment_events
  WHERE appointment_id = appt_main_id
    AND event_type = 'completed';
  IF completed_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION
      'expected exactly one completed appointment_event from trigger, got %',
      completed_events;
  END IF;

  -- items frozen after finish (upsert + remove)
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, %s::bigint, %L::uuid, NULL, %L, NULL, NULL, 1, 0, NULL)',
      unit_a_id, order_main_id, version_v, gen_random_uuid(), service_extra_id
    ),
    'service_order_items_frozen'
  );
  SELECT id INTO item_other_order_id
  FROM public.service_order_items
  WHERE service_order_id = order_main_id
  LIMIT 1;
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_main_id, item_other_order_id, version_v, gen_random_uuid()
    ),
    'service_order_items_frozen'
  );

  -- close positive total → balance unresolved
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.close_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_main_id, version_v, close_req_id
    ),
    'service_order_balance_unresolved'
  );

  -- close zero total ok (separate walk-in with free custom item)
  PERFORM pg_temp.set_actor(admin_id);
  result := public.open_service_order(
    unit_a_id, walk_zero_req, NULL, pro_a_id, client_a_id, NULL
  );
  order_zero_id := (result->>'serviceOrderId')::uuid;
  result := public.start_service_order(
    unit_a_id, order_zero_id, 1, walk_zero_start
  );
  version_v := (result->>'version')::bigint;
  result := public.upsert_service_order_item(
    unit_a_id,
    order_zero_id,
    version_v,
    walk_zero_item,
    NULL,
    NULL,
    pro_a_id,
    'Courtesy item',
    1,
    0,
    0
  );
  version_v := (result->>'version')::bigint;
  result := public.finish_service_order(
    unit_a_id, order_zero_id, version_v, walk_zero_finish
  );
  version_v := (result->>'version')::bigint;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_orders
    WHERE id = order_zero_id AND total_cents = 0 AND status = 'awaiting_payment'
  ) THEN
    RAISE EXCEPTION 'zero-total order not ready to close';
  END IF;
  result := public.close_service_order(
    unit_a_id, order_zero_id, version_v, walk_zero_close
  );
  IF result->>'status' IS DISTINCT FROM 'closed' THEN
    RAISE EXCEPTION 'zero-total close expected closed, got %', result;
  END IF;

  -- remove frozen on closed
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_zero_id;
  SELECT id INTO item_other_order_id
  FROM public.service_order_items
  WHERE service_order_id = order_zero_id
  LIMIT 1;
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_zero_id, item_other_order_id, version_v, gen_random_uuid()
    ),
    'service_order_items_frozen'
  );

  ------------------------------------------------------------------
  -- Void / reopen
  ------------------------------------------------------------------

  -- professional cannot void
  PERFORM pg_temp.set_actor(pro_a_id);
  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_main_id;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, %s::bigint, %L, %L::uuid)',
      unit_a_id, order_main_id, version_v, 'pro void attempt', gen_random_uuid()
    ),
    'forbidden'
  );

  -- void by admin
  PERFORM pg_temp.set_actor(admin_id);
  result := public.void_service_order(
    unit_a_id, order_main_id, version_v, 'admin void reason', void_req_id
  );
  IF result->>'status' IS DISTINCT FROM 'voided' THEN
    RAISE EXCEPTION 'void status expected voided, got %', result;
  END IF;
  IF (result->>'serviceOrderId')::uuid IS DISTINCT FROM order_main_id THEN
    RAISE EXCEPTION 'void changed service order id';
  END IF;
  version_v := (result->>'version')::bigint;

  -- remove frozen on voided
  SELECT id INTO item_other_order_id
  FROM public.service_order_items
  WHERE service_order_id = order_main_id
  LIMIT 1;
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_main_id, item_other_order_id, version_v, gen_random_uuid()
    ),
    'service_order_items_frozen'
  );

  -- second appointment order still blocked after void
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, %L, NULL, NULL, NULL)',
      unit_a_id, gen_random_uuid(), appt_main_id
    ),
    'service_order_invalid_appointment_status'
  );

  -- reopen restores same id
  result := public.reopen_voided_service_order(
    unit_a_id, order_main_id, version_v, 'admin reopen reason', reopen_req_id
  );
  IF (result->>'serviceOrderId')::uuid IS DISTINCT FROM order_main_id THEN
    RAISE EXCEPTION 'reopen must restore same service order id';
  END IF;
  IF result->>'status' IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'reopen status expected awaiting_payment, got %', result;
  END IF;

  ------------------------------------------------------------------
  -- Reads
  ------------------------------------------------------------------

  detail := public.get_service_order(unit_a_id, order_main_id);
  IF detail->'order' IS NULL
     OR jsonb_typeof(detail->'items') IS DISTINCT FROM 'array'
     OR jsonb_typeof(detail->'events') IS DISTINCT FROM 'array'
  THEN
    RAISE EXCEPTION 'get_service_order missing order/items/events: %', detail;
  END IF;
  IF jsonb_array_length(detail->'items') < 1 THEN
    RAISE EXCEPTION 'get_service_order items empty';
  END IF;
  IF jsonb_array_length(detail->'events') < 1 THEN
    RAISE EXCEPTION 'get_service_order events empty';
  END IF;
  IF position('paymentStatus' IN detail::text) > 0
     OR position('payment_status' IN detail::text) > 0
  THEN
    RAISE EXCEPTION 'get_service_order must not expose paymentStatus: %', detail;
  END IF;

  -- professional can read own order; not other's
  PERFORM pg_temp.set_actor(pro_a_id);
  detail := public.get_service_order(unit_a_id, order_main_id);
  IF (detail->'order'->>'id')::uuid IS DISTINCT FROM order_main_id THEN
    RAISE EXCEPTION 'pro A cannot read own order';
  END IF;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order(%L::uuid, %L::uuid)',
      unit_a_id, order_pro_b_id
    ),
    'forbidden'
  );

  local_day := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  -- list own scope
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'own');
  IF jsonb_typeof(list_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'list own missing items array: %', list_payload;
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_main_id
  ) THEN
    RAISE EXCEPTION 'list own missing pro A order';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_pro_b_id
  ) THEN
    RAISE EXCEPTION 'list own leaked pro B order';
  END IF;

  -- professional team scope forbidden
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)',
      unit_a_id, local_day, 'team'
    ),
    'forbidden'
  );

  -- admin team scope includes both
  PERFORM pg_temp.set_actor(admin_id);
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'team');
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_main_id
  ) OR NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(list_payload->'items') AS item
    WHERE (item->>'serviceOrderId')::uuid = order_pro_b_id
  ) THEN
    RAISE EXCEPTION 'list team missing expected orders: %', list_payload;
  END IF;

  -- no payment_status column on foundation table either
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_orders'
      AND column_name = 'payment_status'
  ) INTO col_exists;
  IF col_exists THEN
    RAISE EXCEPTION 'service_orders.payment_status must not exist';
  END IF;

  ------------------------------------------------------------------
  -- read_only / blocked via real billing access modes
  ------------------------------------------------------------------

  -- Force real read_only context (expired trial), keep financial_ops_enabled.
  PERFORM pg_temp.clear_actor();
  UPDATE public.billing_accounts AS account
  SET trial_started_at = now() - interval '15 days',
      trial_ends_at = now() - interval '1 day',
      transition_ends_at = NULL,
      courtesy_ends_at = NULL
  WHERE account.establishment_id = unit_a_id;

  PERFORM pg_temp.set_actor(admin_id);
  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = unit_a_id;
  IF context_record.access_mode IS DISTINCT FROM 'read_only' THEN
    RAISE EXCEPTION 'expected read_only access_mode, got %', context_record.access_mode;
  END IF;
  IF NOT ('view_orders' = ANY (context_record.capabilities))
     OR 'manage_team_orders' = ANY (context_record.capabilities)
  THEN
    RAISE EXCEPTION 'read_only capabilities unexpected: %', context_record.capabilities;
  END IF;

  -- reads allowed in scope
  detail := public.get_service_order(unit_a_id, order_main_id);
  IF detail->'order' IS NULL THEN
    RAISE EXCEPTION 'read_only admin get_service_order failed';
  END IF;
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'team');
  IF jsonb_typeof(list_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'read_only list team failed: %', list_payload;
  END IF;

  PERFORM pg_temp.set_actor(pro_a_id);
  detail := public.get_service_order(unit_a_id, order_main_id);
  IF detail->'order' IS NULL THEN
    RAISE EXCEPTION 'read_only pro get own failed';
  END IF;
  list_payload := public.list_service_orders_for_day(unit_a_id, local_day, 'own');
  IF jsonb_typeof(list_payload->'items') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'read_only list own failed';
  END IF;

  -- mutations forbidden in read_only (use current versions to avoid version_conflict)
  PERFORM pg_temp.set_actor(admin_id);
  SELECT version INTO version_v FROM public.service_orders WHERE id = order_main_id;
  SELECT version INTO previous_version FROM public.service_orders WHERE id = order_remove_id;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, NULL, %L::uuid, NULL, NULL)',
      unit_a_id, gen_random_uuid(), pro_a_id
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.start_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_remove_id, previous_version, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, %s::bigint, %L::uuid, NULL, %L, NULL, NULL, 1, 0, NULL)',
      unit_a_id, order_remove_id, previous_version, gen_random_uuid(), service_cut_id
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_main_id, item_seed_id, version_v, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.finish_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_remove_id, previous_version, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.close_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_main_id, version_v, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, %s::bigint, %L, %L::uuid)',
      unit_a_id, order_main_id, version_v, 'read only void', gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.reopen_voided_service_order(%L::uuid, %L::uuid, %s::bigint, %L, %L::uuid)',
      unit_a_id, order_main_id, version_v, 'read only reopen', gen_random_uuid()
    ),
    'forbidden'
  );

  -- blocked: establishment account_status
  PERFORM pg_temp.clear_actor();
  PERFORM set_config(
    'cutsync.governance_status_reason',
    'Service order blocked-mode validation',
    true
  );
  UPDATE public.establishments
  SET account_status = 'blocked'
  WHERE id = unit_a_id;

  PERFORM pg_temp.set_actor(admin_id);
  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = unit_a_id;
  IF context_record.access_mode IS DISTINCT FROM 'blocked'
     OR cardinality(context_record.capabilities) <> 0
  THEN
    RAISE EXCEPTION 'expected blocked empty capabilities, got % / %',
      context_record.access_mode, context_record.capabilities;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order(%L::uuid, %L::uuid)',
      unit_a_id, order_main_id
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)',
      unit_a_id, local_day, 'team'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, NULL, %L::uuid, NULL, NULL)',
      unit_a_id, gen_random_uuid(), pro_a_id
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.start_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_remove_id, previous_version, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.upsert_service_order_item(%L::uuid, %L::uuid, %s::bigint, %L::uuid, NULL, %L, NULL, NULL, 1, 0, NULL)',
      unit_a_id, order_remove_id, previous_version, gen_random_uuid(), service_cut_id
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        SELECT public.remove_service_order_item(
          target_establishment_id => %L::uuid,
          target_service_order_id => %L::uuid,
          target_service_order_item_id => %L::uuid,
          target_expected_version => %s::bigint,
          target_request_id => %L::uuid
        )
      $sql$,
      unit_a_id, order_main_id, item_seed_id, version_v, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.finish_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_remove_id, previous_version, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.close_service_order(%L::uuid, %L::uuid, %s::bigint, %L::uuid)',
      unit_a_id, order_main_id, version_v, gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.void_service_order(%L::uuid, %L::uuid, %s::bigint, %L, %L::uuid)',
      unit_a_id, order_main_id, version_v, 'blocked void', gen_random_uuid()
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.reopen_voided_service_order(%L::uuid, %L::uuid, %s::bigint, %L, %L::uuid)',
      unit_a_id, order_main_id, version_v, 'blocked reopen', gen_random_uuid()
    ),
    'forbidden'
  );

  PERFORM pg_temp.set_actor(pro_a_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order(%L::uuid, %L::uuid)',
      unit_a_id, order_main_id
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.list_service_orders_for_day(%L::uuid, %L::date, %L)',
      unit_a_id, local_day, 'own'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.open_service_order(%L::uuid, %L::uuid, NULL, %L::uuid, NULL, NULL)',
      unit_a_id, gen_random_uuid(), pro_a_id
    ),
    'forbidden'
  );

  RAISE NOTICE 'service_order_lifecycle_rpcs: OK';
END;
$test$;

ROLLBACK;
