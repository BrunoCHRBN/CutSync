BEGIN;
SET LOCAL search_path = pg_catalog, public, extensions;
-- Freeze the monetary value charged at booking time. duration_minutes already
-- acts as the duration snapshot (trigger set_appointment_duration_snapshot).
-- price_charged is the monetary counterpart so reports survive catalog edits.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS price_charged numeric(12, 2);
COMMENT ON COLUMN public.appointments.price_charged IS
  'Monetary snapshot frozen at booking/reschedule of service+professional; used by reports instead of live services.price.';
COMMENT ON COLUMN public.appointments.duration_minutes IS
  'Duration snapshot frozen at booking/reschedule of service+professional (duration_minutes_snapshot).';
-- Backfill from professional override when active, else catalog price.
UPDATE public.appointments AS appointment
SET price_charged = COALESCE(
  (
    SELECT professional_service.price
    FROM public.professional_services AS professional_service
    WHERE professional_service.professional_id = appointment.professional_id
      AND professional_service.service_id = appointment.service_id
      AND professional_service.establishment_id = appointment.establishment_id
      AND professional_service.is_active = true
    LIMIT 1
  ),
  (
    SELECT service.price
    FROM public.services AS service
    WHERE service.id = appointment.service_id
    LIMIT 1
  ),
  0
)
WHERE appointment.price_charged IS NULL;
ALTER TABLE public.appointments
  ALTER COLUMN price_charged SET DEFAULT 0,
  ALTER COLUMN price_charged SET NOT NULL;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'appointments_price_charged_check'
      AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_price_charged_check
      CHECK (price_charged >= 0);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION public.set_appointment_duration_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_duration integer;
  resolved_price numeric(12, 2);
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.duration_minutes IS NULL
    OR NEW.price_charged IS NULL
  THEN
    SELECT
      COALESCE(professional_service.duration_minutes, service.duration_minutes),
      COALESCE(professional_service.price, service.price)
    INTO resolved_duration, resolved_price
    FROM public.services AS service
    LEFT JOIN public.professional_services AS professional_service
      ON professional_service.professional_id = NEW.professional_id
      AND professional_service.service_id = service.id
      AND professional_service.establishment_id = NEW.establishment_id
      AND professional_service.is_active = true
    WHERE service.id = NEW.service_id
      AND service.establishment_id = NEW.establishment_id
      AND service.deleted_at IS NULL
      AND service.is_active = true;

    IF resolved_duration IS NULL OR resolved_price IS NULL THEN
      RAISE EXCEPTION 'service_unavailable';
    END IF;

    NEW.duration_minutes := resolved_duration;
    NEW.price_charged := resolved_price;
  END IF;

  NEW.ends_at := NEW.date_time + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS set_appointment_duration_snapshot ON public.appointments;
CREATE TRIGGER set_appointment_duration_snapshot
  BEFORE INSERT OR UPDATE OF service_id, professional_id, establishment_id, date_time, duration_minutes, price_charged
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_appointment_duration_snapshot();
-- Clients must not mutate the monetary snapshot on cancel.
CREATE OR REPLACE FUNCTION public.enforce_business_appointment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  old_establishment_id uuid := CASE
    WHEN TG_OP = 'INSERT' THEN NULL
    ELSE OLD.establishment_id
  END;
  new_establishment_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NEW.establishment_id
  END;
  effective_establishment_id uuid := COALESCE(
    new_establishment_id,
    old_establishment_id
  );
  client_cancellation boolean := false;
  client_reschedule boolean := false;
