\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claims', json_build_object('sub', actor_id, 'role', 'authenticated')::text, true);
END $$;

CREATE TEMP TABLE schedule_block_fixture (
  block_start timestamptz NOT NULL,
  block_end timestamptz NOT NULL,
  appointment_start timestamptz NOT NULL,
  appointment_end timestamptz NOT NULL
);

INSERT INTO schedule_block_fixture
SELECT
  date_trunc('day', now()) + interval '7 days 10 hours',
  date_trunc('day', now()) + interval '7 days 11 hours',
  date_trunc('day', now()) + interval '7 days 12 hours',
  date_trunc('day', now()) + interval '7 days 13 hours';

GRANT SELECT ON schedule_block_fixture TO authenticated;

INSERT INTO auth.users (id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at)
VALUES
  ('76000000-0000-0000-0000-000000000001', 'blocks-admin@example.test', '{"name":"Admin Blocks"}'::jsonb, now(), now(), now()),
  ('76000000-0000-0000-0000-000000000002', 'blocks-prof-one@example.test', '{"name":"Profissional One"}'::jsonb, now(), now(), now()),
  ('76000000-0000-0000-0000-000000000003', 'blocks-prof-two@example.test', '{"name":"Profissional Two"}'::jsonb, now(), now(), now()),
  ('76000000-0000-0000-0000-000000000004', 'blocks-client@example.test', '{"name":"Cliente Blocks"}'::jsonb, now(), now(), now());

INSERT INTO public.establishments (id, name, slug, timezone)
VALUES ('77000000-0000-0000-0000-000000000001', 'Schedule Blocks Tenant', 'schedule-blocks-tenant', 'America/Sao_Paulo');

INSERT INTO public.memberships (profile_id, establishment_id, role, created_by)
VALUES
  ('76000000-0000-0000-0000-000000000001', '77000000-0000-0000-0000-000000000001', 'admin', '76000000-0000-0000-0000-000000000001'),
  ('76000000-0000-0000-0000-000000000002', '77000000-0000-0000-0000-000000000001', 'professional', '76000000-0000-0000-0000-000000000001'),
  ('76000000-0000-0000-0000-000000000003', '77000000-0000-0000-0000-000000000001', 'professional', '76000000-0000-0000-0000-000000000001');

INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active)
VALUES ('schedule-block-service', '77000000-0000-0000-0000-000000000001', 'Serviço Blocks', 50, 60, true);

INSERT INTO public.appointments (
  establishment_id, client_id, client_name, professional_id, service_id,
  date_time, ends_at, duration_minutes, status
)
SELECT
  '77000000-0000-0000-0000-000000000001',
  '76000000-0000-0000-0000-000000000004',
  'Cliente Blocks',
  '76000000-0000-0000-0000-000000000002',
  'schedule-block-service',
  appointment_start,
  appointment_end,
  60,
  'confirmed'
FROM schedule_block_fixture;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('76000000-0000-0000-0000-000000000001');

DO $$
DECLARE
  created_block uuid;
  fixture schedule_block_fixture%ROWTYPE;
BEGIN
  SELECT * INTO fixture FROM schedule_block_fixture;
  created_block := public.create_schedule_block(
    '77000000-0000-0000-0000-000000000001',
    '76000000-0000-0000-0000-000000000002',
    fixture.block_start,
    fixture.block_end,
    'break',
    'Almoço'
  );
  IF created_block IS NULL THEN RAISE EXCEPTION 'FAIL: admin did not create schedule block'; END IF;

  BEGIN
    PERFORM public.create_schedule_block(
      '77000000-0000-0000-0000-000000000001',
      '76000000-0000-0000-0000-000000000002',
      fixture.block_start + interval '30 minutes',
      fixture.block_end + interval '30 minutes',
      'blocked',
      NULL
    );
    RAISE EXCEPTION 'FAIL: overlapping schedule block was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%schedule_block_overlap%' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.create_schedule_block(
      '77000000-0000-0000-0000-000000000001',
      '76000000-0000-0000-0000-000000000002',
      fixture.appointment_start + interval '15 minutes',
      fixture.appointment_end,
      'blocked',
      NULL
    );
    RAISE EXCEPTION 'FAIL: block conflicting with appointment was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%schedule_block_conflict%' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.set_actor('76000000-0000-0000-0000-000000000002');

DO $$
DECLARE
  visible_count integer;
  fixture schedule_block_fixture%ROWTYPE;
BEGIN
  SELECT * INTO fixture FROM schedule_block_fixture;
  SELECT count(*) INTO visible_count
  FROM public.get_schedule_blocks(
    '77000000-0000-0000-0000-000000000001',
    fixture.block_start - interval '1 hour',
    fixture.block_end + interval '1 hour',
    NULL
  );
  IF visible_count <> 1 THEN RAISE EXCEPTION 'FAIL: professional expected one visible block, got %', visible_count; END IF;

  BEGIN
    PERFORM public.create_schedule_block(
      '77000000-0000-0000-0000-000000000001',
      '76000000-0000-0000-0000-000000000003',
      fixture.block_start + interval '2 hours',
      fixture.block_end + interval '2 hours',
      'blocked',
      NULL
    );
    RAISE EXCEPTION 'FAIL: professional created a block for another professional';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN RAISE; END IF;
  END;
END $$;

SELECT pg_temp.set_actor('76000000-0000-0000-0000-000000000004');

DO $$
DECLARE
  fixture schedule_block_fixture%ROWTYPE;
BEGIN
  SELECT * INTO fixture FROM schedule_block_fixture;
  BEGIN
    PERFORM * FROM public.get_schedule_blocks(
      '77000000-0000-0000-0000-000000000001',
      fixture.block_start - interval '1 hour',
      fixture.block_end + interval '1 hour',
      NULL
    );
    RAISE EXCEPTION 'FAIL: client read operational schedule blocks';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%forbidden%' THEN RAISE; END IF;
  END;
END $$;

RESET ROLE;
ROLLBACK;
