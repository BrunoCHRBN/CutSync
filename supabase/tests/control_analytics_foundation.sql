-- Execute after 20260804004000_control_analytics_foundation.sql.
-- All fixtures and analytical snapshots are rolled back.

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

CREATE OR REPLACE FUNCTION pg_temp.analytics_day(offset_days integer)
RETURNS date
LANGUAGE sql
STABLE
AS $$
  SELECT (now() AT TIME ZONE 'America/Sao_Paulo')::date + offset_days;
$$;

CREATE OR REPLACE FUNCTION pg_temp.analytics_time(
  offset_days integer,
  target_hour integer
)
RETURNS timestamptz
LANGUAGE sql
STABLE
AS $$
  SELECT (
    pg_temp.analytics_day(offset_days)::timestamp
    + make_interval(hours => target_hour)
  ) AT TIME ZONE 'America/Sao_Paulo';
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
  IF has_schema_privilege('authenticated', 'analytics_private', 'USAGE') THEN
    RAISE EXCEPTION 'FAIL: authenticated can use analytics_private';
  END IF;
  IF has_table_privilege(
    'authenticated',
    'analytics_private.control_daily_metrics',
    'SELECT'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated can read private metric facts';
  END IF;
  IF has_function_privilege(
    'authenticated',
    'analytics_private.refresh_control_daily_metrics(date)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated can refresh private metric facts';
  END IF;
  IF has_function_privilege(
    'anon',
    'public.list_control_metric_scopes()'::regprocedure,
    'EXECUTE'
  ) OR has_function_privilege(
    'anon',
    'public.get_control_executive_dashboard(date,date,text,uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: anon can execute Control analytics RPCs';
  END IF;
  IF NOT has_function_privilege(
    'authenticated',
    'public.get_control_executive_dashboard(date,date,text,uuid)'::regprocedure,
    'EXECUTE'
  ) THEN
    RAISE EXCEPTION 'FAIL: authenticated cannot execute dashboard RPC';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'analytics_private'
      AND relation.relname = 'control_daily_metrics'
      AND relation.relrowsecurity
  ) THEN
    RAISE EXCEPTION 'FAIL: private metric facts do not have RLS enabled';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM cron.job AS job
    WHERE job.jobname = 'control-analytics-finalize-yesterday'
      AND job.command LIKE '%America/Sao_Paulo%'
      AND job.command LIKE '%- 1%'
  ) THEN
    RAISE EXCEPTION 'FAIL: daily Control analytics cron is missing';
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
    '8f000000-0000-4000-8000-000000000001',
    'analytics-owner@example.test',
    '{"name":"Analytics Owner"}'::jsonb,
    now(),
    pg_temp.analytics_time(-12, 8),
    now()
  ),
  (
    '8f000000-0000-4000-8000-000000000002',
    'analytics-professional@example.test',
    '{"name":"Analytics Professional"}'::jsonb,
    now(),
    pg_temp.analytics_time(-12, 8),
    now()
  ),
  (
    '8f000000-0000-4000-8000-000000000003',
    'analytics-client-a@example.test',
    '{"name":"Analytics Client A"}'::jsonb,
    now(),
    pg_temp.analytics_time(-12, 8),
    now()
  ),
  (
    '8f000000-0000-4000-8000-000000000004',
    'analytics-client-b@example.test',
    '{"name":"Analytics Client B"}'::jsonb,
    now(),
    pg_temp.analytics_time(-12, 8),
    now()
  ),
  (
    '8f000000-0000-4000-8000-000000000005',
    'analytics-outsider@example.test',
    '{"name":"Analytics Outsider"}'::jsonb,
    now(),
    pg_temp.analytics_time(-12, 8),
    now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture transacional da fundação analítica',
  true
);
INSERT INTO public.governance_users (
  profile_id,
  role,
  granted_by
)
VALUES (
  '8f000000-0000-4000-8000-000000000001',
  'SaaS_Owner',
  '8f000000-0000-4000-8000-000000000001'
);

