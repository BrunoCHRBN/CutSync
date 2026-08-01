-- Execute after 20260807000000_establishment_client_enrichment.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

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
-- Phone and email normalization parity
-- ---------------------------------------------------------------------------
-- These cases are the contract shared with
-- packages/validation/src/establishment-client.ts. Adding a case here without
-- adding it there lets the same contact normalize differently per writer.

DO $phone_parity$
DECLARE
  case_row record;
  produced text;
BEGIN
  FOR case_row IN
    SELECT *
    FROM (VALUES
      ('(11) 99999-9999', '+5511999999999'),
      ('11999999999', '+5511999999999'),
      ('11 9999-9999', '+551199999999'),
      ('+55 11 99999-9999', '+5511999999999'),
      ('5511999999999', '+5511999999999'),
      ('+1 415 555 2671', '+14155552671'),
      ('  (11) 99999-9999  ', '+5511999999999'),
      ('99999999', NULL),
      ('123', NULL),
      ('+123', NULL),
      ('telefone', NULL),
      ('', NULL),
      (NULL, NULL)
    ) AS cases(input, expected)
  LOOP
    produced := public.normalize_establishment_client_phone(case_row.input);
    IF produced IS DISTINCT FROM case_row.expected THEN
      RAISE EXCEPTION 'phone normalization drifted for %: expected %, got %',
        COALESCE(case_row.input, '<null>'),
        COALESCE(case_row.expected, '<null>'),
        COALESCE(produced, '<null>');
    END IF;
  END LOOP;
END;
$phone_parity$;

DO $email_parity$
DECLARE
  case_row record;
  produced text;
BEGIN
  FOR case_row IN
    SELECT *
    FROM (VALUES
      ('CARLOS@EXEMPLO.COM', 'carlos@exemplo.com'),
      ('  maria@exemplo.com ', 'maria@exemplo.com'),
      ('sem-arroba', NULL),
      ('sem@dominio', NULL),
      ('espaco no@meio.com', NULL),
      ('', NULL),
      (NULL, NULL)
    ) AS cases(input, expected)
  LOOP
    produced := public.normalize_establishment_client_email(case_row.input);
    IF produced IS DISTINCT FROM case_row.expected THEN
      RAISE EXCEPTION 'email normalization drifted for %: expected %, got %',
        COALESCE(case_row.input, '<null>'),
        COALESCE(case_row.expected, '<null>'),
        COALESCE(produced, '<null>');
    END IF;
  END LOOP;
END;
$email_parity$;

-- ---------------------------------------------------------------------------
-- Fixtures
-- ---------------------------------------------------------------------------

