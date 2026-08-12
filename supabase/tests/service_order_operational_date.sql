BEGIN;

\set ON_ERROR_STOP on

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
  actor_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  service_id text := 'operational-date-' || substr(gen_random_uuid()::text, 1, 8);
  future_appointment_id text := 'future-' || substr(gen_random_uuid()::text, 1, 8);
  today_appointment_id text := 'today-' || substr(gen_random_uuid()::text, 1, 8);
  order_id uuid;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (actor_id, 'service-order-date@example.test', now());

  INSERT INTO public.establishments(id, name, slug, timezone, account_status)
  VALUES (
    unit_id, 'Operational Date Unit',
    'operational-date-' || substr(unit_id::text, 1, 8),
    'America/Sao_Paulo', 'active'
  );
  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES (actor_id, unit_id, 'admin', 'admin', 'active', actor_id);
  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (service_id, unit_id, 'Operational Date Service', 50, 30, true);

  INSERT INTO public.appointments(
    id, establishment_id, client_name, professional_id, service_id,
    date_time, ends_at, duration_minutes, status, price_charged
  ) VALUES
    (
      future_appointment_id, unit_id, 'Future Client', actor_id, service_id,
      now() + interval '1 day', now() + interval '1 day 30 minutes',
      30, 'confirmed', 50
    ),
    (
      today_appointment_id, unit_id, 'Today Client', actor_id, service_id,
      now() + interval '30 minutes', now() + interval '60 minutes',
      30, 'confirmed', 50
    );

  PERFORM pg_temp.expect_error(
    format(
      $sql$
        INSERT INTO public.service_orders(
          establishment_id, appointment_id, professional_id,
          created_by, updated_by
        ) VALUES (%L::uuid, %L, %L::uuid, %L::uuid, %L::uuid)
      $sql$,
      unit_id, future_appointment_id, actor_id, actor_id, actor_id
    ),
    'service_order_appointment_not_operational_today'
  );

  INSERT INTO public.service_orders(
    establishment_id, appointment_id, professional_id,
    created_by, updated_by
  ) VALUES (
    unit_id, today_appointment_id, actor_id, actor_id, actor_id
  ) RETURNING id INTO order_id;

  UPDATE public.service_orders
  SET status = 'in_service', started_at = now(), started_by = actor_id
  WHERE id = order_id;
  IF NOT EXISTS (
    SELECT 1 FROM public.service_orders
    WHERE id = order_id AND status = 'in_service'
  ) THEN
    RAISE EXCEPTION 'FAIL: current local date service order was blocked';
  END IF;
END;
$test$;

ROLLBACK;
