-- Execute after 20260809000000_establishment_client_appointment_link.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

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
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected %, got %', expected_fragment, SQLERRM;
  END IF;
END;
$$;

INSERT INTO auth.users (
  id, email, phone, phone_confirmed_at, raw_user_meta_data,
  email_confirmed_at, created_at, updated_at
)
VALUES
  (
    '94000000-0000-0000-0000-000000000001',
    'link-admin@example.test', NULL, NULL,
    '{"name":"Link Admin"}'::jsonb, now(), now(), now()
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    'link-professional@example.test', NULL, NULL,
    '{"name":"Link Professional"}'::jsonb, now(), now(), now()
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    'link-client-a@example.test', '+5511999990001', now(),
    '{"name":"Link Client A"}'::jsonb, now(), now(), now()
  ),
  (
    '94000000-0000-0000-0000-000000000004',
    'link-client-b@example.test', '+5511999990002', now(),
    '{"name":"Link Client B"}'::jsonb, now(), now(), now()
  ),
  (
    '94000000-0000-0000-0000-000000000005',
    'link-refuser@example.test', NULL, NULL,
    '{"name":"Link Refuser"}'::jsonb, now(), now(), now()
  );

INSERT INTO public.establishments (
  id, name, slug, account_status, timezone, share_agendas, opening_hours,
  instant_booking_enabled
)
VALUES
  (
    '94100000-0000-0000-0000-000000000001',
    'Link Unit A', 'link-unit-a', 'active', 'America/Sao_Paulo', true,
    '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"isOpen":true,"open":"08:00","close":"20:00"}]',
    true
  ),
  (
    '94100000-0000-0000-0000-000000000002',
    'Link Unit B', 'link-unit-b', 'active', 'America/Sao_Paulo', false,
    '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"isOpen":true,"open":"08:00","close":"20:00"}]',
    true
  );

INSERT INTO public.profiles (id, establishment_id, name, email, role, work_hours)
VALUES
  (
    '94000000-0000-0000-0000-000000000001',
    '94100000-0000-0000-0000-000000000001',
    'Link Admin', 'link-admin@example.test', 'admin', NULL
  ),
  (
    '94000000-0000-0000-0000-000000000002',
    '94100000-0000-0000-0000-000000000001',
    'Link Professional', 'link-professional@example.test', 'professional',
    '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"isOpen":true,"open":"08:00","close":"20:00"}]'
  ),
  (
    '94000000-0000-0000-0000-000000000003',
    NULL, 'Link Client A', 'link-client-a@example.test', 'client', NULL
  ),
  (
    '94000000-0000-0000-0000-000000000004',
    NULL, 'Link Client B', 'link-client-b@example.test', 'client', NULL
  ),
  (
    '94000000-0000-0000-0000-000000000005',
    NULL, 'Link Refuser', 'link-refuser@example.test', 'client', NULL
  )
ON CONFLICT (id) DO UPDATE
SET establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    work_hours = EXCLUDED.work_hours,
    deleted_at = NULL;

INSERT INTO public.memberships (
  id, profile_id, establishment_id, role, status, commission_rate, created_by
)
VALUES
  (
    '94200000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000001',
    '94100000-0000-0000-0000-000000000001',
    'admin', 'active', 0.50, '94000000-0000-0000-0000-000000000001'
  ),
  (
    '94200000-0000-0000-0000-000000000002',
    '94000000-0000-0000-0000-000000000002',
    '94100000-0000-0000-0000-000000000001',
    'professional', 'active', 0.40, '94000000-0000-0000-0000-000000000001'
  ),
  (
    '94200000-0000-0000-0000-000000000003',
    '94000000-0000-0000-0000-000000000002',
    '94100000-0000-0000-0000-000000000002',
    'professional', 'active', 0.40, '94000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.services (
  id, establishment_id, name, price, duration_minutes, is_active, sort_order
)
VALUES
  (
    'link-service-a', '94100000-0000-0000-0000-000000000001',
    'Link Service A', 50, 30, true, 10
  ),
  (
    'link-service-b', '94100000-0000-0000-0000-000000000002',
    'Link Service B', 50, 30, true, 10
  );

