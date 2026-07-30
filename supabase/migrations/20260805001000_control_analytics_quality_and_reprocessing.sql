BEGIN;

-- The CLI scaffold was moved after the repository's already versioned
-- 20260805000000 migration so remote migration ordering remains monotonic.

CREATE TABLE analytics_private.control_metric_source_coverage (
  source_family text PRIMARY KEY CHECK (
    source_family IN ('operations', 'people', 'activation', 'support')
  ),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 3 AND 80),
  available_from date NOT NULL,
  status text NOT NULL CHECK (
    status IN ('available', 'partial', 'unavailable')
  ),
  assessment_method text NOT NULL CHECK (
    assessment_method IN ('derived', 'operator_reviewed')
  ),
  assessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE analytics_private.control_metric_source_coverage
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE analytics_private.control_metric_source_coverage
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE analytics_private.control_metric_source_coverage
  TO service_role;

WITH source_dates AS (
  SELECT
    'operations'::text AS source_family,
    'Operação e agenda'::text AS label,
    coalesce(
      (
        SELECT min(candidate.source_date)
        FROM (
          SELECT min(
            establishment.created_at AT TIME ZONE establishment.timezone
          )::date AS source_date
          FROM public.establishments AS establishment
          UNION ALL
          SELECT min(
            appointment.date_time AT TIME ZONE establishment.timezone
          )::date
          FROM public.appointments AS appointment
          JOIN public.establishments AS establishment
            ON establishment.id = appointment.establishment_id
          WHERE appointment.deleted_at IS NULL
          UNION ALL
          SELECT min(
            request.created_at AT TIME ZONE 'America/Sao_Paulo'
          )::date
          FROM public.establishment_requests AS request
        ) AS candidate
      ),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    ) AS available_from
  UNION ALL
  SELECT
    'people',
    'Pessoas e vínculos',
    coalesce(
      (
        SELECT min(candidate.source_date)
        FROM (
          SELECT min(
            profile.created_at AT TIME ZONE 'America/Sao_Paulo'
          )::date AS source_date
          FROM public.profiles AS profile
          UNION ALL
          SELECT min(
            membership.created_at AT TIME ZONE 'America/Sao_Paulo'
          )::date
          FROM public.memberships AS membership
          UNION ALL
          SELECT min(
            member.created_at AT TIME ZONE 'America/Sao_Paulo'
          )::date
          FROM public.organization_members AS member
        ) AS candidate
      ),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    )
  UNION ALL
  SELECT
    'activation',
    'Ativação de estabelecimentos',
    coalesce(
      (
        SELECT min(candidate.source_date)
        FROM (
          SELECT min(
            request.created_at AT TIME ZONE 'America/Sao_Paulo'
          )::date AS source_date
          FROM public.establishment_requests AS request
          UNION ALL
          SELECT min(
            audit.created_at AT TIME ZONE 'America/Sao_Paulo'
          )::date
          FROM public.security_audit_logs AS audit
          WHERE audit.action = 'establishment.status_changed'
        ) AS candidate
      ),
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    )
  UNION ALL
  SELECT
    'support',
    'Suporte oficial',
    coalesce(
      min(ticket.created_at AT TIME ZONE 'America/Sao_Paulo')::date,
      (now() AT TIME ZONE 'America/Sao_Paulo')::date
    )
  FROM public.support_tickets AS ticket
)
INSERT INTO analytics_private.control_metric_source_coverage (
  source_family,
  label,
  available_from,
  status,
  assessment_method
)
SELECT
  source.source_family,
  source.label,
  source.available_from,
  'available',
  'derived'
FROM source_dates AS source
ON CONFLICT (source_family) DO NOTHING;

ALTER TABLE analytics_private.control_daily_metrics
  ADD COLUMN IF NOT EXISTS operations_observed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS people_observed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS activation_observed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS support_observed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION analytics_private.mark_control_metric_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, analytics_private
AS $$
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'operations'
      AND coverage.status = 'available'
      AND coverage.available_from <= NEW.metric_date
  )
  INTO NEW.operations_observed;

  SELECT EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'people'
      AND coverage.status = 'available'
      AND coverage.available_from <= NEW.metric_date
  )
  INTO NEW.people_observed;

  SELECT EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'activation'
      AND coverage.status = 'available'
      AND coverage.available_from <= NEW.metric_date
  )
  INTO NEW.activation_observed;

  SELECT EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'support'
      AND coverage.status = 'available'
      AND coverage.available_from <= NEW.metric_date
  )
  INTO NEW.support_observed;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.mark_control_metric_coverage()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS control_daily_metrics_mark_coverage
  ON analytics_private.control_daily_metrics;