BEGIN
  IF actor_id IS NULL OR public.is_superadmin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE'
    AND old_establishment_id IS DISTINCT FROM new_establishment_id
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT'
    AND public.can_operate_business_appointment(
      NEW.establishment_id,
      NEW.professional_id
    )
  THEN
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE'
    AND public.can_operate_business_appointment(
      OLD.establishment_id,
      OLD.professional_id
    )
    AND public.can_operate_business_appointment(
      NEW.establishment_id,
      NEW.professional_id
    )
  THEN
    RETURN NEW;
  ELSIF TG_OP = 'DELETE'
    AND public.can_operate_business_appointment(
      OLD.establishment_id,
      OLD.professional_id
    )
  THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.client_id = actor_id
      AND public.billing_access_mode(effective_establishment_id) = 'full'
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE'
    OR OLD.client_id IS DISTINCT FROM actor_id
    OR NEW.client_id IS DISTINCT FROM actor_id
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  client_cancellation :=
    OLD.status IN ('pending', 'confirmed')
    AND NEW.status = 'cancelled'
    AND NEW.establishment_id = OLD.establishment_id
    AND NEW.professional_id = OLD.professional_id
    AND NEW.service_id = OLD.service_id
    AND NEW.date_time = OLD.date_time
    AND NEW.ends_at = OLD.ends_at
    AND NEW.duration_minutes = OLD.duration_minutes
    AND NEW.price_charged IS NOT DISTINCT FROM OLD.price_charged
    AND NEW.reschedule_count = OLD.reschedule_count
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at;

  IF client_cancellation THEN
    RETURN NEW;
  END IF;

  client_reschedule :=
    OLD.status IN ('pending', 'confirmed')
    AND NEW.status IN ('pending', 'confirmed')
    AND NEW.establishment_id = OLD.establishment_id
    AND NEW.reschedule_count = OLD.reschedule_count + 1
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    AND NEW.cancellation_reason IS NOT DISTINCT FROM OLD.cancellation_reason
    AND NEW.cancellation_reason_code
      IS NOT DISTINCT FROM OLD.cancellation_reason_code
    AND NEW.cancellation_note_internal
      IS NOT DISTINCT FROM OLD.cancellation_note_internal
    AND NEW.cancelled_by_role IS NOT DISTINCT FROM OLD.cancelled_by_role;

  IF client_reschedule
    AND public.billing_access_mode(effective_establishment_id) = 'full'
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;
-- Reports consume frozen price_charged instead of live catalog prices.

