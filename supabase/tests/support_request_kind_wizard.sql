-- Execute after 20260803000000_support_request_kind_wizard.sql.
-- All fixtures and mutations are rolled back.

BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.expect_error(statement text, expected_fragment text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE statement;
  RAISE EXCEPTION 'FAIL: statement unexpectedly succeeded: %', statement;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL: statement unexpectedly succeeded:%' THEN RAISE; END IF;
  IF position(expected_fragment IN SQLERRM) = 0 THEN
    RAISE EXCEPTION 'FAIL: expected error containing %, got %',
      expected_fragment,
      SQLERRM;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.support_tickets
    WHERE request_kind IS NULL
  ) THEN
    RAISE EXCEPTION 'FAIL: request_kind backfill left null rows';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'create_support_ticket_internal'
  ) OR NOT EXISTS (
    SELECT 1
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
      AND proname = 'create_support_ticket_internal_v2'
  ) THEN
    RAISE EXCEPTION 'FAIL: old and v2 RPCs must coexist';
  END IF;
END $$;

SET LOCAL ROLE anon;
SELECT pg_temp.expect_error(
  $sql$SELECT public.create_support_ticket_internal_v2(
    '8d000000-0000-4000-8000-000000000001',
    'question',
    'other',
    'low',
    'Assunto de teste',
    'Mensagem de teste suficientemente longa.',
    NULL,
    '8d100000-0000-4000-8000-000000000002'
  )$sql$,
  'permission denied'
);
RESET ROLE;

INSERT INTO auth.users (
  id,
  email,
  raw_user_meta_data,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES (
  '8d000000-0000-4000-8000-000000000001',
  'support-request-kind@example.test',
  '{"name":"Support Request Kind"}'::jsonb,
  now(),
  now(),
  now()
)
ON CONFLICT (id) DO NOTHING;

UPDATE public.support_runtime_settings
SET enabled = true,
    allow_new_tickets = true,
    sync_enabled = true
WHERE id;

DO $$
DECLARE
  question_result jsonb;
  repeated_result jsonb;
  incident_result jsonb;
BEGIN
  question_result := public.create_support_ticket_internal_v2(
    '8d000000-0000-4000-8000-000000000001',
    'question',
    'other',
    'low',
    'Dúvida sobre o aplicativo',
    'Quero entender onde encontro esta configuração.',
    NULL,
    '8d100000-0000-4000-8000-000000000002'
  );
  repeated_result := public.create_support_ticket_internal_v2(
    '8d000000-0000-4000-8000-000000000001',
    'question',
    'other',
    'low',
    'Dúvida sobre o aplicativo',
    'Quero entender onde encontro esta configuração.',
    NULL,
    '8d100000-0000-4000-8000-000000000002'
  );
  incident_result := public.create_support_ticket_internal_v2(
    '8d000000-0000-4000-8000-000000000001',
    'incident',
    'access_identity',
    'critical',
    'Acesso indisponível no aplicativo',
    'Não consigo entrar e não existe alternativa disponível.',
    NULL,
    '8d100000-0000-4000-8000-000000000003'
  );

  IF question_result #>> '{ticket,request_kind}' <> 'question'
    OR question_result #>> '{ticket,impact}' <> 'low'
    OR question_result #>> '{ticket,priority}' <> 'low'
  THEN
    RAISE EXCEPTION 'FAIL: question derivation is inconsistent';
  END IF;
  IF repeated_result #>> '{ticket,id}' <> question_result #>> '{ticket,id}'
    OR coalesce((repeated_result->>'idempotent')::boolean, false) IS NOT true
  THEN
    RAISE EXCEPTION 'FAIL: v2 creation is not idempotent';
  END IF;
  IF incident_result #>> '{ticket,request_kind}' <> 'incident'
    OR incident_result #>> '{ticket,priority}' <> 'critical'
  THEN
    RAISE EXCEPTION 'FAIL: incident priority was not derived server-side';
  END IF;
END $$;

SELECT pg_temp.expect_error(
  $sql$SELECT public.create_support_ticket_internal_v2(
    '8d000000-0000-4000-8000-000000000001',
    'request',
    'other',
    'high',
    'Melhoria no aplicativo',
    'Esta melhoria ajudaria a concluir a tarefa mais rápido.',
    NULL,
    '8d100000-0000-4000-8000-000000000004'
  )$sql$,
  'invalid_support_impact'
);

SELECT pg_temp.expect_error(
  $sql$SELECT public.create_support_ticket_internal_v2(
    '8d000000-0000-4000-8000-000000000001',
    'invalid',
    'other',
    'normal',
    'Assunto inválido',
    'Mensagem de teste suficientemente longa.',
    NULL,
    '8d100000-0000-4000-8000-000000000005'
  )$sql$,
  'invalid_support_request_kind'
);

ROLLBACK;