INSERT INTO public.professional_services (
  establishment_id, professional_id, service_id, price, duration_minutes, is_active
)
VALUES
  (
    '94100000-0000-0000-0000-000000000001',
    '94000000-0000-0000-0000-000000000002',
    'link-service-a', 50, 30, true
  ),
  (
    '94100000-0000-0000-0000-000000000002',
    '94000000-0000-0000-0000-000000000002',
    'link-service-b', 50, 30, true
  );

DO $test$
<<appointment_link>>
DECLARE
  admin_id constant uuid := '94000000-0000-0000-0000-000000000001';
  professional_id constant uuid := '94000000-0000-0000-0000-000000000002';
  client_a_id constant uuid := '94000000-0000-0000-0000-000000000003';
  client_b_id constant uuid := '94000000-0000-0000-0000-000000000004';
  refuser_id constant uuid := '94000000-0000-0000-0000-000000000005';
  unit_a constant uuid := '94100000-0000-0000-0000-000000000001';
  unit_b constant uuid := '94100000-0000-0000-0000-000000000002';
  target_date date := (now() AT TIME ZONE 'America/Sao_Paulo')::date + 3;
  first_slot timestamptz;
  second_slot timestamptz;
  unit_b_slot timestamptz;
  booking record;
  appointment_row public.appointments%ROWTYPE;
  client_row public.establishment_clients%ROWTYPE;
  client_a_local_id uuid;
  client_b_local_id uuid;
  unit_b_local_id uuid;
  refuser_client_id uuid;
  refuser_link_id uuid;
  walk_in_result jsonb;
  walk_in_client_id uuid;
  backfill_page jsonb;
  name_only_id text := 'link-name-only-appointment';
  historical_id text := 'link-historical-appointment';
