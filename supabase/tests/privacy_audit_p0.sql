-- Execute após 20260716052000_privacy_audit_and_professional_profiles.sql.
-- Usa as fixtures e helpers criados em authorization_p0.sql, na mesma transação de QA.
\set ON_ERROR_STOP on

BEGIN;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles'
      AND (qual = 'true' OR with_check = 'true')
  ) THEN RAISE EXCEPTION 'FAIL: profiles still has a global policy'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_column_grants
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND grantee IN ('anon', 'authenticated')
      AND column_name IN ('email', 'phone', 'push_token', 'commission_rate', 'establishment_id', 'role')
  ) THEN RAISE EXCEPTION 'FAIL: sensitive profile column is directly granted'; END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'authorization_audit_log'
      AND grantee IN ('anon', 'authenticated') AND privilege_type IN ('INSERT', 'UPDATE', 'DELETE')
  ) THEN RAISE EXCEPTION 'FAIL: audit trail is mutable by app roles'; END IF;
END $$;

ROLLBACK;