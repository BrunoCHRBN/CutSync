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
  PERFORM set_config('request.jwt.claim.role', 'service_role', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
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
  admin_id uuid := gen_random_uuid();
  pro_a_id uuid := gen_random_uuid();
  pro_b_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  local_client_id uuid := gen_random_uuid();
  service_id text := 'reassign-service-' || substr(gen_random_uuid()::text, 1, 8);
  linked_appointment_id text := 'reassign-linked-' || substr(gen_random_uuid()::text, 1, 8);
  walk_in_appointment_id text := 'reassign-walkin-' || substr(gen_random_uuid()::text, 1, 8);
  batch_result jsonb;
  current_professional_id uuid;
  flag_value boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'establishments'
      AND column_name = 'appointment_reassignment_enabled'
      AND is_nullable = 'NO'
      AND column_default = 'false'
  ) THEN
    RAISE EXCEPTION 'appointment_reassignment_enabled default/constraint missing';
  END IF;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (admin_id, 'reassign-admin@example.test', now()),
    (pro_a_id, 'reassign-pro-a@example.test', now()),
    (pro_b_id, 'reassign-pro-b@example.test', now());

  PERFORM pg_temp.clear_actor();
  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  ) VALUES (
    unit_id,
    'Reassignment Unit',
    'reassignment-unit-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    true
  );

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, created_by
  ) VALUES
    (admin_id, unit_id, 'admin', 'active', admin_id),
    (pro_a_id, unit_id, 'professional', 'active', admin_id),
    (pro_b_id, unit_id, 'professional', 'active', admin_id);

  INSERT INTO public.establishment_clients(
    id, establishment_id, display_name, created_by, updated_by
  ) VALUES (
    local_client_id, unit_id, 'Containment Fixture', admin_id, admin_id
  );

  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active, sort_order
  ) VALUES (
    service_id, unit_id, 'Containment Service', 50.00, 30, true, 10
  );

  INSERT INTO public.appointments(
    id, establishment_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  ) VALUES
    (
      linked_appointment_id, unit_id, 'Linked Fixture', local_client_id,
      pro_a_id, service_id,
      now() + interval '2 days', 30, now() + interval '2 days 30 minutes',
      'confirmed'
    ),
    (
      walk_in_appointment_id, unit_id, 'Unlinked Fixture', NULL,
      pro_a_id, service_id,
      now() + interval '3 days', 30, now() + interval '3 days 30 minutes',
      'confirmed'
    );

  PERFORM pg_temp.set_actor(admin_id);
  PERFORM pg_temp.expect_error(
    format(
      'UPDATE public.establishments SET appointment_reassignment_enabled = true WHERE id = %L::uuid',
      unit_id
    ),
    'appointment_reassignment_flag_write_forbidden'
  );

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.reschedule_appointment(%L, now() + interval ''2 days'', %L::uuid, %L)',
      linked_appointment_id,
      pro_b_id,
      service_id
    ),
    'appointment_reassignment_requires_workflow'
  );

  SELECT public.transfer_professional_absence(
    pro_a_id,
    now(),
    now() + interval '4 days',
    jsonb_build_array(jsonb_build_object(
      'appointment_id', linked_appointment_id,
      'action', 'transfer',
      'to_professional_id', pro_b_id
    ))
  ) INTO batch_result;
  IF batch_result #>> '{results,0,error}' NOT LIKE '%appointment_reassignment_requires_workflow%' THEN
    RAISE EXCEPTION 'absence transfer did not return the containment error: %', batch_result;
  END IF;

  SELECT professional_id INTO current_professional_id
  FROM public.appointments
  WHERE id = linked_appointment_id;
  IF current_professional_id IS DISTINCT FROM pro_a_id THEN
    RAISE EXCEPTION 'linked appointment changed professional despite containment';
  END IF;

  PERFORM pg_temp.set_actor(pro_a_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.transfer_unlinked_walk_in_professional(%L, %L::uuid, %L, %L::uuid)',
      walk_in_appointment_id,
      pro_b_id,
      'walk_in_correction',
      gen_random_uuid()
    ),
    'forbidden'
  );
  -- professional cannot correct an unlinked walk-in

  PERFORM pg_temp.clear_actor();
  UPDATE public.establishments
  SET appointment_reassignment_enabled = true
  WHERE id = unit_id;
  SELECT appointment_reassignment_enabled INTO flag_value
  FROM public.establishments WHERE id = unit_id;
  IF flag_value IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'service role could not update the protected flag';
  END IF;
END;
$test$;

ROLLBACK;
