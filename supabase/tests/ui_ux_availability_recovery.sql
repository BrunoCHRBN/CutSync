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
  ('75000000-0000-0000-0000-000000000001', 'ux-recovery-client@example.test', '{"name":"Cliente Recovery"}'::jsonb, now(), now(), now()),
  ('75000000-0000-0000-0000-000000000002', 'ux-recovery-prof@example.test', '{"name":"Profissional Recovery"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (
  id, name, slug, timezone, opening_hours, account_status
) VALUES (
  '75000000-0000-0000-0000-000000000010',
  'UX Recovery Tenant',
  'ux-recovery-tenant',
  'America/Sao_Paulo',
  '[{"day":0,"isOpen":false,"open":"09:00","close":"18:00"},{"day":1,"isOpen":true,"open":"09:00","close":"18:00"},{"day":2,"isOpen":true,"open":"09:00","close":"18:00"},{"day":3,"isOpen":true,"open":"09:00","close":"18:00"},{"day":4,"isOpen":true,"open":"09:00","close":"18:00"},{"day":5,"isOpen":true,"open":"09:00","close":"18:00"},{"day":6,"isOpen":false,"open":"09:00","close":"18:00"}]',
  'active'
);

UPDATE public.profiles
SET work_hours = '[{"day":0,"isOpen":false,"open":"09:00","close":"18:00"},{"day":1,"isOpen":true,"open":"10:00","close":"17:00"},{"day":2,"isOpen":true,"open":"10:00","close":"17:00"},{"day":3,"isOpen":true,"open":"10:00","close":"17:00"},{"day":4,"isOpen":true,"open":"10:00","close":"17:00"},{"day":5,"isOpen":true,"open":"10:00","close":"17:00"},{"day":6,"isOpen":false,"open":"09:00","close":"18:00"}]'
WHERE id = '75000000-0000-0000-0000-000000000002';

INSERT INTO public.memberships (profile_id, establishment_id, role, created_by)
VALUES (
  '75000000-0000-0000-0000-000000000002',
  '75000000-0000-0000-0000-000000000010',
  'professional',
  '75000000-0000-0000-0000-000000000002'
);

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
VALUES ('ux-recovery-service', '75000000-0000-0000-0000-000000000010', 'Corte', 70, 60, true);

INSERT INTO public.professional_services (
  establishment_id, professional_id, service_id, price, duration_minutes, is_active
) VALUES (
  '75000000-0000-0000-0000-000000000010',
  '75000000-0000-0000-0000-000000000002',
  'ux-recovery-service',
  70,
  60,
  true
);

DO $$
BEGIN
  IF has_function_privilege(
    'anon',
    'public.get_booking_availability_recovery(uuid,uuid[],text,date,text,integer)',
    'EXECUTE'
  ) THEN RAISE EXCEPTION 'FAIL: anon can execute recovery read model'; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('75000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  next_sunday date := ((now() AT TIME ZONE 'America/Sao_Paulo')::date
    + ((7 - extract(dow FROM now() AT TIME ZONE 'America/Sao_Paulo')::integer) % 7));
  first_recovery record;
BEGIN
  IF next_sunday = (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN
    next_sunday := next_sunday + 7;
  END IF;

  SELECT * INTO first_recovery
  FROM public.get_booking_availability_recovery(
    '75000000-0000-0000-0000-000000000010',
    ARRAY['75000000-0000-0000-0000-000000000002'::uuid],
    'ux-recovery-service',
    next_sunday,
    NULL,
    7
  )
  ORDER BY recovery_rank, starts_at
  LIMIT 1;

  IF first_recovery.local_date IS DISTINCT FROM next_sunday + 1 THEN
    RAISE EXCEPTION 'FAIL: expected recovery on Monday after closed Sunday, got %', first_recovery.local_date;
  END IF;
  IF first_recovery.local_time IS DISTINCT FROM '10:00' THEN
    RAISE EXCEPTION 'FAIL: expected first recovery at 10:00, got %', first_recovery.local_time;
  END IF;
END $$;

RESET ROLE;
ROLLBACK;
