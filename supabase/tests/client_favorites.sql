-- Execute after 20260808041243_client_favorites_reconciled.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
  END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('87000000-0000-0000-0000-000000000001', 'client-favorites@example.test', '{"name":"Favorites Client"}'::jsonb, now(), now(), now()),
  ('87000000-0000-0000-0000-000000000002', 'client-favorites-two@example.test', '{"name":"Favorites Client Two"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug, address, account_status)
VALUES
  (
    '87000000-0000-0000-0000-000000000010',
    'Estúdio Favorito',
    'estudio-favorito',
    'Centro, São Paulo - SP',
    'active'
  ),
  (
    '87000000-0000-0000-0000-000000000011',
    'Estúdio Bloqueado Favorito',
    'estudio-bloqueado-favorito',
    'Centro, São Paulo - SP',
    'blocked'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('87000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  favorited boolean;
  favorite_count integer;
BEGIN
  favorited := public.set_client_favorite_establishment('87000000-0000-0000-0000-000000000010', true);
  IF favorited IS NOT TRUE THEN
    RAISE EXCEPTION 'FAIL: favorite was not marked as true';
  END IF;

  SELECT count(*) INTO favorite_count FROM public.list_client_favorite_establishments();
  IF favorite_count <> 1 THEN
    RAISE EXCEPTION 'FAIL: expected 1 favorite, got %', favorite_count;
  END IF;

  favorited := public.set_client_favorite_establishment('87000000-0000-0000-0000-000000000010', false);
  IF favorited IS NOT FALSE THEN
    RAISE EXCEPTION 'FAIL: unfavorite did not return false';
  END IF;

  SELECT count(*) INTO favorite_count FROM public.list_client_favorite_establishments();
  IF favorite_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: expected 0 favorites after remove, got %', favorite_count;
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.set_client_favorite_establishment('87000000-0000-0000-0000-000000000011', true)$$,
  'establishment_unavailable'
);

SELECT pg_temp.set_actor('87000000-0000-0000-0000-000000000001');
SELECT public.set_client_favorite_establishment('87000000-0000-0000-0000-000000000010', true);

SELECT pg_temp.set_actor('87000000-0000-0000-0000-000000000002');

DO $$
DECLARE
  favorite_count integer;
  visible_rows integer;
BEGIN
  SELECT count(*) INTO favorite_count FROM public.list_client_favorite_establishments();
  IF favorite_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: client two must not see client one favorites';
  END IF;

  SELECT count(*) INTO visible_rows
  FROM public.client_favorite_establishments
  WHERE client_id = '87000000-0000-0000-0000-000000000001';
  IF visible_rows <> 0 THEN
    RAISE EXCEPTION 'FAIL: RLS leaked another client favorite rows';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$INSERT INTO public.client_favorite_establishments (client_id, establishment_id)
    VALUES ('87000000-0000-0000-0000-000000000001', '87000000-0000-0000-0000-000000000010')$$,
  'new row violates row-level security'
);

RESET ROLE;
ROLLBACK;
