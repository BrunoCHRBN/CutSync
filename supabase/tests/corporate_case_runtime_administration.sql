BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN
      RAISE;
    END IF;
    IF position(expected_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
    END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.control_permission_catalog
    WHERE permission = 'control.cases.configure'
      AND risk_level = 'critical'
      AND active
  ) THEN
    RAISE EXCEPTION 'FAIL: corporate case runtime capability is missing';
  END IF;

  IF (
    SELECT count(*)
    FROM public.control_access_profile_permissions AS profile_permission
    JOIN public.control_access_profiles AS access_profile
      ON access_profile.id = profile_permission.access_profile_id
    WHERE profile_permission.permission = 'control.cases.configure'
      AND access_profile.profile_key = 'saas_owner'
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: SaaS Owner runtime capability grant is missing';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.control_access_profile_permissions AS profile_permission
    JOIN public.control_access_profiles AS access_profile
      ON access_profile.id = profile_permission.access_profile_id
    WHERE profile_permission.permission = 'control.cases.configure'
      AND access_profile.profile_key <> 'saas_owner'
  ) THEN
    RAISE EXCEPTION 'FAIL: runtime capability leaked to a non-owner package';
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public'
      AND relation.relname = 'corporate_case_runtime_changes'
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL: runtime change ledger is not RLS-protected';
  END IF;

  IF has_table_privilege('anon', 'public.corporate_case_runtime_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.corporate_case_runtime_changes', 'SELECT')
     OR has_table_privilege('authenticated', 'public.corporate_case_runtime_changes', 'INSERT')
     OR has_table_privilege('authenticated', 'public.corporate_case_runtime_changes', 'UPDATE')
     OR has_table_privilege('authenticated', 'public.corporate_case_runtime_changes', 'DELETE')
  THEN
    RAISE EXCEPTION 'FAIL: direct client privilege on runtime change ledger';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_trigger
    WHERE tgrelid = 'public.corporate_case_runtime_changes'::regclass
      AND tgname = 'corporate_case_runtime_changes_immutable'
      AND NOT tgisinternal
  ) THEN
    RAISE EXCEPTION 'FAIL: immutable runtime change trigger is missing';
  END IF;
END;
$$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.corporate_case_runtime_settings
    WHERE enabled
       OR creation_enabled
       OR workflow_enabled
       OR automation_enabled
       OR email_enabled
       OR legacy_redirects_enabled
       OR version <> 1
  ) THEN
    RAISE EXCEPTION 'FAIL: runtime administration migration changed feature state';
  END IF;

  IF has_function_privilege(
       'anon',
       'public.get_corporate_case_runtime_administration_context(integer)',
       'EXECUTE'
     )
     OR has_function_privilege(
       'anon',
       'public.set_corporate_case_runtime_settings(boolean,boolean,boolean,boolean,boolean,boolean,integer,text,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'FAIL: anon can execute a runtime administration RPC';
  END IF;

  IF NOT has_function_privilege(
       'authenticated',
       'public.get_corporate_case_runtime_administration_context(integer)',
       'EXECUTE'
     )
     OR NOT has_function_privilege(
       'authenticated',
       'public.set_corporate_case_runtime_settings(boolean,boolean,boolean,boolean,boolean,boolean,integer,text,uuid)',
       'EXECUTE'
     )
  THEN
    RAISE EXCEPTION 'FAIL: authenticated role cannot reach guarded runtime RPCs';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM pg_catalog.pg_proc AS procedure
    WHERE procedure.oid IN (
      'public.get_corporate_case_runtime_administration_context(integer)'::regprocedure,
      'public.set_corporate_case_runtime_settings(boolean,boolean,boolean,boolean,boolean,boolean,integer,text,uuid)'::regprocedure
    )
      AND NOT coalesce(procedure.proconfig, ARRAY[]::text[])
        @> ARRAY['search_path=pg_catalog']::text[]
  ) THEN
    RAISE EXCEPTION 'FAIL: privileged runtime RPC search_path is not restricted';
  END IF;
END;
$$;

