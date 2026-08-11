SET search_path = pg_catalog, public, extensions;

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.is_safe_business_push_payload(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND jsonb_typeof(value->'eventType') = 'string'
    AND jsonb_typeof(value->'establishmentId') = 'string'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_each(value) AS item
      WHERE item.key <> ALL (ARRAY[
        'eventType', 'establishmentId', 'appointmentId',
        'invitationId', 'professionalId', 'reassignmentRequestId',
        'correlationId'
      ]::text[])
        OR jsonb_typeof(item.value) <> 'string'
    );
$$;

ALTER TABLE public.business_push_deliveries
  DROP CONSTRAINT IF EXISTS business_push_deliveries_event_type_check;
ALTER TABLE public.business_push_deliveries
  ADD CONSTRAINT business_push_deliveries_event_type_check CHECK (event_type IN (
    'appointment_created', 'appointment_cancelled',
    'appointment_rescheduled', 'invitation_created', 'operational_conflict',
    'appointment_reassignment_action_required',
    'appointment_reassignment_updated'
  ));

CREATE OR REPLACE FUNCTION public.enqueue_business_reassignment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  workflow public.appointment_reassignment_requests%ROWTYPE;
  target_event_type text;
  target_title text;
  target_body text;
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

  IF NEW.event_type = 'reassignment.customer_decided'
    AND NEW.actor_kind = 'customer'
    AND workflow.status IN ('ready_to_apply', 'awaiting_manager', 'manual_review')
  THEN
    target_event_type := 'appointment_reassignment_action_required';
    target_title := 'Decisão do cliente recebida';
    target_body := 'Uma alteração de profissional precisa da próxima ação do estabelecimento.';
  ELSIF NEW.event_type IN (
      'reassignment.customer_decided',
      'reassignment.applied',
      'reassignment.withdrawn',
      'reassignment.expired'
    )
  THEN
    target_event_type := 'appointment_reassignment_updated';
    target_title := 'Reatribuição atualizada';
    target_body := 'Há uma atualização no fluxo de alteração de profissional.';
  ELSE
    RETURN NEW;
  END IF;

  INSERT INTO public.business_push_deliveries (
    event_key,
    event_type,
    profile_id,
    push_device_id,
    establishment_id,
    appointment_id,
    title,
    body,
    payload
  )
  SELECT
    'reassignment:' || NEW.id::text || ':' || target_event_type,
    target_event_type,
    membership.profile_id,
    device.id,
    workflow.establishment_id,
    workflow.appointment_id,
    target_title,
    target_body,
    jsonb_build_object(
      'eventType', target_event_type,
      'establishmentId', workflow.establishment_id,
      'appointmentId', workflow.appointment_id,
      'reassignmentRequestId', workflow.id,
      'correlationId', NEW.correlation_id
    )
  FROM public.memberships AS membership
  JOIN public.push_devices AS device
    ON device.profile_id = membership.profile_id
   AND device.app_kind = 'business'
   AND device.enabled
  JOIN public.profiles AS profile
    ON profile.id = membership.profile_id
   AND profile.deleted_at IS NULL
  WHERE membership.establishment_id = workflow.establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
    AND public.has_business_capability(
      workflow.establishment_id,
      membership.profile_id,
      'apply_appointment_reassignment',
      'full'
    )
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_business_reassignment_push_trigger
  ON public.appointment_assignment_events;
CREATE TRIGGER enqueue_business_reassignment_push_trigger
AFTER INSERT ON public.appointment_assignment_events
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_business_reassignment_push();

REVOKE ALL ON FUNCTION public.enqueue_business_reassignment_push()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_business_reassignment_push()
  TO service_role;

DO $schedule$
DECLARE
  existing_job record;
BEGIN
  FOR existing_job IN
    SELECT jobid
    FROM cron.job
    WHERE jobname IN (
      'cutsync-dispatch-client-notifications',
      'cutsync-dispatch-business-notifications'
    )
  LOOP
    PERFORM cron.unschedule(existing_job.jobid);
  END LOOP;

  PERFORM cron.schedule(
    'cutsync-dispatch-client-notifications',
    '* * * * *',
    $client$
      SELECT net.http_post(
        url := (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'notification_dispatch_client_url'
          LIMIT 1
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cutsync-dispatch-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'notification_dispatch_secret'
            LIMIT 1
          )
        ),
        body := '{"mode":"all","limit":100}'::jsonb,
        timeout_milliseconds := 15000
      );
    $client$
  );

  PERFORM cron.schedule(
    'cutsync-dispatch-business-notifications',
    '* * * * *',
    $business$
      SELECT net.http_post(
        url := (
          SELECT decrypted_secret
          FROM vault.decrypted_secrets
          WHERE name = 'notification_dispatch_business_url'
          LIMIT 1
        ),
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'x-cutsync-dispatch-secret', (
            SELECT decrypted_secret
            FROM vault.decrypted_secrets
            WHERE name = 'notification_dispatch_secret'
            LIMIT 1
          )
        ),
        body := '{"mode":"all","limit":100}'::jsonb,
        timeout_milliseconds := 15000
      );
    $business$
  );
END;
$schedule$;

COMMENT ON FUNCTION public.enqueue_business_reassignment_push() IS
  'Queues capability-scoped Business notifications from immutable reassignment events.';