INSERT INTO public.establishments (
  id,
  name,
  slug,
  timezone,
  account_status,
  created_at,
  updated_at
)
VALUES
  (
    '8f100000-0000-4000-8000-000000000001',
    'Analytics Unit One',
    'analytics-unit-one',
    'America/Sao_Paulo',
    'active',
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  ),
  (
    '8f100000-0000-4000-8000-000000000002',
    'Analytics Unit Two',
    'analytics-unit-two',
    'America/Sao_Paulo',
    'active',
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  ),
  (
    '8f100000-0000-4000-8000-000000000003',
    'Analytics Empty Unit',
    'analytics-empty-unit',
    'America/Sao_Paulo',
    'active',
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  );

INSERT INTO public.organizations (
  id,
  name,
  status,
  created_by,
  created_at,
  updated_at
)
VALUES (
  '8f200000-0000-4000-8000-000000000001',
  'Analytics Organization',
  'active',
  '8f000000-0000-4000-8000-000000000001',
  pg_temp.analytics_time(-10, 8),
  pg_temp.analytics_time(-10, 8)
);

INSERT INTO public.organization_members (
  organization_id,
  profile_id,
  role,
  status,
  created_by,
  created_at,
  updated_at
)
VALUES (
  '8f200000-0000-4000-8000-000000000001',
  '8f000000-0000-4000-8000-000000000001',
  'owner',
  'active',
  '8f000000-0000-4000-8000-000000000001',
  pg_temp.analytics_time(-10, 8),
  pg_temp.analytics_time(-10, 8)
);

INSERT INTO public.organization_establishments (
  organization_id,
  establishment_id,
  status,
  effective_from,
  linked_by,
  created_at,
  updated_at
)
VALUES
  (
    '8f200000-0000-4000-8000-000000000001',
    '8f100000-0000-4000-8000-000000000001',
    'active',
    pg_temp.analytics_day(-10),
    '8f000000-0000-4000-8000-000000000001',
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  ),
  (
    '8f200000-0000-4000-8000-000000000001',
    '8f100000-0000-4000-8000-000000000002',
    'active',
    pg_temp.analytics_day(-10),
    '8f000000-0000-4000-8000-000000000001',
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  );

INSERT INTO public.memberships (
  profile_id,
  establishment_id,
  role,
  status,
  commission_rate,
  created_by,
  created_at,
  updated_at
)
VALUES (
  '8f000000-0000-4000-8000-000000000002',
  '8f100000-0000-4000-8000-000000000001',
  'professional',
  'active',
  0.50,
  '8f000000-0000-4000-8000-000000000001',
  pg_temp.analytics_time(-10, 8),
  pg_temp.analytics_time(-10, 8)
);

INSERT INTO public.services (
  id,
  establishment_id,
  name,
  price,
  duration_minutes,
  created_at,
  updated_at
)
VALUES
  (
    'analytics-service-one',
    '8f100000-0000-4000-8000-000000000001',
    'Analytics Service One',
    0,
    30,
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  ),
  (
    'analytics-service-two',
    '8f100000-0000-4000-8000-000000000002',
    'Analytics Service Two',
    0,
    30,
    pg_temp.analytics_time(-10, 8),
    pg_temp.analytics_time(-10, 8)
  );

