-- Execute after 20260731000000_public_discovery_publication.sql.
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
VALUES ('85000000-0000-0000-0000-000000000001', 'publication-owner@example.test', '{"name":"Publication Owner"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug, address, account_status)
VALUES
  ('85000000-0000-0000-0000-000000000010', 'Studio Publicável', 'studio-publicavel', 'Centro, São Paulo - SP', 'active'),
  ('85000000-0000-0000-0000-000000000011', 'Shop 235831', 'shop-235831', 'Centro, São Paulo - SP', 'active'),
  ('85000000-0000-0000-0000-000000000012', 'Studio Bloqueado', 'studio-bloqueado', 'Centro, São Paulo - SP', 'blocked');

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active, sort_order)
VALUES
  ('85000000-0000-0000-0000-000000000020', '85000000-0000-0000-0000-000000000010', 'Corte essencial', 45, 30, true, 1),
  ('85000000-0000-0000-0000-000000000021', '85000000-0000-0000-0000-000000000011', 'Corte', 35, 30, true, 1),
  ('85000000-0000-0000-0000-000000000022', '85000000-0000-0000-0000-000000000012', 'Corte', 35, 30, true, 1);

INSERT INTO public.memberships (id, establishment_id, profile_id, role, status)
VALUES
  ('85000000-0000-0000-0000-000000000030', '85000000-0000-0000-0000-000000000010', '85000000-0000-0000-0000-000000000001', 'admin', 'active'),
  ('85000000-0000-0000-0000-000000000031', '85000000-0000-0000-0000-000000000011', '85000000-0000-0000-0000-000000000001', 'admin', 'active');

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('85000000-0000-0000-0000-000000000001');

SELECT * FROM public.publish_establishment_discovery('85000000-0000-0000-0000-000000000010');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.list_public_discovery_establishments(50)
    WHERE slug = 'studio-publicavel'
      AND jsonb_array_length(services) = 1
  ) THEN
    RAISE EXCEPTION 'FAIL: eligible published establishment was not returned';
  END IF;
END $$;

SELECT * FROM public.unpublish_establishment_discovery('85000000-0000-0000-0000-000000000010');

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.list_public_discovery_establishments(50)
    WHERE slug = 'studio-publicavel'
  ) THEN
    RAISE EXCEPTION 'FAIL: draft establishment remained discoverable';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.publish_establishment_discovery('85000000-0000-0000-0000-000000000011')$$,
  'discovery_requirements_not_met'
);

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.services
    WHERE establishment_id = '85000000-0000-0000-0000-000000000010'
  ) THEN
    RAISE EXCEPTION 'FAIL: unpublishing removed operational data';
  END IF;
END $$;

SET LOCAL ROLE anon;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.list_public_discovery_establishments(50)
    WHERE slug IN ('shop-235831', 'studio-bloqueado')
  ) THEN
    RAISE EXCEPTION 'FAIL: invalid or blocked establishment was exposed';
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
