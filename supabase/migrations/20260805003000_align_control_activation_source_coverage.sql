BEGIN;

-- The activation family combines approved requests with audited activation
-- events. It is trustworthy only from the later of those two source starts.
WITH activation_start AS (
  SELECT greatest(
    coalesce(
      (
        SELECT min(
          request.created_at AT TIME ZONE 'America/Sao_Paulo'
        )::date
        FROM public.establishment_requests AS request
      ),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ),
    coalesce(
      (
        SELECT min(
          audit.created_at AT TIME ZONE 'America/Sao_Paulo'
        )::date
        FROM public.security_audit_logs AS audit
        WHERE audit.action = 'establishment.status_changed'
          AND audit.changes->>'new_status' = 'active'
      ),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    )
  ) AS available_from
)
UPDATE analytics_private.control_metric_source_coverage AS coverage
SET
  available_from = source.available_from,
  assessment_method = 'derived',
  assessed_at = now()
FROM activation_start AS source
WHERE coverage.source_family = 'activation';

UPDATE analytics_private.control_daily_metrics AS metric
SET activation_observed = EXISTS (
  SELECT 1
  FROM analytics_private.control_metric_source_coverage AS coverage
  WHERE coverage.source_family = 'activation'
    AND coverage.status = 'available'
    AND coverage.available_from <= metric.metric_date
);

COMMIT;
