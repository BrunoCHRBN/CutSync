-- Execute after 20260812155016_ui_ux_brand_studio.sql.
-- All fixtures and mutations are rolled back.
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
VALUES
  ('89000000-0000-0000-0000-000000000001', 'brand-owner@example.test', '{"name":"Brand Owner"}', now(), now(), now()),
  ('89000000-0000-0000-0000-000000000002', 'brand-manager@example.test', '{"name":"Brand Manager"}', now(), now(), now()),
  ('89000000-0000-0000-0000-000000000003', 'brand-admin@example.test', '{"name":"Brand Admin"}', now(), now(), now()),
  ('89000000-0000-0000-0000-000000000004', 'brand-professional@example.test', '{"name":"Brand Professional"}', now(), now(), now());

INSERT INTO public.establishments(id, name, slug, address, account_status)
VALUES ('89000000-0000-0000-0000-000000000010', 'Estúdio Marca', 'estudio-marca', 'São Paulo - SP', 'active');

INSERT INTO public.organizations(id, name, created_by)
VALUES ('89000000-0000-0000-0000-000000000020', 'Grupo Marca', '89000000-0000-0000-0000-000000000001');

INSERT INTO public.organization_establishments(organization_id, establishment_id, linked_by)
VALUES ('89000000-0000-0000-0000-000000000020', '89000000-0000-0000-0000-000000000010', '89000000-0000-0000-0000-000000000001');

INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
VALUES
  ('89000000-0000-0000-0000-000000000020', '89000000-0000-0000-0000-000000000001', 'owner', '89000000-0000-0000-0000-000000000001'),
  ('89000000-0000-0000-0000-000000000020', '89000000-0000-0000-0000-000000000002', 'manager', '89000000-0000-0000-0000-000000000001');

INSERT INTO public.memberships(profile_id, establishment_id, role, role_template, status)
VALUES
  ('89000000-0000-0000-0000-000000000003', '89000000-0000-0000-0000-000000000010', 'admin', 'admin', 'active'),
  ('89000000-0000-0000-0000-000000000004', '89000000-0000-0000-0000-000000000010', 'professional', 'professional', 'active');

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  first_receipt jsonb;
  replay_receipt jsonb;
  publication jsonb;
BEGIN
  first_receipt := public.save_brand_draft(
    '89000000-0000-0000-0000-000000000010', 'organization',
    '{"preset":"classic","primaryColor":"#0F766E","gallery":[],"description":"Marca do grupo","slogan":"Cuidado em rede","composition":"balanced"}',
    ARRAY[]::text[], '89000000-0000-0000-0000-000000000101'
  );
  replay_receipt := public.save_brand_draft(
    '89000000-0000-0000-0000-000000000010', 'organization',
    '{"preset":"classic","primaryColor":"#0F766E","gallery":[],"description":"Marca do grupo","slogan":"Cuidado em rede","composition":"balanced"}',
    ARRAY[]::text[], '89000000-0000-0000-0000-000000000101'
  );
  IF first_receipt->>'versionId' IS DISTINCT FROM replay_receipt->>'versionId' THEN
    RAISE EXCEPTION 'FAIL: draft idempotency did not return the same version';
  END IF;
  publication := public.publish_brand_version(
    '89000000-0000-0000-0000-000000000010', 'organization',
    (first_receipt->>'versionId')::uuid, '89000000-0000-0000-0000-000000000102'
  );
  IF publication->>'status' <> 'published' THEN RAISE EXCEPTION 'FAIL: organization brand not published'; END IF;
END $$;

SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000002');

DO $$
DECLARE manager_draft jsonb;
BEGIN
  manager_draft := public.save_brand_draft(
    '89000000-0000-0000-0000-000000000010', 'organization',
    '{"preset":"editorial","primaryColor":"#315B4C","gallery":[],"description":"Rascunho editorial","slogan":"","composition":"balanced"}',
    ARRAY[]::text[], '89000000-0000-0000-0000-000000000103'
  );
  PERFORM set_config('cutsync.test.manager_version', manager_draft->>'versionId', true);
END $$;

SELECT pg_temp.expect_error(
  format(
    'SELECT public.publish_brand_version(%L, %L, %L::uuid, %L::uuid)',
    '89000000-0000-0000-0000-000000000010', 'organization',
    current_setting('cutsync.test.manager_version'), '89000000-0000-0000-0000-000000000104'
  ),
  'forbidden'
);

SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000003');

DO $$
DECLARE
  unit_draft jsonb;
  editor_context jsonb;
  restored jsonb;
BEGIN
  unit_draft := public.save_brand_draft(
    '89000000-0000-0000-0000-000000000010', 'establishment',
    '{"preset":"classic","primaryColor":"#0F766E","gallery":[],"description":"Marca herdada","slogan":"","composition":"balanced"}',
    ARRAY[]::text[], '89000000-0000-0000-0000-000000000105'
  );
  PERFORM public.publish_brand_version(
    '89000000-0000-0000-0000-000000000010', 'establishment',
    (unit_draft->>'versionId')::uuid, '89000000-0000-0000-0000-000000000106'
  );
  editor_context := public.get_brand_editor_context('89000000-0000-0000-0000-000000000010');
  IF editor_context#>>'{sources,primaryColor}' <> 'organization' THEN
    RAISE EXCEPTION 'FAIL: unit without overrides did not inherit organization color';
  END IF;
  IF editor_context#>>'{capabilities,publishBrand}' <> 'true' THEN
    RAISE EXCEPTION 'FAIL: unit admin did not receive publishBrand';
  END IF;
  restored := public.restore_brand_version(
    '89000000-0000-0000-0000-000000000010', 'establishment',
    (unit_draft->>'versionId')::uuid, '89000000-0000-0000-0000-000000000107'
  );
  editor_context := public.get_brand_editor_context('89000000-0000-0000-0000-000000000010');
  IF restored->>'status' <> 'published'
    OR jsonb_array_length(editor_context->'establishmentHistory') < 2
  THEN RAISE EXCEPTION 'FAIL: restore did not create an auditable published version'; END IF;
END $$;

SELECT pg_temp.set_actor('89000000-0000-0000-0000-000000000004');
SELECT pg_temp.expect_error(
  $$SELECT public.get_brand_editor_context('89000000-0000-0000-0000-000000000010')$$,
  'forbidden'
);

SELECT pg_temp.expect_error(
  $$SELECT count(*) FROM public.establishment_brand_versions$$,
  'permission denied'
);

ROLLBACK;
