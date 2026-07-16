-- Execute após 20260716050000_secure_memberships_and_invites.sql.
-- Estes testes são destrutivos somente dentro da transação e terminam com ROLLBACK.
\set ON_ERROR_STOP on

BEGIN;

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

ROLLBACK;