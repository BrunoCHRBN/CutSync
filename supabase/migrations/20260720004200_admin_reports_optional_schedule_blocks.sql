BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Corrige bancos em que os relatórios foram habilitados antes do recurso de
-- bloqueios de agenda. Sem a tabela, a capacidade continua sendo calculada
-- pela jornada; quando ela existe, os bloqueios são descontados normalmente.
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

REVOKE ALL ON FUNCTION public.admin_report_available_minutes(uuid, date, date, uuid)
  FROM PUBLIC, anon, authenticated;

COMMIT;
