BEGIN;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;

-- Daily analytical facts stay outside the schemas exposed by PostgREST.
CREATE SCHEMA IF NOT EXISTS analytics_private;

REVOKE ALL ON SCHEMA analytics_private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA analytics_private TO service_role;

CREATE TABLE analytics_private.control_daily_metrics (
  metric_date date NOT NULL,
  scope_type text NOT NULL CHECK (
    scope_type IN ('global', 'organization', 'establishment')
  ),
  scope_id uuid,
  scope_key text NOT NULL,
  scope_label text NOT NULL CHECK (char_length(btrim(scope_label)) > 0),
  timezone text NOT NULL,
  definition_version integer NOT NULL CHECK (definition_version > 0),
  is_final boolean NOT NULL,

  total_appointments bigint NOT NULL CHECK (total_appointments >= 0),
  completed_appointments bigint NOT NULL CHECK (completed_appointments >= 0),
  operating_establishments bigint NOT NULL CHECK (
    operating_establishments >= 0
  ),
  identified_clients bigint NOT NULL CHECK (identified_clients >= 0),
  returning_clients bigint NOT NULL CHECK (returning_clients >= 0),
  appointments_created bigint NOT NULL CHECK (appointments_created >= 0),
  appointments_confirmed bigint NOT NULL CHECK (appointments_confirmed >= 0),
  approved_establishments bigint NOT NULL CHECK (
    approved_establishments >= 0
  ),
  activation_cohort_size bigint NOT NULL CHECK (activation_cohort_size >= 0),
  activated_establishments_14d bigint NOT NULL CHECK (
    activated_establishments_14d >= 0
  ),
  average_days_to_first_completion numeric(12, 2) CHECK (
    average_days_to_first_completion IS NULL
    OR average_days_to_first_completion >= 0
  ),
  new_clients bigint NOT NULL CHECK (new_clients >= 0),
  active_professionals bigint NOT NULL CHECK (active_professionals >= 0),
  active_owners bigint NOT NULL CHECK (active_owners >= 0),
  active_clients bigint NOT NULL CHECK (active_clients >= 0),
  cancelled_appointments bigint NOT NULL CHECK (
    cancelled_appointments >= 0
  ),
  critical_tickets bigint NOT NULL CHECK (critical_tickets >= 0),
  sla_at_risk bigint NOT NULL CHECK (sla_at_risk >= 0),
  sync_failed bigint NOT NULL CHECK (sync_failed >= 0),

  completion_rate numeric(7, 2) CHECK (
    completion_rate IS NULL
    OR completion_rate BETWEEN 0 AND 100
  ),
  returning_clients_rate numeric(7, 2) CHECK (
    returning_clients_rate IS NULL
    OR returning_clients_rate BETWEEN 0 AND 100
  ),
  cancellation_rate numeric(7, 2) CHECK (
    cancellation_rate IS NULL
    OR cancellation_rate BETWEEN 0 AND 100
  ),
  identified_client_coverage numeric(7, 2) CHECK (
    identified_client_coverage IS NULL
    OR identified_client_coverage BETWEEN 0 AND 100
  ),

  completed_with_client_id bigint NOT NULL CHECK (
    completed_with_client_id >= 0
  ),
  activation_events_available bigint NOT NULL CHECK (
    activation_events_available >= 0
  ),
  freshness_at timestamptz,
  generated_at timestamptz NOT NULL DEFAULT now(),

  PRIMARY KEY (scope_type, scope_key, metric_date),
  CONSTRAINT control_daily_metrics_scope_contract CHECK (
    (
      scope_type = 'global'
      AND scope_id IS NULL
      AND scope_key = 'global'
    )
    OR (
      scope_type IN ('organization', 'establishment')
      AND scope_id IS NOT NULL
      AND scope_key = scope_id::text
    )
  )
);

ALTER TABLE analytics_private.control_daily_metrics
  ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE analytics_private.control_daily_metrics
  FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE analytics_private.control_daily_metrics
  TO service_role;

CREATE INDEX control_daily_metrics_complete_date_idx
  ON analytics_private.control_daily_metrics (
    scope_type,
    scope_key,
    definition_version,
    metric_date DESC
  )
  WHERE is_final;

CREATE INDEX IF NOT EXISTS security_audit_control_activation_idx
  ON public.security_audit_logs (created_at, target_id)
  WHERE action = 'establishment.status_changed'
    AND changes->>'new_status' = 'active';

