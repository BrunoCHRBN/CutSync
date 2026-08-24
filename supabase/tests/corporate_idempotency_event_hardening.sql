-- Execute after 20260824190722_control_access_idempotency_and_event_hardening.sql.
-- Synthetic identities, access requests and privilege changes are rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid, actor_aal text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', actor_id,
      'role', 'authenticated',
      'aal', actor_aal
    )::text,
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
EXCEPTION
  WHEN OTHERS THEN
    IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN
      RAISE;
    END IF;
    IF position(expected_fragment IN SQLERRM) = 0 THEN
      RAISE EXCEPTION
        'FAIL: expected error containing %, got %',
        expected_fragment,
        SQLERRM;
    END IF;
END;
$$;

DO $$
DECLARE
  privilege_name text;
  trigger_definition text;
  expected_version_constraint text;
  expected_version_unique_constraint text;
BEGIN
  FOREACH privilege_name IN ARRAY ARRAY[
    'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'
  ]
  LOOP
    IF has_table_privilege(
      'service_role',
      'public.corporate_case_events',
      privilege_name
    ) THEN
      RAISE EXCEPTION
        'FAIL: service_role retained % on corporate_case_events',
        privilege_name;
    END IF;
  END LOOP;

  SELECT pg_get_triggerdef(trigger.oid)
  INTO trigger_definition
  FROM pg_catalog.pg_trigger AS trigger
  WHERE trigger.tgrelid = 'public.corporate_case_events'::regclass
    AND trigger.tgname = 'corporate_case_events_truncate_immutable'
    AND trigger.tgenabled = 'O'
    AND NOT trigger.tgisinternal;

  IF trigger_definition IS NULL
     OR position('BEFORE TRUNCATE' IN upper(trigger_definition)) = 0
  THEN
    RAISE EXCEPTION 'FAIL: enabled BEFORE TRUNCATE event trigger is missing';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_attribute AS attribute
    WHERE attribute.attrelid =
      'public.control_access_request_approvals'::pg_catalog.regclass
      AND attribute.attname = 'expected_request_version'
      AND attribute.attnotnull
      AND NOT attribute.attisdropped
  ) THEN
    RAISE EXCEPTION 'FAIL: persisted expected request version is not NOT NULL';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO expected_version_constraint
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
    'public.control_access_request_approvals'::pg_catalog.regclass
    AND constraint_row.conname =
      'control_access_request_approvals_expected_version_check';

  IF expected_version_constraint IS NULL
     OR position('expected_request_version > 0' IN expected_version_constraint) = 0
  THEN
    RAISE EXCEPTION 'FAIL: positive expected request version constraint is missing';
  END IF;

  SELECT pg_catalog.pg_get_constraintdef(constraint_row.oid)
  INTO expected_version_unique_constraint
  FROM pg_catalog.pg_constraint AS constraint_row
  WHERE constraint_row.conrelid =
    'public.control_access_request_approvals'::pg_catalog.regclass
    AND constraint_row.conname =
      'control_access_request_approvals_request_expected_version_key'
    AND constraint_row.contype = 'u';

  IF expected_version_unique_constraint IS NULL
     OR position(
       'UNIQUE (request_id, expected_request_version)'
       IN expected_version_unique_constraint
     ) = 0
  THEN
    RAISE EXCEPTION 'FAIL: request expected version uniqueness is missing';
  END IF;
END;
$$;

-- Prove the trigger fails closed even if a future migration restores a direct
-- service-role table grant.
GRANT ALL PRIVILEGES ON TABLE public.corporate_case_events TO service_role;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error(
  'TRUNCATE TABLE public.corporate_case_events CASCADE',
  'corporate_case_events_are_immutable'
);
RESET ROLE;
REVOKE ALL PRIVILEGES ON TABLE public.corporate_case_events FROM service_role;

INSERT INTO auth.users(
  id, email, raw_user_meta_data, email_confirmed_at, created_at, updated_at
)
VALUES
  (
    'da000000-0000-4000-8000-000000000001',
    'idempotency-requester@example.test',
    '{"name":"Idempotency Requester"}'::jsonb,
    now(), now(), now()
  ),
  (
    'da000000-0000-4000-8000-000000000002',
    'idempotency-approver@example.test',
    '{"name":"Idempotency Approver"}'::jsonb,
    now(), now(), now()
  ),
  (
    'da000000-0000-4000-8000-000000000003',
    'idempotency-target@example.test',
    '{"name":"Idempotency Target"}'::jsonb,
    now(), now(), now()
  );

SELECT set_config(
  'cutsync.governance_access_reason',
  'Fixture transacional do hardening de idempotência',
  true
);

INSERT INTO public.governance_users(profile_id, role, granted_by)
VALUES
  (
    'da000000-0000-4000-8000-000000000001',
    'SaaS_Owner',
    'da000000-0000-4000-8000-000000000001'
  ),
  (
    'da000000-0000-4000-8000-000000000002',
    'SaaS_Owner',
    'da000000-0000-4000-8000-000000000001'
  );

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('da000000-0000-4000-8000-000000000001', 'aal2');

DO $$
DECLARE
  request_key constant uuid := 'da100000-0000-4000-8000-000000000001';
  target_id constant uuid := 'da000000-0000-4000-8000-000000000003';
  valid_until timestamptz := now() + interval '30 days';
  justification constant text :=
    'Acesso financeiro solicitado para validar o fingerprint idempotente completo.';
  ticket_reference constant text := 'SEC-IDEMP-001';
  created jsonb;
  repeated jsonb;
  request_id uuid;
