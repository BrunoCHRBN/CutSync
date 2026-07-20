-- Migration: Hardening security settings for SECURITY DEFINER functions, views, and storage buckets
BEGIN;

-- 1. Secure view definition to enforce RLS (security_invoker = on)
-- This enforces RLS when users select from the active_establishment_invites view
ALTER VIEW IF EXISTS public.active_establishment_invites SET (security_invoker = on);

-- 2. Harden all SECURITY DEFINER functions
-- - Set secure search_path to prevent hijacking
-- - Revoke execute privilege from PUBLIC
-- - Grant execute to authenticated and service_role
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN 
    SELECT ns.nspname AS schema_name, p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace ns ON p.pronamespace = ns.oid
    WHERE ns.nspname = 'public' 
      AND p.prosecdef = true -- SECURITY DEFINER
  LOOP
    -- Set secure search path
    EXECUTE format('ALTER FUNCTION %I.%I(%s) SET search_path = pg_catalog, public', r.schema_name, r.function_name, r.args);

    -- Revoke execute from PUBLIC
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %I.%I(%s) FROM PUBLIC', r.schema_name, r.function_name, r.args);

    -- Grant execute back to authenticated and service_role
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO authenticated', r.schema_name, r.function_name, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %I.%I(%s) TO service_role', r.schema_name, r.function_name, r.args);
  END LOOP;
END;
$$;

-- 3. Restrict listing on public storage buckets
-- Drops SELECT policies on storage.objects for public buckets (listing files is not required for public download)
DO $$
DECLARE
  policy_rec RECORD;
BEGIN
  FOR policy_rec IN
    SELECT pol.policyname
    FROM pg_policies pol
    WHERE pol.schemaname = 'storage'
      AND pol.tablename = 'objects'
      AND pol.cmd = 'SELECT'
      AND (
        pol.policyname ILIKE '%public%'
        OR pol.policyname ILIKE '%anyone%'
        OR pol.policyname ILIKE '%all%'
      )
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', policy_rec.policyname);
  END LOOP;
END;
$$;

COMMIT;
