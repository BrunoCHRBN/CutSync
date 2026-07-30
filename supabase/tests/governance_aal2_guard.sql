-- Execute after 20260804002000_restore_governance_aal2_guard.sql.
-- Synthetic fixtures and plan mutations are rolled back.

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
    '8d000000-0000-0000-0000-000000000001',
    'governance-aal2-owner@example.test',
    '{"name":"AAL2 Owner Fixture"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8d000000-0000-0000-0000-000000000002',
    'governance-aal2-viewer@example.test',
    '{"name":"AAL2 Viewer Fixture"}'::jsonb,
    now(),
    now(),
    now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Teste transacional do guard AAL2',
  true
);

INSERT INTO public.governance_users (
  profile_id,
  role,
  granted_by
)
VALUES
  (
    '8d000000-0000-0000-0000-000000000001',
    'SaaS_Owner',
    '8d000000-0000-0000-0000-000000000001'
  ),
  (
    '8d000000-0000-0000-0000-000000000002',
    'SaaS_Viewer',
    '8d000000-0000-0000-0000-000000000001'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8d000000-0000-0000-0000-000000000002',
  'aal1'
);
DO $$
BEGIN
  IF public.is_governance_user() THEN
    RAISE EXCEPTION 'FAIL: AAL1 session passed the governance guard';
  END IF;
END;
$$;
SELECT pg_temp.expect_error(
  'SELECT * FROM public.list_control_billing_accounts()',
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8d000000-0000-0000-0000-000000000001',
  'aal1'
);
SELECT pg_temp.expect_error(
  $statement$
    SELECT public.configure_control_plan('network', 4990, 'BRL')
  $statement$,
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8d000000-0000-0000-0000-000000000002',
  'aal2'
);
DO $$
BEGIN
  IF NOT public.is_governance_user() THEN
    RAISE EXCEPTION 'FAIL: active AAL2 viewer failed the governance guard';
  END IF;
  PERFORM count(*) FROM public.list_control_billing_accounts();
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8d000000-0000-0000-0000-000000000001',
  'aal2'
);
DO $$
BEGIN
  IF NOT public.is_governance_user(
    ARRAY['SaaS_Owner']::public.governance_role_enum[]
  ) THEN
    RAISE EXCEPTION 'FAIL: active AAL2 owner failed the governance guard';
  END IF;
  PERFORM public.configure_control_plan('network', 4990, 'BRL');
END;
$$;
RESET ROLE;

ROLLBACK;
