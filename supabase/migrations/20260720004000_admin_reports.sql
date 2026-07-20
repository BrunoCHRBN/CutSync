BEGIN;

SET LOCAL search_path = pg_catalog, public;

CREATE OR REPLACE FUNCTION public.admin_report_available_minutes(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_professional_id uuid DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $function$
DECLARE
  target_timezone text;
  establishment_hours_text text;
  establishment_schedule jsonb := '[]'::jsonb;
  establishment_has_schedule boolean := false;
  professional_record record;
  professional_schedule jsonb;
  professional_has_schedule boolean;
  establishment_day jsonb;
  professional_day jsonb;
  current_local_date date;
  current_day integer;
  establishment_open time;
  establishment_close time;
  professional_open time;
  professional_close time;
  effective_open time;
  effective_close time;
  day_starts_at timestamptz;
  day_ends_at timestamptz;
  raw_minutes numeric;
  blocked_minutes numeric;
  schedule_blocks_available boolean := false;
  total_minutes bigint := 0;
BEGIN
  IF target_range_end < target_range_start OR target_range_end > target_range_start + 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;

  SELECT establishment.timezone, establishment.opening_hours
  INTO target_timezone, establishment_hours_text
  FROM public.establishments establishment
  WHERE establishment.id = target_establishment_id;

  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_timezone_names timezone_name WHERE timezone_name.name = target_timezone) THEN
    RAISE EXCEPTION 'invalid_establishment_timezone';
  END IF;
  schedule_blocks_available := to_regclass('public.schedule_blocks') IS NOT NULL;

  BEGIN
    IF NULLIF(trim(establishment_hours_text), '') IS NOT NULL THEN
      establishment_schedule := establishment_hours_text::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END;

  IF jsonb_typeof(establishment_schedule) <> 'array' THEN
    RAISE EXCEPTION 'invalid_schedule_configuration';
  END IF;
  establishment_has_schedule := jsonb_array_length(establishment_schedule) > 0;

  FOR professional_record IN
    SELECT profile.id, profile.work_hours
    FROM public.memberships membership
    JOIN public.profiles profile ON profile.id = membership.profile_id
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.role IN ('professional', 'admin')
      AND profile.deleted_at IS NULL
      AND (target_professional_id IS NULL OR profile.id = target_professional_id)
  LOOP
    professional_schedule := '[]'::jsonb;
    BEGIN
      IF NULLIF(trim(professional_record.work_hours), '') IS NOT NULL THEN
        professional_schedule := professional_record.work_hours::jsonb;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'invalid_schedule_configuration';
    END;
    IF jsonb_typeof(professional_schedule) <> 'array' THEN
      RAISE EXCEPTION 'invalid_schedule_configuration';
    END IF;
    professional_has_schedule := jsonb_array_length(professional_schedule) > 0;

    current_local_date := target_range_start;
    WHILE current_local_date <= target_range_end LOOP
      current_day := extract(dow FROM current_local_date)::integer;
      establishment_day := NULL;
      professional_day := NULL;
      establishment_open := NULL;
      establishment_close := NULL;
      professional_open := NULL;
      professional_close := NULL;

      IF establishment_has_schedule THEN
        SELECT item INTO establishment_day
        FROM jsonb_array_elements(establishment_schedule) AS schedule_item(item)
        WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
          AND (item->>'day')::integer = current_day
        LIMIT 1;
        IF establishment_day IS NULL OR COALESCE(establishment_day->>'isOpen', 'false') <> 'true' THEN
          current_local_date := current_local_date + 1;
          CONTINUE;
        END IF;
      END IF;

      IF professional_has_schedule THEN
        SELECT item INTO professional_day
        FROM jsonb_array_elements(professional_schedule) AS schedule_item(item)
        WHERE COALESCE(item->>'day', '') ~ '^[0-6]$'
          AND (item->>'day')::integer = current_day
        LIMIT 1;
        IF professional_day IS NULL OR COALESCE(professional_day->>'isOpen', 'false') <> 'true' THEN
          current_local_date := current_local_date + 1;
          CONTINUE;
        END IF;
      END IF;

      IF NOT establishment_has_schedule AND NOT professional_has_schedule THEN
        current_local_date := current_local_date + 1;
        CONTINUE;
      END IF;

      BEGIN
        IF establishment_has_schedule THEN
          establishment_open := (establishment_day->>'open')::time;
          establishment_close := (establishment_day->>'close')::time;
        END IF;
        IF professional_has_schedule THEN
          professional_open := (professional_day->>'open')::time;
          professional_close := (professional_day->>'close')::time;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'invalid_schedule_configuration';
      END;

      IF establishment_has_schedule AND professional_has_schedule THEN
        effective_open := GREATEST(establishment_open, professional_open);
        effective_close := LEAST(establishment_close, professional_close);
      ELSIF establishment_has_schedule THEN
        effective_open := establishment_open;
        effective_close := establishment_close;
      ELSE
        effective_open := professional_open;
        effective_close := professional_close;
      END IF;

      IF effective_open IS NOT NULL AND effective_close IS NOT NULL AND effective_open < effective_close THEN
        day_starts_at := (current_local_date + effective_open) AT TIME ZONE target_timezone;
        day_ends_at := (current_local_date + effective_close) AT TIME ZONE target_timezone;
        raw_minutes := extract(epoch FROM (day_ends_at - day_starts_at)) / 60;

        blocked_minutes := 0;
        IF schedule_blocks_available THEN
          EXECUTE $query$
            SELECT COALESCE(sum(
              extract(epoch FROM (
                LEAST(schedule_block.ends_at, $3)
                - GREATEST(schedule_block.starts_at, $4)
              )) / 60
            ), 0)
            FROM public.schedule_blocks schedule_block
            WHERE schedule_block.establishment_id = $1
              AND schedule_block.professional_id = $2
              AND schedule_block.deleted_at IS NULL
              AND schedule_block.starts_at < $3
              AND schedule_block.ends_at > $4
          $query$
          INTO blocked_minutes
          USING target_establishment_id, professional_record.id, day_ends_at, day_starts_at;
        END IF;

        total_minutes := total_minutes + GREATEST(round(raw_minutes - LEAST(blocked_minutes, raw_minutes)), 0)::bigint;
      END IF;

      current_local_date := current_local_date + 1;
    END LOOP;
  END LOOP;

  RETURN total_minutes;
END;
$function$;

REVOKE ALL ON FUNCTION public.admin_report_available_minutes(uuid, date, date, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_admin_report(
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
    'production_realized', COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(
      sum(service.price) FILTER (WHERE appointment.status = 'completed')
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
    'production_realized', COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0),
    'scheduled_value', COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
    'average_ticket', COALESCE(
      sum(service.price) FILTER (WHERE appointment.status = 'completed')
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
      'production_realized', COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0),
      'scheduled_value', COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0),
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
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(
        sum(service.price) FILTER (WHERE appointment.status = 'completed')
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
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * membership.commission_rate AS commission_amount,
      COALESCE(round(
        COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) * 100.0
        / NULLIF(sum(COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0)) OVER (), 0), 1
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

REVOKE ALL ON FUNCTION public.get_admin_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_admin_report(uuid, date, date) TO authenticated;

COMMIT;
