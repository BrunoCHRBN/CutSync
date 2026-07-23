BEGIN;

CREATE TABLE public.client_push_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN (
    'appointment_received',
    'appointment_confirmed',
    'appointment_rescheduled',
    'appointment_cancelled',
    'appointment_reminder'
  )),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  push_device_id uuid NOT NULL REFERENCES public.push_devices(id) ON DELETE CASCADE,
  appointment_id text NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 500),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(payload) = 'object'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',
    'processing',
    'ticketed',
    'sent',
    'failed',
    'skipped'
  )),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  expo_ticket_id text,
  ticketed_at timestamptz,
  receipt_checked_at timestamptz,
  sent_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_key, push_device_id)
);

CREATE INDEX client_push_deliveries_pending_idx
  ON public.client_push_deliveries (available_at, created_at)
  WHERE status IN ('pending', 'processing');

CREATE INDEX client_push_deliveries_receipts_idx
  ON public.client_push_deliveries (ticketed_at, receipt_checked_at)
  WHERE status = 'ticketed';

ALTER TABLE public.client_push_deliveries ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.client_push_deliveries FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_push_deliveries TO service_role;

CREATE OR REPLACE FUNCTION public.enqueue_client_appointment_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_event_type text;
  target_event_key text;
  target_title text;
  target_body text;
  establishment_name text;
  establishment_timezone text;
  localized_starts_at text;
BEGIN
  IF NEW.client_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.status = 'confirmed' THEN
      target_event_type := 'appointment_confirmed';
      target_title := 'Agendamento confirmado';
    ELSIF NEW.status = 'pending' THEN
      target_event_type := 'appointment_received';
      target_title := 'Agendamento recebido';
    ELSE
      RETURN NEW;
    END IF;
  ELSIF NEW.reschedule_count > OLD.reschedule_count
    OR NEW.date_time IS DISTINCT FROM OLD.date_time
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
  THEN
    target_event_type := 'appointment_rescheduled';
    target_title := 'Agendamento alterado';
  ELSIF NEW.status = 'cancelled' AND OLD.status IS DISTINCT FROM 'cancelled' THEN
    target_event_type := 'appointment_cancelled';
    target_title := 'Agendamento cancelado';
  ELSIF NEW.status = 'confirmed' AND OLD.status = 'pending' THEN
    target_event_type := 'appointment_confirmed';
    target_title := 'Agendamento confirmado';
  ELSE
    RETURN NEW;
  END IF;

  SELECT
    establishment.name,
    COALESCE(NULLIF(establishment.timezone, ''), 'America/Sao_Paulo')
  INTO establishment_name, establishment_timezone
  FROM public.establishments AS establishment
  WHERE establishment.id = NEW.establishment_id;

  localized_starts_at := to_char(
    NEW.date_time AT TIME ZONE establishment_timezone,
    'DD/MM/YYYY "às" HH24:MI'
  );

  target_body := CASE target_event_type
    WHEN 'appointment_received' THEN
      'Recebemos seu pedido em ' || establishment_name || ' para ' || localized_starts_at || '.'
    WHEN 'appointment_confirmed' THEN
      'Seu atendimento em ' || establishment_name || ' está confirmado para ' || localized_starts_at || '.'
    WHEN 'appointment_rescheduled' THEN
      'Seu atendimento em ' || establishment_name || ' foi alterado para ' || localized_starts_at || '.'
    WHEN 'appointment_cancelled' THEN
      'Seu atendimento em ' || establishment_name || ' foi cancelado.'
  END;

  target_event_key := concat_ws(
    ':',
    NEW.id,
    target_event_type,
    NEW.status,
    NEW.reschedule_count,
    extract(epoch FROM NEW.date_time)::bigint
  );

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
    target_event_key,
    target_event_type,
    NEW.client_id,
    device.id,
    NEW.id,
    target_title,
    target_body,
    jsonb_build_object(
      'appointmentId', NEW.id,
      'eventType', target_event_type,
      'url', '/appointments/' || NEW.id
    )
  FROM public.profiles AS profile
  JOIN public.push_devices AS device
    ON device.profile_id = profile.id
    AND device.app_kind = 'client'
    AND device.enabled
  WHERE profile.id = NEW.client_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enqueue_client_appointment_push_trigger ON public.appointments;