BEGIN
  -- -------------------------------------------------------------------------
  -- Authenticated client booking creates and links a local CRM row
  -- -------------------------------------------------------------------------

  SELECT starts_at INTO first_slot
  FROM public.get_available_slots(
    unit_a, professional_id, 'link-service-a', target_date, NULL
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;
  IF first_slot IS NULL THEN
    RAISE EXCEPTION 'no available slot in unit A for the booking test';
  END IF;

  PERFORM pg_temp.set_actor(client_a_id);
  SELECT * INTO booking
  FROM public.create_client_appointment(
    unit_a, professional_id, 'link-service-a', first_slot
  );
  IF booking.appointment_id IS NULL THEN
    RAISE EXCEPTION 'client booking did not return an appointment id';
  END IF;

  SELECT * INTO appointment_row
  FROM public.appointments WHERE id = booking.appointment_id;
  IF appointment_row.establishment_client_id IS NULL THEN
    RAISE EXCEPTION 'authenticated booking left establishment_client_id null';
  END IF;
  IF appointment_row.client_id <> client_a_id
    OR appointment_row.client_name <> 'Link Client A'
  THEN RAISE EXCEPTION 'booking lost the authenticated client snapshot'; END IF;

  client_a_local_id := appointment_row.establishment_client_id;
  SELECT * INTO client_row FROM public.establishment_clients WHERE id = client_a_local_id;
  IF client_row.source <> 'client_booking'
    OR client_row.establishment_id <> unit_a
    OR client_row.marketing_consent_status <> 'unknown'
  THEN RAISE EXCEPTION 'local client from booking has the wrong origin or consent'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.establishment_client_links
    WHERE establishment_client_id = client_a_local_id
      AND profile_id = client_a_id
      AND status = 'confirmed'
  ) THEN RAISE EXCEPTION 'booking did not confirm the first-party link'; END IF;

  -- Booking again reuses the same local client.
  SELECT starts_at INTO second_slot
  FROM public.get_available_slots(
    unit_a, professional_id, 'link-service-a', target_date, NULL
  )
  WHERE available AND starts_at > first_slot
  ORDER BY starts_at
  LIMIT 1;
  SELECT * INTO booking
  FROM public.create_client_appointment(
    unit_a, professional_id, 'link-service-a', second_slot
  );
  IF (
    SELECT establishment_client_id FROM public.appointments
    WHERE id = booking.appointment_id
  ) IS DISTINCT FROM client_a_local_id THEN
    RAISE EXCEPTION 'second booking created a duplicate local client';
  END IF;
  IF (
    SELECT count(*) FROM public.establishment_clients AS candidate
    WHERE candidate.establishment_id = unit_a
      AND candidate.display_name = 'Link Client A'
  ) <> 1 THEN RAISE EXCEPTION 'client A is not unique in unit A'; END IF;

  -- -------------------------------------------------------------------------
  -- Shared phone does not force a merge across profiles
  -- -------------------------------------------------------------------------

  PERFORM pg_temp.set_actor(client_b_id);
  SELECT starts_at INTO first_slot
  FROM public.get_available_slots(
    unit_a, professional_id, 'link-service-a', target_date + 1, NULL
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;
  SELECT * INTO booking
  FROM public.create_client_appointment(
    unit_a, professional_id, 'link-service-a', first_slot
  );
  SELECT * INTO appointment_row
  FROM public.appointments WHERE id = booking.appointment_id;
  client_b_local_id := appointment_row.establishment_client_id;
  IF client_b_local_id IS NULL OR client_b_local_id = client_a_local_id THEN
    RAISE EXCEPTION 'shared phone incorrectly reused or skipped a local client';
  END IF;
  SELECT * INTO client_row FROM public.establishment_clients WHERE id = client_b_local_id;
  IF client_row.phone IS NULL AND client_row.normalized_phone IS NULL THEN
    RAISE EXCEPTION 'verified phone was not copied into client B carteira';
  END IF;

  -- auth.users forbids two accounts with the same phone, so the shared-contact
  -- case is reproduced on the carteira itself: the directory must keep both rows.
  UPDATE public.establishment_clients
  SET phone = '(11) 99999-0001'
  WHERE id IN (client_a_local_id, client_b_local_id);
  IF (
    SELECT count(*) FROM public.establishment_clients AS candidate
    WHERE candidate.establishment_id = unit_a
      AND candidate.normalized_phone IS NOT NULL
      AND candidate.id IN (client_a_local_id, client_b_local_id)
  ) <> 2 THEN
    RAISE EXCEPTION 'shared phone collapsed the two local clients into one row';
  END IF;

  -- -------------------------------------------------------------------------
  -- Cross-establishment isolation
  -- -------------------------------------------------------------------------

  SELECT starts_at INTO unit_b_slot
  FROM public.get_available_slots(
    unit_b, professional_id, 'link-service-b', target_date, NULL
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;
  PERFORM pg_temp.set_actor(client_a_id);
  SELECT * INTO booking
  FROM public.create_client_appointment(
    unit_b, professional_id, 'link-service-b', unit_b_slot
  );
  SELECT establishment_client_id INTO unit_b_local_id
  FROM public.appointments WHERE id = booking.appointment_id;
  IF unit_b_local_id IS NULL OR unit_b_local_id = client_a_local_id THEN
    RAISE EXCEPTION 'unit B reused unit A local client';
  END IF;
  IF (
    SELECT establishment_id FROM public.establishment_clients WHERE id = unit_b_local_id
  ) <> unit_b THEN
    RAISE EXCEPTION 'unit B appointment pointed at another unit carteira';
  END IF;

  -- -------------------------------------------------------------------------
  -- Rejected identity request never blocks the appointment
  -- -------------------------------------------------------------------------

  PERFORM pg_temp.set_actor(admin_id);
  walk_in_result := public.create_establishment_client(
    unit_a, 'Link Refuser', '94300000-0000-0000-0000-000000000001',
    NULL, 'link-refuser@example.test'
  );
  refuser_client_id := (walk_in_result->>'establishmentClientId')::uuid;
  SELECT id INTO refuser_link_id
  FROM public.establishment_client_links
  WHERE establishment_client_id = refuser_client_id;
  IF refuser_link_id IS NULL THEN
    RAISE EXCEPTION 'verified email did not queue a link for the refuser';
  END IF;
  PERFORM pg_temp.set_actor(refuser_id);
  PERFORM public.reject_establishment_client_link(
    refuser_link_id, '94300000-0000-0000-0000-000000000002'
  );

  SELECT starts_at INTO first_slot
  FROM public.get_available_slots(
    unit_a, professional_id, 'link-service-a', target_date + 2, NULL
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;
  SELECT * INTO booking
  FROM public.create_client_appointment(
    unit_a, professional_id, 'link-service-a', first_slot
  );
  SELECT * INTO appointment_row
  FROM public.appointments WHERE id = booking.appointment_id;
  IF appointment_row.establishment_client_id IS NOT NULL THEN
    RAISE EXCEPTION 'rejected identity was overridden by a new local client';
  END IF;
  IF appointment_row.client_id <> refuser_id THEN
    RAISE EXCEPTION 'rejected booking lost the authenticated profile';
  END IF;
  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.action = 'client.establishment_client.unresolved_for_appointment'
      AND audit.establishment_id = unit_a
      AND audit.target_profile_id = refuser_id
      AND audit.metadata->>'appointment_id' = booking.appointment_id
  ) <> 1 THEN
    RAISE EXCEPTION 'unresolved booking was not audited exactly once';
  END IF;

  -- -------------------------------------------------------------------------
  -- Walk-in source
  -- -------------------------------------------------------------------------

  PERFORM pg_temp.set_actor(admin_id);
  SELECT starts_at INTO first_slot
  FROM public.get_available_slots(
    unit_a, professional_id, 'link-service-a', target_date + 4, NULL
  )
  WHERE available
  ORDER BY starts_at
  LIMIT 1;
  walk_in_result := public.create_business_appointment(
    unit_a, professional_id, 'link-service-a', first_slot,
    '94300000-0000-0000-0000-000000000010',
    NULL, 'Balcão Sem Conta', '(11) 98888-7777', NULL, 'Nota de balcão'
  );
  walk_in_client_id := (walk_in_result->>'establishmentClientId')::uuid;
  SELECT * INTO client_row FROM public.establishment_clients WHERE id = walk_in_client_id;
  IF client_row.source <> 'walk_in' THEN
    RAISE EXCEPTION 'walk-in client was recorded as %, expected walk_in', client_row.source;
  END IF;

  -- -------------------------------------------------------------------------
  -- Backfill: profile-linked yes, name-only no; re-run is a no-op
  -- -------------------------------------------------------------------------

  INSERT INTO public.appointments (
    id, establishment_id, client_id, client_name, professional_id, service_id,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    historical_id, unit_a, client_a_id, 'Link Client A', professional_id,
    'link-service-a', now() - interval '20 days', 30,
    now() - interval '20 days' + interval '30 minutes', 'completed'
  );
  INSERT INTO public.appointments (
    id, establishment_id, client_name, professional_id, service_id,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    name_only_id, unit_a, 'Maria Silva', professional_id, 'link-service-a',
    now() - interval '10 days', 30,
    now() - interval '10 days' + interval '30 minutes', 'completed'
  );

  -- Clear the actor so the service-role-style backfill is not filtered by
  -- mobile billing guards that key off the JWT subject.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role', 'aal', 'aal2')::text,
    true
  );

  backfill_page := public.backfill_establishment_clients_from_appointments(50);
  IF COALESCE((backfill_page->>'appointmentsUpdated')::integer, 0) < 1 THEN
    RAISE EXCEPTION 'backfill did not update the historical profile appointment: %',
      backfill_page;
  END IF;
  IF (
    SELECT establishment_client_id FROM public.appointments WHERE id = historical_id
  ) IS DISTINCT FROM client_a_local_id THEN
    RAISE EXCEPTION 'backfill did not reuse the existing local client for client A';
  END IF;
  IF (
    SELECT establishment_client_id FROM public.appointments WHERE id = name_only_id
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'name-only appointment was incorrectly linked by backfill';
  END IF;

  -- A rejected identity leaves a permanent unresolved candidate. Re-running
  -- must not create a link for it or mutate already-linked rows.
  backfill_page := public.backfill_establishment_clients_from_appointments(50);
  IF COALESCE((backfill_page->>'pairsLinked')::integer, 0) <> 0
    OR COALESCE((backfill_page->>'appointmentsUpdated')::integer, 0) <> 0
  THEN
    RAISE EXCEPTION 'second backfill linked or updated rows: %', backfill_page;
  END IF;

  -- Historical appointment kept its original profile and name.
  SELECT * INTO appointment_row FROM public.appointments WHERE id = historical_id;
  IF appointment_row.client_id <> client_a_id
    OR appointment_row.client_name <> 'Link Client A'
  THEN RAISE EXCEPTION 'backfill mutated client_id or client_name'; END IF;
END;
$test$;

DO $exposure$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.backfill_establishment_clients_from_appointments(integer)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.backfill_establishment_clients_from_appointments(integer)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'backfill helper is exposed as an RPC';
  END IF;
END;
$exposure$;

SELECT 'establishment client appointment link matrix passed' AS outcome;

ROLLBACK;
