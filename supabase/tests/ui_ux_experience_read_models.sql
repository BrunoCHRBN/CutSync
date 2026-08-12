-- Execute after 20260812160651_ui_ux_experience_read_models.sql.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(target_actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', target_actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', target_actor_id, 'role', 'authenticated')::text, true);
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

INSERT INTO auth.users(id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES ('77000000-0000-0000-0000-000000000001', 'ux-read-model-admin@example.test', '{"name":"UX Admin"}', now(), now(), now());

INSERT INTO public.establishments(id, name, slug, account_status, discovery_status, address)
VALUES ('77000000-0000-0000-0000-000000000010', 'Ateliê Read Model', 'atelie-read-model', 'active', 'draft', NULL);

INSERT INTO public.memberships(id, establishment_id, profile_id, role, role_template, status)
VALUES ('77000000-0000-0000-0000-000000000020', '77000000-0000-0000-0000-000000000010', '77000000-0000-0000-0000-000000000001', 'admin', 'admin', 'active');

INSERT INTO public.services(id, establishment_id, name, price, duration_minutes, is_active, sort_order)
VALUES ('ux-read-model-service', '77000000-0000-0000-0000-000000000010', 'Corte essencial', 55, 30, true, 1);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('77000000-0000-0000-0000-000000000001');

DO $$
DECLARE readiness jsonb; public_experience jsonb;
BEGIN
  readiness := public.get_publication_readiness('77000000-0000-0000-0000-000000000010');
  IF readiness->>'eligible' <> 'true' THEN RAISE EXCEPTION 'FAIL: optional address blocked publication: %', readiness; END IF;
  IF NOT (readiness->'recommendations' ? 'add_logo') THEN RAISE EXCEPTION 'FAIL: completeness recommendation missing'; END IF;

  PERFORM public.publish_establishment_discovery('77000000-0000-0000-0000-000000000010');
  public_experience := public.get_public_establishment_experience('atelie-read-model');
  IF public_experience#>>'{establishment,name}' <> 'Ateliê Read Model'
    OR jsonb_array_length(public_experience->'services') <> 1
  THEN RAISE EXCEPTION 'FAIL: public read model is incomplete: %', public_experience; END IF;
END $$;

SELECT pg_temp.expect_error(
  $$SELECT public.get_public_establishment_experience('invalid slug')$$,
  'invalid_establishment_slug'
);

RESET ROLE;
SET LOCAL ROLE anon;
DO $$
DECLARE public_experience jsonb;
BEGIN
  public_experience := public.get_public_establishment_experience('atelie-read-model');
  IF public_experience ? 'capabilities' THEN RAISE EXCEPTION 'FAIL: public model leaked authorization data'; END IF;
END $$;

ROLLBACK;
