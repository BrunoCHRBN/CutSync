BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Operational lifecycle is restricted to the appointment's local calendar
-- date or a later date. Walk-ins have no appointment and remain unaffected.
CREATE OR REPLACE FUNCTION public.guard_service_order_appointment_date()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  appointment_starts_at timestamptz;
  establishment_timezone text;
BEGIN
  IF NEW.appointment_id IS NULL OR NEW.status = 'voided' THEN
    RETURN NEW;
  END IF;

  SELECT appointment.date_time, establishment.timezone
  INTO appointment_starts_at, establishment_timezone
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment
    ON establishment.id = appointment.establishment_id
  WHERE appointment.id = NEW.appointment_id
    AND appointment.establishment_id = NEW.establishment_id
    AND appointment.deleted_at IS NULL;

  IF appointment_starts_at IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF (appointment_starts_at AT TIME ZONE establishment_timezone)::date
      > (now() AT TIME ZONE establishment_timezone)::date
  THEN
    RAISE EXCEPTION 'service_order_appointment_not_operational_today'
      USING ERRCODE = '22023';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_service_order_appointment_date
  ON public.service_orders;
CREATE TRIGGER guard_service_order_appointment_date
BEFORE INSERT OR UPDATE OF status, appointment_id, establishment_id
ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.guard_service_order_appointment_date();

REVOKE ALL ON FUNCTION public.guard_service_order_appointment_date()
  FROM PUBLIC, anon, authenticated;

-- A service assignment is optional for admin/owner operators. When it exists,
-- it remains authoritative: an inactive assignment excludes the operator and
-- an active assignment may override price/duration. This matches the canonical
-- availability engine instead of discarding admins before the slot check.
CREATE OR REPLACE FUNCTION public.resolve_reassignment_candidate_price(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN membership.role_template = 'admin'
      AND professional_service.professional_id IS NULL
      THEN service.price
    WHEN professional_service.is_active IS TRUE
      THEN professional_service.price
    ELSE NULL
  END
  FROM public.memberships AS membership
  JOIN public.services AS service
    ON service.establishment_id = membership.establishment_id
   AND service.id = target_service_id
   AND service.is_active
   AND service.deleted_at IS NULL
  LEFT JOIN public.professional_services AS professional_service
    ON professional_service.establishment_id = membership.establishment_id
   AND professional_service.professional_id = membership.profile_id
   AND professional_service.service_id = service.id
  WHERE membership.establishment_id = target_establishment_id
    AND membership.profile_id = target_professional_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
    AND membership.role_template IN ('admin', 'professional')
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.resolve_reassignment_candidate_price(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.list_business_reassignment_candidates(
  target_establishment_id uuid,
  target_reassignment_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  workflow public.appointment_reassignment_requests%ROWTYPE;
  appointment public.appointments%ROWTYPE;
  target_timezone text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'apply_appointment_reassignment', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = target_reassignment_request_id
    AND request.establishment_id = target_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'reassignment_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF workflow.status <> 'awaiting_manager' THEN
    RAISE EXCEPTION 'reassignment_not_proposable' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id
    AND target.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'appointment_not_found' USING ERRCODE = 'P0002';
  END IF;
  SELECT establishment.timezone INTO target_timezone
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  SELECT COALESCE(
    jsonb_agg(candidate.payload ORDER BY candidate.name, candidate.profile_id),
    '[]'::jsonb
  )
  INTO result
  FROM (
    SELECT
      profile.id AS profile_id,
      profile.name,
      jsonb_build_object(
        'profileId', profile.id,
        'name', profile.name,
        'priceCents', round(qualification.price * 100)::bigint,
        'monetaryImpact', round(qualification.price * 100)::bigint
          <> round(appointment.price_charged * 100)::bigint
      ) AS payload
    FROM public.memberships AS membership
    JOIN public.profiles AS profile ON profile.id = membership.profile_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_reassignment_candidate_price(
        target_establishment_id,
        membership.profile_id,
        appointment.service_id
      ) AS price
    ) AS qualification
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
      AND membership.role_template IN ('admin', 'professional')
      AND membership.profile_id <> appointment.professional_id
      AND qualification.price IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM public.compute_available_slots(
          target_establishment_id,
          membership.profile_id,
          appointment.service_id,
          (appointment.date_time AT TIME ZONE target_timezone)::date,
          appointment.id
        ) AS slot
        WHERE slot.starts_at = appointment.date_time
          AND slot.available
      )
  ) AS candidate;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.list_business_reassignment_candidates(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_business_reassignment_candidates(uuid, uuid)
  TO authenticated, service_role;

-- Keep proposal-time validation identical to the read model. The replacement
-- is deliberately guarded so schema drift fails the migration instead of
-- silently retaining the stricter legacy JOIN.
DO $migration$
DECLARE
  function_definition text;
  legacy_fragment text := $legacy$
  SELECT professional_service.price INTO proposed_price
  FROM public.professional_services AS professional_service
  WHERE professional_service.establishment_id = workflow.establishment_id
    AND professional_service.professional_id = target_proposed_professional_id
    AND professional_service.service_id = appointment.service_id
    AND professional_service.is_active
  LIMIT 1;
$legacy$;
  replacement_fragment text := $replacement$
  SELECT public.resolve_reassignment_candidate_price(
    workflow.establishment_id,
    target_proposed_professional_id,
    appointment.service_id
  ) INTO proposed_price;
$replacement$;
BEGIN
  SELECT pg_get_functiondef(
    'public.propose_appointment_reassignment(uuid,uuid,integer,uuid)'::regprocedure
  ) INTO function_definition;

  IF position(legacy_fragment IN function_definition) = 0 THEN
    RAISE EXCEPTION 'propose_appointment_reassignment_definition_drift';
  END IF;

  EXECUTE replace(function_definition, legacy_fragment, replacement_fragment);
END;
$migration$;

COMMIT;
