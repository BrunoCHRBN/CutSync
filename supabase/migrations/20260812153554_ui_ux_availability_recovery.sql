BEGIN;

CREATE OR REPLACE FUNCTION public.get_booking_availability_recovery(
  target_establishment_id uuid,
  target_professional_ids uuid[],
  target_service_id text,
  target_local_date date,
  target_appointment_id text DEFAULT NULL,
  search_days integer DEFAULT 14
)
RETURNS TABLE (
  requested_date date,
  local_date date,
  starts_at timestamptz,
  local_time text,
  duration_minutes integer,
  professional_id uuid,
  recovery_rank integer
)
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  candidate_date date;
  date_offset integer;
  returned_rows integer;
  dates_with_slots integer := 0;
  normalized_search_days integer := LEAST(GREATEST(COALESCE(search_days, 14), 1), 31);
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_local_date IS NULL THEN RAISE EXCEPTION 'invalid_availability_date'; END IF;
  IF COALESCE(array_length(target_professional_ids, 1), 0) = 0 THEN
    RAISE EXCEPTION 'professional_required';
  END IF;
  IF array_length(target_professional_ids, 1) > 8 THEN
    RAISE EXCEPTION 'too_many_professionals';
  END IF;

  FOR date_offset IN 0..normalized_search_days LOOP
    candidate_date := target_local_date + date_offset;

    RETURN QUERY
    SELECT
      target_local_date,
      candidate_date,
      resolved.starts_at,
      resolved.local_time,
      resolved.duration_minutes,
      resolved.professional_id,
      date_offset
    FROM (
      SELECT DISTINCT ON (slot.starts_at)
        slot.starts_at,
        slot.local_time,
        slot.duration_minutes,
        professional.professional_id,
        professional.preference
      FROM unnest(target_professional_ids) WITH ORDINALITY
        AS professional(professional_id, preference)
      CROSS JOIN LATERAL public.get_available_slots(
        target_establishment_id,
        professional.professional_id,
        target_service_id,
        candidate_date,
        target_appointment_id
      ) AS slot
      WHERE slot.available = true
        AND slot.starts_at IS NOT NULL
      ORDER BY slot.starts_at, professional.preference
    ) AS resolved
    ORDER BY resolved.starts_at
    LIMIT 24;

    GET DIAGNOSTICS returned_rows = ROW_COUNT;
    IF returned_rows > 0 THEN dates_with_slots := dates_with_slots + 1; END IF;
    EXIT WHEN dates_with_slots >= 3;
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.get_booking_availability_recovery(uuid, uuid[], text, date, text, integer)
IS 'Authenticated booking recovery read model. Returns slots for up to three dates, preserving professional preference and existing availability/billing rules.';

REVOKE ALL ON FUNCTION public.get_booking_availability_recovery(uuid, uuid[], text, date, text, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_booking_availability_recovery(uuid, uuid[], text, date, text, integer)
  TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
