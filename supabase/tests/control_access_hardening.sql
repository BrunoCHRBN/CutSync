-- Execute after 20260804003000_harden_control_access_and_identity_resolution.sql.
-- Synthetic fixtures and all mutations are rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', actor_id,
      'role', 'authenticated',
      'aal', actor_aal
    )::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(
  statement text,
  expected_fragment text
)
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
      RAISE EXCEPTION
        'FAIL: expected error containing %, got %',
        expected_fragment,
        SQLERRM;
    END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.find_control_profile_by_email(text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: anon can search Control profiles';
  END IF;

  IF has_function_privilege(
    'anon',
    'public.resolve_identity_migration_conflict(uuid,uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: anon can resolve identity conflicts';
  END IF;

  IF has_function_privilege(
    'authenticated',
    'public.resolve_identity_migration_conflict(uuid,uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated can call the service-only resolver directly';
  END IF;

  IF NOT has_function_privilege(
    'service_role',
    'public.resolve_identity_migration_conflict(uuid,uuid,text,text)',
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: service_role cannot execute the identity resolver';
  END IF;
END;
$$;

INSERT INTO auth.users (
  id,
  email,
  raw_user_meta_data,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES
  (
    '8e000000-0000-0000-0000-000000000001',
    'control-hardening-owner@example.test',
    '{"name":"Hardening Owner"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-0000-0000-000000000002',
    'control-hardening-editor@example.test',
    '{"name":"Hardening Editor"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-0000-0000-000000000003',
    'control-hardening-viewer@example.test',
    '{"name":"Hardening Viewer"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-0000-0000-000000000004',
    'control-hardening-revoked@example.test',
    '{"name":"Revoked Editor"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-0000-0000-000000000005',
    'control-hardening-expired@example.test',
    '{"name":"Expired Owner"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-0000-0000-000000000006',
    'control-target@example.test',
    '{"name":"Control Target"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-0000-0000-000000000007',
    'control-deleted@example.test',
    '{"name":"Deleted Target"}'::jsonb,
    now(),
    now(),
    now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture transacional do hardening de acesso',
  true
);

INSERT INTO public.governance_users (
  profile_id,
  role,
  granted_by
)
VALUES
  (
    '8e000000-0000-0000-0000-000000000001',
    'SaaS_Owner',
    '8e000000-0000-0000-0000-000000000001'
  ),
  (
    '8e000000-0000-0000-0000-000000000002',
    'SaaS_Editor',
    '8e000000-0000-0000-0000-000000000001'
  ),
  (
    '8e000000-0000-0000-0000-000000000003',
    'SaaS_Viewer',
    '8e000000-0000-0000-0000-000000000001'
  ),
  (
    '8e000000-0000-0000-0000-000000000004',
    'SaaS_Editor',
    '8e000000-0000-0000-0000-000000000001'
  ),
  (
    '8e000000-0000-0000-0000-000000000005',
    'SaaS_Owner',
    '8e000000-0000-0000-0000-000000000001'
  );

UPDATE public.governance_users
SET is_active = false,
    revoked_at = now(),
    revoked_by = '8e000000-0000-0000-0000-000000000001',
    updated_at = now()
WHERE profile_id = '8e000000-0000-0000-0000-000000000004';

UPDATE public.governance_users
SET granted_at = now() - interval '2 days',
    expires_at = now() - interval '1 minute',
    updated_at = now()
WHERE profile_id = '8e000000-0000-0000-0000-000000000005';

UPDATE public.profiles
SET deleted_at = now()
WHERE id = '8e000000-0000-0000-0000-000000000007';

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-0000-0000-000000000001',
  'aal1'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT * FROM public.find_control_profile_by_email(
      'control-target@example.test'
    )
  $statement$,
  'control_aal2_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-0000-0000-000000000003',
  'aal2'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT * FROM public.find_control_profile_by_email(
      'control-target@example.test'
    )
  $statement$,
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-0000-0000-000000000002',
  'aal2'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT * FROM public.find_control_profile_by_email(
      'control-target@example.test'
    )
  $statement$,
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-0000-0000-000000000001',
  'aal2'
);
DO $$
DECLARE
  found_profile_id uuid;
  found_name text;
  found_email text;
  result_count integer;
BEGIN
  SELECT result.profile_id, result.name, result.email
  INTO found_profile_id, found_name, found_email
  FROM public.find_control_profile_by_email(
    '  CONTROL-TARGET@EXAMPLE.TEST  '
  ) AS result;

  IF found_profile_id IS DISTINCT FROM
    '8e000000-0000-0000-0000-000000000006'::uuid
    OR found_name IS DISTINCT FROM 'Control Target'
    OR found_email IS DISTINCT FROM 'control-target@example.test'
  THEN
    RAISE EXCEPTION
      'FAIL: exact case-insensitive profile lookup returned unexpected data';
  END IF;

  SELECT count(*)
  INTO result_count
  FROM public.find_control_profile_by_email('control-target');
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: partial email lookup returned a profile';
  END IF;

  SELECT count(*)
  INTO result_count
  FROM public.find_control_profile_by_email('control-deleted@example.test');
  IF result_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: deleted profile was returned';
  END IF;
END;
$$;
SELECT pg_temp.expect_error(
  $statement$
    SELECT * FROM public.find_control_profile_by_email('   ')
  $statement$,
  'profile_email_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.resolve_identity_migration_conflict(
      '8e000000-0000-0000-0000-000000000001',
      '8e000000-0000-0000-0000-000000000099',
      'reject',
      'Tentativa direta sem a função de borda'
    )
  $statement$,
  'permission denied'
);
RESET ROLE;

SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.resolve_identity_migration_conflict(
      '8e000000-0000-0000-0000-000000000003',
      '8e000000-0000-0000-0000-000000000099',
      'reject',
      'Viewer não pode resolver este conflito'
    )
  $statement$,
  'forbidden'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.resolve_identity_migration_conflict(
      '8e000000-0000-0000-0000-000000000004',
      '8e000000-0000-0000-0000-000000000099',
      'reject',
      'Ator revogado não pode resolver conflito'
    )
  $statement$,
  'forbidden'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.resolve_identity_migration_conflict(
      '8e000000-0000-0000-0000-000000000005',
      '8e000000-0000-0000-0000-000000000099',
      'reject',
      'Ator expirado não pode resolver conflito'
    )
  $statement$,
  'forbidden'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.resolve_identity_migration_conflict(
      '8e000000-0000-0000-0000-000000000002',
      '8e000000-0000-0000-0000-000000000099',
      'reject',
      'Editor ativo pode alcançar o conflito'
    )
  $statement$,
  'conflict_not_pending'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.resolve_identity_migration_conflict(
      '8e000000-0000-0000-0000-000000000001',
      '8e000000-0000-0000-0000-000000000099',
      'reject',
      'Owner ativo pode alcançar o conflito'
    )
  $statement$,
  'conflict_not_pending'
);
RESET ROLE;

ROLLBACK;
