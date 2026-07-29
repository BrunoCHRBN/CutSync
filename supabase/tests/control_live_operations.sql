-- Execute after 20260804001000_control_live_operations.sql.
-- All fixtures and mutations are rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(
  actor_id uuid,
  actor_aal text DEFAULT 'aal1'
)
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
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN
    RAISE;
  END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %',
      expected_fragment,
      SQLERRM;
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.get_control_live_snapshot()'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: anon can execute get_control_live_snapshot';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'realtime'
      AND tablename = 'messages'
      AND policyname = 'Control members receive live invalidations'
      AND cmd = 'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL: private Control Broadcast policy missing';
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
    '8e000000-0000-4000-8000-000000000001',
    'live-owner@example.test',
    '{"name":"Live Owner"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-4000-8000-000000000002',
    'live-viewer@example.test',
    '{"name":"Live Viewer"}'::jsonb,
    now(),
    now(),
    now()
  ),
  (
    '8e000000-0000-4000-8000-000000000003',
    'live-outsider@example.test',
    '{"name":"Live Outsider"}'::jsonb,
    now(),
    now(),
    now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture transacional do Control Ao Vivo',
  true
);
INSERT INTO public.governance_users (
  profile_id,
  role,
  granted_by
)
VALUES
  (
    '8e000000-0000-4000-8000-000000000001',
    'SaaS_Owner',
    '8e000000-0000-4000-8000-000000000001'
  ),
  (
    '8e000000-0000-4000-8000-000000000002',
    'SaaS_Viewer',
    '8e000000-0000-4000-8000-000000000001'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-4000-8000-000000000002',
  'aal1'
);
SELECT pg_temp.expect_error(
  'SELECT public.get_control_live_snapshot()',
  'control_aal2_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-4000-8000-000000000003',
  'aal2'
);
SELECT pg_temp.expect_error(
  'SELECT public.get_control_live_snapshot()',
  'forbidden'
);
DO $$
BEGIN
  IF public.can_read_control_live() THEN
    RAISE EXCEPTION 'FAIL: outsider can join control:live';
  END IF;
END;
$$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-4000-8000-000000000002',
  'aal2'
);
DO $$
DECLARE
  snapshot jsonb := public.get_control_live_snapshot();
BEGIN
  IF NOT public.can_read_control_live() THEN
    RAISE EXCEPTION 'FAIL: active AAL2 viewer cannot join control:live';
  END IF;
  IF snapshot->>'timezone' <> 'America/Sao_Paulo'
    OR NOT snapshot ? 'appointments'
    OR NOT snapshot ? 'establishments'
    OR snapshot->'support' <> 'null'::jsonb
  THEN
    RAISE EXCEPTION 'FAIL: viewer snapshot contract is invalid';
  END IF;
END;
$$;
RESET ROLE;

INSERT INTO public.support_team_members (
  team_id,
  profile_id,
  member_role,
  jira_account_id,
  is_active,
  assigned_by
)
VALUES (
  'b3000000-0000-4000-8000-000000000001',
  '8e000000-0000-4000-8000-000000000001',
  'lead',
  'live-owner-jira-account',
  true,
  '8e000000-0000-4000-8000-000000000001'
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8e000000-0000-4000-8000-000000000001',
  'aal2'
);
DO $$
DECLARE
  snapshot jsonb := public.get_control_live_snapshot();
  support jsonb := snapshot->'support';
BEGIN
  IF support IS NULL
    OR NOT support ? 'open_queue'
    OR NOT support ? 'critical_open'
    OR NOT support ? 'sla_at_risk'
    OR NOT support ? 'pending_operations'
  THEN
    RAISE EXCEPTION 'FAIL: owner support snapshot contract is invalid';
  END IF;
END;
$$;
RESET ROLE;

ROLLBACK;
