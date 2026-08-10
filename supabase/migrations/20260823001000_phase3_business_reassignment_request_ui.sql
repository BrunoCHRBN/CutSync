BEGIN;

-- The Business reassignment request must use the same optimistic version that
-- the backend validates. Expose the appointment timestamp in the existing
-- authorized read model instead of allowing the app to read appointments
-- directly.
CREATE OR REPLACE FUNCTION public.get_business_appointment_detail(
  target_establishment_id uuid,
  target_appointment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  appointment_record public.appointments%ROWTYPE;
  actor_can_manage_clients boolean;
  actor_can_write boolean;
  actor_is_business_admin boolean;
  actor_can_view_sensitive_detail boolean;
  allowed_actions jsonb := '[]'::jsonb;
  result jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT * INTO appointment_record
  FROM public.appointments
  WHERE id = target_appointment_id
    AND establishment_id = target_establishment_id
    AND deleted_at IS NULL;
  IF appointment_record.id IS NULL THEN RAISE EXCEPTION 'appointment_not_found'; END IF;
  IF NOT public.can_view_business_appointment(
    target_establishment_id, appointment_record.professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  actor_can_manage_clients := public.has_business_capability(
    target_establishment_id, 'manage_clients'
  ) OR public.is_superadmin();
  actor_can_write := public.can_operate_business_appointment(
    target_establishment_id, appointment_record.professional_id
  );
  actor_is_business_admin := public.is_superadmin()
    OR public.is_business_administrator(target_establishment_id, false);
  actor_can_view_sensitive_detail := actor_can_write OR actor_is_business_admin;

  IF actor_can_write AND appointment_record.status = 'pending' THEN
    allowed_actions := '["confirm","cancel"]'::jsonb;
    IF appointment_record.date_time > now() THEN
      allowed_actions := allowed_actions || '"reschedule"'::jsonb;
    END IF;
  ELSIF actor_can_write AND appointment_record.status = 'confirmed' THEN
    allowed_actions := '["complete","cancel"]'::jsonb;
    IF appointment_record.date_time > now() THEN
      allowed_actions := allowed_actions || '"reschedule"'::jsonb;
    END IF;
    IF appointment_record.date_time <= now() THEN
      allowed_actions := allowed_actions || '"no_show"'::jsonb;
    END IF;
  END IF;

  SELECT jsonb_build_object(
    'appointmentId', appointment.id,
    'establishmentId', appointment.establishment_id,
    'status', appointment.status,
    'startsAt', appointment.date_time,
    'endsAt', appointment.ends_at,
    'updatedAt', appointment.updated_at,
    'durationMinutes', appointment.duration_minutes,
    'notes', CASE WHEN actor_can_view_sensitive_detail
      THEN appointment.business_notes END,
    'service', jsonb_build_object(
      'id', service.id,
      'name', service.name,
      'listPrice', service.price
    ),
    'professional', jsonb_build_object(
      'id', professional.id,
      'name', professional.name
    ),
    'client', jsonb_strip_nulls(jsonb_build_object(
      'establishmentClientId', CASE WHEN actor_can_view_sensitive_detail
        THEN establishment_client.id END,
      'profileId', CASE WHEN actor_can_view_sensitive_detail
        THEN appointment.client_id END,
      'displayName', CASE WHEN actor_can_view_sensitive_detail THEN COALESCE(
          establishment_client.display_name,
          NULLIF(btrim(appointment.client_name), ''),
          client_profile.name,
          'Cliente'
        ) ELSE 'Cliente' END,
      'phone', CASE WHEN actor_can_manage_clients THEN establishment_client.phone END,
      'email', CASE WHEN actor_can_manage_clients THEN establishment_client.email END,
      'tags', CASE WHEN actor_can_manage_clients THEN establishment_client.tags END,
      'notes', CASE WHEN actor_can_manage_clients THEN establishment_client.notes END
    )),
    'history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', event.id,
        'eventType', event.event_type,
        'actorId', CASE WHEN actor_can_view_sensitive_detail THEN event.actor_id END,
        'previousStatus', event.previous_status,
        'resultingStatus', event.resulting_status,
        'createdAt', event.created_at,
        'metadata', CASE WHEN actor_can_view_sensitive_detail
          THEN event.metadata ELSE '{}'::jsonb END
      ) ORDER BY event.created_at, event.id)
      FROM public.appointment_events AS event
      WHERE event.appointment_id = appointment.id
    ), '[]'::jsonb),
    'allowedActions', allowed_actions
  ) INTO result
  FROM public.appointments AS appointment
  JOIN public.services AS service ON service.id = appointment.service_id
  JOIN public.profiles AS professional ON professional.id = appointment.professional_id
  LEFT JOIN public.profiles AS client_profile ON client_profile.id = appointment.client_id
  LEFT JOIN public.establishment_clients AS establishment_client
    ON establishment_client.id = appointment.establishment_client_id
  WHERE appointment.id = appointment_record.id;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_appointment_detail(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_appointment_detail(uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_business_appointment_detail(uuid, text) IS
  'Authorized Business appointment read model including the optimistic updatedAt version.';

COMMIT;