BEGIN
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_control_access_request(%L,%L,NULL,NULL,%L,%L,%L,%L)',
      target_id, 'finance_analyst', valid_until,
      justification, ticket_reference, gen_random_uuid()
    ),
    'invalid_access_action'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_corporate_access_case(%L,%L,NULL,NULL,%L,%L,ARRAY[]::uuid[],%L)',
      target_id, 'finance_analyst', valid_until,
      'Acesso financeiro solicitado para validar ação corporativa nula.',
      gen_random_uuid()
    ),
    'invalid_corporate_access_action'
  );

  created := public.create_control_access_request(
    target_id,
    'finance_analyst',
    'grant',
    NULL,
    valid_until,
    justification,
    ticket_reference,
    request_key
  );
  request_id := (created->>'request_id')::uuid;

  repeated := public.create_control_access_request(
    target_id,
    'finance_analyst',
    'grant',
    NULL,
    valid_until,
    justification,
    ticket_reference,
    request_key
  );

  IF (repeated->>'request_id')::uuid IS DISTINCT FROM request_id THEN
    RAISE EXCEPTION 'FAIL: exact Control replay did not reuse the request';
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_control_access_request(%L,%L,%L,NULL,%L,%L,%L,%L)',
      target_id, 'commercial_analyst', 'grant', valid_until,
      justification, ticket_reference, request_key
    ),
    'idempotency_conflict'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_control_access_request(%L,%L,%L,%L,%L,%L,%L,%L)',
      target_id, 'finance_analyst', 'grant', 'support_assistant', valid_until,
      justification, ticket_reference, request_key
    ),
    'idempotency_conflict'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_control_access_request(%L,%L,%L,NULL,%L,%L,%L,%L)',
      target_id, 'finance_analyst', 'grant', valid_until + interval '1 day',
      justification, ticket_reference, request_key
    ),
    'idempotency_conflict'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_control_access_request(%L,%L,%L,NULL,%L,%L,%L,%L)',
      target_id, 'finance_analyst', 'grant', valid_until,
      'Justificativa diferente para a mesma chave de criação Control.',
      ticket_reference, request_key
    ),
    'idempotency_conflict'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.create_control_access_request(%L,%L,%L,NULL,%L,%L,%L,%L)',
      target_id, 'finance_analyst', 'grant', valid_until,
      justification, 'SEC-IDEMP-CHANGED', request_key
    ),
    'idempotency_conflict'
  );

  PERFORM set_config('cutsync.test_access_request_id', request_id::text, true);
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.control_access_requests
      WHERE client_request_id = 'da100000-0000-4000-8000-000000000001') <> 1
  THEN
    RAISE EXCEPTION 'FAIL: exact Control replay created more than one request';
  END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.set_actor('da000000-0000-4000-8000-000000000002', 'aal2');

DO $$
DECLARE
  request_id uuid := current_setting('cutsync.test_access_request_id')::uuid;
  decision_key constant uuid := 'da200000-0000-4000-8000-000000000001';
  reason constant text :=
    'Aprovação concedida após revisão independente do escopo solicitado.';
  first_decision jsonb;
  repeated_decision jsonb;
BEGIN
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.decide_control_access_request(%L,NULL,%L,%L,%L)',
      request_id, 'approve', reason, gen_random_uuid()
    ),
    'invalid_access_decision'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.decide_control_access_request(%L,0,%L,%L,%L)',
      request_id, 'approve', reason, gen_random_uuid()
    ),
    'invalid_access_decision'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.decide_control_access_request(%L,1,NULL,%L,%L)',
      request_id, reason, gen_random_uuid()
    ),
    'invalid_access_decision'
  );

  first_decision := public.decide_control_access_request(
    request_id, 1, 'approve', reason, decision_key
  );
  repeated_decision := public.decide_control_access_request(
    request_id, 1, 'approve', reason, decision_key
  );

  IF repeated_decision->>'status' IS DISTINCT FROM first_decision->>'status' THEN
    RAISE EXCEPTION 'FAIL: exact decision replay was not idempotent';
  END IF;

  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.decide_control_access_request(%L,1,%L,%L,%L)',
      request_id,
      'approve',
      'Motivo alterado não pode reutilizar a chave idempotente da decisão.',
      decision_key
    ),
    'idempotency_conflict'
  );
  PERFORM pg_temp.expect_error(
    format(
      'SELECT public.decide_control_access_request(%L,2,%L,%L,%L)',
      request_id, 'approve', reason, decision_key
    ),
    'idempotency_conflict'
  );
END;
$$;

RESET ROLE;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.control_access_request_approvals
      WHERE client_request_id = 'da200000-0000-4000-8000-000000000001') <> 1
  THEN
    RAISE EXCEPTION 'FAIL: exact decision replay created more than one approval';
  END IF;
  IF (SELECT expected_request_version
      FROM public.control_access_request_approvals
      WHERE client_request_id = 'da200000-0000-4000-8000-000000000001') <> 1
  THEN
    RAISE EXCEPTION 'FAIL: decision did not persist its expected request version';
  END IF;
END;
$$;

ROLLBACK;
