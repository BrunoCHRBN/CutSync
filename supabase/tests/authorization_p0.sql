-- Matriz negativa do P0. Execute após a migration segura.
-- Todos os dados são revertidos ao final.
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
  IF expected_fragment IS NOT NULL AND position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_zero(statement text, failure_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE found_count bigint;
BEGIN
  EXECUTE statement INTO found_count;
  IF found_count <> 0 THEN RAISE EXCEPTION 'FAIL: % (found %)', failure_message, found_count; END IF;
END $$;

CREATE OR REPLACE FUNCTION pg_temp.assert_one(statement text, failure_message text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE found_count bigint;
BEGIN
  EXECUTE statement INTO found_count;
  IF found_count <> 1 THEN RAISE EXCEPTION 'FAIL: % (found %)', failure_message, found_count; END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'establishments'
      AND policyname = 'Inserção pública de barbearias'
  ) THEN RAISE EXCEPTION 'FAIL: public establishment insert policy still exists'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_column_grants
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND grantee = 'authenticated' AND privilege_type = 'UPDATE'
      AND column_name IN ('role', 'establishment_id', 'commission_rate')
  ) THEN RAISE EXCEPTION 'FAIL: authenticated can update protected profile columns'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'accept_invitation'
      AND p.prosecdef = true AND p.proconfig::text LIKE '%search_path=%'
  ) THEN RAISE EXCEPTION 'FAIL: accept_invitation is not hardened'; END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.routine_privileges
    WHERE routine_schema = 'public' AND routine_name = 'accept_invitation' AND grantee = 'PUBLIC'
  ) THEN RAISE EXCEPTION 'FAIL: PUBLIC can execute accept_invitation'; END IF;
END $$;

