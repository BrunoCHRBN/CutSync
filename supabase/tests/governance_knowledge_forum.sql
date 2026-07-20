-- Execute após 20260720005000_governance_knowledge_forum.sql.
-- Valida o contrato estrutural sem alterar dados persistentes.
\set ON_ERROR_STOP on

BEGIN;

DO $$
DECLARE
  protected_table text;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY[
    'governance_kb_categories',
    'governance_kb_topics',
    'governance_kb_replies',
    'governance_kb_attachments',
    'governance_kb_revisions'
  ] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_class relation
      JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = protected_table
        AND relation.relrowsecurity
    ) THEN
      RAISE EXCEPTION 'FAIL: RLS disabled on %', protected_table;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name LIKE 'governance_kb_%'
      AND grantee IN ('anon', 'authenticated')
      AND privilege_type = 'DELETE'
  ) THEN
    RAISE EXCEPTION 'FAIL: knowledge records expose hard delete';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM storage.buckets
    WHERE id = 'governance-kb'
      AND public = false
      AND file_size_limit = 5242880
      AND allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']
  ) THEN
    RAISE EXCEPTION 'FAIL: private knowledge bucket contract is invalid';
  END IF;

  IF (SELECT count(*) FROM public.governance_kb_topics
      WHERE id::text LIKE 'b0000000-0000-4000-8000-00000000000_') <> 7 THEN
    RAISE EXCEPTION 'FAIL: expected seven migrated topics';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.governance_kb_topics
    WHERE id::text LIKE 'b0000000-0000-4000-8000-00000000000_'
      AND (is_official OR reviewed_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION 'FAIL: migrated topics must await review';
  END IF;
END $$;

ROLLBACK;