INSERT INTO auth.users (
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES (
  '97000000-0000-0000-0000-000000000001',
  'client-enrichment-admin@example.test',
  '{}'::jsonb,
  now(),
  now(),
  now()
);

INSERT INTO public.establishments (
  id, name, slug, account_status, timezone, share_agendas
)
VALUES (
  '97100000-0000-0000-0000-000000000001',
  'Client Enrichment Unit',
  'client-enrichment-unit',
  'active',
  'America/Sao_Paulo',
  true
);

-- The auth trigger already creates a client profile for every new user, so the
-- fixture upgrades that row instead of assuming it is absent.
INSERT INTO public.profiles (id, establishment_id, name, email, role)
VALUES (
  '97000000-0000-0000-0000-000000000001',
  '97100000-0000-0000-0000-000000000001',
  'Client Enrichment Admin',
  'client-enrichment-admin@example.test',
  'admin'
)
ON CONFLICT (id) DO UPDATE
SET establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    role = EXCLUDED.role;

INSERT INTO public.services (
  id, establishment_id, name, price, duration_minutes, is_active
)
VALUES (
  'client-enrichment-service',
  '97100000-0000-0000-0000-000000000001',
  'Client Enrichment Service',
  50,
  30,
  true
);

INSERT INTO public.establishment_clients (
  id, establishment_id, display_name, phone, email, created_by, updated_by
)
VALUES (
  '97200000-0000-0000-0000-000000000001',
  '97100000-0000-0000-0000-000000000001',
  'Maria Silva',
  '(11) 99999-9999',
  'MARIA@EXEMPLO.COM',
  '97000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Derived contacts and defaults
-- ---------------------------------------------------------------------------

DO $defaults$
DECLARE
  client_row public.establishment_clients%ROWTYPE;
BEGIN
  SELECT * INTO client_row FROM public.establishment_clients
  WHERE id = '97200000-0000-0000-0000-000000000001';

  IF client_row.normalized_phone <> '+5511999999999'
    OR client_row.normalized_email <> 'maria@exemplo.com'
  THEN
    RAISE EXCEPTION 'insert trigger did not derive normalized contacts: % / %',
      client_row.normalized_phone, client_row.normalized_email;
  END IF;
  IF client_row.phone <> '(11) 99999-9999' THEN
    RAISE EXCEPTION 'original phone must be preserved, got %', client_row.phone;
  END IF;
  IF client_row.source <> 'manual'
    OR client_row.marketing_consent_status <> 'unknown'
    OR client_row.marketing_consent_at IS NOT NULL
  THEN
    RAISE EXCEPTION 'a new client must start manual and without marketing consent';
  END IF;
END;
$defaults$;

UPDATE public.establishment_clients
SET phone = '+55 11 98888-7777', email = 'Maria.Nova@Exemplo.com'
WHERE id = '97200000-0000-0000-0000-000000000001';

DO $update_normalization$
DECLARE
  client_row public.establishment_clients%ROWTYPE;
BEGIN
  SELECT * INTO client_row FROM public.establishment_clients
  WHERE id = '97200000-0000-0000-0000-000000000001';
  IF client_row.normalized_phone <> '+5511988887777'
    OR client_row.normalized_email <> 'maria.nova@exemplo.com'
  THEN
    RAISE EXCEPTION 'update trigger did not refresh normalized contacts';
  END IF;
END;
$update_normalization$;

-- A shared contact must remain possible: relatives and dependants use the
-- same phone, so normalization suggests duplicates instead of blocking them.
INSERT INTO public.establishment_clients (
  id, establishment_id, display_name, phone, created_by, updated_by
)
VALUES (
  '97200000-0000-0000-0000-000000000002',
  '97100000-0000-0000-0000-000000000001',
  'Joao Silva',
  '11 98888-7777',
  '97000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000001'
);

DO $duplicate_hint$
DECLARE
  shared integer;
BEGIN
  SELECT count(*) INTO shared
  FROM public.establishment_clients
  WHERE establishment_id = '97100000-0000-0000-0000-000000000001'
    AND normalized_phone = '+5511988887777';
  IF shared <> 2 THEN
    RAISE EXCEPTION 'expected two clients sharing a normalized phone, got %', shared;
  END IF;
END;
$duplicate_hint$;

-- ---------------------------------------------------------------------------
-- Import idempotency and provenance
-- ---------------------------------------------------------------------------

INSERT INTO public.establishment_clients (
  id, establishment_id, display_name, source, source_provider, external_id,
  created_by, updated_by
)
VALUES (
  '97200000-0000-0000-0000-000000000003',
  '97100000-0000-0000-0000-000000000001',
  'Cliente Importado',
  'import',
  'trinks',
  'EXT-1',
  '97000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000001'
);

SELECT pg_temp.expect_error($$
  INSERT INTO public.establishment_clients (
    establishment_id, display_name, source, source_provider, external_id,
    created_by, updated_by
  ) VALUES (
    '97100000-0000-0000-0000-000000000001', 'Cliente Importado De Novo',
    'import', 'trinks', 'EXT-1',
    '97000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001'
  );
$$, 'establishment_clients_external_unique');

SELECT pg_temp.expect_error($$
  INSERT INTO public.establishment_clients (
    establishment_id, display_name, external_id, created_by, updated_by
  ) VALUES (
    '97100000-0000-0000-0000-000000000001', 'Sem Origem', 'EXT-2',
    '97000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001'
  );
$$, 'establishment_clients_external_origin_check');

SELECT pg_temp.expect_error($$
  INSERT INTO public.establishment_clients (
    establishment_id, display_name, source, created_by, updated_by
  ) VALUES (
    '97100000-0000-0000-0000-000000000001', 'Importado Sem Plataforma', 'import',
    '97000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001'
  );
$$, 'establishment_clients_external_origin_check');

SELECT pg_temp.expect_error($$
  INSERT INTO public.establishment_clients (
    establishment_id, display_name, source, created_by, updated_by
  ) VALUES (
    '97100000-0000-0000-0000-000000000001', 'Origem Invalida', 'scraping',
    '97000000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001'
  );
$$, 'establishment_clients_source_check');

-- The same external identifier belongs to another unit's carteira.
INSERT INTO public.establishments (
  id, name, slug, account_status, timezone, share_agendas
)
VALUES (
  '97100000-0000-0000-0000-000000000002',
  'Client Enrichment Isolated Unit',
  'client-enrichment-isolated-unit',
  'active',
  'America/Sao_Paulo',
  false
);

INSERT INTO public.establishment_clients (
  establishment_id, display_name, source, source_provider, external_id,
  created_by, updated_by
)
VALUES (
  '97100000-0000-0000-0000-000000000002',
  'Cliente Importado Outra Unidade',
  'import',
  'trinks',
  'EXT-1',
  '97000000-0000-0000-0000-000000000001',
  '97000000-0000-0000-0000-000000000001'
);

-- ---------------------------------------------------------------------------
-- Consent and lifecycle constraints
-- ---------------------------------------------------------------------------

SELECT pg_temp.expect_error($$
  UPDATE public.establishment_clients
  SET marketing_consent_status = 'granted'
  WHERE id = '97200000-0000-0000-0000-000000000001';
$$, 'establishment_clients_marketing_consent_state_check');

UPDATE public.establishment_clients
SET marketing_consent_status = 'granted', marketing_consent_at = now()
WHERE id = '97200000-0000-0000-0000-000000000001';

SELECT pg_temp.expect_error($$
  UPDATE public.establishment_clients
  SET status = 'archived'
  WHERE id = '97200000-0000-0000-0000-000000000002';
$$, 'establishment_clients_archived_state_check');

UPDATE public.establishment_clients
SET status = 'archived', archived_at = now()
WHERE id = '97200000-0000-0000-0000-000000000002';

SELECT pg_temp.expect_error($$
  UPDATE public.establishment_clients
  SET status = 'merged', merged_into_id = NULL
  WHERE id = '97200000-0000-0000-0000-000000000003';
$$, 'establishment_clients_merge_state_check');

DO $archived_visibility$
DECLARE
  archived_count integer;
BEGIN
  SELECT count(*) INTO archived_count
  FROM public.establishment_clients
  WHERE establishment_id = '97100000-0000-0000-0000-000000000001'
    AND status = 'archived'
    AND archived_at IS NOT NULL;
  IF archived_count <> 1 THEN
    RAISE EXCEPTION 'expected exactly one archived client, got %', archived_count;
  END IF;
END;
$archived_visibility$;

-- ---------------------------------------------------------------------------
-- Activity aggregates
-- ---------------------------------------------------------------------------

INSERT INTO public.appointments (
  id, establishment_id, client_name, establishment_client_id,
  professional_id, service_id, date_time, duration_minutes, ends_at, status
)
VALUES
  (
    'client-enrichment-completed',
    '97100000-0000-0000-0000-000000000001',
    'Maria Silva',
    '97200000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'client-enrichment-service',
    now() - interval '10 days', 30, now() - interval '10 days' + interval '30 minutes',
    'completed'
  ),
  (
    'client-enrichment-confirmed',
    '97100000-0000-0000-0000-000000000001',
    'Maria Silva',
    '97200000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'client-enrichment-service',
    now() + interval '3 days', 30, now() + interval '3 days' + interval '30 minutes',
    'confirmed'
  ),
  (
    'client-enrichment-cancelled',
    '97100000-0000-0000-0000-000000000001',
    'Maria Silva',
    '97200000-0000-0000-0000-000000000001',
    '97000000-0000-0000-0000-000000000001',
    'client-enrichment-service',
    now() + interval '30 days', 30, now() + interval '30 days' + interval '30 minutes',
    'cancelled'
  );

DO $activity$
DECLARE
  client_row public.establishment_clients%ROWTYPE;
BEGIN
  SELECT * INTO client_row FROM public.establishment_clients
  WHERE id = '97200000-0000-0000-0000-000000000001';

  IF client_row.first_appointment_at IS NULL OR client_row.last_appointment_at IS NULL THEN
    RAISE EXCEPTION 'activity aggregates were not maintained by the trigger';
  END IF;
  IF client_row.first_appointment_at >= now() THEN
    RAISE EXCEPTION 'first appointment should be the completed one in the past';
  END IF;
  -- The cancelled row sits further in the future and must be ignored.
  IF client_row.last_appointment_at >= now() + interval '10 days' THEN
    RAISE EXCEPTION 'cancelled appointments must not count as attendance history';
  END IF;
END;
$activity$;

UPDATE public.appointments
SET deleted_at = now()
WHERE id = 'client-enrichment-completed';

DO $activity_after_delete$
DECLARE
  client_row public.establishment_clients%ROWTYPE;
BEGIN
  SELECT * INTO client_row FROM public.establishment_clients
  WHERE id = '97200000-0000-0000-0000-000000000001';
  IF client_row.first_appointment_at IS NULL OR client_row.first_appointment_at < now() THEN
    RAISE EXCEPTION 'soft deleted appointment still counts towards activity';
  END IF;
END;
$activity_after_delete$;

ROLLBACK;
