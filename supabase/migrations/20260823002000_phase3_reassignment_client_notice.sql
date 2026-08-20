CREATE OR REPLACE FUNCTION public.enqueue_client_reassignment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  appointment public.appointments%ROWTYPE;
  workflow public.appointment_reassignment_requests%ROWTYPE;
  target_event_type text;
  target_title text;
  target_body text;
  establishment_name text;
BEGIN
  IF NEW.reassignment_request_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT * INTO workflow
  FROM public.appointment_reassignment_requests AS request
  WHERE request.id = NEW.reassignment_request_id;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  SELECT * INTO appointment
  FROM public.appointments AS target
  WHERE target.id = workflow.appointment_id
    AND target.client_id IS NOT NULL
    AND target.deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF NEW.event_type = 'reassignment.proposed'
    AND workflow.status = 'awaiting_customer'
  THEN
    target_event_type := 'appointment_reassignment_decision_required';
    target_title := 'Sua decisão é necessária';
    target_body := 'O estabelecimento propôs uma alteração de profissional. Revise antes de decidir.';
  ELSIF NEW.event_type = 'reassignment.validated'
    AND workflow.status = 'awaiting_manager'
  THEN
    target_event_type := 'appointment_reassignment_updated';
    target_title := 'Alteração de profissional em análise';
    target_body := 'O estabelecimento está definindo um substituto. Você será avisado quando houver uma proposta para decidir.';
  ELSIF NEW.event_type IN (
      'reassignment.applied',
      'reassignment.withdrawn',
      'reassignment.expired'
    )
    OR (
      NEW.event_type = 'reassignment.customer_decided'
      AND NEW.actor_kind <> 'customer'
    )
  THEN
    target_event_type := 'appointment_reassignment_updated';
    target_title := 'Alteração do atendimento atualizada';
    target_body := 'Há uma nova atualização sobre a alteração de profissional do seu atendimento.';
  ELSE
    RETURN NEW;
  END IF;

  SELECT establishment.name INTO establishment_name
  FROM public.establishments AS establishment
  WHERE establishment.id = workflow.establishment_id;
  target_body := target_body || ' ' || COALESCE(establishment_name, '');

  INSERT INTO public.client_push_deliveries (
    event_key,
    event_type,
    profile_id,
    push_device_id,
    appointment_id,
    title,
    body,
    payload
  )
  SELECT
    'reassignment:' || NEW.id::text || ':' || target_event_type,
    target_event_type,
    appointment.client_id,
    device.id,
    appointment.id,
    target_title,
    left(btrim(target_body), 500),
    jsonb_build_object(
      'appointmentId', appointment.id,
      'reassignmentRequestId', workflow.id,
      'eventType', target_event_type,
      'correlationId', NEW.correlation_id,
      'url', '/appointments/' || appointment.id
    )
  FROM public.profiles AS profile
  JOIN public.push_devices AS device
    ON device.profile_id = profile.id
   AND device.app_kind = 'client'
   AND device.enabled
  WHERE profile.id = appointment.client_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_client_reassignment_push()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_client_reassignment_push()
  TO service_role;

COMMENT ON FUNCTION public.enqueue_client_reassignment_push() IS
  'Enqueues an informational push after validation and an actionable push only after a replacement is proposed.';