CREATE INDEX IF NOT EXISTS appointments_control_date_time_idx
  ON public.appointments (establishment_id, date_time)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS appointments_control_created_at_idx
  ON public.appointments (establishment_id, created_at)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS appointments_control_created_range_idx
  ON public.appointments (created_at, establishment_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS appointments_control_client_history_idx
  ON public.appointments (client_id, date_time, establishment_id)
  WHERE deleted_at IS NULL
    AND status = 'completed'
    AND client_id IS NOT NULL;

CREATE OR REPLACE FUNCTION analytics_private.is_establishment_in_scope(
  target_establishment_id uuid,
  target_event_date date,
  target_scope_type text,
  target_scope_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
  SELECT CASE target_scope_type
    WHEN 'global' THEN true
    WHEN 'establishment' THEN target_establishment_id = target_scope_id
    WHEN 'organization' THEN EXISTS (
      SELECT 1
      FROM public.organization_establishments AS link
      WHERE link.organization_id = target_scope_id
        AND link.establishment_id = target_establishment_id
        AND link.effective_from <= target_event_date
        AND (
          link.effective_until IS NULL
          OR link.effective_until >= target_event_date
        )
        AND (
          link.status = 'active'
          OR link.effective_until IS NOT NULL
        )
    )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION analytics_private.is_establishment_in_scope(
  uuid,
  date,
  text,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.is_establishment_in_scope(
  uuid,
  date,
  text,
  uuid
) TO service_role;

CREATE OR REPLACE FUNCTION analytics_private.compute_control_scope_metrics(
  target_range_start date,
  target_range_end date,
  target_scope_type text,
  target_scope_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
DECLARE
  report_timezone text := 'America/Sao_Paulo';
  result jsonb;
BEGIN
  IF target_range_end < target_range_start THEN
    RAISE EXCEPTION 'invalid_analytics_range';
  END IF;
  IF target_scope_type NOT IN ('global', 'organization', 'establishment') THEN
    RAISE EXCEPTION 'invalid_analytics_scope';
  END IF;
  IF (
    target_scope_type = 'global'
    AND target_scope_id IS NOT NULL
  ) OR (
    target_scope_type <> 'global'
    AND target_scope_id IS NULL
  ) THEN
    RAISE EXCEPTION 'invalid_analytics_scope';
  END IF;

  IF target_scope_type = 'establishment' THEN
    SELECT establishment.timezone
    INTO report_timezone
    FROM public.establishments AS establishment
    WHERE establishment.id = target_scope_id;
  END IF;

  report_timezone := coalesce(report_timezone, 'America/Sao_Paulo');

  WITH period_appointments AS MATERIALIZED (
    SELECT
      appointment.id,
      appointment.establishment_id,
      appointment.client_id,
      appointment.status,
      appointment.date_time,
      appointment.created_at,
      appointment.updated_at
    FROM public.appointments AS appointment
    JOIN public.establishments AS establishment
      ON establishment.id = appointment.establishment_id
    WHERE appointment.deleted_at IS NULL
      AND appointment.date_time >= (
        target_range_start::timestamp AT TIME ZONE 'UTC'
        - interval '14 hours'
      )
      AND appointment.date_time < (
        (target_range_end + 1)::timestamp AT TIME ZONE 'UTC'
        + interval '12 hours'
      )
      AND (
        target_scope_type <> 'establishment'
        OR appointment.establishment_id = target_scope_id
      )
      AND (
        appointment.date_time AT TIME ZONE establishment.timezone
      )::date BETWEEN target_range_start AND target_range_end
      AND analytics_private.is_establishment_in_scope(
        appointment.establishment_id,
        (
          appointment.date_time AT TIME ZONE establishment.timezone
        )::date,
        target_scope_type,
        target_scope_id
      )
  ),
  created_appointments AS MATERIALIZED (
    SELECT
      appointment.id,
      appointment.establishment_id,
      appointment.updated_at
    FROM public.appointments AS appointment
    JOIN public.establishments AS establishment
      ON establishment.id = appointment.establishment_id
    WHERE appointment.deleted_at IS NULL
      AND appointment.created_at >= (
        target_range_start::timestamp AT TIME ZONE 'UTC'
        - interval '14 hours'
      )
      AND appointment.created_at < (
        (target_range_end + 1)::timestamp AT TIME ZONE 'UTC'
        + interval '12 hours'
      )
      AND (
        target_scope_type <> 'establishment'
        OR appointment.establishment_id = target_scope_id
      )
      AND (
        appointment.created_at AT TIME ZONE establishment.timezone
      )::date BETWEEN target_range_start AND target_range_end
      AND analytics_private.is_establishment_in_scope(
        appointment.establishment_id,
        (
          appointment.created_at AT TIME ZONE establishment.timezone
        )::date,
        target_scope_type,
        target_scope_id
      )
  ),
  completed_clients AS MATERIALIZED (
    SELECT DISTINCT appointment.client_id
    FROM period_appointments AS appointment
    WHERE appointment.status = 'completed'
      AND appointment.client_id IS NOT NULL
  ),
  classified_clients AS MATERIALIZED (
    SELECT
      completed_client.client_id,
      EXISTS (
        SELECT 1
        FROM public.appointments AS previous
        JOIN public.establishments AS previous_establishment
          ON previous_establishment.id = previous.establishment_id
        WHERE previous.deleted_at IS NULL
          AND previous.status = 'completed'
          AND previous.client_id = completed_client.client_id
          AND (
            target_scope_type <> 'establishment'
            OR previous.establishment_id = target_scope_id
          )
          AND (
            previous.date_time
            AT TIME ZONE previous_establishment.timezone
          )::date < target_range_start
          AND analytics_private.is_establishment_in_scope(
            previous.establishment_id,
            (
              previous.date_time
              AT TIME ZONE previous_establishment.timezone
            )::date,
            target_scope_type,
            target_scope_id
          )
      ) AS is_returning
    FROM completed_clients AS completed_client
  ),
  approved_establishments AS MATERIALIZED (
    SELECT request.id, request.updated_at
    FROM public.establishment_requests AS request
    LEFT JOIN public.establishments AS establishment
      ON establishment.id = request.establishment_id
    WHERE request.status = 'approved'
      AND (
        coalesce(request.reviewed_at, request.updated_at)
        AT TIME ZONE coalesce(establishment.timezone, report_timezone)
      )::date BETWEEN target_range_start AND target_range_end
      AND (
        target_scope_type = 'global'
        OR (
          request.establishment_id IS NOT NULL
          AND analytics_private.is_establishment_in_scope(
            request.establishment_id,
            (
              coalesce(request.reviewed_at, request.updated_at)
              AT TIME ZONE coalesce(
                establishment.timezone,
                report_timezone
              )
            )::date,
            target_scope_type,
            target_scope_id
          )
        )
      )
  ),
  activation_events AS MATERIALIZED (
    SELECT DISTINCT ON (audit.target_id)
      audit.target_id AS establishment_id,
      audit.created_at AS activated_at
    FROM public.security_audit_logs AS audit
    JOIN public.establishments AS establishment
      ON establishment.id = audit.target_id
      AND audit.target_type = 'establishment'
    WHERE audit.action = 'establishment.status_changed'
      AND audit.changes->>'new_status' = 'active'
      AND (
        audit.created_at AT TIME ZONE establishment.timezone
      )::date BETWEEN target_range_start AND target_range_end
      AND analytics_private.is_establishment_in_scope(
        establishment.id,
        (audit.created_at AT TIME ZONE establishment.timezone)::date,
        target_scope_type,
        target_scope_id
      )
    ORDER BY audit.target_id, audit.created_at
  ),
  activation_results AS MATERIALIZED (
    SELECT
      activation.establishment_id,
      activation.activated_at,
      first_completion.completed_at,
      CASE
        WHEN first_completion.completed_at IS NULL THEN NULL
        ELSE extract(
          epoch FROM (
            first_completion.completed_at - activation.activated_at
          )
        ) / 86400.0
      END AS days_to_first_completion
    FROM activation_events AS activation
    LEFT JOIN LATERAL (
      SELECT min(appointment.date_time) AS completed_at
      FROM public.appointments AS appointment
      WHERE appointment.establishment_id = activation.establishment_id
        AND appointment.deleted_at IS NULL
        AND appointment.status = 'completed'
        AND appointment.date_time >= activation.activated_at
    ) AS first_completion ON true
  ),
  active_professional_profiles AS MATERIALIZED (
    SELECT DISTINCT membership.profile_id
    FROM public.memberships AS membership
    JOIN public.establishments AS establishment
      ON establishment.id = membership.establishment_id
    WHERE membership.role = 'professional'
      AND (
        membership.created_at AT TIME ZONE establishment.timezone
      )::date <= target_range_end
      AND (
        membership.revoked_at IS NULL
        OR (
          membership.revoked_at AT TIME ZONE establishment.timezone
        )::date > target_range_end
      )
      AND (
        membership.status = 'active'
        OR membership.revoked_at IS NOT NULL
      )
      AND analytics_private.is_establishment_in_scope(
        membership.establishment_id,
        target_range_end,
        target_scope_type,
        target_scope_id
      )
  ),
  organization_owner_profiles AS MATERIALIZED (
    SELECT DISTINCT member.profile_id
    FROM public.organization_members AS member
    WHERE member.role = 'owner'
      AND (
        member.created_at AT TIME ZONE 'America/Sao_Paulo'
      )::date <= target_range_end
      AND (
        member.revoked_at IS NULL
        OR (
          member.revoked_at AT TIME ZONE 'America/Sao_Paulo'
        )::date > target_range_end
      )
      AND (
        member.status = 'active'
        OR member.revoked_at IS NOT NULL
      )
      AND (
        target_scope_type = 'global'
        OR (
          target_scope_type = 'organization'
          AND member.organization_id = target_scope_id
        )
        OR (
          target_scope_type = 'establishment'
          AND EXISTS (
            SELECT 1
            FROM public.organization_establishments AS link
            WHERE link.organization_id = member.organization_id
              AND link.establishment_id = target_scope_id
              AND link.effective_from <= target_range_end
              AND (
                link.effective_until IS NULL
                OR link.effective_until >= target_range_end
              )
          )
        )
      )
  ),
  standalone_admin_owner_profiles AS MATERIALIZED (
    SELECT DISTINCT membership.profile_id
    FROM public.memberships AS membership
    JOIN public.establishments AS establishment
      ON establishment.id = membership.establishment_id
    WHERE membership.role = 'admin'
      AND (
        membership.created_at AT TIME ZONE establishment.timezone
      )::date <= target_range_end
      AND (
        membership.revoked_at IS NULL
        OR (
          membership.revoked_at AT TIME ZONE establishment.timezone
        )::date > target_range_end
      )
      AND (
        membership.status = 'active'
        OR membership.revoked_at IS NOT NULL
      )
      AND analytics_private.is_establishment_in_scope(
        membership.establishment_id,
        target_range_end,
        target_scope_type,
        target_scope_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.organization_establishments AS link
        WHERE link.establishment_id = membership.establishment_id
          AND link.effective_from <= target_range_end
          AND (
            link.effective_until IS NULL
            OR link.effective_until >= target_range_end
          )
      )
  ),
  active_owner_profiles AS MATERIALIZED (
    SELECT profile_id FROM organization_owner_profiles
    UNION
    SELECT profile_id FROM standalone_admin_owner_profiles
  ),
  scoped_tickets AS MATERIALIZED (
    SELECT ticket.*
    FROM public.support_tickets AS ticket
    LEFT JOIN public.establishments AS establishment
      ON establishment.id = ticket.establishment_id
    WHERE (
      ticket.created_at AT TIME ZONE coalesce(
        establishment.timezone,
        report_timezone
      )
    )::date BETWEEN target_range_start AND target_range_end
      AND (
        target_scope_type = 'global'
        OR (
          target_scope_type = 'organization'
          AND (
            ticket.organization_id = target_scope_id
            OR (
              ticket.establishment_id IS NOT NULL
              AND analytics_private.is_establishment_in_scope(
                ticket.establishment_id,
                (
                  ticket.created_at AT TIME ZONE coalesce(
                    establishment.timezone,
                    report_timezone
                  )
                )::date,
                target_scope_type,
                target_scope_id
              )
            )
          )
        )
        OR (
          target_scope_type = 'establishment'
          AND ticket.establishment_id = target_scope_id
        )
      )
  ),
  metric_values AS (
    SELECT
      (SELECT count(*) FROM period_appointments) AS total_appointments,
      (
        SELECT count(*)
        FROM period_appointments
        WHERE status = 'completed'
      ) AS completed_appointments,
      (
        SELECT count(DISTINCT establishment_id)
        FROM period_appointments
        WHERE status = 'completed'
      ) AS operating_establishments,
      (SELECT count(*) FROM completed_clients) AS identified_clients,
      (
        SELECT count(*)
        FROM classified_clients
        WHERE is_returning
      ) AS returning_clients,
      (SELECT count(*) FROM created_appointments) AS appointments_created,
      (
        SELECT count(*)
        FROM period_appointments
        WHERE status = 'confirmed'
      ) AS appointments_confirmed,
      (
        SELECT count(*)
        FROM approved_establishments
      ) AS approved_establishments,
      (SELECT count(*) FROM activation_events) AS activation_cohort_size,
      (
        SELECT count(*)
        FROM activation_results
        WHERE completed_at IS NOT NULL
          AND completed_at <= activated_at + interval '14 days'
      ) AS activated_establishments_14d,
      (
        SELECT round(avg(days_to_first_completion), 2)
        FROM activation_results
        WHERE days_to_first_completion IS NOT NULL
      ) AS average_days_to_first_completion,
      (
        SELECT count(*)
        FROM classified_clients
        WHERE NOT is_returning
      ) AS new_clients,
      (
        SELECT count(*)
        FROM active_professional_profiles
      ) AS active_professionals,
      (
        SELECT count(*)
        FROM active_owner_profiles
      ) AS active_owners,
      (
        SELECT count(DISTINCT client_id)
        FROM period_appointments
        WHERE client_id IS NOT NULL
          AND status NOT IN ('cancelled', 'canceled')
      ) AS active_clients,
      (
        SELECT count(*)
        FROM period_appointments
        WHERE status IN ('cancelled', 'canceled')
      ) AS cancelled_appointments,
      (
        SELECT count(*)
        FROM scoped_tickets
        WHERE priority = 'critical'
      ) AS critical_tickets,
      (
        SELECT count(*)
        FROM scoped_tickets
        WHERE sla_breached
          OR (
            first_response_due_at IS NOT NULL
            AND first_responded_at > first_response_due_at
          )
          OR (
            first_response_due_at IS NOT NULL
            AND first_responded_at IS NULL
            AND first_response_due_at < (
              (target_range_end + 1)::timestamp
              AT TIME ZONE report_timezone
            )
          )
      ) AS sla_at_risk,
      (
        SELECT count(*)
        FROM scoped_tickets
        WHERE status = 'sync_failed'
          OR sync_status = 'failed'
      ) AS sync_failed,
      (
        SELECT count(*)
        FROM period_appointments
        WHERE status = 'completed'
          AND client_id IS NOT NULL
      ) AS completed_with_client_id,
      (
        SELECT max(candidate)
        FROM (
          VALUES
            ((SELECT max(updated_at) FROM period_appointments)),
            ((SELECT max(updated_at) FROM created_appointments)),
            ((SELECT max(updated_at) FROM approved_establishments)),
            ((SELECT max(updated_at) FROM scoped_tickets))
        ) AS freshness(candidate)
      ) AS freshness_at
  )
  SELECT jsonb_build_object(
    'total_appointments', metric.total_appointments,
    'completed_appointments', metric.completed_appointments,
    'operating_establishments', metric.operating_establishments,
    'identified_clients', metric.identified_clients,
    'returning_clients', metric.returning_clients,
    'appointments_created', metric.appointments_created,
    'appointments_confirmed', metric.appointments_confirmed,
    'approved_establishments', metric.approved_establishments,
    'activation_cohort_size', metric.activation_cohort_size,
    'activated_establishments_14d',
      metric.activated_establishments_14d,
    'average_days_to_first_completion',
      metric.average_days_to_first_completion,
    'new_clients', metric.new_clients,
    'active_professionals', metric.active_professionals,
    'active_owners', metric.active_owners,
    'active_clients', metric.active_clients,
    'cancelled_appointments', metric.cancelled_appointments,
    'critical_tickets', metric.critical_tickets,
    'sla_at_risk', metric.sla_at_risk,
    'sync_failed', metric.sync_failed,
    'completion_rate', CASE
      WHEN metric.total_appointments = 0 THEN NULL
      ELSE round(
        metric.completed_appointments * 100.0
        / metric.total_appointments,
        2
      )
    END,
    'returning_clients_rate', CASE
      WHEN metric.identified_clients = 0 THEN NULL
      ELSE round(
        metric.returning_clients * 100.0
        / metric.identified_clients,
        2
      )
    END,
    'cancellation_rate', CASE
      WHEN metric.total_appointments = 0 THEN NULL
      ELSE round(
        metric.cancelled_appointments * 100.0
        / metric.total_appointments,
        2
      )
    END,
    'identified_client_coverage', CASE
      WHEN metric.completed_appointments = 0 THEN NULL
      ELSE round(
        metric.completed_with_client_id * 100.0
        / metric.completed_appointments,
        2
      )
    END,
    'completed_with_client_id', metric.completed_with_client_id,
    'activation_events_available', metric.activation_cohort_size,
    'freshness_at', metric.freshness_at
  )
  INTO result
  FROM metric_values AS metric;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.compute_control_scope_metrics(
  date,
  date,
  text,
  uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.compute_control_scope_metrics(
  date,
  date,
  text,
  uuid
) TO service_role;

CREATE OR REPLACE FUNCTION analytics_private.metric_comparison(
  current_value numeric,
  previous_value numeric,
  current_complete boolean,
  previous_complete boolean
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT jsonb_build_object(
    'value', current_value,
    'previous', CASE
      WHEN previous_complete THEN previous_value
      ELSE NULL
    END,
    'delta_absolute', CASE
      WHEN previous_complete
        AND current_value IS NOT NULL
        AND previous_value IS NOT NULL
      THEN round(current_value - previous_value, 2)
      ELSE NULL
    END,
    'delta_percent', CASE
      WHEN previous_complete
        AND current_value IS NOT NULL
        AND previous_value IS NOT NULL
        AND previous_value <> 0
      THEN round(
        (current_value - previous_value) * 100.0
        / abs(previous_value),
        2
      )
      ELSE NULL
    END,
    'comparison_status', CASE
      WHEN NOT current_complete THEN 'current_incomplete'
      WHEN NOT previous_complete THEN 'comparison_unavailable'
      WHEN current_value IS NULL OR previous_value IS NULL
        THEN 'no_denominator'
      WHEN previous_value = 0 THEN 'previous_zero'
      ELSE 'available'
    END
  );
$$;

REVOKE ALL ON FUNCTION analytics_private.metric_comparison(
  numeric,
  numeric,
  boolean,
  boolean
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.metric_comparison(
  numeric,
  numeric,
  boolean,
  boolean
) TO service_role;

CREATE OR REPLACE FUNCTION analytics_private.refresh_control_daily_metrics(
  target_date date
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, analytics_private
AS $$
DECLARE
  definition constant integer := 1;
  local_today date := (
    now() AT TIME ZONE 'America/Sao_Paulo'
  )::date;
  scope_record record;
  metrics jsonb;
  refreshed_count integer := 0;
BEGIN
  IF target_date IS NULL OR target_date > local_today THEN
    RAISE EXCEPTION 'invalid_analytics_snapshot_date';
  END IF;

  -- The loop is intentionally bounded to one daily batch. A future scale phase
  -- can replace it with a set-based multi-scope refresh without changing facts.
  FOR scope_record IN
    SELECT
      'global'::text AS scope_type,
      NULL::uuid AS scope_id,
      'global'::text AS scope_key,
      'CutSync'::text AS scope_label,
      'America/Sao_Paulo'::text AS timezone
    UNION ALL
    SELECT
      'organization',
      organization.id,
      organization.id::text,
      organization.name,
      'America/Sao_Paulo'
    FROM public.organizations AS organization
    WHERE (
      organization.created_at AT TIME ZONE 'America/Sao_Paulo'
    )::date <= target_date
    UNION ALL
    SELECT
      'establishment',
      establishment.id,
      establishment.id::text,
      establishment.name,
      establishment.timezone
    FROM public.establishments AS establishment
    WHERE (
      establishment.created_at AT TIME ZONE establishment.timezone
    )::date <= target_date
  LOOP
    metrics := analytics_private.compute_control_scope_metrics(
      target_date,
      target_date,
      scope_record.scope_type,
      scope_record.scope_id
    );

    INSERT INTO analytics_private.control_daily_metrics (
      metric_date,
      scope_type,
      scope_id,
      scope_key,
      scope_label,
      timezone,
      definition_version,
      is_final,
      total_appointments,
      completed_appointments,
      operating_establishments,
      identified_clients,
      returning_clients,
      appointments_created,
      appointments_confirmed,
      approved_establishments,
      activation_cohort_size,
      activated_establishments_14d,
      average_days_to_first_completion,
      new_clients,
      active_professionals,
      active_owners,
      active_clients,
      cancelled_appointments,
      critical_tickets,
      sla_at_risk,
      sync_failed,
      completion_rate,
      returning_clients_rate,
      cancellation_rate,
      identified_client_coverage,
      completed_with_client_id,
      activation_events_available,
      freshness_at,
      generated_at
    )
    VALUES (
      target_date,
      scope_record.scope_type,
      scope_record.scope_id,
      scope_record.scope_key,
      scope_record.scope_label,
      scope_record.timezone,
      definition,
      target_date < local_today,
      (metrics->>'total_appointments')::bigint,
      (metrics->>'completed_appointments')::bigint,
      (metrics->>'operating_establishments')::bigint,
      (metrics->>'identified_clients')::bigint,
      (metrics->>'returning_clients')::bigint,
      (metrics->>'appointments_created')::bigint,
      (metrics->>'appointments_confirmed')::bigint,
      (metrics->>'approved_establishments')::bigint,
      (metrics->>'activation_cohort_size')::bigint,
      (metrics->>'activated_establishments_14d')::bigint,
      (metrics->>'average_days_to_first_completion')::numeric,
      (metrics->>'new_clients')::bigint,
      (metrics->>'active_professionals')::bigint,
      (metrics->>'active_owners')::bigint,
      (metrics->>'active_clients')::bigint,
      (metrics->>'cancelled_appointments')::bigint,
      (metrics->>'critical_tickets')::bigint,
      (metrics->>'sla_at_risk')::bigint,
      (metrics->>'sync_failed')::bigint,
      (metrics->>'completion_rate')::numeric,
      (metrics->>'returning_clients_rate')::numeric,
      (metrics->>'cancellation_rate')::numeric,
      (metrics->>'identified_client_coverage')::numeric,
      (metrics->>'completed_with_client_id')::bigint,
      (metrics->>'activation_events_available')::bigint,
      (metrics->>'freshness_at')::timestamptz,
      now()
    )
    ON CONFLICT (scope_type, scope_key, metric_date)
    DO UPDATE SET
      scope_id = EXCLUDED.scope_id,
      scope_label = EXCLUDED.scope_label,
      timezone = EXCLUDED.timezone,
      definition_version = EXCLUDED.definition_version,
      is_final = EXCLUDED.is_final,
      total_appointments = EXCLUDED.total_appointments,
      completed_appointments = EXCLUDED.completed_appointments,
      operating_establishments = EXCLUDED.operating_establishments,
      identified_clients = EXCLUDED.identified_clients,
      returning_clients = EXCLUDED.returning_clients,
      appointments_created = EXCLUDED.appointments_created,
      appointments_confirmed = EXCLUDED.appointments_confirmed,
      approved_establishments = EXCLUDED.approved_establishments,
      activation_cohort_size = EXCLUDED.activation_cohort_size,
      activated_establishments_14d =
        EXCLUDED.activated_establishments_14d,
      average_days_to_first_completion =
        EXCLUDED.average_days_to_first_completion,
      new_clients = EXCLUDED.new_clients,
      active_professionals = EXCLUDED.active_professionals,
      active_owners = EXCLUDED.active_owners,
      active_clients = EXCLUDED.active_clients,
      cancelled_appointments = EXCLUDED.cancelled_appointments,
      critical_tickets = EXCLUDED.critical_tickets,
      sla_at_risk = EXCLUDED.sla_at_risk,
      sync_failed = EXCLUDED.sync_failed,
      completion_rate = EXCLUDED.completion_rate,
      returning_clients_rate = EXCLUDED.returning_clients_rate,
      cancellation_rate = EXCLUDED.cancellation_rate,
      identified_client_coverage = EXCLUDED.identified_client_coverage,
      completed_with_client_id = EXCLUDED.completed_with_client_id,
      activation_events_available =
        EXCLUDED.activation_events_available,
      freshness_at = EXCLUDED.freshness_at,
      generated_at = EXCLUDED.generated_at;

    refreshed_count := refreshed_count + 1;
  END LOOP;

  RETURN refreshed_count;
END;
$$;

REVOKE ALL ON FUNCTION analytics_private.refresh_control_daily_metrics(date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION analytics_private.refresh_control_daily_metrics(date)
  TO service_role;

CREATE OR REPLACE FUNCTION public.list_control_metric_scopes()
RETURNS TABLE (
  scope_type text,
  scope_id uuid,
  parent_id uuid,
  label text,
  status text,
  timezone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.get_control_context();

  RETURN QUERY
  SELECT *
  FROM (
    SELECT
      'global'::text AS scope_type,
      NULL::uuid AS scope_id,
      NULL::uuid AS parent_id,
      'CutSync'::text AS label,
      'active'::text AS status,
      'America/Sao_Paulo'::text AS timezone
    UNION ALL
    SELECT
      'organization',
      organization.id,
      NULL::uuid,
      organization.name,
      organization.status,
      'America/Sao_Paulo'
    FROM public.organizations AS organization
    UNION ALL
    SELECT
      'establishment',
      establishment.id,
      active_link.organization_id,
      establishment.name,
      establishment.account_status,
      establishment.timezone
    FROM public.establishments AS establishment
    LEFT JOIN LATERAL (
      SELECT link.organization_id
      FROM public.organization_establishments AS link
      WHERE link.establishment_id = establishment.id
        AND link.status = 'active'
        AND link.effective_from <= (
          now() AT TIME ZONE 'America/Sao_Paulo'
        )::date
        AND (
          link.effective_until IS NULL
          OR link.effective_until >= (
            now() AT TIME ZONE 'America/Sao_Paulo'
          )::date
        )
      ORDER BY link.effective_from DESC, link.created_at DESC
      LIMIT 1
    ) AS active_link ON true
  ) AS scope
  ORDER BY
    CASE scope.scope_type
      WHEN 'global' THEN 0
      WHEN 'organization' THEN 1
      ELSE 2
    END,
    scope.label;
END;
$$;

REVOKE ALL ON FUNCTION public.list_control_metric_scopes()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_control_metric_scopes()
  TO authenticated, service_role;

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
  definition constant integer := 1;
  requested_scope_type text := lower(btrim(coalesce(scope_type, '')));
  requested_scope_key text;
  requested_scope_label text;
  requested_timezone text := 'America/Sao_Paulo';
  period_days integer;
  previous_start date;
  previous_end date;
  current_metrics jsonb;
  previous_metrics jsonb;
  current_missing_days integer;
  previous_missing_days integer;
  current_complete boolean;
  comparison_available boolean;
  latest_complete_date date;
  freshness_at timestamptz;
  series jsonb;
BEGIN
  PERFORM public.get_control_context();

  IF range_start IS NULL
    OR range_end IS NULL
    OR range_end < range_start
  THEN
    RAISE EXCEPTION 'invalid_analytics_range';
  END IF;

  period_days := range_end - range_start + 1;
  IF period_days > 90 THEN
    RAISE EXCEPTION 'analytics_range_too_large';
  END IF;
  IF range_end >= (
    now() AT TIME ZONE 'America/Sao_Paulo'
  )::date THEN
    RAISE EXCEPTION 'analytics_range_not_complete';
  END IF;

  IF requested_scope_type = 'global' AND scope_id IS NULL THEN
    requested_scope_key := 'global';
    requested_scope_label := 'CutSync';
  ELSIF requested_scope_type = 'organization' AND scope_id IS NOT NULL THEN
    SELECT organization.name
    INTO requested_scope_label
    FROM public.organizations AS organization
    WHERE organization.id = scope_id;
    requested_scope_key := scope_id::text;
  ELSIF requested_scope_type = 'establishment' AND scope_id IS NOT NULL THEN
    SELECT establishment.name, establishment.timezone
    INTO requested_scope_label, requested_timezone
    FROM public.establishments AS establishment
    WHERE establishment.id = scope_id;
    requested_scope_key := scope_id::text;
  ELSE
    RAISE EXCEPTION 'invalid_analytics_scope';
  END IF;

  IF requested_scope_label IS NULL THEN
    RAISE EXCEPTION 'analytics_scope_not_found';
  END IF;

  previous_end := range_start - 1;
  previous_start := previous_end - period_days + 1;

  SELECT count(*)::integer
  INTO current_missing_days
  FROM generate_series(range_start, range_end, interval '1 day') AS day
  WHERE NOT EXISTS (
    SELECT 1
    FROM analytics_private.control_daily_metrics AS metric
    WHERE metric.scope_type = requested_scope_type
      AND metric.scope_key = requested_scope_key
      AND metric.metric_date = day::date
      AND metric.definition_version = definition
      AND metric.is_final
  );

  SELECT count(*)::integer
  INTO previous_missing_days
  FROM generate_series(
    previous_start,
    previous_end,
    interval '1 day'
  ) AS day
  WHERE NOT EXISTS (
    SELECT 1
    FROM analytics_private.control_daily_metrics AS metric
    WHERE metric.scope_type = requested_scope_type
      AND metric.scope_key = requested_scope_key
      AND metric.metric_date = day::date
      AND metric.definition_version = definition
      AND metric.is_final
  );

  current_complete := current_missing_days = 0;
  comparison_available := previous_missing_days = 0;

  current_metrics := analytics_private.compute_control_scope_metrics(
    range_start,
    range_end,
    requested_scope_type,
    scope_id
  );
  previous_metrics := analytics_private.compute_control_scope_metrics(
    previous_start,
    previous_end,
    requested_scope_type,
    scope_id
  );

  SELECT
    max(metric.metric_date) FILTER (WHERE metric.is_final),
    coalesce(
      max(metric.freshness_at) FILTER (
        WHERE metric.metric_date BETWEEN range_start AND range_end
      ),
      max(metric.generated_at) FILTER (
        WHERE metric.metric_date BETWEEN range_start AND range_end
      )
    )
  INTO latest_complete_date, freshness_at
  FROM analytics_private.control_daily_metrics AS metric
  WHERE metric.scope_type = requested_scope_type
    AND metric.scope_key = requested_scope_key
    AND metric.definition_version = definition;

  SELECT coalesce(
    jsonb_agg(
      jsonb_build_object(
        'date', day.metric_date,
        'completed_appointments', metric.completed_appointments,
        'operating_establishments', metric.operating_establishments,
        'returning_clients_rate', metric.returning_clients_rate,
        'cancellation_rate', metric.cancellation_rate
      )
      ORDER BY day.metric_date
    ),
    '[]'::jsonb
  )
  INTO series
  FROM (
    SELECT generate_series(
      range_start,
      range_end,
      interval '1 day'
    )::date AS metric_date
  ) AS day
  LEFT JOIN analytics_private.control_daily_metrics AS metric
    ON metric.scope_type = requested_scope_type
    AND metric.scope_key = requested_scope_key
    AND metric.metric_date = day.metric_date
    AND metric.definition_version = definition
    AND metric.is_final;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'timezone', requested_timezone,
    'definition_version', definition,
    'scope', jsonb_build_object(
      'type', requested_scope_type,
      'id', scope_id,
      'label', requested_scope_label
    ),
    'period', jsonb_build_object(
      'start', range_start,
      'end', range_end,
      'days', period_days
    ),
    'comparison_period', jsonb_build_object(
      'start', previous_start,
      'end', previous_end,
      'days', period_days
    ),
    'kpis', jsonb_build_object(
      'completed_appointments',
        analytics_private.metric_comparison(
          (current_metrics->>'completed_appointments')::numeric,
          (previous_metrics->>'completed_appointments')::numeric,
          current_complete,
          comparison_available
        ),
      'operating_establishments',
        analytics_private.metric_comparison(
          (current_metrics->>'operating_establishments')::numeric,
          (previous_metrics->>'operating_establishments')::numeric,
          current_complete,
          comparison_available
        ),
      'returning_clients_rate',
        analytics_private.metric_comparison(
          (current_metrics->>'returning_clients_rate')::numeric,
          (previous_metrics->>'returning_clients_rate')::numeric,
          current_complete,
          comparison_available
        )
    ),
    'drivers', jsonb_build_object(
      'appointments_created',
        analytics_private.metric_comparison(
          (current_metrics->>'appointments_created')::numeric,
          (previous_metrics->>'appointments_created')::numeric,
          current_complete,
          comparison_available
        ),
      'appointments_confirmed',
        analytics_private.metric_comparison(
          (current_metrics->>'appointments_confirmed')::numeric,
          (previous_metrics->>'appointments_confirmed')::numeric,
          current_complete,
          comparison_available
        ),
      'completion_rate',
        analytics_private.metric_comparison(
          (current_metrics->>'completion_rate')::numeric,
          (previous_metrics->>'completion_rate')::numeric,
          current_complete,
          comparison_available
        ),
      'approved_establishments',
        analytics_private.metric_comparison(
          (current_metrics->>'approved_establishments')::numeric,
          (previous_metrics->>'approved_establishments')::numeric,
          current_complete,
          comparison_available
        ),
      'activated_establishments_14d',
        analytics_private.metric_comparison(
          (current_metrics->>'activated_establishments_14d')::numeric,
          (previous_metrics->>'activated_establishments_14d')::numeric,
          current_complete,
          comparison_available
        ),
      'average_days_to_first_completion',
        analytics_private.metric_comparison(
          (current_metrics->>'average_days_to_first_completion')::numeric,
          (previous_metrics->>'average_days_to_first_completion')::numeric,
          current_complete,
          comparison_available
        ),
      'new_clients',
        analytics_private.metric_comparison(
          (current_metrics->>'new_clients')::numeric,
          (previous_metrics->>'new_clients')::numeric,
          current_complete,
          comparison_available
        ),
      'returning_clients',
        analytics_private.metric_comparison(
          (current_metrics->>'returning_clients')::numeric,
          (previous_metrics->>'returning_clients')::numeric,
          current_complete,
          comparison_available
        ),
      'active_professionals',
        analytics_private.metric_comparison(
          (current_metrics->>'active_professionals')::numeric,
          (previous_metrics->>'active_professionals')::numeric,
          current_complete,
          comparison_available
        ),
      'active_owners',
        analytics_private.metric_comparison(
          (current_metrics->>'active_owners')::numeric,
          (previous_metrics->>'active_owners')::numeric,
          current_complete,
          comparison_available
        ),
      'active_clients',
        analytics_private.metric_comparison(
          (current_metrics->>'active_clients')::numeric,
          (previous_metrics->>'active_clients')::numeric,
          current_complete,
          comparison_available
        )
    ),
    'guardrails', jsonb_build_object(
      'cancellation_rate',
        analytics_private.metric_comparison(
          (current_metrics->>'cancellation_rate')::numeric,
          (previous_metrics->>'cancellation_rate')::numeric,
          current_complete,
          comparison_available
        ),
      'identified_client_coverage',
        analytics_private.metric_comparison(
          (current_metrics->>'identified_client_coverage')::numeric,
          (previous_metrics->>'identified_client_coverage')::numeric,
          current_complete,
          comparison_available
        ),
      'critical_tickets',
        analytics_private.metric_comparison(
          (current_metrics->>'critical_tickets')::numeric,
          (previous_metrics->>'critical_tickets')::numeric,
          current_complete,
          comparison_available
        ),
      'sla_at_risk',
        analytics_private.metric_comparison(
          (current_metrics->>'sla_at_risk')::numeric,
          (previous_metrics->>'sla_at_risk')::numeric,
          current_complete,
          comparison_available
        ),
      'sync_failed',
        analytics_private.metric_comparison(
          (current_metrics->>'sync_failed')::numeric,
          (previous_metrics->>'sync_failed')::numeric,
          current_complete,
          comparison_available
        )
    ),
    'series', series,
    'data_quality', jsonb_build_object(
      'freshness_at', freshness_at,
      'latest_complete_date', latest_complete_date,
      'missing_days', current_missing_days,
      'comparison_available', comparison_available
    )
  );
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

DO $schedule$
DECLARE
  existing_job_id bigint;
BEGIN
  FOR existing_job_id IN
    SELECT job.jobid
    FROM cron.job AS job
    WHERE job.jobname = 'control-analytics-finalize-yesterday'
  LOOP
    PERFORM cron.unschedule(existing_job_id);
  END LOOP;

  PERFORM cron.schedule(
    'control-analytics-finalize-yesterday',
    '10 6 * * *',
    $job$
      SELECT analytics_private.refresh_control_daily_metrics(
        (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1
      );
    $job$
  );
END;
$schedule$;

SELECT analytics_private.refresh_control_daily_metrics(
  (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1
);

NOTIFY pgrst, 'reload schema';

COMMIT;
