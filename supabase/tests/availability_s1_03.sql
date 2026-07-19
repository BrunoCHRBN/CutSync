\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
END $$;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('73000000-0000-0000-0000-000000000001', 'availability-client@example.test', '{"name":"Cliente Availability"}'::jsonb, now(), now(), now()),
  ('73000000-0000-0000-0000-000000000002', 'availability-prof@example.test', '{"name":"Profissional Availability"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug, timezone, opening_hours)
VALUES (
  '74000000-0000-0000-0000-000000000001',
  'Availability Tenant',
  'availability-tenant',
  'America/Sao_Paulo',
  '[{"day":0,"isOpen":false,"open":"09:00","close":"18:00"},{"day":1,"isOpen":true,"open":"09:00","close":"18:00"},{"day":2,"isOpen":true,"open":"09:00","close":"18:00"},{"day":3,"isOpen":true,"open":"09:00","close":"18:00"},{"day":4,"isOpen":true,"open":"09:00","close":"18:00"},{"day":5,"isOpen":true,"open":"09:00","close":"18:00"},{"day":6,"isOpen":true,"open":"09:00","close":"14:00"}]'
);

UPDATE public.profiles SET work_hours = '[{"day":0,"isOpen":false,"open":"10:00","close":"17:00"},{"day":1,"isOpen":true,"open":"10:00","close":"17:00"},{"day":2,"isOpen":true,"open":"10:00","close":"17:00"},{"day":3,"isOpen":true,"open":"10:00","close":"17:00"},{"day":4,"isOpen":true,"open":"10:00","close":"17:00"},{"day":5,"isOpen":true,"open":"10:00","close":"17:00"},{"day":6,"isOpen":false,"open":"10:00","close":"13:00"}]'
WHERE id = '73000000-0000-0000-0000-000000000002';

INSERT INTO public.memberships (profile_id, establishment_id, role, created_by)
VALUES ('73000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000001', 'professional', '73000000-0000-0000-0000-000000000002');

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
VALUES ('availability-service', '74000000-0000-0000-0000-000000000001', 'Serviço Availability', 70, 60, true);

INSERT INTO public.professional_services (establishment_id, professional_id, service_id, price, duration_minutes, is_active)
VALUES ('74000000-0000-0000-0000-000000000001', '73000000-0000-0000-0000-000000000002', 'availability-service', 85, 90, true);

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('73000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  next_monday date := ((now() AT TIME ZONE 'America/Sao_Paulo')::date + ((8 - extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer) % 7));
  first_slot record;
BEGIN
  IF next_monday = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN next_monday := next_monday + 7; END IF;

  SELECT * INTO first_slot
  FROM public.get_available_slots(
    '74000000-0000-0000-0000-000000000001',
    '73000000-0000-0000-0000-000000000002',
    'availability-service',
    next_monday,
    NULL
  )
  WHERE available = true
  ORDER BY starts_at
  LIMIT 1;

  IF first_slot.local_time IS DISTINCT FROM '10:00' THEN
    RAISE EXCEPTION 'FAIL: expected intersection to start at 10:00, got %', first_slot.local_time;
  END IF;
  IF first_slot.duration_minutes IS DISTINCT FROM 90 THEN
    RAISE EXCEPTION 'FAIL: expected custom duration 90, got %', first_slot.duration_minutes;
  END IF;
END $$;

RESET ROLE;
ROLLBACK;