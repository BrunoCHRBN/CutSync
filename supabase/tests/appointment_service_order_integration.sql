BEGIN;

\set ON_ERROR_STOP on

-- P0 Etapa 4 — transactional checks for appointment ↔ service_order integration.
-- Covers flag-off legacy flows, flag-on protections, bridge read authz,
-- authorized finish via marker, and payment/cash frontiers.
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
<<appointment_service_order_integration>>
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  pro_a_id uuid := gen_random_uuid();
  pro_b_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_b_only_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  client_a_id uuid := gen_random_uuid();
  client_b_id uuid := gen_random_uuid();
  service_cut_id text := 'asoi-cut-' || substr(gen_random_uuid()::text, 1, 8);
  service_extra_id text := 'asoi-extra-' || substr(gen_random_uuid()::text, 1, 8);
  -- Flag off fixtures
  appt_legacy_confirm_id text := 'asoi-legacy-confirm-' || substr(gen_random_uuid()::text, 1, 8);
  appt_legacy_complete_id text := 'asoi-legacy-complete-' || substr(gen_random_uuid()::text, 1, 8);
  appt_legacy_reschedule_id text := 'asoi-legacy-resched-' || substr(gen_random_uuid()::text, 1, 8);
  -- Flag on, no order
  appt_pending_id text := 'asoi-pending-' || substr(gen_random_uuid()::text, 1, 8);
  appt_cancel_id text := 'asoi-cancel-' || substr(gen_random_uuid()::text, 1, 8);
  appt_noshow_id text := 'asoi-noshow-' || substr(gen_random_uuid()::text, 1, 8);
  appt_reschedule_id text := 'asoi-resched-' || substr(gen_random_uuid()::text, 1, 8);
  appt_direct_complete_id text := 'asoi-direct-complete-' || substr(gen_random_uuid()::text, 1, 8);
  appt_direct_complete_biz_id text := 'asoi-direct-biz-' || substr(gen_random_uuid()::text, 1, 8);
  -- Bridge / order fixtures
  appt_main_id text := 'asoi-main-' || substr(gen_random_uuid()::text, 1, 8);
  appt_pro_b_id text := 'asoi-prob-' || substr(gen_random_uuid()::text, 1, 8);
  appt_locked_id text := 'asoi-locked-' || substr(gen_random_uuid()::text, 1, 8);
  open_main_req uuid := gen_random_uuid();
  open_locked_req uuid := gen_random_uuid();
  start_main_req uuid := gen_random_uuid();
  finish_main_req uuid := gen_random_uuid();
  order_main_id uuid;
  order_locked_id uuid;
  version_v bigint;
  finish_expected_version bigint;
  result jsonb;
  replay jsonb;
  bridge jsonb;
  detail jsonb;
  flag_value boolean;
  appt_status text;
  completed_events integer;
  finished_events integer;
  context_record record;
  forbidden_table_exists boolean;
  payment_status_col boolean;
  new_starts timestamptz;
