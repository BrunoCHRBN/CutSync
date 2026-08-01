-- Execute after 20260722223000_client_discovery.sql.
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
  ('84000000-0000-0000-0000-000000000001', 'client-discovery@example.test', '{"name":"Discovery Client"}'::jsonb, now(), now(), now()),
  ('84000000-0000-0000-0000-000000000002', 'professional-discovery@example.test', '{"name":"Discovery Professional"}'::jsonb, now(), now(), now());

UPDATE public.profiles
SET name = 'Ana Especialista', role = 'professional', specialties = 'Corte clássico'
WHERE id = '84000000-0000-0000-0000-000000000002';

INSERT INTO public.establishments (id, name, slug, address, account_status, gallery_urls, latitude, longitude)
VALUES
  (
    '84000000-0000-0000-0000-000000000010',
    'Estúdio Descoberta',
    'estudio-descoberta',
    'Centro, São Paulo - SP',
    'active',
    '["https://cdn.example.test/a.jpg","https://cdn.example.test/b.jpg"]',
    -23.5505,
    -46.6333
  ),
  (
    '84000000-0000-0000-0000-000000000011',
    'Estúdio Bloqueado',
    'estudio-bloqueado',
    'Centro, São Paulo - SP',
    'blocked',
    NULL,
    NULL,
    NULL
  ),
  (
    '84000000-0000-0000-0000-000000000012',
    'Estúdio Distante',
    'estudio-distante',
    'Centro, Rio de Janeiro - RJ',
    'active',
    NULL,
    -22.9068,
    -43.1729
  );

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active, sort_order)
VALUES
  ('84000000-0000-0000-0000-000000000020', '84000000-0000-0000-0000-000000000010', 'Corte clássico', 55, 40, true, 1),
  ('84000000-0000-0000-0000-000000000021', '84000000-0000-0000-0000-000000000010', 'Serviço oculto', 70, 50, false, 2);

INSERT INTO public.memberships (id, establishment_id, profile_id, role, status)
VALUES (
  '84000000-0000-0000-0000-000000000030',
  '84000000-0000-0000-0000-000000000010',
  '84000000-0000-0000-0000-000000000002',
  'professional',
  'active'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('84000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  catalog_row record;
  detail_row record;
BEGIN
  SELECT * INTO catalog_row
  FROM public.list_client_discovery_establishments('Ana Especialista', 30);

  IF catalog_row.slug <> 'estudio-descoberta'
    OR catalog_row.service_count <> 1
    OR catalog_row.professional_count <> 1
  THEN
    RAISE EXCEPTION 'FAIL: discovery catalog did not return the safe active summary';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.list_client_discovery_establishments('', 30)
    WHERE slug = 'estudio-bloqueado'
  ) THEN
    RAISE EXCEPTION 'FAIL: blocked establishment was exposed';
  END IF;

  SELECT * INTO detail_row
  FROM public.get_client_discovery_establishment('estudio-descoberta');

  IF jsonb_array_length(detail_row.services) <> 1
    OR jsonb_array_length(detail_row.professionals) <> 1
  THEN
    RAISE EXCEPTION 'FAIL: detail did not filter services and professionals';
  END IF;

  IF detail_row.gallery_urls IS NULL
    OR position('cdn.example.test/a.jpg' IN detail_row.gallery_urls) = 0
    OR detail_row.latitude IS NULL
  THEN
    RAISE EXCEPTION 'FAIL: detail did not expose gallery and coordinates';
  END IF;
END $$;

-- Distance ranking: from São Paulo the local studio must come before Rio.
DO $$
DECLARE
  nearest_slug text;
  nearest_distance double precision;
BEGIN
  SELECT slug, distance_meters INTO nearest_slug, nearest_distance
  FROM public.list_client_discovery_establishments('', 30, -23.5505, -46.6333)
  LIMIT 1;

  IF nearest_slug <> 'estudio-descoberta' THEN
    RAISE EXCEPTION 'FAIL: nearest establishment was not ranked first, got %', nearest_slug;
  END IF;

  IF nearest_distance IS NULL OR nearest_distance > 1000 THEN
    RAISE EXCEPTION 'FAIL: distance for the co-located establishment was %', nearest_distance;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.list_client_discovery_establishments('', 30)
    WHERE distance_meters IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: distance was computed without an origin';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.list_client_discovery_establishments('', 30, 120, -46.6333)$$,
  'invalid_discovery_coordinates'
);

SELECT pg_temp.expect_error(
  $$SELECT public.list_client_discovery_establishments('barbearia ' || U&'\+01F488', 30)$$,
  'invalid_discovery_query'
);

SELECT pg_temp.expect_error(
  $$SELECT public.list_client_discovery_establishments('<svg>centro</svg>', 30)$$,
  'invalid_discovery_query'
);

RESET ROLE;
SET LOCAL ROLE anon;

SELECT pg_temp.expect_error(
  $$SELECT public.list_client_discovery_establishments('', 30)$$,
  'permission denied'
);

RESET ROLE;
ROLLBACK;