CREATE TRIGGER control_daily_metrics_mark_coverage
  BEFORE INSERT OR UPDATE ON analytics_private.control_daily_metrics
  FOR EACH ROW
  EXECUTE FUNCTION analytics_private.mark_control_metric_coverage();

UPDATE analytics_private.control_daily_metrics AS metric
SET
  operations_observed = EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'operations'
      AND coverage.status = 'available'
      AND coverage.available_from <= metric.metric_date
  ),
  people_observed = EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'people'
      AND coverage.status = 'available'
      AND coverage.available_from <= metric.metric_date
  ),
  activation_observed = EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'activation'
      AND coverage.status = 'available'
      AND coverage.available_from <= metric.metric_date
  ),
  support_observed = EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_source_coverage AS coverage
    WHERE coverage.source_family = 'support'
      AND coverage.status = 'available'
      AND coverage.available_from <= metric.metric_date
  );

CREATE TABLE analytics_private.control_metric_refresh_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_type text NOT NULL CHECK (
    run_type IN ('daily', 'backfill', 'reprocess')
  ),
  requested_start date NOT NULL,
  requested_end date NOT NULL,
  cursor_date date,
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'running', 'succeeded', 'failed')
  ),
  requested_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  processed_days integer NOT NULL DEFAULT 0 CHECK (processed_days >= 0),
  last_error_code text CHECK (
    last_error_code IS NULL
    OR last_error_code ~ '^[A-Z0-9_]{2,64}$'
  ),
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (requested_end >= requested_start),
  CHECK (
    cursor_date IS NULL
    OR cursor_date BETWEEN requested_start AND requested_end + 1
  )
);

ALTER TABLE analytics_private.control_metric_refresh_runs
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE analytics_private.control_metric_refresh_runs
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE
  analytics_private.control_metric_refresh_runs
  TO service_role;

CREATE INDEX control_metric_refresh_runs_pending_idx
  ON analytics_private.control_metric_refresh_runs (created_at, id)
  WHERE status = 'pending';

CREATE INDEX control_metric_refresh_runs_active_range_idx
  ON analytics_private.control_metric_refresh_runs (
    requested_start,
    requested_end
  )
  WHERE status IN ('pending', 'running');

CREATE UNIQUE INDEX control_metric_refresh_runs_daily_unique_idx
  ON analytics_private.control_metric_refresh_runs (
    run_type,
    requested_start,
    requested_end
  )
  WHERE run_type = 'daily';