BEGIN
  ------------------------------------------------------------------
  -- Frontiers snapshot (also re-checked at end)
  ------------------------------------------------------------------
  IF to_regclass('public.order_payment_entries') IS NOT NULL
    OR to_regclass('public.cash_registers') IS NOT NULL
    OR to_regclass('public.commission_entries') IS NOT NULL
    OR to_regclass('public.payment_refunds') IS NOT NULL
    OR to_regclass('public.payment_provider_accounts') IS NOT NULL
  THEN
    RAISE EXCEPTION 'payment/cash/commission/provider tables must not exist in Etapa 4';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_orders'
      AND column_name = 'payment_status'
  ) INTO payment_status_col;
  IF payment_status_col THEN
    RAISE EXCEPTION 'service_orders.payment_status must not exist';
  END IF;

  PERFORM pg_temp.clear_actor();

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'asoi-owner@example.test', now()),
    (admin_id, 'asoi-admin@example.test', now()),
    (pro_a_id, 'asoi-pro-a@example.test', now()),
    (pro_b_id, 'asoi-pro-b@example.test', now()),
    (outsider_id, 'asoi-outsider@example.test', now()),
    (unit_b_only_id, 'asoi-unit-b-only@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  )
  VALUES
    (
      unit_a_id,
      'ASOI Unit A',
      'asoi-unit-a-' || substr(unit_a_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      false
    ),
    (
      unit_b_id,
      'ASOI Unit B',
      'asoi-unit-b-' || substr(unit_b_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      false
    );

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_a_id, 'Owner', 'asoi-owner@example.test', 'admin'),
    (admin_id, unit_a_id, 'Admin', 'asoi-admin@example.test', 'admin'),
    (pro_a_id, unit_a_id, 'Pro A', 'asoi-pro-a@example.test', 'professional'),
    (pro_b_id, unit_a_id, 'Pro B', 'asoi-pro-b@example.test', 'professional'),
    (outsider_id, NULL, 'Outsider', 'asoi-outsider@example.test', 'client'),
    (unit_b_only_id, unit_b_id, 'Unit B Admin', 'asoi-unit-b-only@example.test', 'admin')
  ON CONFLICT (id) DO UPDATE
  SET establishment_id = EXCLUDED.establishment_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      deleted_at = NULL,
      updated_at = now();

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'ASOI Org', 'active', owner_id);

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
    (owner_id, unit_b_id, 'admin', 'active', owner_id),
    (unit_b_only_id, unit_b_id, 'admin', 'active', owner_id);

  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id,
      owner_resolution_status = 'confirmed'
  WHERE establishment_id IN (unit_a_id, unit_b_id);

  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unit A financial_ops_enabled must start false';
  END IF;

  INSERT INTO public.establishment_clients(
    id, establishment_id, display_name, created_by, updated_by
  )
  VALUES
    (client_a_id, unit_a_id, 'ASOI Client A', owner_id, owner_id),
    (client_b_id, unit_a_id, 'ASOI Client B', owner_id, owner_id);

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
      appt_legacy_confirm_id, unit_a_id, 'Legacy Confirm', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '1 day', 30, now() + interval '1 day 30 minutes',
      'pending'
    ),
    (
      appt_legacy_complete_id, unit_a_id, 'Legacy Complete', client_a_id,
      pro_a_id, service_cut_id,
      now() - interval '1 hour', 30, now() - interval '30 minutes',
      'confirmed'
    ),
    (
      appt_legacy_reschedule_id, unit_a_id, 'Legacy Reschedule', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '2 days', 30, now() + interval '2 days 30 minutes',
      'confirmed'
    ),
    (
      appt_pending_id, unit_a_id, 'Pending Client', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '3 days', 30, now() + interval '3 days 30 minutes',
      'pending'
    ),
    (
      appt_cancel_id, unit_a_id, 'Cancel Client', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '4 days', 30, now() + interval '4 days 30 minutes',
      'confirmed'
    ),
    (
      appt_noshow_id, unit_a_id, 'NoShow Client', client_a_id,
      pro_a_id, service_cut_id,
      now() - interval '2 hours', 30, now() - interval '90 minutes',
      'confirmed'
    ),
    (
      appt_reschedule_id, unit_a_id, 'Reschedule Client', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '5 days', 30, now() + interval '5 days 30 minutes',
      'confirmed'
    ),
    (
      appt_direct_complete_id, unit_a_id, 'Direct Complete', client_a_id,
      pro_a_id, service_cut_id,
      now() - interval '3 hours', 30, now() - interval '150 minutes',
      'confirmed'
    ),
    (
      appt_direct_complete_biz_id, unit_a_id, 'Direct Biz Complete', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '6 days', 30, now() + interval '6 days 30 minutes',
      'confirmed'
    ),
    (
      appt_main_id, unit_a_id, 'Main Client', client_a_id,
      pro_a_id, service_cut_id,
      now() + interval '7 days', 30, now() + interval '7 days 30 minutes',
      'confirmed'
    ),
    (
      appt_pro_b_id, unit_a_id, 'Pro B Client', client_a_id,
      pro_b_id, service_cut_id,
      now() + interval '8 days', 30, now() + interval '8 days 30 minutes',
      'confirmed'
    ),
    (
      appt_locked_id, unit_a_id, 'Locked Client', client_a_id,
      pro_a_id, service_cut_id,
      now() - interval '5 hours', 30, now() - interval '270 minutes',
      'confirmed'
    );

  UPDATE public.appointments
  SET price_charged = 75.00
  WHERE id IN (
    appt_main_id, appt_locked_id, appt_direct_complete_id, appt_direct_complete_biz_id
  );

  ------------------------------------------------------------------
  -- Flag off (1-4): legacy confirm / complete / reschedule / no SO protection
  ------------------------------------------------------------------

  PERFORM pg_temp.set_actor(pro_a_id);
  PERFORM public.update_appointment_status_v2(
    appt_legacy_confirm_id, 'confirmed', NULL, NULL
  );
  SELECT status INTO appt_status
  FROM public.appointments WHERE id = appt_legacy_confirm_id;
  IF appt_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION '1: legacy confirm failed, got %', appt_status;
  END IF;

  PERFORM public.update_appointment_status_v2(
    appt_legacy_complete_id, 'completed', NULL, NULL
  );
  SELECT status INTO appt_status
  FROM public.appointments WHERE id = appt_legacy_complete_id;
  IF appt_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '2: legacy complete failed, got %', appt_status;
  END IF;

  new_starts := now() + interval '2 days 2 hours';
  UPDATE public.appointments
  SET date_time = new_starts,
      ends_at = new_starts + interval '30 minutes'
  WHERE id = appt_legacy_reschedule_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION '3: legacy reschedule update failed';
  END IF;
  SELECT date_time INTO new_starts
  FROM public.appointments WHERE id = appt_legacy_reschedule_id;
  IF new_starts IS NULL THEN
    RAISE EXCEPTION '3: legacy reschedule date_time missing';
  END IF;

  -- 4: no service-order protection interferes (still flag off)
  PERFORM public.complete_business_appointment(
    unit_a_id,
    appt_legacy_reschedule_id,
    gen_random_uuid()
  );
  SELECT status INTO appt_status
  FROM public.appointments WHERE id = appt_legacy_reschedule_id;
  IF appt_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '4: complete without SO protection failed, got %', appt_status;
  END IF;

  ------------------------------------------------------------------
  -- Enable financial ops on A only
  ------------------------------------------------------------------

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

  ------------------------------------------------------------------
  -- Flag on, no order (5-9)
  ------------------------------------------------------------------

  PERFORM pg_temp.set_actor(pro_a_id);

  -- 5: pending → confirmed
  PERFORM public.update_appointment_status_v2(
    appt_pending_id, 'confirmed', NULL, NULL
  );
  SELECT status INTO appt_status FROM public.appointments WHERE id = appt_pending_id;
  IF appt_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION '5: pending→confirmed failed, got %', appt_status;
  END IF;

  -- 6: cancel before check-in
  PERFORM public.update_appointment_status_v2(
    appt_cancel_id, 'cancelled', NULL, 'cliente pediu'
  );
  SELECT status INTO appt_status FROM public.appointments WHERE id = appt_cancel_id;
  IF appt_status IS DISTINCT FROM 'cancelled' THEN
    RAISE EXCEPTION '6: cancel before check-in failed, got %', appt_status;
  END IF;

  -- 7: no-show before check-in
  result := public.mark_business_appointment_no_show(
    unit_a_id, appt_noshow_id, gen_random_uuid()
  );
  IF result->>'status' IS DISTINCT FROM 'no_show' THEN
    RAISE EXCEPTION '7: no-show before check-in failed: %', result;
  END IF;

  -- 8: reschedule before check-in (direct schedule UPDATE — trigger allows without order)
  new_starts := now() + interval '5 days 3 hours';
  UPDATE public.appointments
  SET date_time = new_starts,
      ends_at = new_starts + interval '30 minutes'
  WHERE id = appt_reschedule_id;
  SELECT status INTO appt_status FROM public.appointments WHERE id = appt_reschedule_id;
  IF appt_status IS DISTINCT FROM 'confirmed' THEN
    RAISE EXCEPTION '8: reschedule before check-in changed status to %', appt_status;
  END IF;

  -- 9: direct complete blocked via both RPCs
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.complete_business_appointment(%L::uuid, %L, %L::uuid)',
      unit_a_id, appt_direct_complete_biz_id, gen_random_uuid()
    ),
    'appointment_completion_requires_service_order'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.update_appointment_status_v2(%L, %L, NULL, NULL)',
      appt_direct_complete_id, 'completed'
    ),
    'appointment_completion_requires_service_order'
  );

  ------------------------------------------------------------------
  -- Bridge read (11-19)
  ------------------------------------------------------------------

  -- 11: no order → serviceOrder null
  PERFORM pg_temp.set_actor(pro_a_id);
  bridge := public.get_service_order_for_appointment(unit_a_id, appt_main_id);
  IF bridge->>'appointmentId' IS DISTINCT FROM appt_main_id THEN
    RAISE EXCEPTION '11: appointmentId mismatch: %', bridge;
  END IF;
  IF jsonb_typeof(bridge->'serviceOrder') IS DISTINCT FROM 'null' THEN
    RAISE EXCEPTION '11: serviceOrder must be null without order: %', bridge;
  END IF;

  -- 12: pro reads own appointment
  bridge := public.get_service_order_for_appointment(unit_a_id, appt_main_id);
  IF bridge->>'appointmentId' IS DISTINCT FROM appt_main_id THEN
    RAISE EXCEPTION '12: pro own read failed: %', bridge;
  END IF;

  -- 13: pro cannot read other pro appointment
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order_for_appointment(%L::uuid, %L)',
      unit_a_id, appt_pro_b_id
    ),
    'forbidden'
  );

  -- 14: admin reads team
  PERFORM pg_temp.set_actor(admin_id);
  bridge := public.get_service_order_for_appointment(unit_a_id, appt_pro_b_id);
  IF bridge->>'appointmentId' IS DISTINCT FROM appt_pro_b_id THEN
    RAISE EXCEPTION '14: admin team read failed: %', bridge;
  END IF;

  -- 17: outsider forbidden
  PERFORM pg_temp.set_actor(outsider_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order_for_appointment(%L::uuid, %L)',
      unit_a_id, appt_main_id
    ),
    'forbidden'
  );

  -- 18: other unit cannot access (member of B only)
  PERFORM pg_temp.set_actor(unit_b_only_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order_for_appointment(%L::uuid, %L)',
      unit_a_id, appt_main_id
    ),
    'forbidden'
  );

  -- 19: flag off → financial_ops_disabled
  PERFORM pg_temp.set_actor(owner_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order_for_appointment(%L::uuid, %L)',
      unit_b_id, appt_main_id
    ),
    'financial_ops_disabled'
  );

  ------------------------------------------------------------------
  -- With order (20-30)
  ------------------------------------------------------------------

  PERFORM pg_temp.set_actor(pro_a_id);
  result := public.open_service_order(
    unit_a_id, open_main_req, appt_main_id, NULL, NULL, NULL
  );
  order_main_id := (result->>'serviceOrderId')::uuid;
  version_v := (result->>'version')::bigint;
  IF order_main_id IS NULL OR result->>'status' IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION '20: open_service_order failed: %', result;
  END IF;

  -- 21-23: bridge returns same detail, items/events present, no paymentStatus
  detail := public.get_service_order(unit_a_id, order_main_id);
  bridge := public.get_service_order_for_appointment(unit_a_id, appt_main_id);
  IF bridge->>'appointmentId' IS DISTINCT FROM appt_main_id THEN
    RAISE EXCEPTION '21: bridge appointmentId mismatch: %', bridge;
  END IF;
  IF bridge->'serviceOrder' IS DISTINCT FROM detail THEN
    RAISE EXCEPTION '21: bridge serviceOrder must equal get_service_order';
  END IF;
  IF jsonb_typeof(bridge->'serviceOrder'->'items') IS DISTINCT FROM 'array'
     OR jsonb_array_length(bridge->'serviceOrder'->'items') < 1
  THEN
    RAISE EXCEPTION '22: bridge items missing: %', bridge;
  END IF;
  IF jsonb_typeof(bridge->'serviceOrder'->'events') IS DISTINCT FROM 'array'
     OR jsonb_array_length(bridge->'serviceOrder'->'events') < 1
  THEN
    RAISE EXCEPTION '22: bridge events missing: %', bridge;
  END IF;
  IF bridge::text ILIKE '%paymentStatus%'
     OR bridge::text ILIKE '%payment_status%'
  THEN
    RAISE EXCEPTION '23: bridge must not expose paymentStatus: %', bridge;
  END IF;

  -- Open second order for lock-protection assertions
  result := public.open_service_order(
    unit_a_id, open_locked_req, appt_locked_id, NULL, NULL, NULL
  );
  order_locked_id := (result->>'serviceOrderId')::uuid;
  IF order_locked_id IS NULL THEN
    RAISE EXCEPTION 'locked open failed: %', result;
  END IF;

  -- 24: direct complete → appointment_has_service_order
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.complete_business_appointment(%L::uuid, %L, %L::uuid)',
      unit_a_id, appt_locked_id, gen_random_uuid()
    ),
    'appointment_has_service_order'
  );
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET status = 'completed'
        WHERE id = %L
      $sql$,
      appt_locked_id
    ),
    'appointment_has_service_order'
  );

  -- 25: cancel
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.update_appointment_status_v2(%L, %L, NULL, %L)',
      appt_locked_id, 'cancelled', 'blocked by order'
    ),
    'appointment_has_service_order'
  );

  -- 26: no_show
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.mark_business_appointment_no_show(%L::uuid, %L, %L::uuid)',
      unit_a_id, appt_locked_id, gen_random_uuid()
    ),
    'appointment_has_service_order'
  );

  -- 27: reschedule (schedule fields)
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET date_time = now() + interval '10 days',
            ends_at = now() + interval '10 days 30 minutes'
        WHERE id = %L
      $sql$,
      appt_locked_id
    ),
    'appointment_has_service_order'
  );

  -- 28: change professional
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET professional_id = %L::uuid
        WHERE id = %L
      $sql$,
      pro_b_id, appt_locked_id
    ),
    'appointment_has_service_order'
  );

  -- 29: change service
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET service_id = %L
        WHERE id = %L
      $sql$,
      service_extra_id, appt_locked_id
    ),
    'appointment_has_service_order'
  );

  -- 30: change client
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET establishment_client_id = %L::uuid
        WHERE id = %L
      $sql$,
      client_b_id, appt_locked_id
    ),
    'appointment_has_service_order'
  );

  ------------------------------------------------------------------
  -- Authorized finish (31-37)
  ------------------------------------------------------------------

  SELECT version INTO version_v
  FROM public.service_orders WHERE id = order_main_id;

  -- 31: start
  result := public.start_service_order(
    unit_a_id, order_main_id, version_v, start_main_req
  );
  IF result->>'status' IS DISTINCT FROM 'in_service' THEN
    RAISE EXCEPTION '31: start failed: %', result;
  END IF;
  version_v := (result->>'version')::bigint;

  -- 32-35: finish with marker → appointment completed + events
  finish_expected_version := version_v;
  result := public.finish_service_order(
    unit_a_id, order_main_id, version_v, finish_main_req
  );
  IF result->>'status' IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION '32: finish status expected awaiting_payment, got %', result;
  END IF;

  SELECT status INTO appt_status
  FROM public.appointments WHERE id = appt_main_id;
  IF appt_status IS DISTINCT FROM 'completed' THEN
    RAISE EXCEPTION '33: appointment not completed after finish, got %', appt_status;
  END IF;

  SELECT count(*)::integer INTO completed_events
  FROM public.appointment_events
  WHERE appointment_id = appt_main_id
    AND event_type = 'completed';
  IF completed_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '34: expected one appointment_event completed, got %', completed_events;
  END IF;

  SELECT count(*)::integer INTO finished_events
  FROM public.service_order_events
  WHERE service_order_id = order_main_id
    AND event_type = 'finished';
  IF finished_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '35: expected one service_order_event finished, got %', finished_events;
  END IF;

  -- 36: marker cleared — later UPDATE still blocked
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET professional_id = %L::uuid
        WHERE id = %L
      $sql$,
      pro_b_id, appt_main_id
    ),
    'appointment_has_service_order'
  );
  -- Wrong/stale marker must not authorize another status flip on locked appt
  PERFORM set_config(
    'app.service_order_finish_order_id',
    order_main_id::text,
    true
  );
  PERFORM pg_temp.expect_error(
    format(
      $sql$
        UPDATE public.appointments
        SET status = 'completed'
        WHERE id = %L
      $sql$,
      appt_locked_id
    ),
    'appointment_has_service_order'
  );
  PERFORM set_config('app.service_order_finish_order_id', '', true);

  -- 37: finish replay — same receipt, no duplicate events
  replay := public.finish_service_order(
    unit_a_id, order_main_id, finish_expected_version, finish_main_req
  );
  IF replay IS DISTINCT FROM result THEN
    RAISE EXCEPTION '37: finish replay mismatch: % vs %', replay, result;
  END IF;
  SELECT count(*)::integer INTO completed_events
  FROM public.appointment_events
  WHERE appointment_id = appt_main_id
    AND event_type = 'completed';
  IF completed_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '37: replay duplicated appointment completed events: %', completed_events;
  END IF;
  SELECT count(*)::integer INTO finished_events
  FROM public.service_order_events
  WHERE service_order_id = order_main_id
    AND event_type = 'finished';
  IF finished_events IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION '37: replay duplicated finished events: %', finished_events;
  END IF;

  ------------------------------------------------------------------
  -- Bridge read_only / blocked (15-16) via real billing access modes
  ------------------------------------------------------------------

  -- 15: Force real read_only context (expired trial), keep financial_ops_enabled.
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
    RAISE EXCEPTION '15: expected read_only access_mode, got %', context_record.access_mode;
  END IF;

  bridge := public.get_service_order_for_appointment(unit_a_id, appt_main_id);
  IF bridge->>'appointmentId' IS DISTINCT FROM appt_main_id
     OR jsonb_typeof(bridge->'serviceOrder') IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION '15: read_only admin bridge read failed: %', bridge;
  END IF;

  PERFORM pg_temp.set_actor(pro_a_id);
  bridge := public.get_service_order_for_appointment(unit_a_id, appt_main_id);
  IF bridge->>'appointmentId' IS DISTINCT FROM appt_main_id THEN
    RAISE EXCEPTION '15: read_only pro bridge read failed: %', bridge;
  END IF;

  -- 16: blocked cannot read
  PERFORM pg_temp.clear_actor();
  PERFORM set_config(
    'cutsync.governance_status_reason',
    'Appointment service order blocked-mode validation',
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
    RAISE EXCEPTION '16: expected blocked empty capabilities, got % / %',
      context_record.access_mode, context_record.capabilities;
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_service_order_for_appointment(%L::uuid, %L)',
      unit_a_id, appt_main_id
    ),
    'forbidden'
  );

  ------------------------------------------------------------------
  -- Frontiers (38-44)
  ------------------------------------------------------------------

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
    RAISE EXCEPTION '38-44: payment/cash/commission/provider tables must not exist';
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'service_orders'
      AND column_name = 'payment_status'
  ) INTO payment_status_col;
  IF payment_status_col THEN
    RAISE EXCEPTION '38-44: service_orders.payment_status must not exist';
  END IF;

  RAISE NOTICE 'appointment_service_order_integration: OK';
END;
$test$;

ROLLBACK;