INSERT INTO public.appointments (
  id,
  establishment_id,
  client_id,
  client_name,
  professional_id,
  service_id,
  date_time,
  duration_minutes,
  ends_at,
  status,
  created_at,
  updated_at
)
VALUES
  (
    'analytics-previous-completed-a',
    '8f100000-0000-4000-8000-000000000001',
    '8f000000-0000-4000-8000-000000000003',
    'Client A',
    '8f000000-0000-4000-8000-000000000002',
    'analytics-service-one',
    pg_temp.analytics_time(-6, 10),
    30,
    pg_temp.analytics_time(-6, 10) + interval '30 minutes',
    'completed',
    pg_temp.analytics_time(-7, 10),
    pg_temp.analytics_time(-6, 11)
  ),
  (
    'analytics-current-completed-a',
    '8f100000-0000-4000-8000-000000000001',
    '8f000000-0000-4000-8000-000000000003',
    'Client A',
    '8f000000-0000-4000-8000-000000000002',
    'analytics-service-one',
    pg_temp.analytics_time(-4, 10),
    30,
    pg_temp.analytics_time(-4, 10) + interval '30 minutes',
    'completed',
    pg_temp.analytics_time(-4, 8),
    pg_temp.analytics_time(-4, 11)
  ),
  (
    'analytics-current-cancelled-a',
    '8f100000-0000-4000-8000-000000000001',
    '8f000000-0000-4000-8000-000000000003',
    'Client A',
    '8f000000-0000-4000-8000-000000000002',
    'analytics-service-one',
    pg_temp.analytics_time(-4, 12),
    30,
    pg_temp.analytics_time(-4, 12) + interval '30 minutes',
    'cancelled',
    pg_temp.analytics_time(-4, 9),
    pg_temp.analytics_time(-4, 12)
  ),
  (
    'analytics-current-completed-b',
    '8f100000-0000-4000-8000-000000000002',
    '8f000000-0000-4000-8000-000000000004',
    'Client B',
    '8f000000-0000-4000-8000-000000000002',
    'analytics-service-two',
    pg_temp.analytics_time(-3, 10),
    30,
    pg_temp.analytics_time(-3, 10) + interval '30 minutes',
    'completed',
    pg_temp.analytics_time(-3, 8),
    pg_temp.analytics_time(-3, 11)
  ),
  (
    'analytics-current-confirmed-b',
    '8f100000-0000-4000-8000-000000000002',
    '8f000000-0000-4000-8000-000000000004',
    'Client B',
    '8f000000-0000-4000-8000-000000000002',
    'analytics-service-two',
    pg_temp.analytics_time(-3, 12),
    30,
    pg_temp.analytics_time(-3, 12) + interval '30 minutes',
    'confirmed',
    pg_temp.analytics_time(-3, 9),
    pg_temp.analytics_time(-3, 12)
  );

INSERT INTO public.establishment_requests (
  id,
  requester_id,
  requester_name,
  requester_email,
  name,
  slug,
  status,
  reviewed_by,
  reviewed_at,
  establishment_id,
  created_at,
  updated_at
)
VALUES (
  '8f300000-0000-4000-8000-000000000001',
  '8f000000-0000-4000-8000-000000000001',
  'Analytics Owner',
  'analytics-owner@example.test',
  'Analytics Unit Two',
  'analytics-unit-two-request',
  'approved',
  '8f000000-0000-4000-8000-000000000001',
  pg_temp.analytics_time(-4, 8),
  '8f100000-0000-4000-8000-000000000002',
  pg_temp.analytics_time(-8, 8),
  pg_temp.analytics_time(-4, 8)
);

INSERT INTO public.security_audit_logs (
  actor_id,
  action,
  target_id,
  target_type,
  changes,
  created_at
)
VALUES (
  '8f000000-0000-4000-8000-000000000001',
  'establishment.status_changed',
  '8f100000-0000-4000-8000-000000000002',
  'establishment',
  '{"old_status":"pending_verification","new_status":"active"}'::jsonb,
  pg_temp.analytics_time(-4, 8)
);

INSERT INTO public.support_tickets (
  id,
  requester_id,
  requester_role,
  product,
  category,
  subject,
  impact,
  priority,
  status,
  establishment_id,
  organization_id,
  sync_status,
  first_response_due_at,
  sla_breached,
  created_at,
  updated_at
)
VALUES
  (
    '8f400000-0000-4000-8000-000000000001',
    '8f000000-0000-4000-8000-000000000001',
    'admin',
    'business',
    'platform_incident',
    'Fixture critical analytics ticket',
    'critical',
    'critical',
    'sync_failed',
    '8f100000-0000-4000-8000-000000000002',
    '8f200000-0000-4000-8000-000000000001',
    'failed',
    pg_temp.analytics_time(-4, 9),
    true,
    pg_temp.analytics_time(-4, 8),
    pg_temp.analytics_time(-4, 10)
  ),
  (
    '8f400000-0000-4000-8000-000000000002',
    '8f000000-0000-4000-8000-000000000001',
    'admin',
    'business',
    'other',
    'Fixture future SLA ticket',
    'low',
    'low',
    'open',
    '8f100000-0000-4000-8000-000000000002',
    '8f200000-0000-4000-8000-000000000001',
    'synced',
    pg_temp.analytics_time(-1, 9),
    false,
    pg_temp.analytics_time(-4, 8),
    pg_temp.analytics_time(-4, 10)
  );