CREATE OR REPLACE FUNCTION public.get_admin_report_v2_before_business_access(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_professional_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  range_starts_at timestamptz;
  range_ends_at timestamptz;
  previous_range_start date;
  previous_range_end date;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
  day_count integer;
  available_minutes bigint;
  previous_available_minutes bigint;
  summary jsonb;
  previous_summary jsonb;
  daily_series jsonb;
  hourly_demand jsonb;
  services jsonb;
  professionals jsonb;
  cancellations jsonb;
  clients jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'invalid_report_status';
  END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  day_count := target_range_end - target_range_start + 1;
  previous_range_end := target_range_start - 1;
  previous_range_start := previous_range_end - day_count + 1;
  range_starts_at := target_range_start::timestamp AT TIME ZONE target_timezone;
  range_ends_at := (target_range_end + 1)::timestamp AT TIME ZONE target_timezone;
  previous_starts_at := previous_range_start::timestamp AT TIME ZONE target_timezone;
  previous_ends_at := (previous_range_end + 1)::timestamp AT TIME ZONE target_timezone;

  available_minutes := public.admin_report_available_minutes(
    target_establishment_id, target_range_start, target_range_end, target_professional_id
  );
  previous_available_minutes := public.admin_report_available_minutes(
    target_establishment_id, previous_range_start, previous_range_end, target_professional_id
  );

  WITH filtered AS (
    SELECT appointment.*, appointment.price_charged AS price
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  )
  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(price) FILTER (WHERE status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(sum(price) FILTER (WHERE status = 'completed') / NULLIF(count(*) FILTER (WHERE status = 'completed'), 0), 0),
    'occupancy_rate', CASE WHEN available_minutes > 0 THEN LEAST(round(COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0) * 100.0 / available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0),
    'available_minutes', available_minutes,
    'idle_minutes', GREATEST(available_minutes - COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0), 0),
    'completed_count', count(*) FILTER (WHERE status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE status = 'confirmed'),
    'no_show_count', count(*) FILTER (WHERE status = 'no_show'),
    'active_count', count(*) FILTER (WHERE status IN ('pending', 'confirmed'))
  ) INTO summary FROM filtered;

  WITH filtered AS (
    SELECT appointment.*, appointment.price_charged AS price
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= previous_starts_at
      AND appointment.date_time < previous_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  )
  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(price) FILTER (WHERE status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(price) FILTER (WHERE status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(sum(price) FILTER (WHERE status = 'completed') / NULLIF(count(*) FILTER (WHERE status = 'completed'), 0), 0),
    'occupancy_rate', CASE WHEN previous_available_minutes > 0 THEN LEAST(round(COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0) * 100.0 / previous_available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0),
    'available_minutes', previous_available_minutes,
    'idle_minutes', GREATEST(previous_available_minutes - COALESCE(sum(duration_minutes) FILTER (WHERE status <> 'cancelled'), 0), 0),
    'completed_count', count(*) FILTER (WHERE status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE status = 'confirmed'),
    'no_show_count', count(*) FILTER (WHERE status = 'no_show'),
    'active_count', count(*) FILTER (WHERE status IN ('pending', 'confirmed'))
  ) INTO previous_summary FROM filtered;

  WITH days AS (
    SELECT generate_series(target_range_start, target_range_end, interval '1 day')::date AS day
  ), filtered AS (
    SELECT appointment.*, appointment.price_charged AS price, (appointment.date_time AT TIME ZONE target_timezone)::date AS local_day
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  ), day_rows AS (
    SELECT days.day,
      COALESCE(sum(filtered.price) FILTER (WHERE filtered.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(filtered.price) FILTER (WHERE filtered.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(filtered.duration_minutes) FILTER (WHERE filtered.status <> 'cancelled'), 0) AS occupied_minutes,
      public.admin_report_available_minutes(target_establishment_id, days.day, days.day, target_professional_id) AS day_available_minutes,
      count(filtered.id) FILTER (WHERE filtered.status = 'completed') AS completed_count,
      count(filtered.id) FILTER (WHERE filtered.status = 'cancelled') AS cancelled_count,
      count(filtered.id) FILTER (WHERE filtered.status = 'no_show') AS no_show_count,
      count(filtered.id) FILTER (WHERE filtered.status <> 'cancelled') AS appointment_count
    FROM days LEFT JOIN filtered ON filtered.local_day = days.day
    GROUP BY days.day
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'date', day_rows.day,
    'production_realized', day_rows.production_realized,
    'scheduled_value', day_rows.scheduled_value,
    'occupied_minutes', day_rows.occupied_minutes,
    'available_minutes', day_rows.day_available_minutes,
    'occupancy_rate', CASE
      WHEN day_rows.day_available_minutes > 0
      THEN LEAST(round(day_rows.occupied_minutes * 100.0 / day_rows.day_available_minutes, 1), 100)
      ELSE 0 END,
    'completed_count', day_rows.completed_count,
    'cancelled_count', day_rows.cancelled_count,
    'no_show_count', day_rows.no_show_count,
    'appointment_count', day_rows.appointment_count
  ) ORDER BY day_rows.day), '[]'::jsonb)
  INTO daily_series
  FROM day_rows;

  SELECT COALESCE(jsonb_agg(to_jsonb(hour_report) ORDER BY hour_report.day_of_week, hour_report.hour), '[]'::jsonb)
  INTO hourly_demand
  FROM (
    SELECT extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS day_of_week,
      extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS hour,
      count(*) AS appointment_count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL AND appointment.status <> 'cancelled'
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    GROUP BY 1, 2
  ) hour_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(service_report) ORDER BY service_report.production_realized DESC, service_report.appointment_count DESC), '[]'::jsonb)
  INTO services
  FROM (
    SELECT service.id, service.name,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'no_show') AS no_show_count,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed') / NULLIF(count(appointment.id) FILTER (WHERE appointment.status = 'completed'), 0), 0) AS average_ticket,
      COALESCE(round(avg(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled')), 0) AS average_duration_minutes,
      COALESCE(round(count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') * 100.0
        / NULLIF(sum(count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled')) OVER (), 0), 1), 0) AS demand_share
    FROM public.services service
    LEFT JOIN public.appointments appointment ON appointment.service_id = service.id
      AND appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    WHERE service.establishment_id = target_establishment_id
      AND (target_service_id IS NULL OR service.id = target_service_id)
    GROUP BY service.id, service.name
  ) service_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(professional_report) ORDER BY professional_report.production_realized DESC, professional_report.name), '[]'::jsonb)
  INTO professionals
  FROM (
    SELECT profile.id, profile.name, membership.commission_rate,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'no_show') AS no_show_count,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) * membership.commission_rate AS commission_amount,
      COALESCE(round(COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) * 100.0
        / NULLIF(sum(COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0)) OVER (), 0), 1), 0) AS production_share,
      public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id) AS available_minutes,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) AS occupied_minutes,
      CASE WHEN public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id) > 0
        THEN LEAST(round(COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) * 100.0
          / public.admin_report_available_minutes(target_establishment_id, target_range_start, target_range_end, profile.id), 1), 100)
        ELSE 0 END AS occupancy_rate
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id AND profile.deleted_at IS NULL
    LEFT JOIN public.appointments appointment ON appointment.professional_id = profile.id
      AND appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active' AND membership.role IN ('professional', 'admin')
      AND (target_professional_id IS NULL OR profile.id = target_professional_id)
    GROUP BY profile.id, profile.name, membership.commission_rate
  ) professional_report;

  SELECT jsonb_build_object(
    'total', COALESCE(sum(count), 0),
    'by_reason', COALESCE(jsonb_agg(jsonb_build_object('reason', reason, 'count', count) ORDER BY count DESC, reason), '[]'::jsonb),
    'by_role', '[]'::jsonb
  ) INTO cancellations
  FROM (
    SELECT COALESCE(NULLIF(trim(appointment.cancellation_reason), ''), 'Não informado') AS reason, count(*) AS count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.status = 'cancelled'
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
    GROUP BY 1
  ) cancellation_report;

  WITH completed_clients AS (
    SELECT DISTINCT appointment.client_id
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
      AND appointment.status = 'completed' AND appointment.client_id IS NOT NULL
      AND appointment.date_time >= range_starts_at AND appointment.date_time < range_ends_at
      AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
      AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
      AND (target_status IS NULL OR appointment.status = target_status)
  ), classified AS (
    SELECT client_id, EXISTS (
      SELECT 1 FROM public.appointments previous
      WHERE previous.establishment_id = target_establishment_id AND previous.deleted_at IS NULL
        AND previous.status = 'completed' AND previous.client_id = completed_clients.client_id
        AND previous.date_time < range_starts_at
    ) AS is_returning
    FROM completed_clients
  )
  SELECT jsonb_build_object(
    'identified_clients', count(*),
    'new_clients', count(*) FILTER (WHERE NOT is_returning),
    'returning_clients', count(*) FILTER (WHERE is_returning),
    'return_rate', COALESCE(round(count(*) FILTER (WHERE is_returning) * 100.0 / NULLIF(count(*), 0), 1), 0),
    'walk_in_appointments', (
      SELECT count(*) FROM public.appointments walk_in
      WHERE walk_in.establishment_id = target_establishment_id AND walk_in.deleted_at IS NULL
        AND walk_in.status = 'completed' AND walk_in.client_id IS NULL
        AND walk_in.date_time >= range_starts_at AND walk_in.date_time < range_ends_at
        AND (target_professional_id IS NULL OR walk_in.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR walk_in.service_id = target_service_id)
        AND (target_status IS NULL OR walk_in.status = target_status)
    )
  ) INTO clients FROM classified;

  RETURN jsonb_build_object(
    'period', jsonb_build_object('start', target_range_start, 'end', target_range_end, 'days', day_count,
      'previous_start', previous_range_start, 'previous_end', previous_range_end, 'timezone', target_timezone),
    'summary', summary, 'previous_summary', previous_summary, 'daily_series', daily_series,
    'hourly_demand', hourly_demand, 'services', services, 'professionals', professionals,
    'cancellations', cancellations, 'clients', clients, 'generated_at', now()
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_admin_report_details_before_business_access(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_dimension text,
  target_professional_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_status text DEFAULT NULL,
  target_day date DEFAULT NULL,
  target_day_of_week integer DEFAULT NULL,
  target_hour integer DEFAULT NULL,
  target_cursor text DEFAULT NULL,
  target_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  safe_limit integer := LEAST(GREATEST(COALESCE(target_limit, 25), 1), 25);
  cursor_offset integer := CASE WHEN COALESCE(target_cursor, '') ~ '^[0-9]+$' THEN target_cursor::integer ELSE 0 END;
  result_items jsonb := '[]'::jsonb;
  fetched_count integer := 0;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_dimension NOT IN ('appointments', 'clients') THEN RAISE EXCEPTION 'invalid_report_dimension'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN RAISE EXCEPTION 'invalid_report_range'; END IF;
  IF target_status IS NOT NULL AND target_status NOT IN ('pending', 'confirmed', 'completed', 'cancelled', 'no_show') THEN RAISE EXCEPTION 'invalid_report_status'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT timezone INTO target_timezone FROM public.establishments WHERE id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF target_dimension = 'appointments' THEN
    WITH rows AS (
      SELECT jsonb_build_object(
        'kind', 'appointment', 'id', appointment.id, 'date_time', appointment.date_time,
        'status', appointment.status, 'service_name', COALESCE(service.name, 'Serviço removido'),
        'professional_id', appointment.professional_id, 'professional_name', COALESCE(professional.name, 'Profissional'),
        'client_name', COALESCE(NULLIF(appointment.client_name, ''), 'Cliente não identificado'),
        'production_value', CASE WHEN appointment.status = 'completed' THEN COALESCE(appointment.price_charged, 0) ELSE 0 END
      ) AS payload
      FROM public.appointments appointment
      LEFT JOIN public.services service ON service.id = appointment.service_id
      LEFT JOIN public.profiles professional ON professional.id = appointment.professional_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_day IS NULL OR (appointment.date_time AT TIME ZONE target_timezone)::date = target_day)
        AND (target_day_of_week IS NULL OR extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_day_of_week)
        AND (target_hour IS NULL OR extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer = target_hour)
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      ORDER BY appointment.date_time DESC, appointment.id
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*) INTO result_items, fetched_count FROM rows;
  ELSE
    INSERT INTO public.authorization_audit_log(actor_id, action, establishment_id, metadata)
    VALUES (actor_id, 'report.clients_identified.viewed', target_establishment_id,
      jsonb_build_object('range_start', target_range_start, 'range_end', target_range_end,
        'professional_filter', target_professional_id IS NOT NULL, 'service_filter', target_service_id IS NOT NULL,
        'status_filter', target_status, 'cursor', cursor_offset));

    WITH client_activity AS (
      SELECT appointment.client_id, max(profile.name) AS full_name,
        max(appointment.date_time) FILTER (WHERE appointment.status = 'completed') AS last_visit,
        count(*) FILTER (WHERE appointment.status = 'completed') AS visit_count,
        min(appointment.date_time) FILTER (WHERE appointment.status IN ('pending', 'confirmed') AND appointment.date_time >= now()) AS next_appointment
      FROM public.appointments appointment
      JOIN public.profiles profile ON profile.id = appointment.client_id
      WHERE appointment.establishment_id = target_establishment_id AND appointment.deleted_at IS NULL
        AND appointment.client_id IS NOT NULL
        AND appointment.date_time >= target_range_start::timestamp AT TIME ZONE target_timezone
        AND appointment.date_time < (target_range_end + 1)::timestamp AT TIME ZONE target_timezone
        AND (target_professional_id IS NULL OR appointment.professional_id = target_professional_id)
        AND (target_service_id IS NULL OR appointment.service_id = target_service_id)
        AND (target_status IS NULL OR appointment.status = target_status)
      GROUP BY appointment.client_id
      HAVING count(*) FILTER (WHERE appointment.status = 'completed') > 0
    ), rows AS (
      SELECT jsonb_build_object(
        'kind', 'client', 'id', client_id,
        'display_name', split_part(full_name, ' ', 1) ||
          CASE WHEN strpos(trim(full_name), ' ') > 0 THEN ' ' || left(regexp_replace(trim(full_name), '^.*\s', ''), 1) || '.' ELSE '' END,
        'last_visit', last_visit, 'visit_count', visit_count, 'next_appointment', next_appointment,
        'operational_status', CASE WHEN next_appointment IS NOT NULL THEN 'scheduled'
          WHEN last_visit >= now() - interval '60 days' THEN 'active' ELSE 'inactive' END
      ) AS payload
      FROM client_activity
      ORDER BY last_visit DESC NULLS LAST, client_id
      OFFSET cursor_offset LIMIT safe_limit + 1
    )
    SELECT COALESCE(jsonb_agg(payload), '[]'::jsonb), count(*) INTO result_items, fetched_count FROM rows;
  END IF;

  RETURN jsonb_build_object(
    'dimension', target_dimension,
    'items', CASE WHEN fetched_count > safe_limit THEN result_items - safe_limit ELSE result_items END,
    'has_more', fetched_count > safe_limit,
    'next_cursor', CASE WHEN fetched_count > safe_limit THEN (cursor_offset + safe_limit)::text ELSE NULL END
  );
END;
$function$;
CREATE OR REPLACE FUNCTION public.get_organization_report(
  target_organization_id uuid,
  range_start date,
  range_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF range_end < range_start OR range_end - range_start > 366 THEN RAISE EXCEPTION 'invalid_report_range'; END IF;
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner', 'manager', 'finance']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH units AS (
    SELECT establishment.id, establishment.name, establishment.timezone, establishment.currency
    FROM public.organization_establishments link
    JOIN public.establishments establishment ON establishment.id = link.establishment_id
    WHERE link.organization_id = target_organization_id
      AND link.status = 'active' AND link.effective_until IS NULL
  ), unit_metrics AS (
    SELECT unit.id, unit.name, unit.timezone, unit.currency,
      count(appointment.id) AS appointment_count,
      count(*) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed')) AS scheduled_count,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status IN ('pending', 'confirmed', 'completed')), 0) AS occupied_minutes,
      public.admin_report_available_minutes(unit.id, range_start, range_end, NULL) AS available_minutes,
      count(DISTINCT appointment.client_id) FILTER (WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed') AS identified_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS new_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS returning_clients
    FROM units unit
    LEFT JOIN public.appointments appointment
      ON appointment.establishment_id = unit.id
     AND appointment.deleted_at IS NULL
     AND (appointment.date_time AT TIME ZONE unit.timezone)::date BETWEEN range_start AND range_end
    LEFT JOIN public.services service ON service.id = appointment.service_id
    GROUP BY unit.id, unit.name, unit.timezone, unit.currency
  )
  SELECT jsonb_build_object(
    'organization_id', target_organization_id,
    'range_start', range_start,
    'range_end', range_end,
    'appointment_count', COALESCE(sum(appointment_count), 0),
    'completed_count', COALESCE(sum(completed_count), 0),
    'cancelled_count', COALESCE(sum(cancelled_count), 0),
    'scheduled_count', COALESCE(sum(scheduled_count), 0),
    'production_realized', COALESCE(sum(production_realized), 0),
    'scheduled_value', COALESCE(sum(scheduled_value), 0),
    'average_ticket', CASE WHEN sum(completed_count) > 0
      THEN round(sum(production_realized) / sum(completed_count), 2) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(occupied_minutes), 0),
    'available_minutes', COALESCE(sum(available_minutes), 0),
    'occupancy_rate', CASE WHEN sum(available_minutes) > 0
      THEN round(LEAST(sum(occupied_minutes) * 100.0 / sum(available_minutes), 100), 1) ELSE 0 END,
    'identified_clients', COALESCE(sum(identified_clients), 0),
    'new_clients', COALESCE(sum(new_clients), 0),
    'returning_clients', COALESCE(sum(returning_clients), 0),
    'units', COALESCE(jsonb_agg(to_jsonb(unit_metrics) ORDER BY name), '[]'::jsonb)
  ) INTO result
  FROM unit_metrics;
  RETURN result;
END;
$$;
CREATE OR REPLACE FUNCTION public.get_admin_report_before_business_access(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  range_starts_at timestamptz;
  range_ends_at timestamptz;
  previous_range_start date;
  previous_range_end date;
  previous_starts_at timestamptz;
  previous_ends_at timestamptz;
  day_count integer;
  current_day date;
  available_minutes bigint;
  previous_available_minutes bigint;
  occupied_minutes bigint;
  previous_occupied_minutes bigint;
  summary jsonb;
  previous_summary jsonb;
  daily_series jsonb := '[]'::jsonb;
  hourly_demand jsonb := '[]'::jsonb;
  services jsonb := '[]'::jsonb;
  professionals jsonb := '[]'::jsonb;
  cancellations jsonb := '{}'::jsonb;
  clients jsonb := '{}'::jsonb;
  day_available_minutes bigint;
  day_payload jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  day_count := target_range_end - target_range_start + 1;
  previous_range_end := target_range_start - 1;
  previous_range_start := previous_range_end - day_count + 1;
  range_starts_at := target_range_start::timestamp AT TIME ZONE target_timezone;
  range_ends_at := (target_range_end + 1)::timestamp AT TIME ZONE target_timezone;
  previous_starts_at := previous_range_start::timestamp AT TIME ZONE target_timezone;
  previous_ends_at := (previous_range_end + 1)::timestamp AT TIME ZONE target_timezone;

  available_minutes := public.admin_report_available_minutes(
    target_establishment_id, target_range_start, target_range_end, NULL
  );
  previous_available_minutes := public.admin_report_available_minutes(
    target_establishment_id, previous_range_start, previous_range_end, NULL
  );

  SELECT COALESCE(sum(appointment.duration_minutes), 0)::bigint
  INTO occupied_minutes
  FROM public.appointments appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.status <> 'cancelled'
    AND appointment.date_time >= range_starts_at
    AND appointment.date_time < range_ends_at;

  SELECT COALESCE(sum(appointment.duration_minutes), 0)::bigint
  INTO previous_occupied_minutes
  FROM public.appointments appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.status <> 'cancelled'
    AND appointment.date_time >= previous_starts_at
    AND appointment.date_time < previous_ends_at;

  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(
      sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed')
      / NULLIF(count(*) FILTER (WHERE appointment.status = 'completed'), 0), 0
    ),
    'occupancy_rate', CASE WHEN available_minutes > 0 THEN LEAST(round(occupied_minutes * 100.0 / available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', occupied_minutes,
    'available_minutes', available_minutes,
    'idle_minutes', GREATEST(available_minutes - occupied_minutes, 0),
    'completed_count', count(*) FILTER (WHERE appointment.status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE appointment.status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE appointment.status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE appointment.status = 'confirmed'),
    'active_count', count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed'))
  )
  INTO summary
  FROM public.appointments appointment
  LEFT JOIN public.services service ON service.id = appointment.service_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.date_time >= range_starts_at
    AND appointment.date_time < range_ends_at;

  SELECT jsonb_build_object(
    'production_realized', COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(
      sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed')
      / NULLIF(count(*) FILTER (WHERE appointment.status = 'completed'), 0), 0
    ),
    'occupancy_rate', CASE WHEN previous_available_minutes > 0 THEN LEAST(round(previous_occupied_minutes * 100.0 / previous_available_minutes, 1), 100) ELSE 0 END,
    'occupied_minutes', previous_occupied_minutes,
    'available_minutes', previous_available_minutes,
    'idle_minutes', GREATEST(previous_available_minutes - previous_occupied_minutes, 0),
    'completed_count', count(*) FILTER (WHERE appointment.status = 'completed'),
    'cancelled_count', count(*) FILTER (WHERE appointment.status = 'cancelled'),
    'pending_count', count(*) FILTER (WHERE appointment.status = 'pending'),
    'confirmed_count', count(*) FILTER (WHERE appointment.status = 'confirmed'),
    'active_count', count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed'))
  )
  INTO previous_summary
  FROM public.appointments appointment
  LEFT JOIN public.services service ON service.id = appointment.service_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.date_time >= previous_starts_at
    AND appointment.date_time < previous_ends_at;

  current_day := target_range_start;
  WHILE current_day <= target_range_end LOOP
    day_available_minutes := public.admin_report_available_minutes(
      target_establishment_id, current_day, current_day, NULL
    );
    SELECT jsonb_build_object(
      'date', current_day,
      'production_realized', COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0),
      'scheduled_value', COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
      'occupied_minutes', COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0),
      'available_minutes', day_available_minutes,
      'occupancy_rate', CASE WHEN day_available_minutes > 0 THEN LEAST(round(
        COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0)
        * 100.0 / day_available_minutes, 1
      ), 100) ELSE 0 END,
      'completed_count', count(*) FILTER (WHERE appointment.status = 'completed'),
      'cancelled_count', count(*) FILTER (WHERE appointment.status = 'cancelled'),
      'appointment_count', count(*) FILTER (WHERE appointment.status <> 'cancelled')
    )
    INTO day_payload
    FROM public.appointments appointment
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= current_day::timestamp AT TIME ZONE target_timezone
      AND appointment.date_time < (current_day + 1)::timestamp AT TIME ZONE target_timezone;
    daily_series := daily_series || jsonb_build_array(day_payload);
    current_day := current_day + 1;
  END LOOP;

  SELECT COALESCE(jsonb_agg(to_jsonb(hour_report) ORDER BY hour_report.day_of_week, hour_report.hour), '[]'::jsonb)
  INTO hourly_demand
  FROM (
    SELECT
      extract(dow FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS day_of_week,
      extract(hour FROM appointment.date_time AT TIME ZONE target_timezone)::integer AS hour,
      count(*) AS appointment_count
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.status <> 'cancelled'
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
    GROUP BY 1, 2
  ) hour_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(service_report) ORDER BY service_report.production_realized DESC, service_report.appointment_count DESC), '[]'::jsonb)
  INTO services
  FROM (
    SELECT service.id, service.name,
      count(*) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(*) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(
        sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed')
        / NULLIF(count(*) FILTER (WHERE appointment.status = 'completed'), 0), 0
      ) AS average_ticket,
      COALESCE(round(avg(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled')), 0) AS average_duration_minutes,
      COALESCE(round(
        count(*) FILTER (WHERE appointment.status <> 'cancelled') * 100.0
        / NULLIF(sum(count(*) FILTER (WHERE appointment.status <> 'cancelled')) OVER (), 0), 1
      ), 0) AS demand_share
    FROM public.services service
    LEFT JOIN public.appointments appointment
      ON appointment.service_id = service.id
      AND appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
    WHERE service.establishment_id = target_establishment_id
    GROUP BY service.id, service.name
  ) service_report;

  SELECT COALESCE(jsonb_agg(to_jsonb(professional_report) ORDER BY professional_report.production_realized DESC, professional_report.name), '[]'::jsonb)
  INTO professionals
  FROM (
    SELECT profile.id, profile.name, membership.commission_rate,
      count(appointment.id) FILTER (WHERE appointment.status <> 'cancelled') AS appointment_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(appointment.id) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) * membership.commission_rate AS commission_amount,
      COALESCE(round(
        COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) * 100.0
        / NULLIF(sum(COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0)) OVER (), 0), 1
      ), 0) AS production_share,
      capacity.available_minutes,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0) AS occupied_minutes,
      CASE WHEN capacity.available_minutes > 0 THEN LEAST(round(
        COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status <> 'cancelled'), 0)
        * 100.0 / capacity.available_minutes, 1
      ), 100) ELSE 0 END AS occupancy_rate
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id AND profile.deleted_at IS NULL
    CROSS JOIN LATERAL (
      SELECT public.admin_report_available_minutes(
        target_establishment_id, target_range_start, target_range_end, profile.id
      ) AS available_minutes
    ) capacity
    LEFT JOIN public.appointments appointment
      ON appointment.professional_id = profile.id
      AND appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
    LEFT JOIN public.services service ON service.id = appointment.service_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
    GROUP BY profile.id, profile.name, membership.commission_rate, capacity.available_minutes
  ) professional_report;

  SELECT jsonb_build_object(
    'total', count(*),
    'by_reason', COALESCE((
      SELECT jsonb_agg(to_jsonb(reason_report) ORDER BY reason_report.count DESC, reason_report.reason)
      FROM (
        SELECT COALESCE(NULLIF(trim(cancelled.cancellation_reason), ''), 'Não informado') AS reason, count(*) AS count
        FROM public.appointments cancelled
        WHERE cancelled.establishment_id = target_establishment_id
          AND cancelled.deleted_at IS NULL
          AND cancelled.status = 'cancelled'
          AND cancelled.date_time >= range_starts_at
          AND cancelled.date_time < range_ends_at
        GROUP BY COALESCE(NULLIF(trim(cancelled.cancellation_reason), ''), 'Não informado')
      ) reason_report
    ), '[]'::jsonb),
    'by_role', COALESCE((
      SELECT jsonb_agg(to_jsonb(role_report) ORDER BY role_report.count DESC, role_report.role)
      FROM (
        SELECT COALESCE(cancelled.cancelled_by_role, 'unknown') AS role, count(*) AS count
        FROM public.appointments cancelled
        WHERE cancelled.establishment_id = target_establishment_id
          AND cancelled.deleted_at IS NULL
          AND cancelled.status = 'cancelled'
          AND cancelled.date_time >= range_starts_at
          AND cancelled.date_time < range_ends_at
        GROUP BY COALESCE(cancelled.cancelled_by_role, 'unknown')
      ) role_report
    ), '[]'::jsonb)
  )
  INTO cancellations
  FROM public.appointments appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.status = 'cancelled'
    AND appointment.date_time >= range_starts_at
    AND appointment.date_time < range_ends_at;

  WITH completed_clients AS (
    SELECT DISTINCT appointment.client_id
    FROM public.appointments appointment
    WHERE appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
      AND appointment.status = 'completed'
      AND appointment.client_id IS NOT NULL
      AND appointment.date_time >= range_starts_at
      AND appointment.date_time < range_ends_at
  ), classified_clients AS (
    SELECT completed_client.client_id,
      EXISTS (
        SELECT 1 FROM public.appointments previous
        WHERE previous.establishment_id = target_establishment_id
          AND previous.deleted_at IS NULL
          AND previous.status = 'completed'
          AND previous.client_id = completed_client.client_id
          AND previous.date_time < range_starts_at
      ) AS is_returning
    FROM completed_clients completed_client
  )
  SELECT jsonb_build_object(
    'identified_clients', count(*),
    'new_clients', count(*) FILTER (WHERE NOT is_returning),
    'returning_clients', count(*) FILTER (WHERE is_returning),
    'return_rate', COALESCE(round(count(*) FILTER (WHERE is_returning) * 100.0 / NULLIF(count(*), 0), 1), 0),
    'walk_in_appointments', (
      SELECT count(*) FROM public.appointments walk_in
      WHERE walk_in.establishment_id = target_establishment_id
        AND walk_in.deleted_at IS NULL
        AND walk_in.status = 'completed'
        AND walk_in.client_id IS NULL
        AND walk_in.date_time >= range_starts_at
        AND walk_in.date_time < range_ends_at
    )
  )
  INTO clients
  FROM classified_clients;

  RETURN jsonb_build_object(
    'period', jsonb_build_object(
      'start', target_range_start,
      'end', target_range_end,
      'days', day_count,
      'previous_start', previous_range_start,
      'previous_end', previous_range_end,
      'timezone', target_timezone
    ),
    'summary', summary,
    'previous_summary', previous_summary,
    'daily_series', daily_series,
    'hourly_demand', hourly_demand,
    'services', services,
    'professionals', professionals,
    'cancellations', cancellations,
    'clients', clients,
    'generated_at', now()
  );
END;
$function$;
COMMIT;
