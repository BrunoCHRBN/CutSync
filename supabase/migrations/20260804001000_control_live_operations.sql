BEGIN;

CREATE INDEX IF NOT EXISTS appointments_control_live_date_status_idx
  ON public.appointments (date_time, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS establishments_control_live_status_idx
  ON public.establishments (account_status);

CREATE INDEX IF NOT EXISTS establishment_requests_control_live_status_idx
  ON public.establishment_requests (status);

CREATE OR REPLACE FUNCTION public.can_read_control_live()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    coalesce((SELECT auth.jwt()->>'aal'), 'aal1') = 'aal2'
    AND public.is_governance_user(NULL);
$$;

REVOKE ALL ON FUNCTION public.can_read_control_live()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_read_control_live()
  TO authenticated, service_role;

DROP POLICY IF EXISTS "Control members receive live invalidations"
  ON realtime.messages;
CREATE POLICY "Control members receive live invalidations"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  realtime.topic() = 'control:live'
  AND extension = 'broadcast'
  AND public.can_read_control_live()
);

CREATE OR REPLACE FUNCTION public.send_control_live_invalidation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  PERFORM realtime.send(
    jsonb_build_object(
      'scope', TG_ARGV[0],
      'reason', lower(TG_OP),
      'occurred_at', clock_timestamp()
    ),
    'invalidate',
    'control:live',
    true
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.send_control_live_invalidation()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_control_live_invalidation()
  TO service_role;

DROP TRIGGER IF EXISTS control_live_appointments_changed
  ON public.appointments;
CREATE TRIGGER control_live_appointments_changed
AFTER INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('appointments');

DROP TRIGGER IF EXISTS control_live_establishments_changed
  ON public.establishments;
CREATE TRIGGER control_live_establishments_changed
AFTER INSERT OR UPDATE OR DELETE ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('establishments');

DROP TRIGGER IF EXISTS control_live_establishment_requests_changed
  ON public.establishment_requests;
CREATE TRIGGER control_live_establishment_requests_changed
AFTER INSERT OR UPDATE OR DELETE ON public.establishment_requests
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('onboarding');

DROP TRIGGER IF EXISTS control_live_support_tickets_changed
  ON public.support_tickets;
CREATE TRIGGER control_live_support_tickets_changed
AFTER INSERT OR UPDATE OR DELETE ON public.support_tickets
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('support');

DROP TRIGGER IF EXISTS control_live_support_messages_changed
  ON public.support_messages;
CREATE TRIGGER control_live_support_messages_changed
AFTER INSERT OR UPDATE OR DELETE ON public.support_messages
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('support');

DROP TRIGGER IF EXISTS control_live_support_operations_changed
  ON public.support_sync_operations;
CREATE TRIGGER control_live_support_operations_changed
AFTER INSERT OR UPDATE OR DELETE ON public.support_sync_operations
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('support');

DROP TRIGGER IF EXISTS control_live_support_runtime_changed
  ON public.support_runtime_settings;
CREATE TRIGGER control_live_support_runtime_changed
AFTER INSERT OR UPDATE OR DELETE ON public.support_runtime_settings
FOR EACH ROW EXECUTE FUNCTION public.send_control_live_invalidation('support');

CREATE OR REPLACE FUNCTION public.get_control_live_snapshot()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  control_context jsonb;
  actor_id uuid;
  local_day_start timestamptz;
  local_day_end timestamptz;
  appointment_payload jsonb;
  establishment_payload jsonb;
  support_team_id uuid;
  support_enabled boolean := false;
  support_sync_enabled boolean := false;
  support_payload jsonb := NULL;
BEGIN
  control_context := public.get_control_context();
  actor_id := (control_context->>'profile_id')::uuid;

  local_day_start := date_trunc(
    'day',
    now() AT TIME ZONE 'America/Sao_Paulo'
  ) AT TIME ZONE 'America/Sao_Paulo';
  local_day_end := local_day_start + interval '1 day';

  SELECT jsonb_build_object(
    'today_total', count(*),
    'pending', count(*) FILTER (WHERE appointment.status = 'pending'),
    'confirmed', count(*) FILTER (WHERE appointment.status = 'confirmed'),
    'completed', count(*) FILTER (WHERE appointment.status = 'completed'),
    'cancelled', count(*) FILTER (
      WHERE appointment.status IN ('cancelled', 'canceled')
    ),
    'next_60_minutes', (
      SELECT count(*)
      FROM public.appointments AS upcoming
      WHERE upcoming.deleted_at IS NULL
        AND upcoming.date_time >= now()
        AND upcoming.date_time < now() + interval '60 minutes'
        AND upcoming.status NOT IN ('cancelled', 'canceled', 'completed')
    )
  )
  INTO appointment_payload
  FROM public.appointments AS appointment
  WHERE appointment.deleted_at IS NULL
    AND appointment.date_time >= local_day_start
    AND appointment.date_time < local_day_end;

  SELECT jsonb_build_object(
    'active', (
      SELECT count(*)
      FROM public.establishments AS establishment
      WHERE establishment.account_status = 'active'
    ),
    'pending_requests', (
      SELECT count(*)
      FROM public.establishment_requests AS request
      WHERE request.status = 'pending'
    )
  )
  INTO establishment_payload;

  SELECT member.team_id
  INTO support_team_id
  FROM public.support_team_members AS member
  JOIN public.support_teams AS team
    ON team.id = member.team_id
    AND team.active
  WHERE member.profile_id = actor_id
    AND member.is_active
  ORDER BY
    (member.member_role = 'lead') DESC,
    team.is_default DESC,
    team.code
  LIMIT 1;

  SELECT
    settings.enabled,
    settings.sync_enabled
  INTO support_enabled, support_sync_enabled
  FROM public.support_runtime_settings AS settings
  WHERE settings.id;

  IF support_team_id IS NOT NULL THEN
    WITH ticket_counts AS (
      SELECT
        count(*) FILTER (
          WHERE ticket.status IN ('queued', 'open', 'in_progress')
        ) AS open_queue,
        count(*) FILTER (
          WHERE ticket.status = 'waiting_user'
        ) AS waiting_user,
        count(*) FILTER (
          WHERE ticket.priority = 'critical'
            AND ticket.status NOT IN ('resolved', 'closed')
        ) AS critical_open,
        count(*) FILTER (
          WHERE ticket.first_responded_at IS NULL
            AND ticket.status NOT IN ('resolved', 'closed')
            AND (
              ticket.sla_breached
              OR ticket.first_response_due_at <= now() + interval '1 hour'
            )
        ) AS sla_at_risk,
        count(*) FILTER (
          WHERE ticket.status = 'sync_failed'
            OR ticket.sync_status = 'failed'
        ) AS sync_failed
      FROM public.support_tickets AS ticket
      WHERE ticket.team_id = support_team_id
        AND ticket.content_purged_at IS NULL
    ),
    operation_counts AS (
      SELECT
        count(*) AS pending_operations,
        floor(
          extract(
            epoch FROM now() - min(operation.created_at)
          ) / 60
        )::integer AS oldest_pending_minutes
      FROM public.support_sync_operations AS operation
      JOIN public.support_tickets AS ticket
        ON ticket.id = operation.ticket_id
      WHERE ticket.team_id = support_team_id
        AND operation.status IN ('pending', 'processing', 'retry')
    )
    SELECT jsonb_build_object(
      'runtime_enabled', coalesce(support_enabled, false),
      'sync_enabled', coalesce(support_sync_enabled, false),
      'open_queue', ticket_counts.open_queue,
      'waiting_user', ticket_counts.waiting_user,
      'critical_open', ticket_counts.critical_open,
      'sla_at_risk', ticket_counts.sla_at_risk,
      'sync_failed', ticket_counts.sync_failed,
      'pending_operations', operation_counts.pending_operations,
      'oldest_pending_minutes', operation_counts.oldest_pending_minutes
    )
    INTO support_payload
    FROM ticket_counts
    CROSS JOIN operation_counts;
  END IF;

  RETURN jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Sao_Paulo',
    'appointments', appointment_payload,
    'establishments', establishment_payload,
    'support', support_payload
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_control_live_snapshot()
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_control_live_snapshot()
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
