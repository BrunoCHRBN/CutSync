BEGIN;

-- Segunda leva: runbooks de sustentação, suporte e governança operacional.
-- Os artigos nascem como rascunhos para revisão, publicação e moderação por SaaS_Owner.
INSERT INTO public.governance_kb_topics (
  id, slug, title, body_markdown, category_id, kind, tags,
  publication_status, resolution_status, author_id, is_official,
  is_pinned, reviewed_at, reviewed_by, published_at, last_change_summary
)
VALUES
  (
    'b2000000-0000-4000-8000-000000000001', 'triagem-suporte-oficial', 'Triagem de suporte oficial',
    E'# Triagem de suporte oficial\n\n## Objetivo\n\nClassificar solicitações encaminhadas ao suporte oficial do CutSync e preservar contexto suficiente para investigação.\n\n## Procedimento\n\n1. Confirme o papel da pessoa: cliente, profissional ou administrador.\n2. Registre o impacto, horário aproximado, tela/fluxo e identificadores técnicos não pessoais.\n3. Classifique a prioridade pela interrupção operacional e quantidade de pessoas afetadas.\n4. Abra ou atualize o ticket no Jira Service Management, fonte de verdade do suporte.\n\n## Escalonamento\n\nIncidentes de segurança, indisponibilidade ampla, duplicidade financeira ou perda de acesso exigem escalonamento imediato. Não envie senhas, tokens, documentos ou URLs assinadas ao ticket.',
    'a0000000-0000-4000-8000-000000000002', 'procedure', ARRAY['suporte', 'jira', 'triagem'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000002', 'resposta-a-incidentes', 'Resposta a incidentes',
    E'# Resposta a incidentes\n\n## Classificação\n\n- **P0:** segurança, indisponibilidade ampla ou dano financeiro em andamento.\n- **P1:** função crítica indisponível para grupo relevante.\n- **P2:** degradação com alternativa operacional.\n- **P3:** defeito localizado ou solicitação de melhoria.\n\n## Fluxo\n\n1. Declare o incidente e nomeie responsável.\n2. Preserve evidências técnicas sem dados pessoais.\n3. Mitigue o impacto antes de buscar a causa raiz.\n4. Atualize o ticket e a comunicação interna em intervalos definidos.\n5. Registre causa, correção, ações preventivas e data de revisão.\n\n## Segurança\n\nNão altere auditoria, não desative RLS como atalho e não publique detalhes de segurança em canais públicos.',
    'a0000000-0000-4000-8000-000000000002', 'procedure', ARRAY['incidente', 'p0', 'p1', 'sre'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000003', 'diagnostico-disponibilidade-agendamentos', 'Diagnóstico de disponibilidade e agendamentos',
    E'# Diagnóstico de disponibilidade e agendamentos\n\n## Objetivo\n\nInvestigar indisponibilidade de horários sem concluir pela interface antes de verificar as regras compartilhadas.\n\n## Checklist\n\n1. Confirme estabelecimento, profissional, serviço, data e fuso horário.\n2. Verifique horário de funcionamento, turnos, bloqueios e agendamentos existentes.\n3. Consulte a RPC de disponibilidade publicada e valide o schema cache.\n4. Repita o cenário nos fluxos de cliente e profissional.\n\n## Falhas recorrentes\n\n`PGRST202` normalmente indica diferença entre migration aplicada e schema cache publicado. Aplique migrations na ordem definida, recarregue o PostgREST e repita a prova.\n\n## Evidências\n\nRegistre IDs técnicos, intervalo consultado e resposta sanitizada; não copie dados de clientes.',
    'a0000000-0000-4000-8000-000000000002', 'procedure', ARRAY['agendamentos', 'disponibilidade', 'pgrst202', 'rpc'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000004', 'runbook-migrations-e-rollback', 'Runbook de migrations e rollback',
    E'# Runbook de migrations e rollback\n\n## Antes da aplicação\n\n1. Revise a ordem dos arquivos e dependências.\n2. Execute testes estáticos, SQL e build relevante.\n3. Aplique primeiro em homologação.\n4. Prepare consultas de verificação e plano de reversão compatível.\n\n## Após a aplicação\n\nValide RPCs, RLS, Storage, schema cache e fluxos de papel real. Uma migration não é considerada validada apenas por existir no repositório.\n\n## Rollback\n\nNão reescreva histórico. Crie migration corretiva, preserve auditoria e documente o impacto. Para mudanças destrutivas, valide backups e o alvo exato antes de executar.',
    'a0000000-0000-4000-8000-000000000004', 'procedure', ARRAY['migrations', 'rollback', 'homologacao', 'postgrest'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000005', 'observabilidade-sentry-e-metricas', 'Observabilidade com Sentry e métricas',
    E'# Observabilidade com Sentry e métricas\n\n## Fontes\n\n- **Sentry:** erros, regressões e contexto técnico sanitizado.\n- **Supabase:** saúde de RPCs, banco, Edge Functions e Realtime.\n- **Métricas operacionais:** volume, conversão, agendamentos e filas.\n\n## Investigação\n\nCorrelacione horário, release, rota e identificadores técnicos. Compare com auditoria quando a ação tiver efeito de autorização ou conformidade.\n\n## Cuidados\n\nNão habilite coleta de dados pessoais para acelerar depuração. Remova anexos ou breadcrumbs que exponham e-mail, telefone, documento, token ou conteúdo de KYC.',
    'a0000000-0000-4000-8000-000000000004', 'guide', ARRAY['sentry', 'observabilidade', 'metricas', 'realtime'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000006', 'retencao-e-governanca-de-dados', 'Retenção e governança de dados',
    E'# Retenção e governança de dados\n\n## Princípios\n\nMantenha dados somente pelo período necessário à finalidade, à obrigação legal e à sustentação do produto. Auditoria não é depósito de dados pessoais.\n\n## Diretrizes\n\n- Dados brutos de evento: retenção definida pela política vigente, com agregados quando possível.\n- Solicitações LGPD: acompanhar status, decisão e evidências mínimas.\n- Logs: manter metadados técnicos e IDs, não conteúdo pessoal.\n- Documentos KYC: bucket privado, acesso temporário e revisão controlada.\n\n## Revisão\n\nQualquer mudança de retenção, descarte ou exportação exige revisão de Governança e migration explícita quando afetar banco ou Storage.',
    'a0000000-0000-4000-8000-000000000003', 'guide', ARRAY['retencao', 'dados', 'lgpd', 'kyc'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000007', 'continuidade-operacional-plataforma', 'Continuidade operacional da plataforma',
    E'# Continuidade operacional da plataforma\n\n## Cenários\n\nIndisponibilidade de Supabase, Storage, Realtime, Jira ou serviço externo de validação cadastral.\n\n## Procedimento\n\n1. Identifique o componente afetado e o escopo.\n2. Preserve operações seguras e interrompa ações que possam duplicar efeitos.\n3. Comunique impacto e alternativa aprovada.\n4. Acompanhe o fornecedor e registre o incidente.\n5. Refaça operações pendentes apenas quando houver confirmação de consistência.\n\n## Regras\n\nNão contorne autenticação, RLS ou auditoria em modo degradado. Não reenvie automaticamente operações de pagamento, convite ou anonimização sem confirmar idempotência.',
    'a0000000-0000-4000-8000-000000000004', 'procedure', ARRAY['continuidade', 'supabase', 'storage', 'realtime'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000008', 'gestao-de-inadimplencia', 'Gestão de inadimplência e circuito de proteção',
    E'# Gestão de inadimplência e circuito de proteção\n\n## Estados\n\n- `active`: operação regular.\n- `pending_verification`: unidade em verificação; siga as regras específicas do fluxo.\n- `delinquent`: novas operações protegidas podem ser limitadas.\n- `blocked`: operação protegida interrompida.\n\n## Procedimento\n\n1. Confirme a origem e a data da informação financeira.\n2. Avalie o impacto em agendamentos e operações existentes.\n3. Altere o status somente pelo fluxo auditável, com justificativa.\n4. Confirme o evento na auditoria e comunique a área responsável.\n\nNunca trate o bloqueio apenas como condição visual: as regras de banco e RLS são a fonte de proteção.',
    'a0000000-0000-4000-8000-000000000002', 'procedure', ARRAY['inadimplencia', 'circuit-breaker', 'account-status'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000009', 'integracoes-jira-e-edge-functions', 'Integrações Jira e Edge Functions',
    E'# Integrações Jira e Edge Functions\n\n## Princípios\n\nJira Service Management é a fonte de verdade para suporte oficial. Segredos e credenciais ficam apenas no ambiente de servidor.\n\n## Implementação segura\n\n- Edge Functions autenticadas derivam identidade da sessão.\n- Nunca exponha tokens, service keys ou detalhes internos da Governança no aplicativo público.\n- Registre resultado técnico e ID externo, sem copiar conteúdo pessoal do ticket para auditoria.\n\n## Falhas\n\nSe a integração falhar, mantenha estado local claro, evite duplicação de ticket e permita reprocessamento idempotente após investigar o erro.',
    'a0000000-0000-4000-8000-000000000005', 'guide', ARRAY['jira', 'edge-functions', 'integracoes', 'segredos'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000010', 'padroes-conteudo-base-de-conhecimento', 'Padrões de conteúdo da Base de Conhecimento',
    E'# Padrões de conteúdo da Base de Conhecimento\n\n## Quando criar um artigo\n\nCrie um guia quando houver procedimento repetível, incidente recorrente, decisão arquitetural ou controle que exija interpretação uniforme.\n\n## Estrutura mínima\n\n1. Objetivo e público.\n2. Pré-requisitos e permissões.\n3. Passos verificáveis.\n4. Decisões, limites e escalonamento.\n5. Evidências e cuidados de privacidade.\n6. Tags de busca e data de revisão.\n\n## Ciclo editorial\n\nEditor cria ou atualiza rascunho. Owner revisa, publica, marca como oficial ou fixa quando apropriado. Alterações em artigo publicado exigem resumo e preservam versão anterior.\n\nArquive conteúdo obsoleto; não o apague para manter histórico.',
    'a0000000-0000-4000-8000-000000000005', 'guide', ARRAY['base-de-conhecimento', 'editorial', 'revisao', 'versoes'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000011', 'seguranca-de-conta-e-mfa', 'Segurança de conta e MFA',
    E'# Segurança de conta e MFA\n\n## Objetivo\n\nReduzir risco de acesso indevido a contas de Governança e operações administrativas.\n\n## Procedimento\n\n1. Use autenticação multifator quando exigida.\n2. Revogue sessões ou acessos suspeitos pelo fluxo autorizado.\n3. Verifique o papel e os memberships antes de restaurar acesso.\n4. Registre suspeitas e decisões na trilha apropriada.\n\n## Incidente\n\nEm caso de dispositivo perdido, credencial comprometida ou MFA indisponível, suspenda ações de alto impacto, escale o caso e nunca compartilhe códigos de autenticação por ticket ou mensagem.',
    'a0000000-0000-4000-8000-000000000001', 'procedure', ARRAY['mfa', 'seguranca', 'conta', 'acesso'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  ),
  (
    'b2000000-0000-4000-8000-000000000012', 'metricas-executivas-governanca', 'Métricas executivas da Governança',
    E'# Métricas executivas da Governança\n\n## Objetivo\n\nInterpretar indicadores operacionais sem confundir métricas agregadas com fonte transacional.\n\n## Indicadores sugeridos\n\n- Solicitações pendentes e tempo de decisão.\n- KYC pendente, aprovado e rejeitado.\n- Solicitações LGPD abertas, executadas e rejeitadas.\n- Mudanças de acesso, memberships e convites revogados.\n- Incidentes, recorrência e tempo de mitigação.\n\n## Leitura responsável\n\nDefina fonte, período, filtro, atraso de atualização e limitações de cada métrica. Use agregados para acompanhamento executivo e consulte registros operacionais apenas quando houver necessidade legítima.\n\n## Escalonamento\n\nDivergência de métrica deve gerar investigação de origem, não alteração manual de dados para ajustar painel.',
    'a0000000-0000-4000-8000-000000000004', 'guide', ARRAY['metricas', 'kpi', 'governanca', 'executivo'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo operacional inicial para revisão'
  )
ON CONFLICT (slug) DO NOTHING;

COMMIT;