SELECT analytics_private.refresh_control_daily_metrics(
  pg_temp.analytics_day(-6)
);
SELECT analytics_private.refresh_control_daily_metrics(
  pg_temp.analytics_day(-5)
);
SELECT analytics_private.refresh_control_daily_metrics(
  pg_temp.analytics_day(-4)
);
SELECT analytics_private.refresh_control_daily_metrics(
  pg_temp.analytics_day(-3)
);

DO $$
DECLARE
  rows_before integer;
  rows_after integer;
BEGIN
  SELECT count(*)
  INTO rows_before
  FROM analytics_private.control_daily_metrics AS metric
  WHERE metric.scope_type = 'organization'
    AND metric.scope_id = '8f200000-0000-4000-8000-000000000001'
    AND metric.metric_date = pg_temp.analytics_day(-4);

  PERFORM analytics_private.refresh_control_daily_metrics(
    pg_temp.analytics_day(-4)
  );

  SELECT count(*)
  INTO rows_after
  FROM analytics_private.control_daily_metrics AS metric
  WHERE metric.scope_type = 'organization'
    AND metric.scope_id = '8f200000-0000-4000-8000-000000000001'
    AND metric.metric_date = pg_temp.analytics_day(-4);

  IF rows_before <> 1 OR rows_after <> 1 THEN
    RAISE EXCEPTION 'FAIL: daily refresh is not idempotent';
  END IF;
END;
$$;

DO $$
BEGIN
  IF analytics_private.metric_comparison(2, 1, true, true)
      #>> '{comparison_status}' <> 'available'
    OR analytics_private.metric_comparison(2, 1, false, true)
      #>> '{comparison_status}' <> 'current_incomplete'
    OR analytics_private.metric_comparison(2, 1, true, false)
      #>> '{comparison_status}' <> 'comparison_unavailable'
    OR analytics_private.metric_comparison(NULL, NULL, true, true)
      #>> '{comparison_status}' <> 'no_denominator'
    OR analytics_private.metric_comparison(1, 0, true, true)
      #>> '{comparison_status}' <> 'previous_zero'
    OR analytics_private.metric_comparison(1, 0, true, true)
      #> '{delta_percent}' <> 'null'::jsonb
  THEN
    RAISE EXCEPTION 'FAIL: comparison status contract is invalid';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8f000000-0000-4000-8000-000000000001',
  'aal1'
);
SELECT pg_temp.expect_error(
  format(
    'SELECT public.get_control_executive_dashboard(%L, %L, %L, %L)',
    pg_temp.analytics_day(-4),
    pg_temp.analytics_day(-3),
    'organization',
    '8f200000-0000-4000-8000-000000000001'
  ),
  'control_aal2_required'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8f000000-0000-4000-8000-000000000005',
  'aal2'
);
SELECT pg_temp.expect_error(
  format(
    'SELECT public.get_control_executive_dashboard(%L, %L, %L, %L)',
    pg_temp.analytics_day(-4),
    pg_temp.analytics_day(-3),
    'organization',
    '8f200000-0000-4000-8000-000000000001'
  ),
  'forbidden'
);
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor(
  '8f000000-0000-4000-8000-000000000001',
  'aal2'
);
DO $$
DECLARE
  dashboard jsonb := public.get_control_executive_dashboard(
    pg_temp.analytics_day(-4),
    pg_temp.analytics_day(-3),
    'organization',
    '8f200000-0000-4000-8000-000000000001'
  );
  empty_dashboard jsonb := public.get_control_executive_dashboard(
    pg_temp.analytics_day(-4),
    pg_temp.analytics_day(-3),
    'establishment',
    '8f100000-0000-4000-8000-000000000003'
  );
