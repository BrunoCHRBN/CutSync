-- Execute after 20260806000000_android_business_operational_cycle.sql.
-- All fixtures and mutations are rolled back.
\set ON_ERROR_STOP on

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(
  statement text,
  expected_fragment text
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF expected_fragment = '42501' AND SQLSTATE <> '42501' THEN
    RAISE EXCEPTION 'FAIL: expected SQLSTATE 42501, got % (%)', SQLSTATE, SQLERRM;
  ELSIF expected_fragment <> '42501'
    AND position(expected_fragment IN SQLERRM) = 0
  THEN
    RAISE EXCEPTION 'FAIL: expected %, got %', expected_fragment, SQLERRM;
  END IF;
END;
$$;

SET LOCAL ROLE anon;

DO $release_policy$
DECLARE
  payload jsonb;
BEGIN
  SELECT to_jsonb(policy.*) INTO payload
  FROM public.get_mobile_release_policy('business', 'android', '0.0.1') AS policy;

  IF payload IS NULL
    OR payload->>'minimum_supported_version' <> '0.1.0'
    OR payload->>'latest_version' <> '0.1.0'
    OR COALESCE((payload->>'enforcement_enabled')::boolean, true)
    OR COALESCE((payload->>'update_required')::boolean, true)
  THEN RAISE EXCEPTION 'anonymous release policy is missing, invalid or unexpectedly enforced'; END IF;
END;
$release_policy$;

RESET ROLE;

DO $immutable_history$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname IN (
      'appointment_events_appointment_id_fkey',
      'appointment_events_establishment_id_fkey',
      'establishment_client_merge_events_establishment_id_fkey'
    )
      AND confdeltype <> 'r'
  ) OR (
    SELECT count(*)
    FROM pg_constraint
    WHERE conname IN (
      'appointment_events_appointment_id_fkey',
      'appointment_events_establishment_id_fkey',
      'establishment_client_merge_events_establishment_id_fkey'
    )
  ) <> 3 THEN
    RAISE EXCEPTION 'immutable operational history must use restrictive parent deletes';
  END IF;
END;
$immutable_history$;

