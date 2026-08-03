BEGIN;

\set ON_ERROR_STOP on

-- P0 Etapa 2 — transactional schema checks for service_orders foundation.
-- Privileged fixtures set terminal statuses directly (no Etapa 3 RPCs).

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
<<service_orders_foundation>>
DECLARE
  owner_id uuid := gen_random_uuid();
  pro_a_id uuid := gen_random_uuid();
  pro_b_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  client_a_id uuid := gen_random_uuid();
  client_b_id uuid := gen_random_uuid();
  order_open_id uuid;
  order_walk_1 uuid;
  order_walk_2 uuid;
  order_appt_id uuid;
  order_void_id uuid;
  order_closed_id uuid;
  order_service_id uuid;
  order_freeze_id uuid;
  order_open_b_id uuid;
  order_actor_id uuid;
  order_chrono_id uuid;
  item_id uuid;
  item_closed_id uuid;
  item_voided_id uuid;
  item_open_a_id uuid;
  item_open_b_id uuid;
  event_id bigint;
  subtotal_v bigint;
  discount_v bigint;
  total_v bigint;
  version_v bigint;
  col_exists boolean;
  forbidden_table_exists boolean;
  rpc_exists boolean;
BEGIN
  -- 1: tables exist
  IF to_regclass('public.service_orders') IS NULL
    OR to_regclass('public.service_order_items') IS NULL
    OR to_regclass('public.service_order_events') IS NULL
  THEN
    RAISE EXCEPTION 'service order foundation tables missing';
  END IF;

  -- 2/3: no payment_status or financial-status equivalents
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_orders'
      AND column_name IN (
        'payment_status',
        'financial_status',
        'paid_status',
        'settlement_status',
        'balance_status'
      )
  ) INTO col_exists;
  IF col_exists THEN
    RAISE EXCEPTION 'service_orders must not persist payment/financial status columns';
  END IF;

  PERFORM pg_temp.clear_actor();

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'so-owner@example.test', now()),
    (pro_a_id, 'so-pro-a@example.test', now()),
    (pro_b_id, 'so-pro-b@example.test', now()),
    (outsider_id, 'so-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  )
  VALUES
    (
      unit_a_id,
      'SO Unit A',
      'so-unit-a-' || substr(unit_a_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      true
    ),
    (
      unit_b_id,
      'SO Unit B',
      'so-unit-b-' || substr(unit_b_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      false
    );

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_a_id, 'Owner', 'so-owner@example.test', 'admin'),
    (pro_a_id, unit_a_id, 'Pro A', 'so-pro-a@example.test', 'professional'),
    (pro_b_id, unit_b_id, 'Pro B', 'so-pro-b@example.test', 'professional'),
    (outsider_id, NULL, 'Outsider', 'so-outsider@example.test', 'client');

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, commission_rate, created_by
  )
  VALUES
    (owner_id, unit_a_id, 'admin', 'active', 0.50, owner_id),
    (pro_a_id, unit_a_id, 'professional', 'active', 0.40, owner_id),
    (pro_b_id, unit_b_id, 'professional', 'active', 0.40, owner_id);

  INSERT INTO public.establishment_clients(
    id, establishment_id, display_name, created_by, updated_by
  )
  VALUES
    (client_a_id, unit_a_id, 'Client A', owner_id, owner_id),
    (client_b_id, unit_b_id, 'Client B', owner_id, owner_id);

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active, sort_order
  )
  VALUES
    ('so-service-a', unit_a_id, 'Cut A', 50, 30, true, 10),
    ('so-service-b', unit_b_id, 'Cut B', 50, 30, true, 10);

  INSERT INTO public.appointments(
    id, establishment_id, client_name, professional_id, service_id,
    date_time, duration_minutes, ends_at, status
  )
  VALUES
    (
      'so-appt-a1', unit_a_id, 'Walk Client', pro_a_id, 'so-service-a',
      now() + interval '1 day', 30, now() + interval '1 day 30 minutes',
      'confirmed'
    ),
    (
      'so-appt-a2', unit_a_id, 'Walk Client 2', pro_a_id, 'so-service-a',
      now() + interval '2 days', 30, now() + interval '2 days 30 minutes',
      'confirmed'
    ),
    (
      'so-appt-a3', unit_a_id, 'Walk Client 3', pro_a_id, 'so-service-a',
      now() + interval '3 days', 30, now() + interval '3 days 30 minutes',
      'confirmed'
    ),
    (
      'so-appt-b1', unit_b_id, 'Other Unit', pro_b_id, 'so-service-b',
      now() + interval '1 day', 30, now() + interval '1 day 30 minutes',
      'confirmed'
    );

  -- 4: invalid status rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, status, created_by, updated_by
        ) VALUES (%L, 'paid', %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'violates check constraint'
  );

  -- 5: non-BRL currency rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, currency, created_by, updated_by
        ) VALUES (%L, 'USD', %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'violates check constraint'
  );

  -- 6: negative money rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, subtotal_cents, discount_cents, total_cents,
          created_by, updated_by
        ) VALUES (%L, -1, 0, -1, %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'violates check constraint'
  );

  -- 7: inconsistent totals rejected by CHECK (frontend values not trusted)
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, subtotal_cents, discount_cents, total_cents,
          created_by, updated_by
        ) VALUES (%L, 1000, 0, 999, %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'violates check constraint'
  );

  INSERT INTO public.service_orders(
    id, establishment_id, establishment_client_id, professional_id,
    created_by, updated_by
  )
  VALUES (
    gen_random_uuid(), unit_a_id, client_a_id, pro_a_id, owner_id, owner_id
  )
  RETURNING id INTO order_open_id;

  -- 8/9: item generated totals + discount > subtotal rejected
  INSERT INTO public.service_order_items(
    service_order_id, establishment_id, service_id, professional_id,
    description_snapshot, quantity, unit_price_cents, discount_cents,
    created_by, updated_by
  )
  VALUES (
    order_open_id, unit_a_id, 'so-service-a', pro_a_id,
    'Haircut', 2, 1500, 500, owner_id, owner_id
  )
  RETURNING id, subtotal_cents, total_cents
  INTO item_id, subtotal_v, total_v;

  IF subtotal_v IS DISTINCT FROM 3000 OR total_v IS DISTINCT FROM 2500 THEN
    RAISE EXCEPTION 'item generated totals mismatch: % / %', subtotal_v, total_v;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_order_items(
          service_order_id, establishment_id, description_snapshot,
          quantity, unit_price_cents, discount_cents, created_by, updated_by
        ) VALUES (%L, %L, 'Bad discount', 1, 1000, 1001, %L, %L)
      $sql$,
      order_open_id, unit_a_id, owner_id, owner_id
    ),
    'violates check constraint'
  );

  -- 10: order totals recalculated after insert
  SELECT subtotal_cents, discount_cents, total_cents, version
  INTO subtotal_v, discount_v, total_v, version_v
  FROM public.service_orders
  WHERE id = order_open_id;

  IF subtotal_v IS DISTINCT FROM 3000
    OR discount_v IS DISTINCT FROM 500
    OR total_v IS DISTINCT FROM 2500
  THEN
    RAISE EXCEPTION 'order totals after insert mismatch: %/%/%',
      subtotal_v, discount_v, total_v;
  END IF;
  IF version_v < 2 THEN
    RAISE EXCEPTION 'version must bump after item insert: %', version_v;
  END IF;

  -- 11: totals recalculated after item update
  UPDATE public.service_order_items
  SET quantity = 3, discount_cents = 0, updated_by = owner_id
  WHERE id = item_id;

  SELECT subtotal_cents, discount_cents, total_cents
  INTO subtotal_v, discount_v, total_v
  FROM public.service_orders
  WHERE id = order_open_id;

  IF subtotal_v IS DISTINCT FROM 4500
    OR discount_v IS DISTINCT FROM 0
    OR total_v IS DISTINCT FROM 4500
  THEN
    RAISE EXCEPTION 'order totals after update mismatch: %/%/%',
      subtotal_v, discount_v, total_v;
  END IF;

  -- 12: totals recalculated after item delete
  DELETE FROM public.service_order_items WHERE id = item_id;

  SELECT subtotal_cents, discount_cents, total_cents
  INTO subtotal_v, discount_v, total_v
  FROM public.service_orders
  WHERE id = order_open_id;

  IF subtotal_v IS DISTINCT FROM 0
    OR discount_v IS DISTINCT FROM 0
    OR total_v IS DISTINCT FROM 0
  THEN
    RAISE EXCEPTION 'order totals after delete mismatch: %/%/%',
      subtotal_v, discount_v, total_v;
  END IF;

  -- 13: multiple walk-ins (appointment_id NULL) allowed
  INSERT INTO public.service_orders(
    establishment_id, appointment_id, created_by, updated_by
  )
  VALUES (unit_a_id, NULL, owner_id, owner_id)
  RETURNING id INTO order_walk_1;

  INSERT INTO public.service_orders(
    establishment_id, appointment_id, created_by, updated_by
  )
  VALUES (unit_a_id, NULL, owner_id, owner_id)
  RETURNING id INTO order_walk_2;

  IF order_walk_1 IS NULL
    OR order_walk_2 IS NULL
    OR order_walk_1 = order_walk_2
  THEN
    RAISE EXCEPTION 'walk-in orders not created distinctly';
  END IF;

  -- 14: second order for same appointment rejected
  INSERT INTO public.service_orders(
    establishment_id, appointment_id, professional_id, created_by, updated_by
  )
  VALUES (
    unit_a_id, 'so-appt-a1', pro_a_id, owner_id, owner_id
  )
  RETURNING id INTO order_appt_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, appointment_id, created_by, updated_by
        ) VALUES (%L, 'so-appt-a1', %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'service_orders_one_per_appointment'
  );

  -- 15: rejection persists when first order is voided
  INSERT INTO public.service_orders(
    establishment_id, appointment_id, professional_id, created_by, updated_by
  )
  VALUES (
    unit_a_id, 'so-appt-a2', pro_a_id, owner_id, owner_id
  )
  RETURNING id INTO order_void_id;

  UPDATE public.service_orders
  SET
    status = 'voided',
    voided_at = now(),
    voided_by = owner_id,
    void_reason = 'fixture void for uniqueness',
    updated_by = owner_id
  WHERE id = order_void_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, appointment_id, created_by, updated_by
        ) VALUES (%L, 'so-appt-a2', %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'service_orders_one_per_appointment'
  );

  -- 16: rejection persists when first order is closed
  INSERT INTO public.service_orders(
    establishment_id, appointment_id, professional_id, created_by, updated_by
  )
  VALUES (
    unit_a_id, 'so-appt-a3', pro_a_id, owner_id, owner_id
  )
  RETURNING id INTO order_closed_id;

  UPDATE public.service_orders
  SET
    status = 'closed',
    started_at = now() - interval '1 hour',
    finished_at = now() - interval '30 minutes',
    closed_at = now(),
    started_by = owner_id,
    finished_by = owner_id,
    closed_by = owner_id,
    updated_by = owner_id
  WHERE id = order_closed_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, appointment_id, created_by, updated_by
        ) VALUES (%L, 'so-appt-a3', %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'service_orders_one_per_appointment'
  );

  -- 17: appointment from other unit rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, appointment_id, created_by, updated_by
        ) VALUES (%L, 'so-appt-b1', %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    ),
    'service_order_appointment_tenant_mismatch'
  );

  -- 18: establishment client from other unit rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, establishment_client_id, created_by, updated_by
        ) VALUES (%L, %L, %L, %L)
      $sql$,
      unit_a_id, client_b_id, owner_id, owner_id
    ),
    'service_order_client_tenant_mismatch'
  );

  -- 19: professional from other unit rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, professional_id, created_by, updated_by
        ) VALUES (%L, %L, %L, %L)
      $sql$,
      unit_a_id, pro_b_id, owner_id, owner_id
    ),
    'service_order_professional_tenant_mismatch'
  );

  -- Fresh open order for item tenant / freeze checks
  INSERT INTO public.service_orders(
    establishment_id, professional_id, created_by, updated_by
  )
  VALUES (unit_a_id, pro_a_id, owner_id, owner_id)
  RETURNING id INTO order_service_id;

  -- 20: item with mismatched establishment rejected (composite FK)
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_order_items(
          service_order_id, establishment_id, description_snapshot,
          quantity, unit_price_cents, created_by, updated_by
        ) VALUES (%L, %L, 'Cross tenant', 1, 1000, %L, %L)
      $sql$,
      order_service_id, unit_b_id, owner_id, owner_id
    ),
    'foreign key'
  );

  -- 21: service from other unit rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_order_items(
          service_order_id, establishment_id, service_id,
          description_snapshot, quantity, unit_price_cents,
          created_by, updated_by
        ) VALUES (%L, %L, 'so-service-b', 'Wrong service', 1, 1000, %L, %L)
      $sql$,
      order_service_id, unit_a_id, owner_id, owner_id
    ),
    'service_order_item_service_tenant_mismatch'
  );

  -- 22: item professional from other unit rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_order_items(
          service_order_id, establishment_id, professional_id,
          description_snapshot, quantity, unit_price_cents,
          created_by, updated_by
        ) VALUES (%L, %L, %L, 'Wrong pro', 1, 1000, %L, %L)
      $sql$,
      order_service_id, unit_a_id, pro_b_id, owner_id, owner_id
    ),
    'service_order_item_professional_tenant_mismatch'
  );

  INSERT INTO public.service_order_items(
    service_order_id, establishment_id, service_id, professional_id,
    description_snapshot, quantity, unit_price_cents, created_by, updated_by
  )
  VALUES (
    order_service_id, unit_a_id, 'so-service-a', pro_a_id,
    'Editable item', 1, 2000, owner_id, owner_id
  )
  RETURNING id INTO item_id;

  -- 23: item mutable in open
  UPDATE public.service_order_items
  SET unit_price_cents = 2100, updated_by = owner_id
  WHERE id = item_id;

  -- 24: item mutable in in_service
  UPDATE public.service_orders
  SET
    status = 'in_service',
    started_at = now(),
    started_by = owner_id,
    updated_by = owner_id
  WHERE id = order_service_id;

  UPDATE public.service_order_items
  SET unit_price_cents = 2200, updated_by = owner_id
  WHERE id = item_id;

  -- 25: frozen in awaiting_payment
  UPDATE public.service_orders
  SET
    status = 'awaiting_payment',
    finished_at = now(),
    finished_by = owner_id,
    updated_by = owner_id
  WHERE id = order_service_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET unit_price_cents = 2300, updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, item_id
    ),
    'service_order_items_frozen'
  );

  -- 26: frozen in closed
  UPDATE public.service_orders
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = owner_id,
    updated_by = owner_id
  WHERE id = order_service_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        DELETE FROM public.service_order_items WHERE id = %L
      $sql$,
      item_id
    ),
    'service_order_items_frozen'
  );

  -- 27: frozen in voided (fresh order)
  INSERT INTO public.service_orders(
    establishment_id, professional_id, created_by, updated_by
  )
  VALUES (unit_a_id, pro_a_id, owner_id, owner_id)
  RETURNING id INTO order_freeze_id;

  INSERT INTO public.service_order_items(
    service_order_id, establishment_id, description_snapshot,
    quantity, unit_price_cents, created_by, updated_by
  )
  VALUES (
    order_freeze_id, unit_a_id, 'To void', 1, 1000, owner_id, owner_id
  )
  RETURNING id INTO item_id;

  UPDATE public.service_orders
  SET
    status = 'voided',
    voided_at = now(),
    voided_by = owner_id,
    void_reason = 'fixture freeze void',
    updated_by = owner_id
  WHERE id = order_freeze_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET discount_cents = 1, updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, item_id
    ),
    'service_order_items_frozen'
  );

  item_voided_id := item_id;
  SELECT id INTO item_closed_id
  FROM public.service_order_items
  WHERE service_order_id = order_service_id
  LIMIT 1;
  IF item_closed_id IS NULL OR item_voided_id IS NULL THEN
    RAISE EXCEPTION 'fixture items for parent immutability missing';
  END IF;

  -- Parent immutable + editable field updates
  INSERT INTO public.service_orders(
    establishment_id, professional_id, created_by, updated_by
  )
  VALUES (unit_a_id, pro_a_id, owner_id, owner_id)
  RETURNING id INTO order_open_b_id;

  INSERT INTO public.service_order_items(
    service_order_id, establishment_id, service_id, professional_id,
    description_snapshot, quantity, unit_price_cents, discount_cents,
    created_by, updated_by
  )
  VALUES (
    order_open_id, unit_a_id, 'so-service-a', pro_a_id,
    'Open A item', 1, 1000, 0, owner_id, owner_id
  )
  RETURNING id INTO item_open_a_id;

  INSERT INTO public.service_order_items(
    service_order_id, establishment_id, description_snapshot,
    quantity, unit_price_cents, created_by, updated_by
  )
  VALUES (
    order_open_b_id, unit_a_id, 'Open B item', 1, 1000, owner_id, owner_id
  )
  RETURNING id INTO item_open_b_id;

  -- 1: closed item cannot move to open order
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET service_order_id = %L, updated_by = %L
        WHERE id = %L
      $sql$,
      order_open_b_id, owner_id, item_closed_id
    ),
    'service_order_item_parent_immutable'
  );

  -- 2: voided item cannot move to open order
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET service_order_id = %L, updated_by = %L
        WHERE id = %L
      $sql$,
      order_open_b_id, owner_id, item_voided_id
    ),
    'service_order_item_parent_immutable'
  );

  -- 3: even between two open orders, service_order_id cannot change
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET service_order_id = %L, updated_by = %L
        WHERE id = %L
      $sql$,
      order_open_b_id, owner_id, item_open_a_id
    ),
    'service_order_item_parent_immutable'
  );

  -- 4: establishment_id of item cannot change (parent immutability first)
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET establishment_id = %L, updated_by = %L
        WHERE id = %L
      $sql$,
      unit_b_id, owner_id, item_open_a_id
    ),
    'service_order_item_parent_immutable'
  );

  -- Parent unchanged: tenant integrity still rejects cross-unit service
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET service_id = 'so-service-b', updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, item_open_a_id
    ),
    'service_order_item_service_tenant_mismatch'
  );

  -- Parent unchanged: tenant integrity still rejects cross-unit professional
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_items
        SET professional_id = %L, updated_by = %L
        WHERE id = %L
      $sql$,
      pro_b_id, owner_id, item_open_a_id
    ),
    'service_order_item_professional_tenant_mismatch'
  );

  -- 5: normal editable-field updates remain allowed on open orders
  UPDATE public.service_order_items
  SET
    quantity = 2,
    unit_price_cents = 1800,
    discount_cents = 100,
    service_id = 'so-service-a',
    professional_id = pro_a_id,
    description_snapshot = 'Open A item updated',
    updated_by = owner_id
  WHERE id = item_open_a_id;

  SELECT total_cents INTO total_v
  FROM public.service_orders
  WHERE id = order_open_id;
  IF total_v IS DISTINCT FROM 3500 THEN
    RAISE EXCEPTION 'editable item update did not recalculate order total: %', total_v;
  END IF;

  -- Actor/timestamp pairing rejections
  INSERT INTO public.service_orders(
    establishment_id, professional_id, created_by, updated_by
  )
  VALUES (unit_a_id, pro_a_id, owner_id, owner_id)
  RETURNING id INTO order_actor_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET status = 'in_service', started_at = now(), updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, order_actor_id
    ),
    'service_orders_transition_actor_chk'
  );

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET started_by = %L, updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_actor_id
    ),
    'service_orders_transition_actor_chk'
  );

  UPDATE public.service_orders
  SET
    status = 'in_service',
    started_at = now(),
    started_by = owner_id,
    updated_by = owner_id
  WHERE id = order_actor_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'awaiting_payment',
          finished_at = now(),
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, order_actor_id
    ),
    'service_orders_transition_actor_chk'
  );

  UPDATE public.service_orders
  SET
    status = 'awaiting_payment',
    finished_at = now(),
    finished_by = owner_id,
    updated_by = owner_id
  WHERE id = order_actor_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'closed',
          closed_at = now(),
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, order_actor_id
    ),
    'service_orders_transition_actor_chk'
  );

  -- Reset actor fixture to open for voided_at without voided_by
  INSERT INTO public.service_orders(
    establishment_id, professional_id, created_by, updated_by
  )
  VALUES (unit_a_id, pro_a_id, owner_id, owner_id)
  RETURNING id INTO order_chrono_id;

  BEGIN
    UPDATE public.service_orders
    SET
      status = 'voided',
      voided_at = now(),
      void_reason = 'missing actor',
      updated_by = owner_id
    WHERE id = order_chrono_id;
    RAISE EXCEPTION 'voided_at without voided_by unexpectedly succeeded';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%voided_at without voided_by unexpectedly succeeded%' THEN
        RAISE;
      END IF;
      -- Both actor pairing and status timeline reject this shape.
      IF position('service_orders_transition_actor_chk' IN SQLERRM) = 0
        AND position('service_orders_status_timeline_chk' IN SQLERRM) = 0
      THEN
        RAISE EXCEPTION 'unexpected voided_at/voided_by denial: %', SQLERRM;
      END IF;
  END;

  -- Chronology rejections
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'in_service',
          started_at = opened_at - interval '1 minute',
          started_by = %L,
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_chrono_id
    ),
    'service_orders_transition_chronology_chk'
  );

  UPDATE public.service_orders
  SET
    status = 'in_service',
    started_at = opened_at + interval '1 minute',
    started_by = owner_id,
    updated_by = owner_id
  WHERE id = order_chrono_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'awaiting_payment',
          finished_at = started_at - interval '1 minute',
          finished_by = %L,
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_chrono_id
    ),
    'service_orders_transition_chronology_chk'
  );

  UPDATE public.service_orders
  SET
    status = 'awaiting_payment',
    finished_at = started_at + interval '1 minute',
    finished_by = owner_id,
    updated_by = owner_id
  WHERE id = order_chrono_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'closed',
          closed_at = finished_at - interval '1 minute',
          closed_by = %L,
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_chrono_id
    ),
    'service_orders_transition_chronology_chk'
  );

  -- Fresh open order for void chronology vs opened_at
  INSERT INTO public.service_orders(
    establishment_id, professional_id, created_by, updated_by,
    opened_at
  )
  VALUES (
    unit_a_id, pro_a_id, owner_id, owner_id,
    now() - interval '10 minutes'
  )
  RETURNING id INTO order_actor_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'voided',
          voided_at = opened_at - interval '1 minute',
          voided_by = %L,
          void_reason = 'before open',
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_actor_id
    ),
    'service_orders_transition_chronology_chk'
  );

  UPDATE public.service_orders
  SET
    status = 'in_service',
    started_at = opened_at + interval '2 minutes',
    started_by = owner_id,
    updated_by = owner_id
  WHERE id = order_actor_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'voided',
          voided_at = started_at - interval '1 minute',
          voided_by = %L,
          void_reason = 'before start',
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_actor_id
    ),
    'service_orders_transition_chronology_chk'
  );

  UPDATE public.service_orders
  SET
    status = 'awaiting_payment',
    finished_at = started_at + interval '2 minutes',
    finished_by = owner_id,
    updated_by = owner_id
  WHERE id = order_actor_id;

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_orders
        SET
          status = 'voided',
          voided_at = finished_at - interval '1 minute',
          voided_by = %L,
          void_reason = 'before finish',
          updated_by = %L
        WHERE id = %L
      $sql$,
      owner_id, owner_id, order_actor_id
    ),
    'service_orders_transition_chronology_chk'
  );

  -- 28: physical delete of service order rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        DELETE FROM public.service_orders WHERE id = %L
      $sql$,
      order_open_id
    ),
    'service_orders_is_immutable'
  );

  -- Event fixtures for immutability
  INSERT INTO public.service_order_events(
    service_order_id, establishment_id, actor_id,
    event_type, previous_status, resulting_status, metadata
  )
  VALUES (
    order_open_id, unit_a_id, owner_id,
    'opened', NULL, 'open', '{}'::jsonb
  )
  RETURNING id INTO event_id;

  -- 29: event update rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.service_order_events
        SET resulting_status = 'closed'
        WHERE id = %s
      $sql$,
      event_id
    ),
    'service_order_events_is_immutable'
  );

  -- 30: event delete rejected
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        DELETE FROM public.service_order_events WHERE id = %s
      $sql$,
      event_id
    ),
    'service_order_events_is_immutable'
  );

  -- 31: authenticated cannot write directly
  IF has_table_privilege('authenticated', 'public.service_orders', 'INSERT')
    OR has_table_privilege('authenticated', 'public.service_orders', 'UPDATE')
    OR has_table_privilege('authenticated', 'public.service_orders', 'DELETE')
    OR has_table_privilege('authenticated', 'public.service_order_items', 'INSERT')
    OR has_table_privilege('authenticated', 'public.service_order_events', 'INSERT')
  THEN
    RAISE EXCEPTION 'authenticated must not have direct write grants';
  END IF;

  PERFORM pg_temp.set_actor(owner_id);
  BEGIN
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, created_by, updated_by
        ) VALUES (%L, %L, %L)
      $sql$,
      unit_a_id, owner_id, owner_id
    );
    EXECUTE 'RESET ROLE';
    RAISE EXCEPTION 'authenticated direct insert unexpectedly succeeded';
  EXCEPTION
    WHEN insufficient_privilege THEN
      EXECUTE 'RESET ROLE';
    WHEN OTHERS THEN
      EXECUTE 'RESET ROLE';
      IF SQLERRM LIKE '%authenticated direct insert unexpectedly succeeded%' THEN
        RAISE;
      END IF;
  END;
  PERFORM pg_temp.clear_actor();

  -- 32: outsider without membership has no direct access grants
  PERFORM pg_temp.set_actor(outsider_id);
  IF has_table_privilege('authenticated', 'public.service_orders', 'SELECT')
    OR has_table_privilege('authenticated', 'public.service_order_items', 'SELECT')
    OR has_table_privilege('authenticated', 'public.service_order_events', 'SELECT')
  THEN
    RAISE EXCEPTION 'authenticated must not have direct SELECT grants';
  END IF;
  PERFORM pg_temp.clear_actor();

  -- 33: billing_* tables untouched / not referenced by this foundation
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'billing_accounts'
  ) THEN
    RAISE EXCEPTION 'billing_accounts unexpectedly missing';
  END IF;

  -- 34: no payment/cash/commission/provider tables created in this etapa
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name IN (
        'order_payment_entries',
        'cash_registers',
        'cash_sessions',
        'cash_movements',
        'commission_entries',
        'commission_policies',
        'payment_intents',
        'payment_refunds',
        'establishment_payment_methods',
        'payment_provider_accounts',
        'payment_provider_events'
      )
  ) INTO forbidden_table_exists;
  IF forbidden_table_exists THEN
    RAISE EXCEPTION 'Etapa 2 must not create payment/cash/commission/provider tables';
  END IF;

  -- 35: no Etapa 3 lifecycle RPCs
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc AS proc
    JOIN pg_namespace AS nsp ON nsp.oid = proc.pronamespace
    WHERE nsp.nspname = 'public'
      AND proc.proname IN (
        'open_service_order',
        'start_service_order',
        'finish_service_order',
        'close_service_order',
        'void_service_order',
        'reopen_voided_service_order',
        'upsert_service_order_item',
        'remove_service_order_item',
        'get_service_order',
        'list_service_orders_for_day'
      )
  ) INTO rpc_exists;
  IF rpc_exists THEN
    RAISE EXCEPTION 'Etapa 3 RPCs must not exist yet';
  END IF;

  RAISE NOTICE 'service_orders_foundation checks passed';
END;
$test$;

ROLLBACK;