CREATE OR REPLACE FUNCTION analytics_private.enqueue_control_metric_refresh(
  target_start date,
  target_end date,
  target_run_type text,
  target_reason text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, analytics_private
AS $$
DECLARE
  existing_id uuid;
  created_id uuid;
BEGIN
  IF target_start IS NULL
    OR target_end IS NULL
    OR target_end < target_start
  THEN
    RAISE EXCEPTION 'invalid_analytics_refresh_range';
  END IF;
  IF target_run_type NOT IN ('daily', 'backfill') THEN
    RAISE EXCEPTION 'invalid_analytics_refresh_type';
  END IF;
  IF char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'invalid_analytics_refresh_reason';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('cutsync_control_analytics_refresh_queue')
  );

  SELECT run.id
  INTO existing_id
  FROM analytics_private.control_metric_refresh_runs AS run
  WHERE run.run_type = target_run_type
    AND run.requested_start = target_start
    AND run.requested_end = target_end
  ORDER BY run.created_at DESC
  LIMIT 1;

  IF existing_id IS NOT NULL THEN
    RETURN existing_id;
  END IF;

  INSERT INTO analytics_private.control_metric_refresh_runs (
    run_type,
    requested_start,
    requested_end,
    reason
  )
  VALUES (
    target_run_type,
    target_start,
    target_end,
    btrim(target_reason)
  )
  RETURNING id INTO created_id;

  RETURN created_id;
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.enqueue_control_metric_refresh(
  date,
  date,
  text,
  text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.enqueue_control_metric_refresh(
  date,
  date,
  text,
  text
) TO service_role;

CREATE OR REPLACE FUNCTION analytics_private.process_control_analytics_refresh_queue(
  max_days integer DEFAULT 3
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, analytics_private
AS $$
DECLARE
  bounded_days integer := least(greatest(coalesce(max_days, 3), 1), 3);
  run_record analytics_private.control_metric_refresh_runs%ROWTYPE;
  current_day date;
  processed_in_call integer := 0;
  error_state text;
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext('cutsync_control_analytics_refresh_worker')
  );

  UPDATE analytics_private.control_metric_refresh_runs
  SET
    status = 'pending',
    started_at = NULL,
    updated_at = now(),
    last_error_code = 'STALE_RUN_RECOVERED'
  WHERE status = 'running'
    AND updated_at < now() - interval '15 minutes';

  SELECT run.*
  INTO run_record
  FROM analytics_private.control_metric_refresh_runs AS run
  WHERE run.status = 'pending'
  ORDER BY run.created_at, run.id
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF run_record.id IS NULL THEN
    RETURN jsonb_build_object('status', 'idle', 'processed_days', 0);
  END IF;

  UPDATE analytics_private.control_metric_refresh_runs
  SET
    status = 'running',
    started_at = coalesce(started_at, now()),
    updated_at = now(),
    last_error_code = NULL
  WHERE id = run_record.id;

  current_day := coalesce(run_record.cursor_date, run_record.requested_start);

  WHILE current_day <= run_record.requested_end
    AND processed_in_call < bounded_days
  LOOP
    PERFORM analytics_private.refresh_control_daily_metrics(current_day);
    processed_in_call := processed_in_call + 1;
    current_day := current_day + 1;

    UPDATE analytics_private.control_metric_refresh_runs
    SET
      cursor_date = current_day,
      processed_days = processed_days + 1,
      updated_at = now()
    WHERE id = run_record.id;
  END LOOP;

  IF current_day > run_record.requested_end THEN
    UPDATE analytics_private.control_metric_refresh_runs
    SET
      status = 'succeeded',
      cursor_date = requested_end + 1,
      completed_at = now(),
      updated_at = now()
    WHERE id = run_record.id;
  ELSE
    UPDATE analytics_private.control_metric_refresh_runs
    SET
      status = 'pending',
      updated_at = now()
    WHERE id = run_record.id;
  END IF;

  RETURN jsonb_build_object(
    'id', run_record.id,
    'status', CASE
      WHEN current_day > run_record.requested_end THEN 'succeeded'
      ELSE 'pending'
    END,
    'processed_days', processed_in_call,
    'next_date', CASE
      WHEN current_day <= run_record.requested_end THEN current_day
      ELSE NULL
    END
  );
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS error_state = RETURNED_SQLSTATE;

  IF run_record.id IS NOT NULL THEN
    UPDATE analytics_private.control_metric_refresh_runs
    SET
      status = 'failed',
      last_error_code = upper(coalesce(error_state, 'INTERNAL_ERROR')),
      completed_at = now(),
      updated_at = now()
    WHERE id = run_record.id;
  END IF;

  RETURN jsonb_build_object(
    'id', run_record.id,
    'status', 'failed',
    'error_code', upper(coalesce(error_state, 'INTERNAL_ERROR'))
  );
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.process_control_analytics_refresh_queue(
  integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION
  analytics_private.process_control_analytics_refresh_queue(integer)
  TO service_role;

CREATE OR REPLACE FUNCTION analytics_private.strict_metric_comparison(
  metric jsonb,
  current_complete boolean,
  previous_complete boolean,
  current_source_available boolean,
  previous_source_available boolean
)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  current_value numeric := (metric->>'value')::numeric;
  previous_value numeric := (metric->>'previous')::numeric;
  status text;
BEGIN
  status := CASE
    WHEN NOT current_complete THEN 'current_incomplete'
    WHEN NOT previous_complete THEN 'comparison_unavailable'
    WHEN NOT current_source_available OR NOT previous_source_available
      THEN 'source_unavailable'
    WHEN current_value IS NULL OR previous_value IS NULL
      THEN 'no_denominator'
    WHEN previous_value = 0 THEN 'previous_zero'
    ELSE 'available'
  END;

  RETURN jsonb_build_object(
    'value', CASE
      WHEN current_complete AND current_source_available THEN current_value
      ELSE NULL
    END,
    'previous', CASE
      WHEN previous_complete AND previous_source_available THEN previous_value
      ELSE NULL
    END,
    'delta_absolute', CASE
      WHEN status = 'available'
      THEN round(current_value - previous_value, 2)
      ELSE NULL
    END,
    'delta_percent', CASE
      WHEN status = 'available'
      THEN round(
        (current_value - previous_value) * 100.0
        / abs(previous_value),
        2
      )
      ELSE NULL
    END,
    'comparison_status', status
  );
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.strict_metric_comparison(
  jsonb,
  boolean,
  boolean,
  boolean,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.strict_metric_comparison(
  jsonb,
  boolean,
  boolean,
  boolean,
  boolean
) TO service_role;

ALTER FUNCTION public.get_control_executive_dashboard(
  date,
  date,
  text,
  uuid
) RENAME TO get_control_executive_dashboard_source_v1;

REVOKE ALL ON FUNCTION public.get_control_executive_dashboard_source_v1(
  date,
  date,
  text,
  uuid
) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_control_executive_dashboard(
  range_start date,
  range_end date,
  scope_type text,
  scope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
DECLARE
  raw_dashboard jsonb;
  requested_scope_type text := lower(btrim(coalesce(scope_type, '')));
  requested_scope_key text;
  previous_start date;
  current_complete boolean;
  previous_complete boolean;
  current_operations boolean := false;
  previous_operations boolean := false;
  current_people boolean := false;
  previous_people boolean := false;
  current_activation boolean := false;
  previous_activation boolean := false;
  current_support boolean := false;
  previous_support boolean := false;
  missing_dates jsonb;
  source_coverage jsonb;
  full_coverage_start date;
  quality jsonb;
  strict_series jsonb;
BEGIN
  raw_dashboard := public.get_control_executive_dashboard_source_v1(
    range_start,
    range_end,
    scope_type,
    scope_id
  );

  requested_scope_key := CASE
    WHEN requested_scope_type = 'global' THEN 'global'
    ELSE scope_id::text
  END;
  previous_start := (raw_dashboard#>>'{comparison_period,start}')::date;
  current_complete := coalesce(
    (raw_dashboard#>>'{data_quality,missing_days}')::integer = 0,
    false
  );
  previous_complete := coalesce(
    (raw_dashboard#>>'{data_quality,comparison_available}')::boolean,
    false
  );

  SELECT
    coalesce(bool_or(
      coverage.source_family = 'operations'
      AND coverage.status = 'available'
      AND coverage.available_from <= range_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'operations'
      AND coverage.status = 'available'
      AND coverage.available_from <= previous_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'people'
      AND coverage.status = 'available'
      AND coverage.available_from <= range_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'people'
      AND coverage.status = 'available'
      AND coverage.available_from <= previous_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'activation'
      AND coverage.status = 'available'
      AND coverage.available_from <= range_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'activation'
      AND coverage.status = 'available'
      AND coverage.available_from <= previous_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'support'
      AND coverage.status = 'available'
      AND coverage.available_from <= range_start
    ), false),
    coalesce(bool_or(
      coverage.source_family = 'support'
      AND coverage.status = 'available'
      AND coverage.available_from <= previous_start
    ), false)
  INTO
    current_operations,
    previous_operations,
    current_people,
    previous_people,
    current_activation,
    previous_activation,
    current_support,
    previous_support
  FROM analytics_private.control_metric_source_coverage AS coverage;

  SELECT coalesce(
    jsonb_agg(day.metric_date::date ORDER BY day.metric_date),
    '[]'::jsonb
  )
  INTO missing_dates
  FROM generate_series(range_start, range_end, interval '1 day') AS day(metric_date)
  WHERE NOT EXISTS (
    SELECT 1
    FROM analytics_private.control_daily_metrics AS metric
    WHERE metric.scope_type = requested_scope_type
      AND metric.scope_key = requested_scope_key
      AND metric.metric_date = day.metric_date::date
      AND metric.definition_version = 1
      AND metric.is_final
  );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'family', coverage.source_family,
        'label', coverage.label,
        'available_from', coverage.available_from,
        'status', coverage.status,
        'assessed_at', coverage.assessed_at
      )
      ORDER BY coverage.source_family
    ),
    '[]'::jsonb
  )
  INTO source_coverage
  FROM analytics_private.control_metric_source_coverage AS coverage;

  SELECT max(coverage.available_from)
  INTO full_coverage_start
  FROM analytics_private.control_metric_source_coverage AS coverage
  WHERE coverage.status = 'available';

  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{kpis,completed_appointments}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{kpis,completed_appointments}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{kpis,operating_establishments}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{kpis,operating_establishments}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{kpis,returning_clients_rate}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{kpis,returning_clients_rate}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );

  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,appointments_created}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,appointments_created}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,appointments_confirmed}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,appointments_confirmed}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,completion_rate}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,completion_rate}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,new_clients}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,new_clients}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,returning_clients}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,returning_clients}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,active_clients}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,active_clients}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,active_professionals}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,active_professionals}',
      current_complete,
      previous_complete,
      current_people,
      previous_people
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,active_owners}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,active_owners}',
      current_complete,
      previous_complete,
      current_people,
      previous_people
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,approved_establishments}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,approved_establishments}',
      current_complete,
      previous_complete,
      current_activation,
      previous_activation
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,activated_establishments_14d}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,activated_establishments_14d}',
      current_complete,
      previous_complete,
      current_activation,
      previous_activation
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{drivers,average_days_to_first_completion}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{drivers,average_days_to_first_completion}',
      current_complete,
      previous_complete,
      current_activation,
      previous_activation
    )
  );

  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{guardrails,cancellation_rate}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{guardrails,cancellation_rate}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{guardrails,identified_client_coverage}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{guardrails,identified_client_coverage}',
      current_complete,
      previous_complete,
      current_operations,
      previous_operations
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{guardrails,critical_tickets}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{guardrails,critical_tickets}',
      current_complete,
      previous_complete,
      current_support,
      previous_support
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{guardrails,sla_at_risk}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{guardrails,sla_at_risk}',
      current_complete,
      previous_complete,
      current_support,
      previous_support
    )
  );
  raw_dashboard := jsonb_set(
    raw_dashboard,
    '{guardrails,sync_failed}',
    analytics_private.strict_metric_comparison(
      raw_dashboard#>'{guardrails,sync_failed}',
      current_complete,
      previous_complete,
      current_support,
      previous_support
    )
  );

  SELECT coalesce(
    jsonb_agg(
      CASE
        WHEN coalesce(metric.operations_observed, false) THEN point.value
        ELSE point.value || jsonb_build_object(
          'completed_appointments', NULL,
          'operating_establishments', NULL,
          'returning_clients_rate', NULL,
          'cancellation_rate', NULL
        )
      END
      ORDER BY (point.value->>'date')::date
    ),
    '[]'::jsonb
  )
  INTO strict_series
  FROM jsonb_array_elements(raw_dashboard->'series') AS point(value)
  LEFT JOIN analytics_private.control_daily_metrics AS metric
    ON metric.scope_type = requested_scope_type
    AND metric.scope_key = requested_scope_key
    AND metric.metric_date = (point.value->>'date')::date
    AND metric.definition_version = 1
    AND metric.is_final;

  quality := (raw_dashboard->'data_quality') || jsonb_build_object(
    'coverage_start_date', full_coverage_start,
    'coverage_end_date',
      raw_dashboard#>>'{data_quality,latest_complete_date}',
    'missing_dates', missing_dates,
    'source_coverage', source_coverage,
    'comparison_available',
      current_complete
      AND previous_complete
      AND current_operations
      AND previous_operations
      AND current_people
      AND previous_people
      AND current_activation
      AND previous_activation
      AND current_support
      AND previous_support,
    'comparison_available_on', jsonb_build_object(
      '7', CASE
        WHEN full_coverage_start IS NULL THEN NULL
        ELSE full_coverage_start + 14
      END,
      '28', CASE
        WHEN full_coverage_start IS NULL THEN NULL
        ELSE full_coverage_start + 56
      END,
      '90', CASE
        WHEN full_coverage_start IS NULL THEN NULL
        ELSE full_coverage_start + 180
      END
    )
  );

  raw_dashboard := jsonb_set(raw_dashboard, '{series}', strict_series);
  raw_dashboard := jsonb_set(raw_dashboard, '{data_quality}', quality);

  RETURN raw_dashboard;
