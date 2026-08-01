-- Execute after 20260808000000_establishment_client_lifecycle.sql.
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

-- ---------------------------------------------------------------------------
-- Consent precedence parity
-- ---------------------------------------------------------------------------
-- These cases are the contract shared with resolveMergedConsentStatus in
-- packages/domain/src/establishment-client.ts.

DO $consent_parity$
DECLARE
  case_row record;
  produced text;
BEGIN
  FOR case_row IN
    SELECT *
    FROM (VALUES
      ('granted', 'granted', 'granted'),
      ('granted', 'unknown', 'unknown'),
      ('unknown', 'granted', 'unknown'),
      ('unknown', 'unknown', 'unknown'),
      ('granted', 'revoked', 'revoked'),
      ('revoked', 'granted', 'revoked'),
      ('unknown', 'revoked', 'revoked'),
      ('revoked', 'revoked', 'revoked')
    ) AS cases(left_status, right_status, expected)
  LOOP
    produced := public.resolve_merged_marketing_consent(
      case_row.left_status, case_row.right_status
    );
    IF produced IS DISTINCT FROM case_row.expected THEN
      RAISE EXCEPTION 'consent precedence drifted for % + %: expected %, got %',
        case_row.left_status, case_row.right_status, case_row.expected, produced;
    END IF;
  END LOOP;
END;
$consent_parity$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES
  (
    '95000000-0000-0000-0000-000000000001',
    'lifecycle-admin@example.test',
    '{"name":"Lifecycle Admin"}'::jsonb, now(), now(), now()
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    'lifecycle-professional@example.test',
    '{"name":"Lifecycle Professional"}'::jsonb, now(), now(), now()
  ),
  (
    '95000000-0000-0000-0000-000000000003',
    'lifecycle-booking-client@example.test',
    '{"name":"Lifecycle Booking Client"}'::jsonb, now(), now(), now()
  ),
  (
    '95000000-0000-0000-0000-000000000004',
    'lifecycle-refuser@example.test',
    '{"name":"Lifecycle Refuser"}'::jsonb, now(), now(), now()
  );

INSERT INTO public.establishments (
  id, name, slug, account_status, timezone, share_agendas
)
VALUES
  (
    '95100000-0000-0000-0000-000000000001',
    'Lifecycle Unit', 'lifecycle-unit', 'active', 'America/Sao_Paulo', true
  ),
  (
    '95100000-0000-0000-0000-000000000002',
    'Lifecycle Isolated Unit', 'lifecycle-isolated-unit', 'active',
    'America/Manaus', false
  );

INSERT INTO public.profiles (id, establishment_id, name, email, role)
VALUES
  (
    '95000000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    'Lifecycle Admin', 'lifecycle-admin@example.test', 'admin'
  ),
  (
    '95000000-0000-0000-0000-000000000002',
    '95100000-0000-0000-0000-000000000001',
    'Lifecycle Professional', 'lifecycle-professional@example.test', 'professional'
  ),
  (
    '95000000-0000-0000-0000-000000000003',
    NULL, 'Lifecycle Booking Client', 'lifecycle-booking-client@example.test', 'client'
  ),
  (
    '95000000-0000-0000-0000-000000000004',
    NULL, 'Lifecycle Refuser', 'lifecycle-refuser@example.test', 'client'
  )
ON CONFLICT (id) DO UPDATE
SET establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    deleted_at = NULL;

INSERT INTO public.memberships (
  id, profile_id, establishment_id, role, status, commission_rate, created_by
)
VALUES
  (
    '95200000-0000-0000-0000-000000000001',
    '95000000-0000-0000-0000-000000000001',
    '95100000-0000-0000-0000-000000000001',
    'admin', 'active', 0.50, '95000000-0000-0000-0000-000000000001'
  ),
  (
    '95200000-0000-0000-0000-000000000002',
    '95000000-0000-0000-0000-000000000002',
    '95100000-0000-0000-0000-000000000001',
    'professional', 'active', 0.40, '95000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.services (
  id, establishment_id, name, price, duration_minutes, is_active, sort_order
)
VALUES (
  'lifecycle-service', '95100000-0000-0000-0000-000000000001',
  'Lifecycle Service', 50, 30, true, 10
);

