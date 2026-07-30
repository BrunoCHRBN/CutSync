-- READ-ONLY preflight. Safe to run against production before any Control
-- analytics migration is promoted. It never changes schema or data.

WITH checks AS (
  SELECT
    'control_access_context'::text AS check_key,
    to_regprocedure('public.get_control_context()') IS NOT NULL AS ready,
    'AAL2 access context RPC'::text AS detail
  UNION ALL
  SELECT
    'analytics_daily_facts',
    to_regclass('analytics_private.control_daily_metrics') IS NOT NULL,
    'Private daily snapshot table'
  UNION ALL
  SELECT
    'analytics_source_coverage',
    to_regclass(
      'analytics_private.control_metric_source_coverage'
    ) IS NOT NULL,
    'Explicit source coverage catalog'
  UNION ALL
  SELECT
    'analytics_refresh_queue',
    to_regclass(
      'analytics_private.control_metric_refresh_runs'
    ) IS NOT NULL,
    'Auditable refresh queue'
  UNION ALL
  SELECT
    'executive_dashboard_rpc',
    to_regprocedure(
      'public.get_control_executive_dashboard(date,date,text,uuid)'
    ) IS NOT NULL,
    'Executive dashboard RPC'
  UNION ALL
  SELECT
    'analytics_health_rpc',
    to_regprocedure('public.get_control_analytics_health()') IS NOT NULL,
    'Data health RPC'
  UNION ALL
  SELECT
    'analytics_reprocess_rpc',
    to_regprocedure(
      'public.request_control_analytics_reprocess(date,date,text)'
    ) IS NOT NULL,
    'Owner-only reprocessing RPC'
  UNION ALL
  SELECT
    'support_source',
    to_regclass('public.support_tickets') IS NOT NULL,
    'Official support source used by guardrails'
  UNION ALL
  SELECT
    'analytics_worker',
    to_regprocedure(
      'analytics_private.process_control_analytics_refresh_queue(integer)'
    ) IS NOT NULL,
    'Bounded private refresh worker'
)
SELECT
  check_key,
  CASE WHEN ready THEN 'ready' ELSE 'blocked' END AS status,
  detail
FROM checks
ORDER BY ready, check_key;