INSERT INTO auth.users (
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES
  (
    '96000000-0000-0000-0000-000000000001',
    'android-cycle-admin@example.test',
    '{"name":"Android Cycle Admin"}'::jsonb,
    now(), now(), now()
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    'android-cycle-professional@example.test',
    '{"name":"Android Cycle Professional"}'::jsonb,
    now(), now(), now()
  ),
  (
    '96000000-0000-0000-0000-000000000003',
    'android-cycle-client@example.test',
    '{"name":"Android Cycle Client"}'::jsonb,
    now(), now(), now()
  ),
  (
    '96000000-0000-0000-0000-000000000004',
    'android-cycle-rejected@example.test',
    '{"name":"Same Display Name"}'::jsonb,
    now(), now(), now()
  ),
  (
    '96000000-0000-0000-0000-000000000005',
    'android-cycle-invitee@example.test',
    '{"name":"Android Cycle Invitee"}'::jsonb,
    now(), now(), now()
  ),
  (
    '96000000-0000-0000-0000-000000000006',
    'android-cycle-no-push-admin@example.test',
    '{"name":"Android Cycle No Push Admin"}'::jsonb,
    now(), now(), now()
  );

INSERT INTO public.establishments (
  id, name, slug, account_status, timezone, share_agendas, opening_hours
)
VALUES
  (
    '96100000-0000-0000-0000-000000000001',
    'Android Cycle Unit',
    'android-cycle-unit',
    'active',
    'America/Sao_Paulo',
    true,
    '[{"day":0,"isOpen":true,"open":"08:00","close":"20:00"},{"day":1,"isOpen":true,"open":"08:00","close":"20:00"},{"day":2,"isOpen":true,"open":"08:00","close":"20:00"},{"day":3,"isOpen":true,"open":"08:00","close":"20:00"},{"day":4,"isOpen":true,"open":"08:00","close":"20:00"},{"day":5,"isOpen":true,"open":"08:00","close":"20:00"},{"day":6,"isOpen":true,"open":"08:00","close":"20:00"}]'
  ),
  (
    '96100000-0000-0000-0000-000000000002',
    'Android Cycle Isolated Unit',
    'android-cycle-isolated-unit',
    'active',
    'America/Manaus',
    false,
    NULL
  );

INSERT INTO public.profiles (
  id, establishment_id, name, email, role, notification_channels
)
VALUES
  (
    '96000000-0000-0000-0000-000000000001',
    '96100000-0000-0000-0000-000000000001',
    'Android Cycle Admin',
    'android-cycle-admin@example.test',
    'admin',
    ARRAY['push']::text[]
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    '96100000-0000-0000-0000-000000000001',
    'Android Cycle Professional',
    'android-cycle-professional@example.test',
    'professional',
    ARRAY['push']::text[]
  ),
  (
    '96000000-0000-0000-0000-000000000003',
    NULL,
    'Android Cycle Client',
    'android-cycle-client@example.test',
    'client',
    ARRAY['push']::text[]
  ),
  (
    '96000000-0000-0000-0000-000000000004',
    NULL,
    'Same Display Name',
    'android-cycle-rejected@example.test',
    'client',
    ARRAY['push']::text[]
  ),
  (
    '96000000-0000-0000-0000-000000000005',
    NULL,
    'Android Cycle Invitee',
    'android-cycle-invitee@example.test',
    'client',
    ARRAY['push']::text[]
  ),
  (
    '96000000-0000-0000-0000-000000000006',
    '96100000-0000-0000-0000-000000000001',
    'Android Cycle No Push Admin',
    'android-cycle-no-push-admin@example.test',
    'admin',
    ARRAY['email']::text[]
  )
ON CONFLICT (id) DO UPDATE
SET establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    notification_channels = EXCLUDED.notification_channels,
    deleted_at = NULL,
    updated_at = now();

INSERT INTO public.memberships (
  id, profile_id, establishment_id, role, status, commission_rate, created_by
)
VALUES
  (
    '96200000-0000-0000-0000-000000000001',
    '96000000-0000-0000-0000-000000000001',
    '96100000-0000-0000-0000-000000000001',
    'admin', 'active', 0.50,
    '96000000-0000-0000-0000-000000000001'
  ),
  (
    '96200000-0000-0000-0000-000000000002',
    '96000000-0000-0000-0000-000000000002',
    '96100000-0000-0000-0000-000000000001',
    'professional', 'active', 0.40,
    '96000000-0000-0000-0000-000000000001'
  ),
  (
    '96200000-0000-0000-0000-000000000003',
    '96000000-0000-0000-0000-000000000006',
    '96100000-0000-0000-0000-000000000001',
    'admin', 'active', 0.50,
    '96000000-0000-0000-0000-000000000001'
  );

INSERT INTO public.services (
  id, establishment_id, name, price, duration_minutes, is_active, sort_order
)
VALUES (
  'android-cycle-service',
  '96100000-0000-0000-0000-000000000001',
  'Android Cycle Service',
  50,
  30,
  true,
  10
);

INSERT INTO public.professional_services (
  establishment_id, professional_id, service_id, price, duration_minutes, is_active
)
VALUES (
  '96100000-0000-0000-0000-000000000001',
  '96000000-0000-0000-0000-000000000002',
  'android-cycle-service',
  45,
  45,
  true
);

INSERT INTO public.push_devices (
  profile_id, app_kind, platform, expo_push_token, enabled
)
VALUES
  (
    '96000000-0000-0000-0000-000000000001',
    'business', 'android',
    'ExpoPushToken[android-cycle-admin-device]', true
  ),
  (
    '96000000-0000-0000-0000-000000000002',
    'business', 'android',
    'ExpoPushToken[android-cycle-professional-device]', true
  ),
  (
    '96000000-0000-0000-0000-000000000003',
    'client', 'android',
    'ExpoPushToken[android-cycle-client-device]', true
  ),
  (
    '96000000-0000-0000-0000-000000000004',
    'client', 'android',
    'ExpoPushToken[android-cycle-rejected-device]', true
  ),
  (
    '96000000-0000-0000-0000-000000000004',
    'business', 'android',
    'ExpoPushToken[android-cycle-rejected-business-device]', true
  ),
  (
    '96000000-0000-0000-0000-000000000005',
    'business', 'android',
    'ExpoPushToken[android-cycle-invitee-device]', true
  ),
  (
    '96000000-0000-0000-0000-000000000006',
    'business', 'android',
    'ExpoPushToken[android-cycle-no-push-admin-device]', false
  );

DO $test$
<<android_cycle>>
DECLARE
  admin_id constant uuid := '96000000-0000-0000-0000-000000000001';
  professional_id constant uuid := '96000000-0000-0000-0000-000000000002';
  client_profile_id constant uuid := '96000000-0000-0000-0000-000000000003';
  rejected_profile_id constant uuid := '96000000-0000-0000-0000-000000000004';
  invitee_id constant uuid := '96000000-0000-0000-0000-000000000005';
  no_push_admin_id constant uuid := '96000000-0000-0000-0000-000000000006';
  establishment_id constant uuid := '96100000-0000-0000-0000-000000000001';
  isolated_establishment_id constant uuid := '96100000-0000-0000-0000-000000000002';
  professional_membership_id constant uuid := '96200000-0000-0000-0000-000000000002';
  client_id uuid;
  rejected_client_id uuid;
  name_only_client_id uuid;
  created_duplicate_client_id uuid;
  link_id uuid;
  rejected_link_id uuid;
  created_invitation_id uuid;
  invitation_token text;
  previous_invitation_token text;
  block_id uuid;
  service_id text;
  first_result jsonb;
  replay_result jsonb;
  payload jsonb;
  context_record record;
  conflict_start timestamptz;
  created_appointment_id text;
  quick_appointment_id text;
  appointment_start timestamptz;
  appointment_rescheduled_start timestamptz;
  local_block_date date := current_date + 10;
BEGIN
  PERFORM pg_temp.set_actor(admin_id);

  SELECT to_jsonb(policy.*) INTO payload
  FROM public.get_mobile_release_policy('business', 'android', '0.0.1') AS policy;
  IF payload->>'minimum_supported_version' <> '0.1.0'
    OR payload->>'latest_version' <> '0.1.0'
    OR COALESCE((payload->>'enforcement_enabled')::boolean, true)
    OR COALESCE((payload->>'update_required')::boolean, true)
  THEN RAISE EXCEPTION 'release policy unexpectedly enforced an update'; END IF;

  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = android_cycle.establishment_id;
  IF context_record.access_mode <> 'full'
    OR NOT ('view_services' = ANY(context_record.capabilities))
    OR NOT ('manage_services' = ANY(context_record.capabilities))
    OR NOT ('view_clients' = ANY(context_record.capabilities))
    OR NOT ('manage_clients' = ANY(context_record.capabilities))
  THEN RAISE EXCEPTION 'full operational context did not expose expected capabilities'; END IF;

  payload := public.get_business_services(establishment_id);
  IF jsonb_array_length(payload) <> 1
    OR payload #>> '{0,id}' <> 'android-cycle-service'
  THEN RAISE EXCEPTION 'full context could not read the typed service RPC'; END IF;

  first_result := public.create_establishment_client(
    establishment_id,
    'Android Cycle Client',
    '96300000-0000-0000-0000-000000000001',
    NULL,
    'android-cycle-client@example.test',
    ARRAY['vip', 'retorno'],
    'Internal fixture note'
  );
  replay_result := public.create_establishment_client(
    establishment_id,
    'Android Cycle Client',
    '96300000-0000-0000-0000-000000000001',
    NULL,
    'android-cycle-client@example.test',
    ARRAY['retorno', 'vip', 'vip'],
    'Internal fixture note'
  );
  IF first_result IS DISTINCT FROM replay_result THEN
    RAISE EXCEPTION 'normalized idempotent client create returned a different response';
  END IF;
  client_id := (first_result->>'establishmentClientId')::uuid;
  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'business.client.created'
      AND audit.metadata = jsonb_build_object('establishment_client_id', client_id)
  ) <> 1 THEN
    RAISE EXCEPTION 'client create audit was missing or duplicated on replay';
  END IF;

  IF (
    SELECT count(*) FROM public.establishment_client_links
    WHERE establishment_client_id = client_id
      AND profile_id = client_profile_id
      AND status = 'pending'
      AND match_kind = 'confirmed_email'
  ) <> 1 THEN RAISE EXCEPTION 'verified contact did not create one pending link'; END IF;

  payload := public.search_establishment_clients(establishment_id, 'Android', 50, 0);
  IF jsonb_array_length(payload) <> 1
    OR NOT (payload->0 ? 'createdAt')
    OR NOT (payload->0 ? 'lastAppointmentAt')
    OR (payload->0)->'lastAppointmentAt' <> 'null'::jsonb
  THEN RAISE EXCEPTION 'CRM search contract is incomplete: %', payload; END IF;

  first_result := public.create_establishment_client(
    establishment_id,
    'Same Display Name',
    '96300000-0000-0000-0000-000000000002'
  );
  name_only_client_id := (first_result->>'establishmentClientId')::uuid;
  IF EXISTS (
    SELECT 1 FROM public.establishment_client_links
    WHERE establishment_client_id = name_only_client_id
  ) THEN RAISE EXCEPTION 'a name-only CRM record was auto-linked'; END IF;

  first_result := public.create_establishment_client(
    establishment_id,
    'Rejected Link Fixture',
    '96300000-0000-0000-0000-000000000003',
    NULL,
    'android-cycle-rejected@example.test'
  );
  rejected_client_id := (first_result->>'establishmentClientId')::uuid;
  SELECT id INTO rejected_link_id
  FROM public.establishment_client_links
  WHERE establishment_client_id = rejected_client_id;

  PERFORM pg_temp.set_actor(client_profile_id);
  payload := public.get_my_establishment_client_link_requests();
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS item
    WHERE item->>'status' = 'pending'
      AND (item->>'establishmentClientId')::uuid = client_id
  ) THEN RAISE EXCEPTION 'client did not receive pending association'; END IF;
  SELECT id INTO link_id FROM public.establishment_client_links
  WHERE establishment_client_id = client_id;
  first_result := public.confirm_establishment_client_link(
    link_id, '96300000-0000-0000-0000-000000000004'
  );
  replay_result := public.confirm_establishment_client_link(
    link_id, '96300000-0000-0000-0000-000000000004'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result->>'status' <> 'confirmed'
  THEN RAISE EXCEPTION 'link confirmation was not idempotent'; END IF;
  IF (
    SELECT count(*)
    FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = client_profile_id
      AND audit.target_profile_id = client_profile_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'client.establishment_client_link.confirmed'
      AND audit.metadata = jsonb_build_object(
        'link_id', link_id,
        'establishment_client_id', client_id
      )
  ) <> 1 THEN
    RAISE EXCEPTION 'link confirmation audit was missing, unsafe or duplicated';
  END IF;
  payload := public.get_my_establishment_client_link_requests();
  IF NOT EXISTS (
    SELECT 1 FROM jsonb_array_elements(payload) AS item
    WHERE item->>'status' = 'confirmed'
  ) THEN RAISE EXCEPTION 'confirmed establishment association is missing'; END IF;

  PERFORM pg_temp.set_actor(rejected_profile_id);
  PERFORM public.reject_establishment_client_link(
    rejected_link_id, '96300000-0000-0000-0000-000000000005'
  );
  IF (
    SELECT count(*)
    FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = rejected_profile_id
      AND audit.target_profile_id = rejected_profile_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'client.establishment_client_link.rejected'
      AND audit.metadata = jsonb_build_object(
        'link_id', rejected_link_id,
        'establishment_client_id', rejected_client_id
      )
  ) <> 1 THEN
    RAISE EXCEPTION 'link rejection audit was missing or unsafe';
  END IF;
  PERFORM pg_temp.set_actor(admin_id);
  PERFORM public.update_establishment_client(
    establishment_id,
    rejected_client_id,
    '96300000-0000-0000-0000-000000000006',
    'Rejected Link Fixture Updated',
    NULL,
    'android-cycle-rejected@example.test'
  );
  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'business.client.updated'
      AND audit.metadata = jsonb_build_object('establishment_client_id', rejected_client_id)
  ) <> 1 THEN
    RAISE EXCEPTION 'client update audit was missing';
  END IF;
  IF (
    SELECT status FROM public.establishment_client_links
    WHERE id = rejected_link_id
  ) <> 'rejected' THEN
    RAISE EXCEPTION 'rejected contact match was presented again';
  END IF;

  PERFORM pg_temp.set_actor(professional_id);
  PERFORM pg_temp.expect_error(
    format('SELECT public.search_establishment_clients(%L, NULL, 50, 0)', establishment_id),
    'forbidden'
  );
  PERFORM pg_temp.set_actor(admin_id);
  PERFORM pg_temp.expect_error(
    format('SELECT public.get_establishment_client(%L, %L)', isolated_establishment_id, client_id),
    'forbidden'
  );

  INSERT INTO public.appointments (
    id, establishment_id, client_id, client_name, establishment_client_id,
    business_notes, professional_id, service_id,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    'android-cycle-team-detail', establishment_id, client_profile_id,
    'Android Cycle Client', client_id, 'Sensitive team-only note',
    admin_id, 'android-cycle-service', now() + interval '6 days', 30,
    now() + interval '6 days 30 minutes', 'pending'
  );
  PERFORM pg_temp.set_actor(professional_id);
  payload := public.get_business_appointment_detail(
    establishment_id, 'android-cycle-team-detail'
  );
  IF payload #>> '{client,displayName}' <> 'Cliente'
    OR payload->'client' ? 'profileId'
    OR payload->'client' ? 'establishmentClientId'
    OR payload->'notes' IS DISTINCT FROM 'null'::jsonb
    OR jsonb_array_length(payload->'allowedActions') <> 0
    OR jsonb_array_length(payload->'history') <> 1
    OR payload #> '{history,0,actorId}' IS DISTINCT FROM 'null'::jsonb
    OR payload #> '{history,0,metadata}' IS DISTINCT FROM '{}'::jsonb
    OR payload::text LIKE '%Sensitive team-only note%'
    OR payload::text LIKE '%' || client_profile_id::text || '%'
  THEN
    RAISE EXCEPTION 'shared team agenda leaked protected appointment detail: %', payload;
  END IF;
  PERFORM pg_temp.set_actor(admin_id);

  INSERT INTO public.appointments (
    id, establishment_id, client_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  ) VALUES (
    'android-cycle-cancel', establishment_id, client_profile_id,
    'Android Cycle Client', client_id, professional_id,
    'android-cycle-service', now() + interval '2 days', 30,
    now() + interval '2 days 30 minutes', 'pending'
  );
  first_result := public.cancel_business_appointment(
    establishment_id,
    'android-cycle-cancel',
    '96300000-0000-0000-0000-000000000010',
    'Fixture cancellation note'
  );
  replay_result := public.cancel_business_appointment(
    establishment_id,
    'android-cycle-cancel',
    '96300000-0000-0000-0000-000000000010',
    'Fixture cancellation note'
  );
  IF first_result IS DISTINCT FROM replay_result THEN
    RAISE EXCEPTION 'lost-response retry changed cancellation result';
  END IF;
  IF (
    SELECT count(*) FROM public.appointment_events
    WHERE appointment_id = 'android-cycle-cancel' AND event_type = 'cancelled'
  ) <> 1 THEN RAISE EXCEPTION 'retry duplicated appointment event'; END IF;
  IF (
    SELECT count(*) FROM public.command_receipts
    WHERE request_id = '96300000-0000-0000-0000-000000000010'
      AND response_payload::text NOT LIKE '%Fixture cancellation note%'
  ) <> 1 THEN RAISE EXCEPTION 'receipt missing or retained a sensitive note'; END IF;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.cancel_business_appointment(%L,%L,%L,%L)',
      establishment_id,
      'android-cycle-cancel',
      '96300000-0000-0000-0000-000000000010',
      'Different payload'
    ),
    'idempotency_conflict'
  );

  INSERT INTO public.appointments (
    id, establishment_id, client_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  ) VALUES (
    'android-cycle-no-show', establishment_id, client_profile_id,
    'Android Cycle Client', client_id, professional_id,
    'android-cycle-service', now() - interval '1 hour', 30,
    now() - interval '30 minutes', 'confirmed'
  );
  payload := public.get_business_appointment_detail(
    establishment_id, 'android-cycle-no-show'
  );
  IF payload->'allowedActions' ? 'reschedule'
    OR NOT (payload->'allowedActions' @> '["complete","cancel","no_show"]'::jsonb)
  THEN
    RAISE EXCEPTION 'started appointment exposed an invalid reschedule action: %', payload;
  END IF;
  first_result := public.mark_business_appointment_no_show(
    establishment_id,
    'android-cycle-no-show',
    '96300000-0000-0000-0000-000000000011'
  );
  replay_result := public.mark_business_appointment_no_show(
    establishment_id,
    'android-cycle-no-show',
    '96300000-0000-0000-0000-000000000011'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result->>'status' <> 'no_show'
  THEN RAISE EXCEPTION 'no-show command was not idempotent'; END IF;
  IF (
    SELECT count(*) FROM public.appointment_events
    WHERE appointment_id = 'android-cycle-no-show' AND event_type = 'no_show'
  ) <> 1 OR (
    SELECT count(*) FROM public.client_push_deliveries
    WHERE appointment_id = 'android-cycle-no-show'
      AND event_type = 'appointment_no_show'
  ) <> 1 THEN RAISE EXCEPTION 'no-show event/push was not emitted once'; END IF;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.cancel_business_appointment(%L,%L,%L,NULL)',
      establishment_id,
      'android-cycle-no-show',
      '96300000-0000-0000-0000-000000000012'
    ),
    'invalid_status_transition'
  );

  INSERT INTO public.appointments (
    id, establishment_id, client_id, client_name, establishment_client_id,
    professional_id, service_id, date_time, duration_minutes, ends_at, status
  ) VALUES (
    'android-cycle-future-complete', establishment_id, client_profile_id,
    'Android Cycle Client', client_id, professional_id,
    'android-cycle-service', now() + interval '4 days', 45,
    now() + interval '4 days 45 minutes', 'confirmed'
  );
  payload := public.get_business_appointment_detail(
    establishment_id, 'android-cycle-future-complete'
  );
  IF NOT (payload->'allowedActions' ? 'reschedule')
    OR payload->'allowedActions' ? 'no_show'
  THEN
    RAISE EXCEPTION 'future appointment action contract is invalid: %', payload;
  END IF;
  first_result := public.complete_business_appointment(
    establishment_id,
    'android-cycle-future-complete',
    '96300000-0000-0000-0000-000000000013'
  );
  IF first_result->>'status' <> 'completed' THEN
    RAISE EXCEPTION 'completed transition incorrectly required the appointment start';
  END IF;
  payload := public.get_business_appointment_detail(
    establishment_id, 'android-cycle-no-show'
  );
  IF payload->>'status' <> 'no_show'
    OR jsonb_array_length(payload->'allowedActions') <> 0
    OR NOT (payload->'history'->0 ? 'eventType')
  THEN RAISE EXCEPTION 'appointment detail terminal contract failed'; END IF;

  payload := public.get_admin_report_v2(
    establishment_id,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1,
    NULL,
    NULL,
    'no_show'
  );
  IF COALESCE((payload #>> '{summary,no_show_count}')::integer, 0) <> 1
    OR COALESCE((payload #>> '{summary,production_realized}')::numeric, -1) <> 0
    OR COALESCE((payload #>> '{summary,scheduled_value}')::numeric, -1) <> 0
  THEN RAISE EXCEPTION 'no-show leaked into production or scheduled value: %', payload; END IF;

  payload := public.get_admin_report_details(
    establishment_id,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date - 1,
    (now() AT TIME ZONE 'America/Sao_Paulo')::date + 1,
    'appointments',
    NULL,
    NULL,
    'no_show',
    NULL,
    NULL,
    NULL,
    NULL,
    25
  );
  IF jsonb_array_length(payload->'items') <> 1
    OR payload #>> '{items,0,status}' <> 'no_show'
    OR COALESCE((payload #>> '{items,0,production_value}')::numeric, -1) <> 0
  THEN RAISE EXCEPTION 'no-show detail was represented as production: %', payload; END IF;

  first_result := public.create_business_schedule_block(
    establishment_id,
    professional_id,
    NULL,
    NULL,
    'time_off',
    '96300000-0000-0000-0000-000000000020',
    'All-day fixture',
    true,
    local_block_date
  );
  block_id := (first_result->>'scheduleBlockId')::uuid;
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_blocks AS block
    WHERE block.id = block_id
      AND block.is_all_day
      AND block.local_date = local_block_date
      AND block.starts_at = local_block_date::timestamp AT TIME ZONE 'America/Sao_Paulo'
      AND block.ends_at = (local_block_date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo'
  ) THEN RAISE EXCEPTION 'all-day block timezone conversion failed'; END IF;
  first_result := public.update_business_schedule_block(
    establishment_id,
    block_id,
    NULL,
    NULL,
    'time_off',
    '96300000-0000-0000-0000-000000000022',
    'Updated all-day fixture',
    true,
    local_block_date + 1
  );
  replay_result := public.update_business_schedule_block(
    establishment_id,
    block_id,
    NULL,
    NULL,
    'time_off',
    '96300000-0000-0000-0000-000000000022',
    'Updated all-day fixture',
    true,
    local_block_date + 1
  );
  IF first_result IS DISTINCT FROM replay_result
    OR NOT EXISTS (
      SELECT 1 FROM public.schedule_blocks
      WHERE id = block_id AND local_date = local_block_date + 1
    )
  THEN RAISE EXCEPTION 'schedule block update retry failed'; END IF;
  PERFORM public.delete_business_schedule_block(
    establishment_id,
    block_id,
    '96300000-0000-0000-0000-000000000023'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.schedule_blocks
    WHERE id = block_id AND deleted_at IS NOT NULL
  ) THEN RAISE EXCEPTION 'schedule block was not soft-deleted'; END IF;

  conflict_start := (current_date + 12 + time '10:00')
    AT TIME ZONE 'America/Sao_Paulo';
  INSERT INTO public.appointments (
    id, establishment_id, client_name, professional_id, service_id,
    date_time, duration_minutes, ends_at, status
  ) VALUES (
    'android-cycle-block-conflict', establishment_id, 'Conflict Fixture',
    professional_id, 'android-cycle-service', conflict_start, 30,
    conflict_start + interval '30 minutes', 'confirmed'
  );
  first_result := public.create_business_schedule_block(
    establishment_id,
    professional_id,
    conflict_start + interval '5 minutes',
    conflict_start + interval '20 minutes',
    'blocked',
    '96300000-0000-0000-0000-000000000021'
  );
  replay_result := public.create_business_schedule_block(
    establishment_id,
    professional_id,
    conflict_start + interval '5 minutes',
    conflict_start + interval '20 minutes',
    'blocked',
    '96300000-0000-0000-0000-000000000021'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result <> jsonb_build_object(
      'errorCode', 'schedule_block_conflict',
      'appointmentId', 'android-cycle-block-conflict',
      'professionalId', professional_id
    )
    OR (
      SELECT count(*) FROM public.command_receipts
      WHERE request_id = '96300000-0000-0000-0000-000000000021'
        AND response_payload = first_result
    ) <> 1
    OR (
      SELECT count(DISTINCT delivery.event_key)
      FROM public.business_push_deliveries AS delivery
      WHERE delivery.event_key = 'schedule-block-conflict:96300000-0000-0000-0000-000000000021'
        AND delivery.event_type = 'operational_conflict'
    ) <> 1
    OR (
      SELECT count(*) FROM public.business_push_deliveries AS delivery
      WHERE delivery.event_key = 'schedule-block-conflict:96300000-0000-0000-0000-000000000021'
    ) <> 2
  THEN RAISE EXCEPTION 'schedule block conflict receipt/push retry contract failed'; END IF;
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_business_schedule_block(%L,%L,%L,%L,%L,%L,NULL,false,NULL)',
      establishment_id, professional_id,
      conflict_start + interval '5 minutes',
      conflict_start + interval '25 minutes',
      'blocked',
      '96300000-0000-0000-0000-000000000021'
    ),
    'idempotency_conflict'
  );

  block_id := '96500000-0000-0000-0000-000000000001';
  INSERT INTO public.schedule_blocks (
    id, establishment_id, professional_id, starts_at, ends_at, kind, created_by
  ) VALUES (
    block_id, establishment_id, professional_id,
    (current_date + 13 + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
    (current_date + 13 + time '09:30') AT TIME ZONE 'America/Sao_Paulo',
    'blocked', admin_id
  );
  first_result := public.update_business_schedule_block(
    establishment_id,
    block_id,
    conflict_start + interval '5 minutes',
    conflict_start + interval '20 minutes',
    'blocked',
    '96300000-0000-0000-0000-000000000027'
  );
  replay_result := public.update_business_schedule_block(
    establishment_id,
    block_id,
    conflict_start + interval '5 minutes',
    conflict_start + interval '20 minutes',
    'blocked',
    '96300000-0000-0000-0000-000000000027'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result <> jsonb_build_object(
      'errorCode', 'schedule_block_conflict',
      'appointmentId', 'android-cycle-block-conflict',
      'scheduleBlockId', block_id,
      'professionalId', professional_id
    )
    OR EXISTS (
      SELECT 1 FROM public.schedule_blocks AS block
      WHERE block.id = block_id
        AND block.starts_at = conflict_start + interval '5 minutes'
    )
    OR (
      SELECT count(*) FROM public.business_push_deliveries AS delivery
      WHERE delivery.event_key = 'schedule-block-conflict:96300000-0000-0000-0000-000000000027'
    ) <> 2
  THEN RAISE EXCEPTION 'schedule block update conflict mutated state or duplicated push'; END IF;

  first_result := public.create_business_appointment(
    establishment_id,
    professional_id,
    'android-cycle-service',
    conflict_start,
    '96300000-0000-0000-0000-000000000028',
    client_id
  );
  replay_result := public.create_business_appointment(
    establishment_id,
    professional_id,
    'android-cycle-service',
    conflict_start,
    '96300000-0000-0000-0000-000000000028',
    client_id
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result <> jsonb_build_object(
      'errorCode', 'appointment_conflict',
      'professionalId', professional_id
    )
    OR (
      SELECT count(*) FROM public.command_receipts
      WHERE request_id = '96300000-0000-0000-0000-000000000028'
        AND response_payload = first_result
    ) <> 1
    OR (
      SELECT count(*) FROM public.business_push_deliveries AS delivery
      WHERE delivery.event_key = 'appointment-conflict:96300000-0000-0000-0000-000000000028'
        AND delivery.event_type = 'operational_conflict'
    ) <> 2
  THEN RAISE EXCEPTION 'appointment create conflict receipt/push retry contract failed'; END IF;

  appointment_start := (current_date + 15 + time '11:00')
    AT TIME ZONE 'America/Sao_Paulo';
  appointment_rescheduled_start := (current_date + 15 + time '11:30')
    AT TIME ZONE 'America/Sao_Paulo';
  first_result := public.create_business_appointment(
    establishment_id,
    professional_id,
    'android-cycle-service',
    appointment_start,
    '96300000-0000-0000-0000-000000000024',
    client_id,
    NULL,
    NULL,
    NULL,
    'Appointment-only note'
  );
  replay_result := public.create_business_appointment(
    establishment_id,
    professional_id,
    'android-cycle-service',
    appointment_start,
    '96300000-0000-0000-0000-000000000024',
    client_id,
    NULL,
    NULL,
    NULL,
    'Appointment-only note'
  );
  IF first_result IS DISTINCT FROM replay_result THEN
    RAISE EXCEPTION 'walk-in create retry was not idempotent';
  END IF;
  created_appointment_id := first_result->>'appointmentId';
  SELECT jsonb_build_object(
    'notes', appointment.business_notes,
    'durationMinutes', appointment.duration_minutes,
    'startsAt', appointment.date_time,
    'endsAt', appointment.ends_at
  ) INTO payload
  FROM public.appointments AS appointment
  WHERE appointment.id = created_appointment_id;
  IF payload->>'notes' <> 'Appointment-only note'
    OR (payload->>'durationMinutes')::integer <> 45
    OR (payload->>'endsAt')::timestamptz <> appointment_start + interval '45 minutes'
  THEN RAISE EXCEPTION 'walk-in did not preserve appointment note or professional duration: %', payload; END IF;
  payload := public.get_business_appointment_detail(
    establishment_id, created_appointment_id
  );
  IF payload->>'notes' <> 'Appointment-only note'
    OR (payload->'client'->>'notes') <> 'Internal fixture note'
    OR EXISTS (
      SELECT 1 FROM public.command_receipts AS receipt
      WHERE receipt.request_id = '96300000-0000-0000-0000-000000000024'
        AND receipt.response_payload::text LIKE '%Appointment-only note%'
    )
    OR EXISTS (
      SELECT 1 FROM public.appointment_events AS event
      WHERE event.appointment_id = created_appointment_id
        AND event.metadata::text LIKE '%Appointment-only note%'
    )
    OR EXISTS (
      SELECT 1 FROM public.business_push_deliveries AS delivery
      WHERE delivery.appointment_id = created_appointment_id
        AND delivery.payload::text LIKE '%Appointment-only note%'
    )
  THEN RAISE EXCEPTION 'appointment-note privacy contract failed'; END IF;
  first_result := public.reschedule_business_appointment(
    establishment_id,
    created_appointment_id,
    appointment_rescheduled_start,
    professional_id,
    'android-cycle-service',
    '96300000-0000-0000-0000-000000000025'
  );
  replay_result := public.reschedule_business_appointment(
    establishment_id,
    created_appointment_id,
    appointment_rescheduled_start,
    professional_id,
    'android-cycle-service',
    '96300000-0000-0000-0000-000000000025'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR (first_result->>'startsAt')::timestamptz <> appointment_rescheduled_start
    OR (first_result->>'endsAt')::timestamptz
      <> appointment_rescheduled_start + interval '45 minutes'
    OR NOT EXISTS (
      SELECT 1 FROM public.appointments AS appointment
      WHERE appointment.id = created_appointment_id
        AND appointment.duration_minutes = 45
        AND appointment.ends_at = appointment_rescheduled_start + interval '45 minutes'
    )
    OR (
      SELECT count(*) FROM public.appointment_events
      WHERE appointment_id = created_appointment_id AND event_type = 'rescheduled'
    ) <> 1
  THEN RAISE EXCEPTION 'reschedule retry/event contract failed'; END IF;

  first_result := public.reschedule_business_appointment(
    establishment_id,
    created_appointment_id,
    conflict_start,
    professional_id,
    'android-cycle-service',
    '96300000-0000-0000-0000-000000000029'
  );
  replay_result := public.reschedule_business_appointment(
    establishment_id,
    created_appointment_id,
    conflict_start,
    professional_id,
    'android-cycle-service',
    '96300000-0000-0000-0000-000000000029'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result <> jsonb_build_object(
      'errorCode', 'appointment_conflict',
      'appointmentId', created_appointment_id,
      'professionalId', professional_id
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.appointments AS appointment
      WHERE appointment.id = created_appointment_id
        AND appointment.date_time = appointment_rescheduled_start
    )
    OR (
      SELECT count(*) FROM public.command_receipts
      WHERE request_id = '96300000-0000-0000-0000-000000000029'
        AND response_payload = first_result
    ) <> 1
    OR (
      SELECT count(*) FROM public.business_push_deliveries AS delivery
      WHERE delivery.event_key = 'appointment-conflict:96300000-0000-0000-0000-000000000029'
        AND delivery.event_type = 'operational_conflict'
    ) <> 2
  THEN RAISE EXCEPTION 'appointment reschedule conflict mutated state or duplicated push'; END IF;

  first_result := public.create_business_appointment(
    establishment_id,
    professional_id,
    'android-cycle-service',
    appointment_start + interval '90 minutes',
    '96300000-0000-0000-0000-000000000026',
    NULL,
    'Quick Client Fixture',
    NULL,
    NULL,
    'Quick appointment note'
  );
  quick_appointment_id := first_result->>'appointmentId';
  IF NOT EXISTS (
    SELECT 1
    FROM public.appointments AS appointment
    JOIN public.establishment_clients AS establishment_client
      ON establishment_client.id = appointment.establishment_client_id
    WHERE appointment.id = quick_appointment_id
      AND appointment.business_notes = 'Quick appointment note'
      AND establishment_client.notes IS NULL
  ) THEN RAISE EXCEPTION 'quick-create appointment note leaked into CRM notes'; END IF;

  first_result := public.create_business_service(
    establishment_id,
    'Android Cycle Service Two',
    75,
    45,
    '96300000-0000-0000-0000-000000000030',
    20
  );
  replay_result := public.create_business_service(
    establishment_id,
    'Android Cycle Service Two',
    75,
    45,
    '96300000-0000-0000-0000-000000000030',
    20
  );
  IF first_result IS DISTINCT FROM replay_result THEN
    RAISE EXCEPTION 'service create retry was not idempotent';
  END IF;
  service_id := first_result->>'serviceId';
  PERFORM public.update_business_service(
    establishment_id, service_id,
    '96300000-0000-0000-0000-000000000032',
    'Android Cycle Service Two Updated', 80, 50, 30
  );
  PERFORM public.set_business_service_status(
    establishment_id, service_id, false,
    '96300000-0000-0000-0000-000000000033'
  );
  PERFORM public.set_business_service_status(
    establishment_id, service_id, true,
    '96300000-0000-0000-0000-000000000034'
  );
  PERFORM public.reorder_business_services(
    establishment_id,
    ARRAY[service_id, 'android-cycle-service']::text[],
    '96300000-0000-0000-0000-000000000035'
  );
  PERFORM public.upsert_business_professional_service(
    establishment_id, professional_id, service_id,
    70, 40, true,
    '96300000-0000-0000-0000-000000000031'
  );
  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'business.service.status_changed'
      AND audit.metadata->>'service_id' = service_id
  ) <> 2 OR (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'business.service.reordered'
      AND audit.metadata = jsonb_build_object('service_count', 2)
  ) <> 1 OR (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.target_profile_id = professional_id
      AND audit.action = 'business.professional_service.upserted'
      AND audit.metadata = jsonb_build_object('service_id', service_id, 'is_active', true)
  ) <> 1 THEN
    RAISE EXCEPTION 'service command audit coverage is incomplete';
  END IF;

  first_result := public.suspend_business_team_member(
    establishment_id,
    professional_membership_id,
    '96300000-0000-0000-0000-000000000040'
  );
  replay_result := public.suspend_business_team_member(
    establishment_id,
    professional_membership_id,
    '96300000-0000-0000-0000-000000000040'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR (SELECT status FROM public.memberships WHERE id = professional_membership_id) <> 'suspended'
  THEN RAISE EXCEPTION 'team suspension retry failed'; END IF;
  PERFORM public.reactivate_business_team_member(
    establishment_id,
    professional_membership_id,
    '96300000-0000-0000-0000-000000000041'
  );
  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.target_profile_id = professional_id
      AND audit.action = 'business.membership.suspended'
      AND audit.metadata = jsonb_build_object('membership_id', professional_membership_id)
  ) <> 1 OR (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.target_profile_id = professional_id
      AND audit.action = 'business.membership.reactivated'
      AND audit.metadata = jsonb_build_object('membership_id', professional_membership_id)
  ) <> 1 THEN
    RAISE EXCEPTION 'membership suspension/reactivation audit was missing or duplicated';
  END IF;
  PERFORM public.update_business_team_commission(
    establishment_id,
    professional_membership_id,
    0.45,
    '96300000-0000-0000-0000-000000000042'
  );

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_business_team_invite(%L,%L,%L,%L)',
      establishment_id,
      'android-cycle-admin@example.test',
      'professional',
      '96300000-0000-0000-0000-000000000049'
    ),
    'forbidden'
  );

  first_result := public.create_business_team_invite(
    establishment_id,
    'android-cycle-invitee@example.test',
    'professional',
    '96300000-0000-0000-0000-000000000043'
  );
  replay_result := public.create_business_team_invite(
    establishment_id,
    'android-cycle-invitee@example.test',
    'professional',
    '96300000-0000-0000-0000-000000000043'
  );
  created_invitation_id := (first_result->>'invitationId')::uuid;
  invitation_token := first_result->>'invitationToken';
  IF first_result IS DISTINCT FROM replay_result
    OR invitation_token !~ '^[0-9a-f]{64}$'
    OR EXISTS (
      SELECT 1 FROM public.command_receipts
      WHERE request_id = '96300000-0000-0000-0000-000000000043'
        AND response_payload ? 'invitationToken'
    )
  THEN RAISE EXCEPTION 'team invite token was not safely idempotent'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.business_push_deliveries AS delivery
    WHERE delivery.invitation_id = created_invitation_id
      AND delivery.event_type = 'invitation_created'
      AND delivery.payload->>'invitationId' = created_invitation_id::text
      AND NOT delivery.payload ? 'url'
  ) THEN RAISE EXCEPTION 'identifier-only invitation push is missing'; END IF;
  PERFORM pg_temp.set_actor(invitee_id);
  SELECT to_jsonb(invitation.*) INTO payload
  FROM public.inspect_business_invitation_token(invitation_token) AS invitation;
  IF payload->>'establishment_name' <> 'Android Cycle Unit'
    OR payload->>'invitation_status' <> 'pending'
  THEN RAISE EXCEPTION 'token invitation inspection failed'; END IF;
  payload := public.get_my_business_team_invitation(created_invitation_id);
  IF payload->>'establishmentName' <> 'Android Cycle Unit'
    OR payload->>'status' <> 'pending'
  THEN RAISE EXCEPTION 'invitation detail validation failed'; END IF;
  SELECT to_jsonb(acceptance.*) INTO first_result
  FROM public.accept_business_invitation_token(
    invitation_token,
    '96300000-0000-0000-0000-000000000044'
  ) AS acceptance;
  SELECT to_jsonb(acceptance.*) INTO replay_result
  FROM public.accept_business_invitation_token(
    invitation_token,
    '96300000-0000-0000-0000-000000000044'
  ) AS acceptance;
  IF first_result IS DISTINCT FROM replay_result
    OR first_result->>'accepted_establishment_id' <> establishment_id::text
  THEN RAISE EXCEPTION 'token invitation acceptance was not idempotent'; END IF;
  PERFORM pg_temp.set_actor(admin_id);
  PERFORM public.remove_business_team_member(
    establishment_id,
    (
      SELECT membership.id FROM public.memberships AS membership
      WHERE membership.profile_id = invitee_id
        AND membership.establishment_id = android_cycle.establishment_id
    ),
    '96300000-0000-0000-0000-000000000045'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = invitee_id AND deleted_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.profile_id = invitee_id
      AND membership.establishment_id = android_cycle.establishment_id
      AND membership.status = 'revoked'
  ) THEN RAISE EXCEPTION 'team removal deleted identity or kept access'; END IF;

  UPDATE public.profiles
  SET notification_channels = ARRAY[]::text[]
  WHERE id = rejected_profile_id;
  first_result := public.create_business_team_invite(
    establishment_id,
    'android-cycle-rejected@example.test',
    'professional',
    '96300000-0000-0000-0000-000000000046'
  );
  created_invitation_id := (first_result->>'invitationId')::uuid;
  previous_invitation_token := first_result->>'invitationToken';
  IF NOT EXISTS (
    SELECT 1
    FROM public.business_push_deliveries AS delivery
    WHERE delivery.invitation_id = created_invitation_id
      AND delivery.profile_id = rejected_profile_id
  ) THEN
    RAISE EXCEPTION 'enabled Business device was blocked by Client profile channels';
  END IF;
  UPDATE public.push_devices AS device
  SET enabled = false,
      updated_at = now()
  WHERE device.profile_id = rejected_profile_id
    AND device.app_kind = 'business';
  first_result := public.resend_business_team_invite(
    establishment_id, created_invitation_id,
    '96300000-0000-0000-0000-000000000047'
  );
  replay_result := public.resend_business_team_invite(
    establishment_id, created_invitation_id,
    '96300000-0000-0000-0000-000000000047'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR first_result->>'invitationToken' = previous_invitation_token
    OR (first_result->>'invitationToken') !~ '^[0-9a-f]{64}$'
    OR EXISTS (
      SELECT 1 FROM public.command_receipts
      WHERE request_id = '96300000-0000-0000-0000-000000000047'
        AND response_payload ? 'invitationToken'
    )
  THEN
    RAISE EXCEPTION 'invitation resend retry failed';
  END IF;
  IF (
    SELECT count(*)
    FROM public.business_push_deliveries AS delivery
    WHERE delivery.invitation_id = created_invitation_id
      AND delivery.profile_id = rejected_profile_id
  ) <> 1 THEN
    RAISE EXCEPTION 'disabled Business device received an invitation resend';
  END IF;
  PERFORM public.revoke_business_team_invite(
    establishment_id, created_invitation_id,
    '96300000-0000-0000-0000-000000000048'
  );
  IF (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'business.invitation.resent'
      AND audit.metadata = jsonb_build_object('invitation_id', created_invitation_id)
  ) <> 1 OR (
    SELECT count(*) FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.establishment_id = android_cycle.establishment_id
      AND audit.action = 'business.invitation.revoked'
      AND audit.metadata = jsonb_build_object('invitation_id', created_invitation_id)
  ) <> 1 THEN
    RAISE EXCEPTION 'invitation resend/revoke audit was missing or duplicated';
  END IF;

  PERFORM pg_temp.set_actor(admin_id);
  first_result := public.create_establishment_client(
    establishment_id,
    'Duplicate Fixture',
    '96300000-0000-0000-0000-000000000050'
  );
  created_duplicate_client_id := (first_result->>'establishmentClientId')::uuid;
  first_result := public.merge_establishment_clients(
    establishment_id,
    client_id,
    created_duplicate_client_id,
    '96300000-0000-0000-0000-000000000051',
    'Explicit test merge'
  );
  replay_result := public.merge_establishment_clients(
    establishment_id,
    client_id,
    created_duplicate_client_id,
    '96300000-0000-0000-0000-000000000051',
    'Explicit test merge'
  );
  IF first_result IS DISTINCT FROM replay_result
    OR (SELECT status FROM public.establishment_clients WHERE id = created_duplicate_client_id) <> 'merged'
    OR (
      SELECT count(*) FROM public.establishment_client_merge_events AS merge_event
      WHERE merge_event.duplicate_client_id = created_duplicate_client_id
    ) <> 1
  THEN RAISE EXCEPTION 'explicit CRM merge was not atomic/idempotent'; END IF;

  IF EXISTS (
    SELECT 1
    FROM public.authorization_audit_log AS audit
    WHERE audit.actor_id = admin_id
      AND audit.action = ANY(ARRAY[
        'business.client.created',
        'business.client.updated',
        'business.service.status_changed',
        'business.service.reordered',
        'business.professional_service.upserted',
        'business.invitation.resent',
        'business.invitation.revoked',
        'business.membership.suspended',
        'business.membership.reactivated'
      ])
      AND audit.metadata ?| ARRAY[
        'name', 'phone', 'email', 'contact', 'notes', 'price',
        'token', 'token_hash', 'invitation_token'
      ]
  ) THEN
    RAISE EXCEPTION 'mobile command audit metadata contains sensitive fields';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.command_receipts AS receipt
    WHERE receipt.actor_id = admin_id
      AND receipt.command_type = ANY(ARRAY[
        'client.created',
        'client.updated',
        'service.status_changed',
        'service.reordered',
        'professional_service.upserted',
        'team_invite.resent',
        'team_invite.revoked',
        'membership.suspended',
        'membership.active'
      ])
      AND receipt.response_payload ?| ARRAY[
        'name', 'phone', 'email', 'contact', 'notes', 'price',
        'token', 'token_hash', 'invitationToken'
      ]
  ) THEN
    RAISE EXCEPTION 'mobile command receipt contains sensitive response fields';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.business_push_deliveries AS delivery
    WHERE delivery.profile_id = no_push_admin_id
  ) THEN
    RAISE EXCEPTION 'business appointment/conflict push ignored disabled device opt-out';
  END IF;

  -- Exercise the public RPCs against access modes resolved from real billing
  -- state. This intentionally does not call the capability resolver directly.
  UPDATE public.billing_accounts AS account
  SET trial_started_at = now() - interval '15 days',
      trial_ends_at = now() - interval '1 day',
      transition_ends_at = NULL,
      courtesy_ends_at = NULL
  WHERE account.establishment_id = android_cycle.establishment_id;

  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = android_cycle.establishment_id;
  IF context_record.access_mode <> 'read_only'
    OR NOT ('view_services' = ANY(context_record.capabilities))
    OR 'manage_services' = ANY(context_record.capabilities)
    OR 'view_clients' = ANY(context_record.capabilities)
    OR 'manage_clients' = ANY(context_record.capabilities)
  THEN RAISE EXCEPTION 'real read-only context was not resolved fail-closed'; END IF;

  payload := public.get_business_services(establishment_id);
  IF jsonb_array_length(payload) = 0 THEN
    RAISE EXCEPTION 'read-only context could not read services';
  END IF;
  payload := public.get_business_appointment_detail(
    establishment_id, 'android-cycle-team-detail'
  );
  IF payload->>'appointmentId' <> 'android-cycle-team-detail'
    OR jsonb_array_length(payload->'allowedActions') <> 0
  THEN RAISE EXCEPTION 'read-only appointment detail exposed a mutation'; END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.confirm_business_appointment(%L,%L,%L)',
      establishment_id,
      'android-cycle-team-detail',
      '96300000-0000-0000-0000-000000000090'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_business_service(%L,%L,10,30,%L,NULL)',
      establishment_id,
      'Read-only forbidden service',
      '96300000-0000-0000-0000-000000000091'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_establishment_client(%L,%L,%L)',
      establishment_id,
      'Read-only forbidden client',
      '96300000-0000-0000-0000-000000000092'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_business_schedule_block(%L,%L,NULL,NULL,%L,%L,NULL,true,current_date + 20)',
      establishment_id,
      professional_id,
      'time_off',
      '96300000-0000-0000-0000-000000000093'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.search_establishment_clients(%L,NULL,50,0)',
      establishment_id
    ),
    'forbidden'
  );
  IF EXISTS (
    SELECT 1 FROM public.command_receipts
    WHERE request_id IN (
      '96300000-0000-0000-0000-000000000090',
      '96300000-0000-0000-0000-000000000091',
      '96300000-0000-0000-0000-000000000092',
      '96300000-0000-0000-0000-000000000093'
    )
  ) THEN RAISE EXCEPTION 'read-only denied command retained a receipt'; END IF;

  PERFORM set_config(
    'cutsync.governance_status_reason',
    'Android operational blocked RPC validation',
    true
  );
  -- The access-mode transition is an administrative fixture operation. Clear
  -- the simulated mobile actor so the legacy billing write guard does not
  -- reject the establishment status change merely because it is read-only.
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('role', 'service_role', 'aal', 'aal2')::text,
    true
  );
  UPDATE public.establishments AS establishment
  SET account_status = 'blocked'
  WHERE establishment.id = android_cycle.establishment_id;
  PERFORM pg_temp.set_actor(admin_id);

  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = android_cycle.establishment_id;
  IF context_record.access_mode <> 'blocked'
    OR cardinality(context_record.capabilities) <> 0
  THEN RAISE EXCEPTION 'real blocked context retained operational capabilities'; END IF;

  PERFORM pg_temp.expect_error(
    format('SELECT public.get_business_services(%L)', establishment_id),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.get_business_appointment_detail(%L,%L)',
      establishment_id,
      'android-cycle-team-detail'
    ),
    'forbidden'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT * FROM public.get_business_agenda_day(%L,current_date,%L)',
      establishment_id,
      'team'
    ),
    'business_access_blocked'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_business_service(%L,%L,10,30,%L,NULL)',
      establishment_id,
      'Blocked forbidden service',
      '96300000-0000-0000-0000-000000000094'
    ),
    'forbidden'
  );
  IF EXISTS (
    SELECT 1 FROM public.command_receipts
    WHERE request_id = '96300000-0000-0000-0000-000000000094'
  ) THEN RAISE EXCEPTION 'blocked denied command retained a receipt'; END IF;
END;
$test$;

-- Direct mobile table access remains closed even for a valid operational actor.
SELECT pg_temp.set_actor('96000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;

SELECT pg_temp.expect_error(
  'SELECT count(*) FROM public.command_receipts',
  '42501'
);
SELECT pg_temp.expect_error(
  'SELECT count(*) FROM public.establishment_clients',
  '42501'
);
SELECT pg_temp.expect_error(
  'SELECT count(*) FROM public.appointment_events',
  '42501'
);
SELECT pg_temp.expect_error(
  'SELECT count(*) FROM public.business_push_deliveries',
  '42501'
);

RESET ROLE;

-- The queue worker surface is service-role-only and can claim one of the
-- identifier-only notifications emitted above.
SET LOCAL ROLE service_role;
DO $worker$
DECLARE
  claimed record;
  receipt record;
BEGIN
  SELECT * INTO claimed
  FROM public.claim_business_push_deliveries(1)
  LIMIT 1;
  IF claimed.delivery_id IS NULL
    OR claimed.expo_push_token IS NULL
    OR claimed.notification_payload ? 'clientName'
    OR claimed.notification_payload ? 'phone'
    OR claimed.notification_payload ? 'email'
    OR claimed.notification_payload ? 'notes'
    OR claimed.notification_payload ? 'url'
  THEN RAISE EXCEPTION 'business push claim leaked data or returned no row'; END IF;

  IF NOT public.complete_business_push_delivery(
    claimed.delivery_id,
    true,
    'android-cycle-expo-ticket',
    NULL,
    false
  ) THEN RAISE EXCEPTION 'business push ticket completion failed'; END IF;
  UPDATE public.business_push_deliveries
  SET ticketed_at = now() - interval '16 minutes'
  WHERE id = claimed.delivery_id;
  SELECT * INTO receipt
  FROM public.claim_business_push_receipts(1)
  WHERE delivery_id = claimed.delivery_id;
  IF receipt.delivery_id IS NULL
    OR receipt.expo_ticket_id <> 'android-cycle-expo-ticket'
  THEN RAISE EXCEPTION 'business push receipt was not claimable'; END IF;
  IF NOT public.complete_business_push_receipt(
    receipt.delivery_id, true, NULL
  ) THEN RAISE EXCEPTION 'business push receipt completion failed'; END IF;
END;
$worker$;
RESET ROLE;

ROLLBACK;