DO $test$
<<lifecycle>>
DECLARE
  admin_id constant uuid := '95000000-0000-0000-0000-000000000001';
  professional_id constant uuid := '95000000-0000-0000-0000-000000000002';
  booking_profile_id constant uuid := '95000000-0000-0000-0000-000000000003';
  refuser_profile_id constant uuid := '95000000-0000-0000-0000-000000000004';
  establishment_id constant uuid := '95100000-0000-0000-0000-000000000001';
  isolated_establishment_id constant uuid := '95100000-0000-0000-0000-000000000002';
  archived_client_id uuid;
  survivor_client_id uuid;
  duplicate_client_id uuid;
  ensured_client_id uuid;
  repeated_client_id uuid;
  refuser_client_id uuid;
  refuser_link_id uuid;
  context_record record;
  payload jsonb;
  client_row public.establishment_clients%ROWTYPE;
BEGIN
  PERFORM pg_temp.set_actor(admin_id);

  -- -------------------------------------------------------------------------
  -- Capabilities
  -- -------------------------------------------------------------------------

  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = lifecycle.establishment_id;
  IF NOT ('export_clients' = ANY (context_record.capabilities))
    OR NOT ('manage_data_imports' = ANY (context_record.capabilities))
  THEN RAISE EXCEPTION 'admin did not receive the new client capabilities'; END IF;

  PERFORM pg_temp.set_actor(professional_id);
  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = lifecycle.establishment_id;
  IF 'export_clients' = ANY (context_record.capabilities)
    OR 'manage_data_imports' = ANY (context_record.capabilities)
  THEN RAISE EXCEPTION 'professional received capabilities reserved for owner and admin'; END IF;

  PERFORM pg_temp.expect_error(
    format('SELECT public.export_establishment_clients(%L)', establishment_id),
    'forbidden'
  );

  -- -------------------------------------------------------------------------
  -- Archiving
  -- -------------------------------------------------------------------------

  PERFORM pg_temp.set_actor(admin_id);
  payload := public.create_establishment_client(
    establishment_id, 'Archivable Client',
    '95300000-0000-0000-0000-000000000001',
    '(11) 91111-1111'
  );
  archived_client_id := (payload->>'establishmentClientId')::uuid;

  INSERT INTO public.appointments (
    id, establishment_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  ) VALUES (
    'lifecycle-future', establishment_id, 'Archivable Client', archived_client_id,
    professional_id, 'lifecycle-service', now() + interval '5 days', 30,
    now() + interval '5 days 30 minutes', 'confirmed'
  );

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.archive_establishment_client(%L, %L, %L)',
      establishment_id, archived_client_id, '95300000-0000-0000-0000-000000000002'
    ),
    'establishment_client_has_future_appointments'
  );

  UPDATE public.appointments SET status = 'cancelled' WHERE id = 'lifecycle-future';

  payload := public.archive_establishment_client(
    establishment_id, archived_client_id, '95300000-0000-0000-0000-000000000003'
  );
  IF payload->>'status' <> 'archived' THEN
    RAISE EXCEPTION 'archive did not report the archived state';
  END IF;

  SELECT * INTO client_row FROM public.establishment_clients WHERE id = archived_client_id;
  IF client_row.status <> 'archived' OR client_row.archived_at IS NULL THEN
    RAISE EXCEPTION 'archived client is missing its lifecycle stamp';
  END IF;

  -- Archiving twice must not be a second event.
  payload := public.archive_establishment_client(
    establishment_id, archived_client_id, '95300000-0000-0000-0000-000000000004'
  );
  IF payload->>'status' <> 'archived' THEN
    RAISE EXCEPTION 'archiving an archived client stopped being idempotent';
  END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.search_establishment_clients(establishment_id, 'Archivable')
    ) AS item
    WHERE (item->>'id')::uuid = archived_client_id
  ) THEN RAISE EXCEPTION 'archived client stayed in the default directory'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.search_establishment_clients(establishment_id, 'Archivable', 50, 0, true)
    ) AS item
    WHERE (item->>'id')::uuid = archived_client_id
      AND item->>'status' = 'archived'
  ) THEN RAISE EXCEPTION 'archived client did not reappear under the explicit filter'; END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.update_establishment_client(%L, %L, %L, %L)',
      establishment_id, archived_client_id,
      '95300000-0000-0000-0000-000000000005', 'Nome Novo'
    ),
    'establishment_client_archived'
  );

  payload := public.restore_establishment_client(
    establishment_id, archived_client_id, '95300000-0000-0000-0000-000000000006'
  );
  SELECT * INTO client_row FROM public.establishment_clients WHERE id = archived_client_id;
  IF client_row.status <> 'active' OR client_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'restore did not clear the archived state';
  END IF;

  -- Another unit must not reach this carteira.
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.archive_establishment_client(%L, %L, %L)',
      isolated_establishment_id, archived_client_id,
      '95300000-0000-0000-0000-000000000007'
    ),
    'forbidden'
  );

  -- -------------------------------------------------------------------------
  -- Tolerant search
  -- -------------------------------------------------------------------------

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.search_establishment_clients(establishment_id, '11911111111')
    ) AS item
    WHERE (item->>'id')::uuid = archived_client_id
  ) THEN RAISE EXCEPTION 'search did not tolerate an unformatted phone'; END IF;

  -- -------------------------------------------------------------------------
  -- Merge carrying consent and activity
  -- -------------------------------------------------------------------------

  payload := public.create_establishment_client(
    establishment_id, 'Survivor Client', '95300000-0000-0000-0000-000000000010'
  );
  survivor_client_id := (payload->>'establishmentClientId')::uuid;
  payload := public.create_establishment_client(
    establishment_id, 'Duplicate Client', '95300000-0000-0000-0000-000000000011'
  );
  duplicate_client_id := (payload->>'establishmentClientId')::uuid;

  PERFORM public.update_establishment_client(
    establishment_id, survivor_client_id, '95300000-0000-0000-0000-000000000012',
    NULL, NULL, NULL, NULL::text[], NULL, 'granted'
  );
  PERFORM public.update_establishment_client(
    establishment_id, duplicate_client_id, '95300000-0000-0000-0000-000000000013',
    NULL, NULL, NULL, NULL::text[], NULL, 'revoked'
  );

  SELECT * INTO client_row FROM public.establishment_clients WHERE id = survivor_client_id;
  IF client_row.marketing_consent_status <> 'granted'
    OR client_row.marketing_consent_at IS NULL
  THEN RAISE EXCEPTION 'consent decision was not stamped with a date'; END IF;

  INSERT INTO public.appointments (
    id, establishment_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  ) VALUES
    (
      'lifecycle-duplicate-old', establishment_id, 'Duplicate Client',
      duplicate_client_id, professional_id, 'lifecycle-service',
      now() - interval '40 days', 30, now() - interval '40 days' + interval '30 minutes',
      'completed'
    ),
    (
      'lifecycle-survivor-recent', establishment_id, 'Survivor Client',
      survivor_client_id, professional_id, 'lifecycle-service',
      now() - interval '2 days', 30, now() - interval '2 days' + interval '30 minutes',
      'completed'
    );

  PERFORM public.merge_establishment_clients(
    establishment_id, survivor_client_id, duplicate_client_id,
    '95300000-0000-0000-0000-000000000014', 'Mesma pessoa'
  );

  SELECT * INTO client_row FROM public.establishment_clients WHERE id = survivor_client_id;
  IF client_row.marketing_consent_status <> 'revoked' THEN
    RAISE EXCEPTION 'merge did not keep the most restrictive consent, got %',
      client_row.marketing_consent_status;
  END IF;
  IF client_row.marketing_consent_at IS NULL THEN
    RAISE EXCEPTION 'a revoked consent must keep the date of the revocation';
  END IF;
  IF client_row.first_appointment_at IS NULL
    OR client_row.first_appointment_at > now() - interval '39 days'
  THEN RAISE EXCEPTION 'merge lost the oldest appointment of the duplicate'; END IF;
  IF client_row.last_appointment_at IS NULL
    OR client_row.last_appointment_at < now() - interval '3 days'
  THEN RAISE EXCEPTION 'merge lost the most recent appointment of the survivor'; END IF;

  IF (
    SELECT count(*) FROM public.appointments
    WHERE establishment_client_id = duplicate_client_id
  ) <> 0 THEN RAISE EXCEPTION 'merge left appointments pointing at the duplicate'; END IF;

  SELECT * INTO client_row FROM public.establishment_clients WHERE id = duplicate_client_id;
  IF client_row.status <> 'merged' OR client_row.archived_at IS NOT NULL THEN
    RAISE EXCEPTION 'merged duplicate kept an inconsistent lifecycle state';
  END IF;

  -- -------------------------------------------------------------------------
  -- Resolving a local client from a profile
  -- -------------------------------------------------------------------------

  ensured_client_id := public.ensure_establishment_client_for_profile(
    establishment_id, booking_profile_id
  );
  IF ensured_client_id IS NULL THEN
    RAISE EXCEPTION 'booking profile did not produce a local client';
  END IF;

  SELECT * INTO client_row FROM public.establishment_clients WHERE id = ensured_client_id;
  IF client_row.source <> 'client_booking' THEN
    RAISE EXCEPTION 'local client from a booking must record its origin, got %',
      client_row.source;
  END IF;
  IF client_row.display_name <> 'Lifecycle Booking Client' THEN
    RAISE EXCEPTION 'local client did not take the profile name';
  END IF;
  IF client_row.email <> 'lifecycle-booking-client@example.test' THEN
    RAISE EXCEPTION 'verified email was not copied into the carteira';
  END IF;
  IF client_row.marketing_consent_status <> 'unknown' THEN
    RAISE EXCEPTION 'booking must not imply marketing consent';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.establishment_client_links
    WHERE establishment_client_id = ensured_client_id
      AND profile_id = booking_profile_id
      AND status = 'confirmed'
      AND match_kind = 'manual'
  ) THEN RAISE EXCEPTION 'first-party booking did not create a confirmed link'; END IF;

  repeated_client_id := public.ensure_establishment_client_for_profile(
    establishment_id, booking_profile_id
  );
  IF repeated_client_id IS DISTINCT FROM ensured_client_id THEN
    RAISE EXCEPTION 'resolving the same profile twice created a second carteira row';
  END IF;
  IF (
    SELECT count(*) FROM public.establishment_clients AS candidate
    WHERE candidate.establishment_id = lifecycle.establishment_id
      AND candidate.display_name = 'Lifecycle Booking Client'
  ) <> 1 THEN RAISE EXCEPTION 'profile resolution is not idempotent'; END IF;

  -- A refusal must not be routed around by creating a fresh row.
  payload := public.create_establishment_client(
    establishment_id, 'Lifecycle Refuser', '95300000-0000-0000-0000-000000000020',
    NULL, 'lifecycle-refuser@example.test'
  );
  refuser_client_id := (payload->>'establishmentClientId')::uuid;
  SELECT id INTO refuser_link_id FROM public.establishment_client_links
  WHERE establishment_client_id = refuser_client_id;
  IF refuser_link_id IS NULL THEN
    RAISE EXCEPTION 'verified email did not queue an identity request';
  END IF;

  PERFORM pg_temp.set_actor(refuser_profile_id);
  PERFORM public.reject_establishment_client_link(
    refuser_link_id, '95300000-0000-0000-0000-000000000021'
  );
  PERFORM pg_temp.set_actor(admin_id);

  IF public.ensure_establishment_client_for_profile(
    establishment_id, refuser_profile_id
  ) IS NOT NULL THEN
    RAISE EXCEPTION 'a rejected identity request was overridden by a new local client';
  END IF;

  -- -------------------------------------------------------------------------
  -- Audited export
  -- -------------------------------------------------------------------------

  payload := public.export_establishment_clients(establishment_id, 100, 0, true);
  IF (payload->>'count')::integer < 3 THEN
    RAISE EXCEPTION 'export returned fewer clients than the carteira holds: %', payload;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload->'clients') AS item
    WHERE item->>'displayName' = 'Survivor Client'
      AND item ? 'marketingConsentStatus'
  ) THEN RAISE EXCEPTION 'export omitted consent for a known client'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload->'clients') AS item
    WHERE item->>'status' = 'merged'
  ) THEN RAISE EXCEPTION 'export leaked a merged row'; END IF;

  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = lifecycle.establishment_id
      AND audit.action = 'business.client.exported'
      AND (audit.metadata->>'rows_returned')::integer = (payload->>'count')::integer
  ) <> 1 THEN RAISE EXCEPTION 'export did not leave exactly one audit trail'; END IF;

  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = lifecycle.establishment_id
      AND audit.action IN ('business.client.archived', 'business.client.restored')
  ) <> 2 THEN RAISE EXCEPTION 'lifecycle changes were not audited exactly once each'; END IF;
END;
$test$;

-- The resolution helper writes to the carteira without a capability check, so
-- it must stay unreachable from the API roles.
DO $exposure$
BEGIN
  IF has_function_privilege(
    'authenticated',
    'public.ensure_establishment_client_for_profile(uuid, uuid, text)',
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.ensure_establishment_client_for_profile(uuid, uuid, text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'the profile resolution helper is exposed as an RPC';
  END IF;
END;
$exposure$;

SELECT 'establishment client lifecycle matrix passed' AS outcome;

ROLLBACK;