BEGIN
  IF NOT dashboard ?& ARRAY[
    'generated_at',
    'timezone',
    'definition_version',
    'scope',
    'period',
    'comparison_period',
    'kpis',
    'drivers',
    'guardrails',
    'series',
    'data_quality'
  ] THEN
    RAISE EXCEPTION 'FAIL: executive dashboard top-level contract is invalid';
  END IF;
  IF dashboard#>>'{scope,type}' <> 'organization'
    OR dashboard#>>'{scope,id}'
      <> '8f200000-0000-4000-8000-000000000001'
    OR (dashboard#>>'{period,days}')::integer <> 2
  THEN
    RAISE EXCEPTION 'FAIL: executive dashboard scope/period is invalid';
  END IF;
  IF (dashboard#>>'{kpis,completed_appointments,value}')::numeric <> 2
    OR (
      dashboard#>>'{kpis,completed_appointments,previous}'
    )::numeric <> 1
    OR (
      dashboard#>>'{kpis,completed_appointments,delta_absolute}'
    )::numeric <> 1
    OR (
      dashboard#>>'{kpis,operating_establishments,value}'
    )::numeric <> 2
    OR (
      dashboard#>>'{kpis,returning_clients_rate,value}'
    )::numeric <> 50
  THEN
    RAISE EXCEPTION 'FAIL: primary KPI values are invalid: %', dashboard;
  END IF;
  IF (dashboard#>>'{drivers,appointments_created,value}')::numeric <> 4
    OR (
      dashboard#>>'{drivers,appointments_confirmed,value}'
    )::numeric <> 1
    OR (dashboard#>>'{drivers,completion_rate,value}')::numeric <> 50
    OR (
      dashboard#>>'{drivers,approved_establishments,value}'
    )::numeric <> 1
    OR (
      dashboard#>>'{drivers,activated_establishments_14d,value}'
    )::numeric <> 1
    OR (dashboard#>>'{drivers,new_clients,value}')::numeric <> 1
    OR (dashboard#>>'{drivers,returning_clients,value}')::numeric <> 1
    OR (
      dashboard#>>'{drivers,active_professionals,value}'
    )::numeric <> 1
    OR (dashboard#>>'{drivers,active_owners,value}')::numeric <> 1
    OR (dashboard#>>'{drivers,active_clients,value}')::numeric <> 2
  THEN
    RAISE EXCEPTION 'FAIL: driver values are invalid: %', dashboard;
  END IF;
  IF (dashboard#>>'{guardrails,cancellation_rate,value}')::numeric <> 25
    OR (
      dashboard#>>'{guardrails,identified_client_coverage,value}'
    )::numeric <> 100
    OR (dashboard#>>'{guardrails,critical_tickets,value}')::numeric <> 1
    OR (dashboard#>>'{guardrails,sla_at_risk,value}')::numeric <> 1
    OR (dashboard#>>'{guardrails,sync_failed,value}')::numeric <> 1
  THEN
    RAISE EXCEPTION 'FAIL: guardrail values are invalid: %', dashboard;
  END IF;
  IF jsonb_array_length(dashboard->'series') <> 2
    OR (dashboard#>>'{data_quality,missing_days}')::integer <> 0
    OR (dashboard#>>'{data_quality,comparison_available}')::boolean IS NOT true
  THEN
    RAISE EXCEPTION 'FAIL: series/data-quality contract is invalid';
  END IF;
  IF empty_dashboard#>'{drivers,completion_rate,value}' <> 'null'::jsonb
    OR empty_dashboard#>'{guardrails,cancellation_rate,value}'
      <> 'null'::jsonb
    OR empty_dashboard#>>'{drivers,completion_rate,comparison_status}'
      <> 'no_denominator'
  THEN
    RAISE EXCEPTION 'FAIL: zero denominators must return null percentages';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.list_control_metric_scopes() AS scope
    WHERE scope.scope_type = 'organization'
      AND scope.scope_id = '8f200000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'FAIL: organization scope is not listed';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.list_control_metric_scopes() AS scope
    WHERE scope.scope_type = 'establishment'
      AND scope.scope_id = '8f100000-0000-4000-8000-000000000001'
      AND scope.parent_id = '8f200000-0000-4000-8000-000000000001'
  ) THEN
    RAISE EXCEPTION 'FAIL: establishment parent scope is invalid';
  END IF;
END;
$$;

SELECT pg_temp.expect_error(
  format(
    'SELECT public.get_control_executive_dashboard(%L, %L, %L, NULL)',
    pg_temp.analytics_day(-100),
    pg_temp.analytics_day(-3),
    'global'
  ),
  'analytics_range_too_large'
);
RESET ROLE;

ROLLBACK;
