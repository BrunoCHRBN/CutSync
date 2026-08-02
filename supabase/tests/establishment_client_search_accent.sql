-- Execute after 20260810000000_establishment_client_search_accent.sql.
-- Covers accent-tolerant search and cross-tenant read refusal.
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

DO $fold_parity$
DECLARE
  case_row record;
  produced text;
BEGIN
  FOR case_row IN
    SELECT *
    FROM (VALUES
      ('José da Silva', 'jose da silva'),
      ('JOSÉ DA SILVA', 'jose da silva'),
      ('  Ângela   Núñez ', 'angela nunez'),
      ('', NULL),
      (NULL, NULL)
    ) AS cases(input, expected)
  LOOP
    produced := public.fold_establishment_client_search_text(case_row.input);
    IF produced IS DISTINCT FROM case_row.expected THEN
      RAISE EXCEPTION 'fold drifted for %: expected %, got %',
        COALESCE(case_row.input, '<null>'),
        COALESCE(case_row.expected, '<null>'),
        COALESCE(produced, '<null>');
    END IF;
  END LOOP;
END;
$fold_parity$;

INSERT INTO auth.users (
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES
  (
    '96000000-0000-0000-0000-000000000001',
    'accent-admin@example.test',
    '{"name":"Accent Admin"}'::jsonb, now(), now(), now()
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    'accent-outsider@example.test',
    '{"name":"Accent Outsider"}'::jsonb, now(), now(), now()
  );

-- auth.users already materializes profiles via handle_new_user.
UPDATE public.profiles
SET name = 'Accent Admin', role = 'admin'
WHERE id = '96000000-0000-0000-0000-000000000001';
UPDATE public.profiles
SET name = 'Accent Outsider', role = 'admin'
WHERE id = '96000000-0000-0000-0000-000000000002';

INSERT INTO public.establishments (
  id, name, slug, account_status, timezone, share_agendas
)
VALUES
  (
    '96100000-0000-0000-0000-000000000001',
    'Accent Search Unit',
    'accent-search-unit',
    'active',
    'America/Sao_Paulo',
    false
  ),
  (
    '96100000-0000-0000-0000-000000000002',
    'Accent Isolated Unit',
    'accent-isolated-unit',
    'active',
    'America/Sao_Paulo',
    false
  );

INSERT INTO public.memberships (
  id, establishment_id, profile_id, role, status, commission_rate
)
VALUES
  (
    '96200000-0000-0000-0000-000000000001',
    '96100000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000001',
    'admin',
    'active',
    0
  ),
  (
    '96200000-0000-0000-0000-000000000002',
    '96100000-0000-0000-0000-000000000002',
    '96000000-0000-0000-0000-000000000002',
    'admin',
    'active',
    0
  );

DO $search_and_tenant$
DECLARE
  admin_id uuid := '96000000-0000-0000-0000-000000000001';
  outsider_id uuid := '96000000-0000-0000-0000-000000000002';
  establishment_id uuid := '96100000-0000-0000-0000-000000000001';
  isolated_establishment_id uuid := '96100000-0000-0000-0000-000000000002';
  client_id uuid;
  payload jsonb;
BEGIN
  PERFORM pg_temp.set_actor(admin_id);

  payload := public.create_establishment_client(
    establishment_id,
    'José da Silva',
    '96300000-0000-0000-0000-000000000001',
    '(11) 92222-3333',
    'jose@exemplo.com'
  );
  client_id := (payload->>'establishmentClientId')::uuid;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.search_establishment_clients(establishment_id, 'jose')
    ) AS item
    WHERE (item->>'id')::uuid = client_id
  ) THEN RAISE EXCEPTION 'accent-folded search did not find José via jose'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.search_establishment_clients(establishment_id, 'JOSÉ')
    ) AS item
    WHERE (item->>'id')::uuid = client_id
  ) THEN RAISE EXCEPTION 'accented query did not find José'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(
      public.search_establishment_clients(establishment_id, '11922223333')
    ) AS item
    WHERE (item->>'id')::uuid = client_id
  ) THEN RAISE EXCEPTION 'digit search regressed after accent fold'; END IF;

  -- Outsider admin of another unit must not read this carteira.
  PERFORM pg_temp.set_actor(outsider_id);
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_establishment_client(%L, %L)',
      isolated_establishment_id, client_id
    ),
    'establishment_client_not_found'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_establishment_client(%L, %L)',
      establishment_id, client_id
    ),
    'forbidden'
  );
END;
$search_and_tenant$;

ROLLBACK;