-- Fixtures independentes de dados reais.
INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('10000000-0000-0000-0000-000000000001', 'p0-client-a@example.test', '{}'::jsonb, now(), now(), now()),
  ('10000000-0000-0000-0000-000000000002', 'p0-prof-a@example.test', '{}'::jsonb, now(), now(), now()),
  ('10000000-0000-0000-0000-000000000003', 'p0-admin-a@example.test', '{}'::jsonb, now(), now(), now()),
  ('10000000-0000-0000-0000-000000000004', 'p0-prof-b@example.test', '{}'::jsonb, now(), now(), now()),
  ('10000000-0000-0000-0000-000000000005', 'p0-admin-b@example.test', '{}'::jsonb, now(), now(), now()),
  ('10000000-0000-0000-0000-000000000006', 'p0-super@example.test', '{}'::jsonb, now(), now(), now()),
  ('10000000-0000-0000-0000-000000000007', 'p0-attack@example.test', '{"name":"Attack","role":"admin","establishment_id":"20000000-0000-0000-0000-000000000001"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'Tenant A', 'p0-tenant-a'),
  ('20000000-0000-0000-0000-000000000002', 'Tenant B', 'p0-tenant-b');

INSERT INTO public.memberships(profile_id, establishment_id, role, created_by)
VALUES
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'professional', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'admin', '10000000-0000-0000-0000-000000000003'),
  ('10000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'professional', '10000000-0000-0000-0000-000000000005'),
  ('10000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'admin', '10000000-0000-0000-0000-000000000005');

UPDATE public.profiles p SET
  establishment_id = m.establishment_id, role = m.role, commission_rate = m.commission_rate
FROM public.memberships m WHERE m.profile_id = p.id;

INSERT INTO public.superadmins(profile_id) VALUES ('10000000-0000-0000-0000-000000000006');

INSERT INTO public.invitations(establishment_id, invited_email, role, token_hash, expires_at, created_by)
VALUES
  ('20000000-0000-0000-0000-000000000001', 'p0-client-a@example.test', 'professional',
    encode(extensions.digest(repeat('a', 64), 'sha256'), 'hex'), now() + interval '24 hours', '10000000-0000-0000-0000-000000000003'),
  ('20000000-0000-0000-0000-000000000001', 'p0-client-a@example.test', 'professional',
    encode(extensions.digest(repeat('b', 64), 'sha256'), 'hex'), now() - interval '1 second', '10000000-0000-0000-0000-000000000003');

DO $$
DECLARE attack_role text; attack_establishment uuid;
BEGIN
  SELECT role, establishment_id INTO attack_role, attack_establishment
  FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000007';
  IF attack_role <> 'client' OR attack_establishment IS NOT NULL THEN
    RAISE EXCEPTION 'FAIL: malicious signup metadata changed authorization';
  END IF;
END $$;

SET LOCAL ROLE authenticated;

-- Cliente: não enxerga perfis/vínculos de outro usuário e não altera autorização.
SELECT pg_temp.set_actor('10000000-0000-0000-0000-000000000001');
SELECT pg_temp.assert_zero(
  $$SELECT count(*) FROM public.profiles WHERE id = '10000000-0000-0000-0000-000000000003'$$,
  'client can see another profile'
);
SELECT pg_temp.assert_zero(
  $$SELECT count(*) FROM public.memberships WHERE establishment_id = '20000000-0000-0000-0000-000000000001'$$,
  'client can see tenant memberships'
);
SELECT pg_temp.expect_error(
  $$UPDATE public.profiles SET role = 'admin', establishment_id = '20000000-0000-0000-0000-000000000001', commission_rate = 1 WHERE id = '10000000-0000-0000-0000-000000000001'$$,
  'permission denied'
);
SELECT pg_temp.expect_error(
  $$SELECT public.create_invitation('20000000-0000-0000-0000-000000000001', 'x@example.test', 'professional')$$,
  'forbidden'
);

-- Profissional: não convida, não lê outro tenant e não administra equipe.
SELECT pg_temp.set_actor('10000000-0000-0000-0000-000000000002');
SELECT pg_temp.assert_zero(
  $$SELECT count(*) FROM public.memberships WHERE establishment_id = '20000000-0000-0000-0000-000000000002'$$,
  'professional can see another tenant memberships'
);
SELECT pg_temp.expect_error(
  $$SELECT public.create_invitation('20000000-0000-0000-0000-000000000001', 'new-prof@example.test', 'professional')$$,
  'forbidden'
);
SELECT pg_temp.expect_error(
  $$SELECT count(*) FROM public.get_establishment_team('20000000-0000-0000-0000-000000000001', true)$$,
  'forbidden'
);

-- Admin A: administra somente A, convida somente profissionais e nunca admins.
SELECT pg_temp.set_actor('10000000-0000-0000-0000-000000000003');
SELECT pg_temp.assert_one(
  $$SELECT count(*) FROM public.memberships WHERE profile_id = '10000000-0000-0000-0000-000000000002' AND establishment_id = '20000000-0000-0000-0000-000000000001'$$,
  'admin cannot see own tenant membership'
);
SELECT pg_temp.assert_zero(
  $$SELECT count(*) FROM public.memberships WHERE establishment_id = '20000000-0000-0000-0000-000000000002'$$,
  'admin can see another tenant memberships'
);
SELECT pg_temp.expect_error(
  $$SELECT public.create_invitation('20000000-0000-0000-0000-000000000002', 'cross@example.test', 'professional')$$,
  'forbidden'
);
SELECT pg_temp.expect_error(
  $$SELECT public.create_invitation('20000000-0000-0000-0000-000000000001', 'admin@example.test', 'admin')$$,
  'forbidden'
);
SELECT count(*) FROM public.create_invitation(
  '20000000-0000-0000-0000-000000000001', 'allowed-prof@example.test', 'professional'
);

-- Superadmin: pode convidar admin, mas não ganha membership implícita.
SELECT pg_temp.set_actor('10000000-0000-0000-0000-000000000006');
SELECT count(*) FROM public.create_invitation(
  '20000000-0000-0000-0000-000000000002', 'allowed-admin@example.test', 'admin'
);
SELECT pg_temp.assert_zero(
  $$SELECT count(*) FROM public.memberships WHERE profile_id = '10000000-0000-0000-0000-000000000006'$$,
  'superadmin received an implicit tenant membership'
);

-- Tokens inválidos, usuário/e-mail incorreto e reutilização são negados.
SELECT pg_temp.expect_error($$SELECT public.accept_invitation('short')$$, 'invalid_invitation_token');
SELECT pg_temp.expect_error(
  $$SELECT public.accept_invitation(repeat('a', 64))$$,
  'invitation_email_mismatch'
);

SELECT pg_temp.set_actor('10000000-0000-0000-0000-000000000001');
SELECT count(*) FROM public.accept_invitation(repeat('a', 64));
SELECT pg_temp.expect_error(
  $$SELECT public.accept_invitation(repeat('a', 64))$$,
  'invalid_or_used_invitation'
);
SELECT pg_temp.expect_error(
  $$SELECT public.accept_invitation(repeat('b', 64))$$,
  'expired_invitation'
);

RESET ROLE;

ROLLBACK;