CREATE TRIGGER enqueue_client_appointment_push_trigger
AFTER INSERT OR UPDATE OF
  status,
  date_time,
  professional_id,
  service_id,
  reschedule_count,
  deleted_at
ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public.enqueue_client_appointment_push();

CREATE OR REPLACE FUNCTION public.queue_due_client_appointment_reminders(
  target_now timestamptz DEFAULT now()
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  inserted_count integer;
BEGIN
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
    appointment.id || ':appointment_reminder:24h',
    'appointment_reminder',
    appointment.client_id,
    device.id,
    appointment.id,
    'Lembrete de atendimento',
    'Seu atendimento em ' || establishment.name || ' será amanhã, '
      || to_char(
        appointment.date_time AT TIME ZONE COALESCE(NULLIF(establishment.timezone, ''), 'America/Sao_Paulo'),
        'DD/MM/YYYY "às" HH24:MI'
      ) || '.',
    jsonb_build_object(
      'appointmentId', appointment.id,
      'eventType', 'appointment_reminder',
      'url', '/appointments/' || appointment.id
    )
  FROM public.appointments AS appointment
  JOIN public.establishments AS establishment
    ON establishment.id = appointment.establishment_id
  JOIN public.profiles AS profile
    ON profile.id = appointment.client_id
    AND profile.deleted_at IS NULL
    AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
  JOIN public.push_devices AS device
    ON device.profile_id = appointment.client_id
    AND device.app_kind = 'client'
    AND device.enabled
  WHERE appointment.deleted_at IS NULL
    AND appointment.status IN ('pending', 'confirmed')
    AND appointment.date_time > target_now + interval '23 hours 45 minutes'
    AND appointment.date_time <= target_now + interval '24 hours'
  ON CONFLICT (event_key, push_device_id) DO NOTHING;

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RETURN inserted_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_client_push_deliveries(target_limit integer DEFAULT 100)
RETURNS TABLE (
  delivery_id uuid,
  expo_push_token text,
  notification_title text,
  notification_body text,
  notification_payload jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.client_push_deliveries AS delivery
  SET status = 'skipped',
      last_error_code = 'push_disabled',
      locked_at = NULL,
      updated_at = now()
  WHERE delivery.status IN ('pending', 'processing')
    AND (
      NOT EXISTS (
        SELECT 1
        FROM public.push_devices AS device
        WHERE device.id = delivery.push_device_id
          AND device.enabled
          AND device.app_kind = 'client'
      )
      OR NOT EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = delivery.profile_id
          AND profile.deleted_at IS NULL
          AND 'push' = ANY(COALESCE(profile.notification_channels, ARRAY[]::text[]))
      )
    );

  RETURN QUERY
  WITH candidates AS (
    SELECT queued.id
    FROM public.client_push_deliveries AS queued
    WHERE (
        queued.status = 'pending'
        OR (
          queued.status = 'processing'
          AND queued.locked_at < now() - interval '5 minutes'
        )
      )
      AND queued.available_at <= now()
      AND queued.attempts < 5
    ORDER BY queued.available_at, queued.created_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(target_limit, 100), 1), 100)
  ),
  claimed AS (
    UPDATE public.client_push_deliveries AS queued
    SET status = 'processing',
        attempts = queued.attempts + 1,
        locked_at = now(),
        updated_at = now()
    FROM candidates
    WHERE queued.id = candidates.id
    RETURNING queued.*
  )
  SELECT
    claimed.id,
    device.expo_push_token,
    claimed.title,
    claimed.body,
    claimed.payload
  FROM claimed
  JOIN public.push_devices AS device ON device.id = claimed.push_device_id
  ORDER BY claimed.created_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_client_push_delivery(
  target_delivery_id uuid,
  target_success boolean,
  target_ticket_id text DEFAULT NULL,
  target_error_code text DEFAULT NULL,
  target_retryable boolean DEFAULT false
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_device_id uuid;
BEGIN
  UPDATE public.client_push_deliveries AS delivery
  SET
    status = CASE
      WHEN target_success THEN 'ticketed'
      WHEN target_retryable AND delivery.attempts < 5 THEN 'pending'
      ELSE 'failed'
    END,
    expo_ticket_id = CASE WHEN target_success THEN NULLIF(btrim(target_ticket_id), '') ELSE NULL END,
    ticketed_at = CASE WHEN target_success THEN now() ELSE NULL END,
    available_at = CASE
      WHEN NOT target_success AND target_retryable AND delivery.attempts < 5
        THEN now() + make_interval(mins => (2 ^ LEAST(delivery.attempts, 5))::integer)
      ELSE delivery.available_at
    END,
    locked_at = NULL,
    last_error_code = CASE WHEN target_success THEN NULL ELSE NULLIF(btrim(target_error_code), '') END,
    updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.status = 'processing'
  RETURNING delivery.push_device_id INTO target_device_id;

  IF target_device_id IS NULL THEN RETURN false; END IF;

  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices
    SET enabled = false,
        updated_at = now()
    WHERE id = target_device_id;
  END IF;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_client_push_receipts(target_limit integer DEFAULT 100)
RETURNS TABLE (
  delivery_id uuid,
  expo_ticket_id text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  UPDATE public.client_push_deliveries
  SET status = 'failed',
      last_error_code = 'receipt_expired',
      updated_at = now()
  WHERE status = 'ticketed'
    AND ticketed_at < now() - interval '24 hours';

  RETURN QUERY
  WITH candidates AS (
    SELECT delivery.id
    FROM public.client_push_deliveries AS delivery
    WHERE delivery.status = 'ticketed'
      AND delivery.ticketed_at <= now() - interval '15 minutes'
      AND (
        delivery.receipt_checked_at IS NULL
        OR delivery.receipt_checked_at <= now() - interval '15 minutes'
      )
    ORDER BY delivery.ticketed_at
    FOR UPDATE SKIP LOCKED
    LIMIT LEAST(GREATEST(COALESCE(target_limit, 100), 1), 100)
  ),
  claimed AS (
    UPDATE public.client_push_deliveries AS delivery
    SET receipt_checked_at = now(),
        updated_at = now()
    FROM candidates
    WHERE delivery.id = candidates.id
    RETURNING delivery.id, delivery.expo_ticket_id
  )
  SELECT claimed.id, claimed.expo_ticket_id
  FROM claimed
  WHERE claimed.expo_ticket_id IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_client_push_receipt(
  target_delivery_id uuid,
  target_success boolean,
  target_error_code text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_device_id uuid;
BEGIN
  UPDATE public.client_push_deliveries AS delivery
  SET status = CASE WHEN target_success THEN 'sent' ELSE 'failed' END,
      sent_at = CASE WHEN target_success THEN now() ELSE NULL END,
      last_error_code = CASE WHEN target_success THEN NULL ELSE NULLIF(btrim(target_error_code), '') END,
      updated_at = now()
  WHERE delivery.id = target_delivery_id
    AND delivery.status = 'ticketed'
  RETURNING delivery.push_device_id INTO target_device_id;

  IF target_device_id IS NULL THEN RETURN false; END IF;

  IF target_error_code = 'DeviceNotRegistered' THEN
    UPDATE public.push_devices
    SET enabled = false,
        updated_at = now()
    WHERE id = target_device_id;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.enqueue_client_appointment_push() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.queue_due_client_appointment_reminders(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_client_push_deliveries(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_push_delivery(uuid, boolean, text, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_client_push_receipts(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_client_push_receipt(uuid, boolean, text) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.queue_due_client_appointment_reminders(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_client_push_deliveries(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_push_delivery(uuid, boolean, text, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_client_push_receipts(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_client_push_receipt(uuid, boolean, text) TO service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
