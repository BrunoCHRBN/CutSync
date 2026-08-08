-- Execute after 20260805001000_control_analytics_quality_and_reprocessing.sql.
-- The test changes only private analytics rows and rolls everything back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.quality_set_actor(
  actor_id uuid,
  actor_aal text DEFAULT 'aal2'
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

CREATE OR REPLACE FUNCTION pg_temp.quality_expect_error(
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
    RAISE EXCEPTION 'FAIL: expected %, got %',
      expected_fragment,
      SQLERRM;
  END IF;
END;
$$;

DO $$
BEGIN
  IF has_schema_privilege('authenticated', 'analytics_private', 'USAGE') THEN
    RAISE EXCEPTION 'FAIL: authenticated can use analytics_private';
  END IF;
  IF has_table_privilege(
    'authenticated',
    'analytics_private.control_metric_source_coverage',
    'SELECT'
  ) OR has_table_privilege(
    'authenticated',
    'analytics_private.control_metric_refresh_runs',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated can read private analytics controls';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'analytics_private.process_control_analytics_refresh_queue(integer)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated can execute the private worker';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.get_control_analytics_health()'::regprocedure,
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.request_control_analytics_reprocess(date,date,text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: anon can execute analytics quality RPCs';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.get_control_analytics_health()'::regprocedure,
    'EXECUTE'
  ) OR NOT has_function_privilege(
    'authenticated',
    'public.request_control_analytics_reprocess(date,date,text)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated RPC grants are missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job AS job
    WHERE job.jobname = 'control-analytics-refresh-worker'
      AND job.schedule = '*/5 * * * *'
      AND job.command LIKE '%process_control_analytics_refresh_queue(3)%'
  ) THEN
    RAISE EXCEPTION 'FAIL: bounded analytics worker cron is missing';
  END IF;
END;
$$;

DO $$
DECLARE
  comparison jsonb;
BEGIN
  comparison := analytics_private.strict_metric_comparison(
    '{"value":10,"previous":8}'::jsonb,
    true,
    true,
    false,
    false
  );
  IF comparison#>>'{comparison_status}' <> 'source_unavailable'
    OR comparison#>'{value}' <> 'null'::jsonb
    OR comparison#>'{previous}' <> 'null'::jsonb
  THEN
    RAISE EXCEPTION 'FAIL: missing source must not be represented as zero';
  END IF;

  comparison := analytics_private.strict_metric_comparison(
    '{"value":10,"previous":8}'::jsonb,
    true,
    true,
    true,
    true
  );
  IF comparison#>>'{comparison_status}' <> 'available'
    OR (comparison#>>'{delta_percent}')::numeric <> 25
  THEN
    RAISE EXCEPTION 'FAIL: fully covered comparison is invalid';
  END IF;
END;
$$;

INSERT INTO auth.users (
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES (
  '90500000-0000-0000-0000-000000000001',
  'analytics-quality-owner@example.test',
  '{"name":"Analytics Quality Owner"}'::jsonb,
  now(), now(), now()
);

SELECT set_config(
  'cutsync.governance_access_reason',
  'analytics_quality_sql_test',
  true
);

INSERT INTO public.governance_users (profile_id, role, granted_by)
VALUES (
  '90500000-0000-0000-0000-000000000001',
  'SaaS_Owner',
  '90500000-0000-0000-0000-000000000001'
);

SELECT set_config(
  'cutsync.test_analytics_owner',
  (
    SELECT governance.profile_id::text
    FROM public.governance_users AS governance
    WHERE governance.role = 'SaaS_Owner'
      AND governance.is_active
      AND governance.revoked_at IS NULL
      AND (
        governance.expires_at IS NULL
        OR governance.expires_at > now()
      )
    ORDER BY governance.granted_at
    LIMIT 1
  ),
  true
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.quality_set_actor(
  current_setting('cutsync.test_analytics_owner')::uuid,
  'aal2'
);

DO $$
DECLARE
  health jsonb := public.get_control_analytics_health();
BEGIN
  IF NOT health ?& ARRAY[
    'generated_at',
    'timezone',
    'coverage_start_date',
    'missing_dates',
    'source_coverage',
    'comparison_availability',
    'queue',
    'recent_runs'
  ] THEN
    RAISE EXCEPTION 'FAIL: analytics health contract is incomplete';
  END IF;
  IF jsonb_array_length(health->'source_coverage') <> 4
    OR jsonb_array_length(health->'comparison_availability') <> 3
  THEN
    RAISE EXCEPTION 'FAIL: analytics health coverage is invalid';
  END IF;
END;
$$;

SELECT pg_temp.quality_expect_error(
  format(
    'SELECT public.request_control_analytics_reprocess(%L, %L, %L)',
    (now() AT TIME ZONE 'America/Sao_Paulo')::date - 20,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1,
    'Intervalo propositalmente maior que quatorze dias.'
  ),
  'analytics_reprocess_range_too_large'
);
RESET ROLE;

ROLLBACK;
