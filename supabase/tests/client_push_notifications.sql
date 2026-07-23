-- Execute after 20260724010000_client_push_notifications.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
END $$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %', expected_fragment, SQLERRM;
  END IF;
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('87000000-0000-0000-0000-000000000001', 'push-client@example.test', '{"name":"Push Client"}'::jsonb, now(), now(), now()),
  ('87000000-0000-0000-0000-000000000002', 'push-professional@example.test', '{"name":"Push Professional"}'::jsonb, now(), now(), now());

UPDATE public.profiles
SET notification_channels = ARRAY['push']
WHERE id = '87000000-0000-0000-0000-000000000001';

INSERT INTO public.establishments (
  id, name, slug, timezone, account_status, opening_hours
)
VALUES (
  '87000000-0000-0000-0000-000000000010',
  'Estúdio Push',
  'estudio-push',
  'America/Sao_Paulo',
  'active',
  '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"}]'
);

INSERT INTO public.memberships (profile_id, establishment_id, role, status)
VALUES (
  '87000000-0000-0000-0000-000000000002',
  '87000000-0000-0000-0000-000000000010',
  'professional',
  'active'
);

INSERT INTO public.services (
  id, establishment_id, name, price, duration_minutes, is_active
)
VALUES (
  'push-service',
  '87000000-0000-0000-0000-000000000010',
  'Serviço Push',
  50,
  30,
  true
);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('87000000-0000-0000-0000-000000000001');
SELECT public.register_push_device(
  'client',
  'android',
  'ExpoPushToken[client-push-notification-test]'
);
RESET ROLE;

INSERT INTO public.appointments (
  id, establishment_id, client_id, client_name, professional_id, service_id,
  date_time, ends_at, duration_minutes, status, reschedule_count
)
VALUES (
  '87000000-0000-0000-0000-000000000100',
  '87000000-0000-0000-0000-000000000010',
  '87000000-0000-0000-0000-000000000001',
  'Push Client',
  '87000000-0000-0000-0000-000000000002',
  'push-service',
  date_trunc('minute', now() + interval '3 days'),
  date_trunc('minute', now() + interval '3 days 30 minutes'),
  30,
  'confirmed',
  0
);

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.client_push_deliveries
    WHERE appointment_id = '87000000-0000-0000-0000-000000000100'
      AND event_type = 'appointment_confirmed'
  ) <> 1 THEN
    RAISE EXCEPTION 'FAIL: confirmation notification was not queued once';
  END IF;
END $$;

UPDATE public.appointments
SET date_time = date_time + interval '1 day',
    ends_at = ends_at + interval '1 day',
    reschedule_count = 1
WHERE id = '87000000-0000-0000-0000-000000000100';

UPDATE public.appointments
SET status = 'cancelled',
    cancellation_reason = 'Outro',
    cancelled_by_role = 'client'
WHERE id = '87000000-0000-0000-0000-000000000100';

DO $$
BEGIN
  IF (
    SELECT count(*)
    FROM public.client_push_deliveries
    WHERE appointment_id = '87000000-0000-0000-0000-000000000100'
  ) <> 3 THEN
    RAISE EXCEPTION 'FAIL: expected confirmation, reschedule and cancellation notifications';
  END IF;
END $$;

INSERT INTO public.appointments (
  id, establishment_id, client_id, client_name, professional_id, service_id,
  date_time, ends_at, duration_minutes, status, reschedule_count
)
VALUES (
  '87000000-0000-0000-0000-000000000101',
  '87000000-0000-0000-0000-000000000010',
  '87000000-0000-0000-0000-000000000001',
  'Push Client',
  '87000000-0000-0000-0000-000000000002',
  'push-service',
  date_trunc('minute', now() + interval '23 hours 50 minutes'),
  date_trunc('minute', now() + interval '24 hours 20 minutes'),
  30,
  'confirmed',
  0
);

DO $$
DECLARE
  first_count integer;
  second_count integer;
BEGIN
  first_count := public.queue_due_client_appointment_reminders(now());
  second_count := public.queue_due_client_appointment_reminders(now());
  IF first_count <> 1 OR second_count <> 0 THEN
    RAISE EXCEPTION 'FAIL: reminder queue is not idempotent';
  END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('87000000-0000-0000-0000-000000000001');
SELECT pg_temp.expect_error(
  $$SELECT count(*) FROM public.client_push_deliveries$$,
  'permission denied'
);
RESET ROLE;

SET LOCAL ROLE service_role;
DO $$
DECLARE
  claimed record;
  completed boolean;
BEGIN
  SELECT * INTO claimed
  FROM public.claim_client_push_deliveries(1)
  LIMIT 1;

  IF claimed.delivery_id IS NULL OR claimed.expo_push_token = '' THEN
    RAISE EXCEPTION 'FAIL: service role did not claim a queued delivery';
  END IF;

  completed := public.complete_client_push_delivery(
    claimed.delivery_id,
    true,
    'expo-ticket-test',
    NULL,
    false
  );
  IF NOT completed THEN RAISE EXCEPTION 'FAIL: delivery ticket was not recorded'; END IF;
END $$;
RESET ROLE;

UPDATE public.client_push_deliveries
SET ticketed_at = now() - interval '16 minutes'
WHERE expo_ticket_id = 'expo-ticket-test';

SET LOCAL ROLE service_role;
DO $$
DECLARE
  claimed record;
BEGIN
  SELECT * INTO claimed
  FROM public.claim_client_push_receipts(1)
  LIMIT 1;
  IF claimed.expo_ticket_id <> 'expo-ticket-test' THEN
    RAISE EXCEPTION 'FAIL: Expo receipt was not claimed';
  END IF;

  IF NOT public.complete_client_push_receipt(claimed.delivery_id, true, NULL) THEN
    RAISE EXCEPTION 'FAIL: Expo receipt was not completed';
  END IF;
END $$;
RESET ROLE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.client_push_deliveries
    WHERE expo_ticket_id = 'expo-ticket-test'
      AND status = 'sent'
      AND sent_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: delivered notification was not finalized';
  END IF;
END $$;

ROLLBACK;