END;
$$;

REVOKE ALL ON FUNCTION public.get_control_executive_dashboard(
  date,
  date,
  text,
  uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_control_executive_dashboard(
  date,
  date,
  text,
  uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_control_analytics_health()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
DECLARE
  local_today date := (
    now() AT TIME ZONE 'America/Sao_Paulo'
  )::date;
  latest_complete_date date;
  earliest_complete_date date;
  full_coverage_start date;
  missing_dates jsonb;
  source_coverage jsonb;
  recent_runs jsonb;
  comparison_availability jsonb;
  queue_summary jsonb;
BEGIN
  PERFORM public.get_control_context();

  SELECT
    min(metric.metric_date),
    max(metric.metric_date)
  INTO earliest_complete_date, latest_complete_date
  FROM analytics_private.control_daily_metrics AS metric
  WHERE metric.scope_type = 'global'
    AND metric.scope_key = 'global'
    AND metric.definition_version = 1
    AND metric.is_final;

  SELECT
    CASE
      WHEN count(*) FILTER (WHERE coverage.status = 'available') = 4
      THEN max(coverage.available_from) FILTER (
        WHERE coverage.status = 'available'
      )
      ELSE NULL
    END,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'family', coverage.source_family,
          'label', coverage.label,
          'available_from', coverage.available_from,
          'status', coverage.status,
          'assessed_at', coverage.assessed_at
        )
        ORDER BY coverage.source_family
      ),
      '[]'::jsonb
    )
  INTO full_coverage_start, source_coverage
  FROM analytics_private.control_metric_source_coverage AS coverage;

  SELECT coalesce(
    jsonb_agg(day.metric_date::date ORDER BY day.metric_date),
    '[]'::jsonb
  )
  INTO missing_dates
  FROM generate_series(
    greatest(
      coalesce(full_coverage_start, local_today),
      local_today - 180
    ),
    local_today - 1,
    interval '1 day'
  ) AS day(metric_date)
  WHERE NOT EXISTS (
    SELECT 1
    FROM analytics_private.control_daily_metrics AS metric
    WHERE metric.scope_type = 'global'
      AND metric.scope_key = 'global'
      AND metric.metric_date = day.metric_date::date
      AND metric.definition_version = 1
      AND metric.is_final
  );

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', run.id,
        'run_type', run.run_type,
        'start', run.requested_start,
        'end', run.requested_end,
        'status', run.status,
        'processed_days', run.processed_days,
        'total_days', run.requested_end - run.requested_start + 1,
        'error_code', run.last_error_code,
        'created_at', run.created_at,
        'updated_at', run.updated_at,
        'completed_at', run.completed_at
      )
      ORDER BY run.created_at DESC
    ),
    '[]'::jsonb
  )
  INTO recent_runs
  FROM (
    SELECT source.*
    FROM analytics_private.control_metric_refresh_runs AS source
    ORDER BY source.created_at DESC
    LIMIT 20
  ) AS run;

  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE run.status = 'pending'),
    'running', count(*) FILTER (WHERE run.status = 'running'),
    'failed', count(*) FILTER (WHERE run.status = 'failed')
  )
  INTO queue_summary
  FROM analytics_private.control_metric_refresh_runs AS run;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'range_days', target.days,
        'available_on', CASE
          WHEN full_coverage_start IS NULL THEN NULL
          ELSE full_coverage_start + (target.days * 2)
        END,
        'available',
          full_coverage_start IS NOT NULL
          AND local_today >= full_coverage_start + (target.days * 2)
          AND NOT EXISTS (
            SELECT 1
            FROM generate_series(
              local_today - (target.days * 2),
              local_today - 1,
              interval '1 day'
            ) AS expected(metric_date)
            WHERE NOT EXISTS (
              SELECT 1
              FROM analytics_private.control_daily_metrics AS metric
              WHERE metric.scope_type = 'global'
                AND metric.scope_key = 'global'
                AND metric.metric_date = expected.metric_date::date
                AND metric.definition_version = 1
                AND metric.is_final
            )
          )
      )
      ORDER BY target.days
    ),
    '[]'::jsonb
  )
  INTO comparison_availability
  FROM (VALUES (7), (28), (90)) AS target(days);

  RETURN jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Sao_Paulo',
    'coverage_start_date', full_coverage_start,
    'earliest_complete_date', earliest_complete_date,
    'latest_complete_date', latest_complete_date,
    'missing_dates', missing_dates,
    'source_coverage', source_coverage,
    'comparison_availability', comparison_availability,
    'queue', queue_summary,
    'recent_runs', recent_runs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_control_analytics_health()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_control_analytics_health()
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.request_control_analytics_reprocess(
  range_start date,
  range_end date,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
DECLARE
  context_payload jsonb;
  local_today date := (
    now() AT TIME ZONE 'America/Sao_Paulo'
  )::date;
  coverage_floor date;
  created_id uuid;
BEGIN
  context_payload := public.get_control_context();

  IF context_payload->>'role' <> 'SaaS_Owner' THEN
    RAISE EXCEPTION 'control_owner_required';
  END IF;
  IF range_start IS NULL
    OR range_end IS NULL
    OR range_end < range_start
  THEN
    RAISE EXCEPTION 'invalid_analytics_reprocess_range';
  END IF;
  IF range_end - range_start + 1 > 14 THEN
    RAISE EXCEPTION 'analytics_reprocess_range_too_large';
  END IF;
  IF range_end >= local_today THEN
    RAISE EXCEPTION 'analytics_reprocess_requires_complete_days';
  END IF;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_analytics_reprocess_reason';
  END IF;

  SELECT min(coverage.available_from)
  INTO coverage_floor
  FROM analytics_private.control_metric_source_coverage AS coverage
  WHERE coverage.status = 'available';

  IF coverage_floor IS NULL OR range_start < coverage_floor THEN
    RAISE EXCEPTION 'analytics_reprocess_before_source_coverage';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('cutsync_control_analytics_refresh_queue')
  );

  IF EXISTS (
    SELECT 1
    FROM analytics_private.control_metric_refresh_runs AS run
    WHERE run.status IN ('pending', 'running')
      AND daterange(
        run.requested_start,
        run.requested_end,
        '[]'
      ) && daterange(range_start, range_end, '[]')
  ) THEN
    RAISE EXCEPTION 'analytics_reprocess_overlaps_active_run';
  END IF;

  INSERT INTO analytics_private.control_metric_refresh_runs (
    run_type,
    requested_start,
    requested_end,
    requested_by,
    reason
  )
  VALUES (
    'reprocess',
    range_start,
    range_end,
    auth.uid(),
    btrim(reason)
  )
  RETURNING id INTO created_id;

  RETURN jsonb_build_object(
    'id', created_id,
    'status', 'pending',
    'start', range_start,
    'end', range_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_control_analytics_reprocess(
  date,
  date,
  text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.request_control_analytics_reprocess(
  date,
  date,
  text
) TO authenticated, service_role;

DO $schedule$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname IN (
      'control-analytics-finalize-yesterday',
      'control-analytics-refresh-worker'
    )
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'control-analytics-finalize-yesterday',
    '10 6 * * *',
    $job$
      SELECT analytics_private.enqueue_control_metric_refresh(
        (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1,
        (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1,
        'daily',
        'Finalização diária automática do Control.'
      );
    $job$
  );

  PERFORM cron.schedule(
    'control-analytics-refresh-worker',
    '*/5 * * * *',
    $job$
      SELECT analytics_private.process_control_analytics_refresh_queue(3);
    $job$
  );
END;
$schedule$;

DO $bootstrap$
DECLARE
  first_covered_date date;
  last_complete_date date := (
    now() AT TIME ZONE 'America/Sao_Paulo'
  )::date - 1;
BEGIN
  SELECT min(coverage.available_from)
  INTO first_covered_date
  FROM analytics_private.control_metric_source_coverage AS coverage
  WHERE coverage.status = 'available';

  IF first_covered_date IS NOT NULL
    AND first_covered_date <= last_complete_date
    AND NOT EXISTS (
      SELECT 1
      FROM analytics_private.control_metric_refresh_runs AS run
      WHERE run.run_type = 'backfill'
        AND run.requested_start = first_covered_date
        AND run.requested_end = last_complete_date
    )
  THEN
    PERFORM analytics_private.enqueue_control_metric_refresh(
      first_covered_date,
      last_complete_date,
      'backfill',
      'Carga histórica inicial da cobertura analítica do Control.'
    );
  END IF;
END;
$bootstrap$;

SELECT analytics_private.process_control_analytics_refresh_queue(3);

NOTIFY pgrst, 'reload schema';

COMMIT;
