BEGIN;

-- Conteúdo inicial P1: rascunhos para revisão e publicação por SaaS_Owner.
-- IDs estáveis e conflito por slug tornam a migration segura para reaplicação.
INSERT INTO public.governance_kb_topics (
  id, slug, title, body_markdown, category_id, kind, tags,
  publication_status, resolution_status, author_id, is_official,
  is_pinned, reviewed_at, reviewed_by, published_at, last_change_summary
)
VALUES
  (
    'b1000000-0000-4000-8000-000000000001',
    'ciclo-solicitacoes-estabelecimento',
    'Ciclo de solicitações de estabelecimento',
    E'# Ciclo de solicitações de estabelecimento\n\n## Objetivo\n\nPadronizar a análise de solicitações recebidas pela Central de Governança.\n\n## Público e permissões\n\n- **SaaS_Viewer:** consulta a fila e os detalhes.\n- **SaaS_Editor** e **SaaS_Owner:** aprovam ou rejeitam com justificativa.\n\n## Procedimento\n\n1. Pesquise por nome, slug, solicitante ou documento disponível.\n2. Confirme a elegibilidade cadastral e a ausência de conflito de slug.\n3. Registre justificativa objetiva, entre 10 e 500 caracteres.\n4. Aprove ou rejeite a solicitação.\n\nA aprovação cria o estabelecimento em `pending_verification` e preserva a geração do convite administrativo. A rejeição não deve conter dados pessoais desnecessários na justificativa.\n\n## Evidências\n\nConsulte os eventos `governance.request.approved` ou `governance.request.rejected` e correlacione pelo ID da solicitação.\n\n## Escalonamento\n\nNão aprove quando houver dúvida sobre identidade, documento ou base cadastral. Registre o caso como pendência operacional.',
    'a0000000-0000-4000-8000-000000000002',
    'procedure', ARRAY['solicitacoes', 'onboarding', 'pending-verification'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  ),
  (
    'b1000000-0000-4000-8000-000000000002',
    'verificacao-kyc-documento-privado',
    'Verificação KYC com documento privado',
    E'# Verificação KYC com documento privado\n\n## Objetivo\n\nRevisar evidências cadastrais sem expor documentos publicamente.\n\n## Público e permissões\n\n- **SaaS_Viewer:** consulta o status e o histórico.\n- **SaaS_Editor** e **SaaS_Owner:** enviam e decidem revisões.\n\n## Regras do documento\n\n- Aceitos: PDF, JPEG e PNG.\n- Limite: 10 MB.\n- Armazenamento: bucket privado `governance-kyc`.\n- Visualização: somente por URL assinada de curta duração.\n\n## Fluxo\n\n1. Envie o documento e informe a justificativa.\n2. O status passa de `unsubmitted` para `pending`.\n3. Revise a evidência e registre decisão com justificativa.\n4. `approved` eleva `verification_level` para 3; `rejected` preserva o nível anterior.\n5. Um novo documento abre nova revisão.\n\n## Segurança\n\nNunca copie documentos, URLs assinadas, CPF, CNPJ ou conteúdo pessoal para comentários, tickets ou trilhas de auditoria.\n\n## Escalonamento\n\nFalhas de upload, MIME inválido ou URL expirada devem ser tratadas como falhas operacionais, sem solicitar envio por canais públicos.',
    'a0000000-0000-4000-8000-000000000003',
    'procedure', ARRAY['kyc', 'storage', 'url-assinada', 'privacidade'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  ),
  (
    'b1000000-0000-4000-8000-000000000003',
    'solicitacoes-lgpd-anonimizacao',
    'Solicitações LGPD e anonimização idempotente',
    E'# Solicitações LGPD e anonimização idempotente\n\n## Objetivo\n\nTratar solicitações de anonimização com confirmação, rastreabilidade e proteção de dados pessoais.\n\n## Fluxo\n\n1. Abra a solicitação com `submit_governance_privacy_request`.\n2. Consulte a fila com `list_governance_privacy_requests`.\n3. Confirme identidade e base legal antes de decidir.\n4. Um **SaaS_Editor** ou **SaaS_Owner** executa ou rejeita com justificativa.\n\nA execução usa `execute_governance_privacy_request`, só atualiza a solicitação após concluir e é idempotente: repetir a chamada para uma solicitação executada não reaplica a anonimização.\n\n## Impacto\n\nA anonimização remove ou substitui identificadores pessoais e revoga vínculos ativos conforme a política vigente. Ela não deve ser usada para corrigir dados comuns ou substituir suporte.\n\n## Auditoria\n\nUse os IDs da solicitação e do perfil como correlação. Não registre e-mail, telefone, CPF, documento ou justificativa livre na auditoria.\n\n## Escalonamento\n\nEm caso de contestação, bloqueio jurídico ou dúvida sobre identidade, não execute a anonimização até a análise responsável.',
    'a0000000-0000-4000-8000-000000000003',
    'procedure', ARRAY['lgpd', 'anonimizacao', 'idempotencia', 'privacidade'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  ),
  (
    'b1000000-0000-4000-8000-000000000004',
    'matriz-acesso-governanca',
    'Matriz de acesso da Central de Governança',
    E'# Matriz de acesso da Central de Governança\n\n## SaaS_Viewer\n\nConsulta estabelecimentos, solicitações, verificações, privacidade, vínculos, convites e auditoria. Não executa mutações.\n\n## SaaS_Editor\n\nAlém da consulta, aprova ou rejeita solicitações, revisa KYC, executa ou rejeita solicitações LGPD, revoga memberships profissionais e convites pendentes.\n\n## SaaS_Owner\n\nPossui todas as ações do Editor e também concede, altera ou remove papéis globais de Governança; revoga memberships administrativas; publica, modera e marca conteúdos oficiais.\n\n## Regras invariáveis\n\n- Toda alteração de acesso exige justificativa.\n- Somente perfis já cadastrados podem receber papel de Governança.\n- Não há convite externo de Governança neste ciclo.\n- O último `SaaS_Owner` não pode ser removido nem rebaixado.\n- Não altere `profiles.role` ou `profiles.establishment_id` diretamente.',
    'a0000000-0000-4000-8000-000000000001',
    'guide', ARRAY['rbac', 'saas-viewer', 'saas-editor', 'saas-owner'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  ),
  (
    'b1000000-0000-4000-8000-000000000005',
    'revogacao-memberships-convites',
    'Revogação de memberships e convites',
    E'# Revogação de memberships e convites\n\n## Objetivo\n\nRemover acessos operacionais sem alterar diretamente os campos globais do perfil.\n\n## Matriz de decisão\n\n- **Membership profissional:** `SaaS_Editor` ou `SaaS_Owner` pode revogar.\n- **Membership administrativo:** somente `SaaS_Owner` pode revogar.\n- **Convite pendente:** `SaaS_Editor` ou `SaaS_Owner` pode revogar.\n\nToda revogação exige motivo entre 10 e 500 caracteres.\n\n## Procedimento\n\n1. Confirme o vínculo, papel, status e estabelecimento corretos.\n2. Avalie impacto em agendas, atendimento e operação do estabelecimento.\n3. Registre a justificativa.\n4. Execute a RPC de revogação correspondente.\n5. Verifique o evento em `authorization_audit_log`.\n\n## Segurança\n\nNão use atualização direta em `memberships`, `profiles.role` ou `profiles.establishment_id` para revogar acesso.\n\n## Escalonamento\n\nSe a revogação afetar uma conta administrativa crítica, encaminhe para um Owner antes da execução.',
    'a0000000-0000-4000-8000-000000000001',
    'procedure', ARRAY['memberships', 'convites', 'revogacao', 'autorizacao'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  ),
  (
    'b1000000-0000-4000-8000-000000000006',
    'leitura-auditoria-governanca',
    'Como ler a auditoria de Governança',
    E'# Como ler a auditoria de Governança\n\n## Fontes\n\n- `security_audit_logs`: eventos de segurança, conformidade e decisão.\n- `authorization_audit_log`: mudanças de autorização, convites e memberships.\n\n## Leitura segura\n\nCorrelacione os eventos por IDs de estabelecimento, solicitação, revisão, membership ou convite. Priorize ação, data, ator, alvo e metadados não sensíveis.\n\nA presença de `reason_provided: true` confirma que houve justificativa, sem replicar seu conteúdo na trilha imutável.\n\n## Investigação\n\n1. Delimite período e alvo.\n2. Localize a ação primária.\n3. Busque eventos de autorização ou segurança relacionados.\n4. Registre a conclusão em canal apropriado, sem copiar dados pessoais.\n\n## Proibições\n\nNão edite ou exclua a auditoria. Não use logs para armazenar documentos, e-mails, telefones, CPF, CNPJ, tokens ou URLs assinadas.',
    'a0000000-0000-4000-8000-000000000003',
    'guide', ARRAY['auditoria', 'security-audit-logs', 'authorization-audit-log'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  ),
  (
    'b1000000-0000-4000-8000-000000000007',
    'checklist-validacao-governanca-staging',
    'Checklist de validação da Governança em staging',
    E'# Checklist de validação da Governança em staging\n\n## Pré-requisitos\n\n- Migration aplicada em homologação.\n- Sessões reais de `SaaS_Viewer`, `SaaS_Editor` e `SaaS_Owner`.\n- Dados de teste sem dados pessoais reais.\n\n## Cenários obrigatórios\n\n1. Viewer consulta filas e não vê controles de escrita.\n2. Editor aprova e rejeita solicitação com justificativa.\n3. Editor envia KYC válido, visualiza somente URL assinada e decide revisão.\n4. Editor executa anonimização uma vez e confirma a idempotência.\n5. Editor revoga membership profissional e convite pendente.\n6. Owner concede e remove papéis, sem conseguir remover o último Owner.\n7. Owner revoga membership administrativa.\n8. Auditoria registra ações sem dados pessoais sensíveis.\n\n## Evidências\n\nAnexe IDs de teste, resultado de cada cenário e captura da auditoria sem PII.\n\n## Promoção\n\nPromova para produção somente quando todos os cenários críticos passarem e as divergências forem registradas e resolvidas.',
    'a0000000-0000-4000-8000-000000000004',
    'procedure', ARRAY['staging', 'validacao', 'rls', 'governanca'],
    'draft', NULL, NULL, false, false, NULL, NULL, NULL, 'Conteúdo P1 inicial para revisão'
  )
ON CONFLICT (slug) DO NOTHING;

COMMIT;