INSERT INTO auth.users(id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  (
    'ca500000-0000-4000-8000-000000000001',
    'runtime-owner@example.test',
    '{"name":"Runtime Owner"}'::jsonb,
    now(), now(), now()
  ),
  (
    'ca500000-0000-4000-8000-000000000002',
    'runtime-editor@example.test',
    '{"name":"Runtime Editor"}'::jsonb,
    now(), now(), now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture transacional de administração das flags de Chamados',
  true
);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  (
    'ca500000-0000-4000-8000-000000000001',
    'SaaS_Owner',
    'ca500000-0000-4000-8000-000000000001'
  ),
  (
    'ca500000-0000-4000-8000-000000000002',
    'SaaS_Editor',
    'ca500000-0000-4000-8000-000000000001'
  );

-- Give the editor the capability deliberately: the RPC must still require the Owner role.
INSERT INTO public.control_user_access_assignments(
  target_profile_id,
  access_profile_id,
  source_type,
  source_key,
  granted_by
)
SELECT
  'ca500000-0000-4000-8000-000000000002',
  access_profile.id,
  'migration',
  'runtime-editor-owner-package-test',
  'ca500000-0000-4000-8000-000000000001'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key = 'saas_owner';

SET LOCAL ROLE authenticated;

SELECT pg_temp.set_actor('ca500000-0000-4000-8000-000000000002', 'aal2');
SELECT pg_temp.expect_error(
  'SELECT public.get_corporate_case_runtime_administration_context(20)',
  'forbidden'
);

SELECT pg_temp.set_actor('ca500000-0000-4000-8000-000000000001', 'aal1');
SELECT pg_temp.expect_error(
  'SELECT public.get_corporate_case_runtime_administration_context(20)',
  'control_aal2_required'
);

SELECT pg_temp.set_actor('ca500000-0000-4000-8000-000000000001', 'aal2');

DO $$
DECLARE
  context_payload jsonb;
  first_result jsonb;
  repeated_result jsonb;
BEGIN
  context_payload := public.get_corporate_case_runtime_administration_context(20);
  IF (context_payload#>>'{settings,version}')::integer <> 1
     OR (context_payload#>>'{settings,enabled}')::boolean
  THEN
    RAISE EXCEPTION 'FAIL: unexpected initial administration context %', context_payload;
  END IF;

  PERFORM pg_temp.expect_error(
    $statement$SELECT public.set_corporate_case_runtime_settings(
      true, false, false, false, true, false, 1,
      'Tentativa inválida para testar dependência entre e-mail e automação.',
      'ca510000-0000-4000-8000-000000000001'
    )$statement$,
    'corporate_case_runtime_dependency_invalid'
  );

  first_result := public.set_corporate_case_runtime_settings(
    true, false, false, false, false, false, 1,
    'Ativação controlada apenas da leitura após validação do contrato em banco local.',
    'ca510000-0000-4000-8000-000000000002'
  );

  IF coalesce((first_result->>'idempotent')::boolean, true)
     OR (first_result->>'resulting_version')::integer <> 2
  THEN
    RAISE EXCEPTION 'FAIL: unexpected first runtime mutation %', first_result;
  END IF;

  repeated_result := public.set_corporate_case_runtime_settings(
    true, false, false, false, false, false, 1,
    'Ativação controlada apenas da leitura após validação do contrato em banco local.',
    'ca510000-0000-4000-8000-000000000002'
  );

  IF NOT coalesce((repeated_result->>'idempotent')::boolean, false)
     OR repeated_result->>'change_id' <> first_result->>'change_id'
  THEN
    RAISE EXCEPTION 'FAIL: idempotent retry did not return the original change';
  END IF;

  PERFORM pg_temp.expect_error(
    $statement$SELECT public.set_corporate_case_runtime_settings(
      true, true, false, false, false, false, 1,
      'Reutilização proposital da chave para testar conflito de idempotência.',
      'ca510000-0000-4000-8000-000000000002'
    )$statement$,
    'corporate_case_runtime_idempotency_conflict'
  );

  PERFORM pg_temp.expect_error(
    $statement$SELECT public.set_corporate_case_runtime_settings(
      false, false, false, false, false, false, 1,
      'Tentativa com versão antiga para validar bloqueio otimista concorrente.',
      'ca510000-0000-4000-8000-000000000003'
    )$statement$,
    'corporate_case_runtime_version_conflict'
  );
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.corporate_case_runtime_settings
    WHERE singleton
      AND enabled
      AND NOT creation_enabled
      AND NOT workflow_enabled
      AND NOT automation_enabled
      AND NOT email_enabled
      AND NOT legacy_redirects_enabled
      AND version = 2
      AND updated_by = 'ca500000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'FAIL: runtime settings did not persist the expected atomic state';
  END IF;

  IF (SELECT count(*) FROM public.corporate_case_runtime_changes) <> 1 THEN
    RAISE EXCEPTION 'FAIL: idempotent mutation created duplicate runtime changes';
  END IF;

  IF (
    SELECT count(*)
    FROM public.security_audit_logs
    WHERE action = 'corporate_case.runtime_settings.changed'
      AND target_id = '00000000-0000-4000-8000-00000000ca5e'
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: security audit entry was not created exactly once';
  END IF;
END;
$$;

SELECT pg_temp.expect_error(
  $$UPDATE public.corporate_case_runtime_changes
    SET reason = 'Alteração proibida do histórico imutável para validação do trigger.'$$,
  'corporate_case_runtime_changes_are_immutable'
);

ROLLBACK;
