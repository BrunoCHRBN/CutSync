-- Testes SQL da RPC pública de solicitações comerciais.
-- Uso local: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f tests/sql/marketing_contact_requests.test.sql
-- Requer a migration 20260805000000_marketing_contact_requests.sql aplicada.

BEGIN;

DO $$
DECLARE
  result jsonb;
  inserted integer;
BEGIN
  -- 1. Validação server-side: origem inválida.
  result := public.submit_marketing_contact_request('other', 'Ana Souza', 'ana@exemplo.com', NULL, 'Mensagem com tamanho suficiente.', true, '');
  ASSERT result->>'status' = 'invalid', 'origem inválida deveria ser rejeitada';

  -- 2. Validação server-side: e-mail inválido.
  result := public.submit_marketing_contact_request('client', 'Ana Souza', 'ana(arroba)exemplo', NULL, 'Mensagem com tamanho suficiente.', true, '');
  ASSERT result->>'status' = 'invalid', 'e-mail inválido deveria ser rejeitado';

  -- 3. Validação server-side: mensagem curta.
  result := public.submit_marketing_contact_request('client', 'Ana Souza', 'ana@exemplo.com', NULL, 'curta', true, '');
  ASSERT result->>'status' = 'invalid', 'mensagem curta deveria ser rejeitada';

  -- 4. Validação server-side: consentimento ausente.
  result := public.submit_marketing_contact_request('client', 'Ana Souza', 'ana@exemplo.com', NULL, 'Mensagem com tamanho suficiente.', false, '');
  ASSERT result->>'status' = 'invalid', 'sem consentimento deveria ser rejeitado';

  -- 5. Honeypot: resposta genérica e nenhuma escrita.
  result := public.submit_marketing_contact_request('client', 'Bot', 'bot@exemplo.com', NULL, 'Mensagem com tamanho suficiente.', true, 'spam');
  ASSERT result->>'status' = 'received', 'honeypot deveria responder de forma genérica';
  SELECT count(*) INTO inserted FROM public.marketing_contact_requests WHERE email = 'bot@exemplo.com';
  ASSERT inserted = 0, 'honeypot não deveria gravar solicitação';

  -- 6. Caso válido do cliente: normaliza e-mail e ignora estabelecimento.
  result := public.submit_marketing_contact_request('client', '  Ana   Souza ', ' ANA@Exemplo.com ', 'Studio Central', 'Preciso de ajuda para agendar um horário.', true, '');
  ASSERT result->>'status' = 'received', 'solicitação válida deveria ser aceita';
  SELECT count(*) INTO inserted
  FROM public.marketing_contact_requests
  WHERE email = 'ana@exemplo.com' AND name = 'Ana Souza' AND origin = 'client' AND establishment_name IS NULL AND status = 'new';
  ASSERT inserted = 1, 'solicitação do cliente deveria ser normalizada e sem estabelecimento';

  -- 7. Caso válido do estabelecimento: mantém nome do estabelecimento.
  result := public.submit_marketing_contact_request('business', 'Bruno Chaves', 'bruno@exemplo.com', ' Studio  Central ', 'Quero entender como organizar a agenda da equipe.', true, '');
  ASSERT result->>'status' = 'received', 'solicitação comercial deveria ser aceita';
  SELECT count(*) INTO inserted
  FROM public.marketing_contact_requests
  WHERE email = 'bruno@exemplo.com' AND origin = 'business' AND establishment_name = 'Studio Central';
  ASSERT inserted = 1, 'nome do estabelecimento deveria ser preservado';

  -- 8. Rate limit: até três por e-mail em 24 horas, com resposta genérica.
  PERFORM public.submit_marketing_contact_request('client', 'Ana Souza', 'ana@exemplo.com', NULL, 'Segunda mensagem com tamanho suficiente.', true, '');
  PERFORM public.submit_marketing_contact_request('client', 'Ana Souza', 'ana@exemplo.com', NULL, 'Terceira mensagem com tamanho suficiente.', true, '');
  result := public.submit_marketing_contact_request('client', 'Ana Souza', 'ana@exemplo.com', NULL, 'Quarta mensagem com tamanho suficiente.', true, '');
  ASSERT result->>'status' = 'received', 'excesso deveria responder de forma genérica';
  SELECT count(*) INTO inserted FROM public.marketing_contact_requests WHERE email = 'ana@exemplo.com';
  ASSERT inserted = 3, format('rate limit deveria manter 3 solicitações, encontrado %s', inserted);
END;
$$;

DO $$
DECLARE
  rls_enabled boolean;
  rls_forced boolean;
  policy_count integer;
  anon_table_privileges integer;
  anon_execute boolean;
  authenticated_execute boolean;
  public_execute boolean;
BEGIN
  SELECT relrowsecurity, relforcerowsecurity
  INTO rls_enabled, rls_forced
  FROM pg_class
  WHERE oid = 'public.marketing_contact_requests'::regclass;
  ASSERT rls_enabled, 'RLS deveria estar habilitada';
  ASSERT rls_forced, 'RLS deveria estar forçada';

  SELECT count(*) INTO policy_count FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'marketing_contact_requests';
  ASSERT policy_count = 0, 'a tabela não deveria expor policies de acesso direto';

  SELECT count(*) INTO anon_table_privileges
  FROM information_schema.role_table_grants
  WHERE table_schema = 'public'
    AND table_name = 'marketing_contact_requests'
    AND grantee IN ('anon', 'authenticated', 'PUBLIC');
  ASSERT anon_table_privileges = 0, 'anon e authenticated não deveriam ter acesso direto à tabela';

  SELECT has_function_privilege('anon', 'public.submit_marketing_contact_request(text, text, text, text, text, boolean, text)', 'EXECUTE'),
         has_function_privilege('authenticated', 'public.submit_marketing_contact_request(text, text, text, text, text, boolean, text)', 'EXECUTE'),
         has_function_privilege('public', 'public.submit_marketing_contact_request(text, text, text, text, text, boolean, text)', 'EXECUTE')
  INTO anon_execute, authenticated_execute, public_execute;
  ASSERT anon_execute, 'anon deveria executar a RPC';
  ASSERT authenticated_execute, 'authenticated deveria executar a RPC';
  ASSERT NOT public_execute, 'PUBLIC não deveria executar a RPC';

  ASSERT NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'marketing_contact_requests'
      AND column_name IN ('ip', 'ip_address', 'user_agent')
  ), 'a tabela não deveria armazenar IP ou user-agent';
END;
$$;

ROLLBACK;
