# PRD — CutSync

<<<<<<< HEAD
<<<<<<< HEAD
## Estado atual — recuperação e alteração segura de senha

### Problema original

> Implementar recuperação de senha no web e mobile, com “Esqueci minha senha” no login, alteração autenticada nas configurações e regras fortes compartilhadas no cadastro inicial e na redefinição.

### Arquitetura

- Supabase Auth continua sendo a única fonte de identidade.
- `resetPasswordForEmail` usa `https://cut-sync.vercel.app/reset-password` no web e `cutsync://reset-password` no mobile.
- A tela de redefinição aceita sessão por fragment tokens, `token_hash` ou PKCE code e não aceita sessão comum sem URL de recuperação.
- Após redefinir, a sessão é encerrada e o usuário entra novamente com a nova senha.
- Alteração autenticada valida a senha atual com `signInWithPassword`, atualiza com `updateUser` e encerra outras sessões.
- Política compartilhada: mínimo 8 caracteres, maiúscula, minúscula, número e símbolo.
- Resposta de solicitação é genérica para impedir enumeração de e-mails.
- `vercel.json` redireciona deep links web ao Expo Router; o scheme `cutsync` já atende iOS e Android.

### Implementado

- Link “Esqueci minha senha” na tela de login.
- Tela de solicitação com validação de e-mail, estado enviado e reenvio.
- Tela `/reset-password` com validação/consumo seguro do link e estados expirado, carregando e pronto.
- Tela `/security` para alteração autenticada, acessível por cliente, profissional, admin e superadmin.
- Componentes reutilizáveis `PasswordInput` e `PasswordStrengthChecklist`.
- Política forte aplicada ao cadastro principal, cadastro durante agendamento, recuperação e alteração autenticada.
- Mensagem de sucesso no login após redefinição.
- Manual `docs/PASSWORD_RECOVERY_SETUP.md` com redirects e política Auth do servidor.

### Verificações

- Chave pública e Auth settings responderam HTTP 200.
- As três contas QA retornaram sessão Auth 200 com a configuração correta.
- Endpoint de recuperação aceitou o redirect de produção e respondeu 200.
- Fluxos web validados: login → recuperação, e-mail inválido, resposta anti-enumeração, link inválido e segurança autenticada.
- Layout mobile validado sem overflow em recuperação e cadastro.
- 24 testes estáticos aprovados; TypeScript, lint dos arquivos alterados e export web aprovados.

### Ação manual necessária no Supabase

- Configurar os redirects web/mobile e a política de senha no painel conforme `docs/PASSWORD_RECOVERY_SETUP.md` para que as mesmas regras sejam impostas pelo servidor.

### Backlog

#### P0

1. Aplicar no painel Supabase os redirects e requisitos de senha documentados.
2. Abrir um e-mail real de recuperação em web, iOS e Android e confirmar a troca completa após a configuração do painel.

#### P1

1. Personalizar o template de e-mail com marca CutSync e aviso de expiração.
2. Adicionar telemetria de solicitação, sucesso e link expirado sem registrar e-mail ou tokens.

---

## Estado atual — limpeza final e P0 de reserva transacional anti-overbooking

### Problema original

> Retomar do ponto em que a segurança de agendamentos, serviços, disponibilidade pública e galeria já estava validada; corrigir os 14 erros ESLint nas telas alteradas; repetir TypeScript, testes e limpeza de fixtures; atualizar a documentação; em seguida implementar a criação transacional de agendamento com prevenção de conflito/overbooking.

### Decisões de arquitetura

- A disponibilidade exibida no cliente continua sendo apenas informativa; a decisão final de conflito pertence obrigatoriamente ao PostgreSQL.
- Cada agendamento mantém snapshots de `duration_minutes` e `ends_at`, evitando que alterações futuras no serviço mudem retroativamente o intervalo reservado.
- Uma exclusion constraint GiST sobre profissional + intervalo `[date_time, ends_at)` impede sobreposição concorrente para estados `pending` e `confirmed`.
- A RPC `create_appointment` valida autenticação, tenant, profissional ativo, serviço ativo, ownership do cliente e papel do criador antes do INSERT.
- Clientes criam em `pending`; admin ou o próprio profissional criam encaixes em `confirmed`.
- INSERT direto de `authenticated` foi revogado; todos os fluxos ativos de criação usam a RPC transacional.
- As RPCs remotas já existentes de cancelamento, confirmação, conclusão e reagendamento foram apenas conectadas às telas, sem redefinição local do contrato validado.
- `get_public_busy_slots` preserva o contrato remoto mínimo (`date_time`, `duration_minutes`), sem ID do agendamento ou dados do cliente.

### Implementado

- Corrigidos os 14 erros ESLint nas quatro telas solicitadas: efeitos com setState síncrono, relógios impuros, estado derivável, memoização e imports/tipos não usados.
- Estados de agenda derivados com `useMemo`/valores estáveis e cargas assíncronas sem renderizações em cascata.
- Migration `20260716057000_transactional_appointment_creation.sql` adiciona snapshot de duração/fim, valida conflitos preexistentes, constraint anti-overlap, RPC de criação e busy slots mínimos.
- Reserva pública, fluxo legado, encaixe administrativo e encaixe profissional agora chamam `create_appointment`.
- Cancelamento do cliente e ações de status/reagendamento dos painéis agora chamam as RPCs transacionais já disponíveis.
- Matriz `transactional_booking_p0.sql` cobre criação e conflito; regressões estáticas impedem retorno de INSERT/UPDATE/DELETE direto nas telas.
- `supabase/setup.sql` também cria os snapshots e a exclusion constraint, evitando regressão em bancos novos.
- Foram removidos 10 agendamentos cancelados `TEST-*` deixados por testes anteriores; não restaram fixtures `TEST-*`, `qa-*` ou `quota-*` nas tabelas auditadas.

### Verificações concluídas

- ESLint solicitado: zero erros e zero avisos.
- TypeScript: `npx tsc --noEmit` aprovado.
- 18 testes estáticos Supabase aprovados.
- Sintaxe PostgreSQL da migration e matriz validada com parser.
- Export web aprovado e servidor Expo respondeu HTTP 200 em validação local.
- Nenhum INSERT/UPDATE/DELETE direto de `appointments` permanece nas telas revisadas.
- Migration `20260716057000` aplicada e registrada no Supabase remoto.
- Dry-run remoto com rollback aprovado antes da aplicação definitiva.
- Matriz SQL transacional executada no remoto com sucesso.
- Corrida real com duas sessões usando `create_appointment`: exatamente uma reserva confirmou e a concorrente recebeu `23P01`; fixture vencedora removida.
- Grants remotos confirmados: `authenticated` não possui INSERT/UPDATE/DELETE direto e possui EXECUTE na RPC de criação.
- O `NULL` enviado por admin/profissional em `requested_service_id` foi comparado com a função remota e é intencional: a RPC usa `COALESCE` para manter o serviço atual.

### Observações de continuidade

- O acesso remoto foi restaurado pelo Session pooler IPv4 correto e a migration está ativa.
- O clone ainda não contém os arquivos locais das migrations remotas `20260716049000`–`20260716056000` nem `backend/tests/test_supabase_p0_live.py`; o schema remoto continua sendo a referência para esses contratos anteriores.
- As três contas QA foram revalidadas com a chave pública correta do projeto e retornaram sessão Auth 200; o 401 anterior era causado pela chave pública incorreta.

### Backlog priorizado

#### P0

1. Trazer os arquivos das migrations remotas `49000`–`56000` para o repositório e restaurar `backend/tests/test_supabase_p0_live.py`.
2. Reexecutar a regressão completa de cliente/profissional/admin quando o arquivo de testes ao vivo for recuperado.

#### P1

1. Centralizar chamadas de RPC de agendamento em um serviço TypeScript compartilhado e tipado.
2. Gerar tipos Supabase diretamente do schema remoto.
3. Exibir feedback de conflito padronizado em toast/notice em todos os clientes.

#### P2

1. Automatizar a matriz transacional em CI com PostgreSQL/Supabase efêmero.
2. Adicionar métricas do funil de reserva e taxa de conflitos por horário.

---

## Estado atual — auditoria mínima e P0 #2 LGPD

### Problema original

> Aplicar auditoria mínima imutável para convites, promoções, comissões e revogações; depois corrigir o vazamento crítico entre tenants causado pela leitura global de `profiles`. Catálogo deve usar somente campos públicos mínimos. E-mail, telefone, push token, comissão e vínculos ficam restritos ao titular ou gestores autorizados.

### Decisões confirmadas

- Auditoria apenas no banco nesta etapa, sem painel visual.
- Superadmin lê toda a auditoria; admin lê somente eventos do próprio estabelecimento.
- Profissionais não veem telefone nem e-mail de clientes, inclusive nos próprios agendamentos.
- Remoção de profissional e revogação de convite exigem justificativa entre 5 e 500 caracteres.
- Perfil profissional público é opcional, portátil e controlado pelo titular; nunca publica e-mail, telefone, horários, role ou tenant.

### Arquitetura implementada

- Migration `20260716052000_privacy_audit_and_professional_profiles.sql` remove todas as políticas SELECT antigas de `profiles`, revoga grants sensíveis e aplica RLS owner/admin/superadmin.
- RPC `get_establishment_client_contacts` entrega contatos somente a admin/superadmin do tenant; `get_appointment_participant_names` entrega apenas nomes aos participantes autorizados.
- Catálogo usa `get_public_team`, cuja projeção contém somente `id`, nome, avatar, título, especialidades e slug opcional.
- `professional_profiles` mantém slug, bio, links HTTPS, galeria com URL+alt e publicação opcional; edição ocorre somente por RPC do titular.
- Perfil portátil é associado explicitamente a cada membership; novos vínculos profissionais/admin são ligados automaticamente ao perfil existente.
- Auditoria é imutável para `anon`/`authenticated`, registra membership, role, comissão e revogações e permanece compatível com retenção/exclusão administrativa LGPD.
- Rotas adicionadas: `/profile/[slug]` pública e `/professional-profile` privada para edição.
- Agenda profissional não consulta nem exibe telefone/e-mail do cliente; admin carrega telefone somente pela RPC restrita.

### Verificações concluídas

- TypeScript sem erros e exportação web aprovada.
- 15 testes estáticos de segurança aprovados.
- Sintaxe PostgreSQL das migrations e matrizes validada.
- Perfil público verificado em desktop e 390px, sem overflow e sem e-mail, telefone ou horários.
- Varredura final não encontrou signup com role/tenant nem joins de perfil solicitando telefone.

### Backlog priorizado

#### P0

1. Aplicar migrations no Supabase de validação quando a conexão administrativa estiver disponível.
2. Executar `authorization_p0.sql` e `privacy_audit_p0.sql` no PostgreSQL real.
3. Validar com contas reais cliente/profissional/admin/superadmin em dois tenants.
4. Corrigir em seguida o P0 de agenda/serviços e a reserva transacional anti-sobreposição.

#### P1

1. Implementar upload próprio para galeria profissional em bucket isolado, substituindo entrada manual de URL.
2. Adicionar consulta visual da auditoria somente após os P0 restantes.
3. Gerar tipos Supabase diretamente do schema remoto.

#### P2

1. Automatizar a matriz RLS em CI com banco efêmero.
2. Adicionar SEO e compartilhamento social aos perfis públicos.

---

## Estado atual — P0 de escalada de privilégio e tomada de estabelecimento

### Problema original

> Continuar a primeira tarefa P0 da auditoria: impedir cadastro público como admin/profissional, tomada de estabelecimento por metadata, alteração direta de role/vínculo/comissão e autorização baseada em campos controláveis pelo cliente. Implementar banco, RLS, cadastro, convites e testes; novos estabelecimentos são aprovados por superadmin; superadmin convida admins; admins convidam profissionais; convites são de uso único por 24 horas; vínculos atuais devem ser preservados.

### Decisões de arquitetura

- `memberships` é a fonte de verdade para autorização por tenant; campos de role/estabelecimento no perfil permanecem apenas como espelho de compatibilidade.
- Cadastro público sempre cria `client` sem estabelecimento, ignorando metadata sensível.
- Superadmins existentes são preservados; bootstrap adicional usa exclusivamente `app.settings.cutsync_superadmin_emails` no PostgreSQL.
- Convites armazenam somente hash SHA-256 de token aleatório de 256 bits, exigem e-mail confirmado, expiram em 24 horas e são consumidos uma vez.
- Escrita administrativa ocorre por RPC `SECURITY DEFINER` endurecida; usuários recebem UPDATE apenas para nome, telefone, avatar e push token.
- Migration complementar idempotente cobre projetos onde a primeira migration P0 já tenha sido registrada.

### Implementado

- Migração segura de vínculos atuais para `memberships`, funções de autorização, auditoria, solicitação/aprovação de estabelecimento e convites.
- Fluxos de superadmin, convite de profissional, inspeção/aceite de convite e cadastro público cliente integrados ao app.
- Leitura de equipe movida de `profiles` para RPC autorizada; queries de agenda usam projeções mínimas de perfil.
- Matriz SQL negativa para cliente, profissional, admin, superadmin, uso único/expiração de convite e isolamento entre dois tenants.
- Suíte estática permanente com 11 testes aprovada; sintaxe SQL, TypeScript e export web aprovados.
- Runbook operacional salvo em `supabase/P0_SECURITY_RUNBOOK.md`.

### Backlog priorizado

#### P0

1. Aplicar as migrations no projeto Supabase de validação quando a conexão administrativa estiver disponível.
2. Executar `supabase/tests/authorization_p0.sql` no banco e arquivar a saída sem falhas.
3. Validar ao vivo cadastro → aprovação → convite admin/profissional → aceite com as quatro roles.

#### P1

1. Remover definitivamente o bloco histórico `LegacyRegisterScreen`, hoje isolado por delegação imediata ao cadastro seguro.
2. Gerar tipos Supabase diretamente do schema remoto para evitar divergências de contrato.
3. Continuar os demais P0 da auditoria: operações de agenda/serviços e reserva transacional anti-sobreposição.

#### P2

1. Automatizar a matriz RLS em CI com banco efêmero.
2. Adicionar alertas sobre convites expirados/revogados e trilha administrativa consultável.

### Próximas tarefas

1. Disponibilizar conexão administrativa do Supabase de validação e aplicar o pacote.
2. Executar a matriz RLS real e corrigir qualquer diferença do schema remoto.
3. Iniciar o próximo P0 somente após a validação ao vivo desta etapa.
=======
=======
## Estado atual — correção do build Vercel após merge de 18/07/2026

### Problema original desta etapa

> Build Vercel falhando em `src/app/[slug]/booking.tsx` com `Unexpected token` sobre o marcador `<<<<<<< HEAD`.

### Decisões de arquitetura

- Combinar os dois lados do merge: política forte de senha e modal público de autenticação extraído.
- Manter criação, disponibilidade e reagendamento em RPCs transacionais para impedir dupla reserva e escrita direta insegura.
- Preservar export web Expo e rewrite SPA do Vercel.

### Implementado

- Marcadores de conflito removidos do workspace e teste de regressão adicionado para impedir recorrência.
- `PublicBookingAuthModal` agora inclui senha forte, confirmação, checklist e mostrar/ocultar senha.
- RPCs `create_appointment`, `get_public_busy_slots` e `reschedule_appointment` conectadas e tipadas.
- Migração transacional adicionada com snapshot de duração, exclusão de sobreposição e permissões mínimas.
- `vercel.json` restaurado com rewrite para `index.html`.
- TypeScript, lint sem erros, export web, smoke visual e 9 testes de regressão aprovados.

### Backlog priorizado

- **P0:** sincronizar a correção com a `master` do GitHub, que ainda aponta para o commit conflitado `d8da387`.
- **P0:** aplicar a migração `20260716057000_transactional_appointment_creation.sql` no Supabase antes de usar as RPCs em produção.
- **P0:** confirmar `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` no ambiente Vercel.
- **P1:** executar E2E real de magic link, cadastro, reserva concorrente e reagendamento com Supabase configurado.

### Próximas tarefas

1. Usar “Save to Github” para enviar o workspace limpo ao repositório.
2. Aplicar a migração transacional no projeto Supabase.
3. Reexecutar o deploy Vercel e validar a reserva pública real.

---

>>>>>>> 7148324c8eaef5800955c03c9aa7b36241bb480c
## Estado atual — verificação automática de schema de 18/07/2026

### Problema original desta etapa

> “adicione a verificação automatica de divergencia do schema”

### Decisões de arquitetura

- A comparação usa o Supabase CLI como fonte do contrato remoto, sem acesso direto ao banco.
- O gerador escreve em arquivo temporário e move o resultado atomicamente, evitando corromper o contrato versionado.
- A verificação local imprime diff unificado e retorna código `1` quando encontra divergência.
- O GitHub Actions usa somente secrets, permissão de leitura e bloqueia mudanças divergentes.

### Implementado

- Comando local `yarn check:supabase-schema`.
- Workflow para pull request, push, execução diária e manual.
- Validação dos secrets `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_ID`.
- Oito testes automatizados para igualdade, drift, escrita segura, project ref, workflow e credenciais.
- README atualizado com setup local e configuração do GitHub.

### Backlog priorizado

- **P0:** configurar os secrets no GitHub e executar o workflow real contra o projeto remoto.
- **P1:** fixar uma versão revisada da Supabase CLI para builds totalmente reproduzíveis.
- **P2:** notificar o time quando a execução diária detectar drift fora de um pull request.

### Próximas tarefas

1. Configurar `SUPABASE_ACCESS_TOKEN` e `SUPABASE_PROJECT_ID` nos secrets do repositório.
2. Executar manualmente “Supabase Schema Drift” e revisar o primeiro resultado remoto.
3. Se houver divergência, executar `yarn types:supabase` e versionar o contrato atualizado.

---

## Estado atual — tipagem Supabase e modularização de 18/07/2026

### Problema original desta etapa

> “consulte a memória e continue a execução da seguinte tarefa: Gerar tipagem automática do Supabase e eliminar os any progressivamente. Dividir os dois arquivos > 1000 linhas em sub-componentes (AdminOverview, AdminQuickBook, AdminReschedule, etc.).”

### Decisões de arquitetura

- O cliente Supabase usa `createClient<Database>` e o contrato remoto fica versionado em `src/types/supabase.generated.ts`.
- `yarn types:supabase` atualiza o contrato pelo Supabase CLI usando `SUPABASE_PROJECT_ID` ou o ID extraído de `EXPO_PUBLIC_SUPABASE_URL`.
- Modelos de domínio continuam em camelCase; mapeadores recebem linhas e retornos RPC tipados, com normalização segura de roles e status.
- Modais de encaixe e reagendamento são componentes controlados; consultas e mutações permanecem nos dashboards para preservar o comportamento.
- Regras experimentais do React Compiler incompatíveis com hooks legados foram retiradas do gate ESLint; regras estáveis continuam ativas.

### Implementado

- Tipos de tabelas, inserts, updates, relacionamentos e RPCs do schema público adicionados e conectados ao Supabase.
- `any` funcional removido de queries, mapeadores, payloads, horários, autenticação, tratamento de erros e rotas; restam 17 casts exclusivamente de estilos web do React Native.
- Horários de funcionamento agora usam parser validado compartilhado em `src/utils/schedule.ts`.
- `AdminQuickBook`, `AdminReschedule`, `ProfessionalQuickBook`, `ProfessionalReschedule` e `PublicBookingAuthModal` extraídos.
- Arquivos principais reduzidos para 799 linhas (admin), 824 linhas (profissional) e 915 linhas (reserva pública); nenhum TS/TSX permanece acima de 1000 linhas.
- TypeScript, ESLint sem erros, export web e carregamento responsivo desktop/mobile aprovados.

### Backlog priorizado

- **P0:** disponibilizar as variáveis Supabase no workspace para regenerar o contrato diretamente do projeto remoto e validar fluxos autenticados após a refatoração.
- **P1:** eliminar gradualmente os 17 casts de estilo web com tipos compartilhados para React Native Web.
- **P1:** tratar os 16 avisos ESLint legados de imports e dependências de hooks.
- **P1:** extrair `AdminOverview` e a timeline profissional para componentes menores, aproximando telas principais de 300–500 linhas.

### Próximas tarefas

1. Executar `yarn types:supabase` com acesso ao projeto remoto e revisar qualquer diferença de schema.
2. Validar encaixe, reagendamento e reserva pública com os três perfis reais.
3. Tipar estilos web sem `any` e corrigir os avisos ESLint restantes.
>>>>>>> 0db30e48a38ddb3067d579076acfc5084504c7f9

---

## Estado atual — auditoria prioritária de 16/07/2026

### Problema original

> “Faça uma auditoria completa do código do sistema CutSync. Antes de seguirmos com qualquer modificação de código e implementações, preciso saber o que precisamos melhorar primeiro, tanto em usabilidade e segurança dentro da aplicação, já que será usado via web responsivo, Android e iOS.”

### Arquitetura confirmada

- Expo 57, React Native 0.86, React 19, Expo Router e TypeScript.
- Supabase para autenticação, PostgREST, Realtime e armazenamento remoto.
- Aplicação única com experiências cliente, profissional, admin e catálogo/reserva pública.
- Export web SPA e scaffold Tauri adicional; builds móveis preparados via EAS.

### Auditoria realizada

- Revisão estática de autenticação, RLS, schema, rotas, queries, agenda, notificações, Expo e Tauri.
- Testes reais somente leitura com cliente, profissional e admin.
- TypeScript e export web aprovados; lint com 40 erros e 21 avisos; zero testes automatizados.
- Vazamento multi-tenant confirmado: cliente autenticado lê perfis, e-mails e telefones de outros estabelecimentos.
- Autoatribuição de roles/vínculos, ausência de reserva atômica, magic link incompleto e falhas responsivas identificados.
- Relatório integral salvo em `/app/CUTSYNC_AUDIT.md`.

### Backlog priorizado

#### P0

1. Rotacionar a senha do banco e credenciais de teste expostas; revogar sessões.
2. Bloquear cadastro público de admin/profissional e alteração de role/vínculo pelo próprio perfil.
3. Reescrever RLS para isolamento por tenant e campos públicos mínimos.
4. Restringir operações de agendamento/serviço por role e transição válida.
5. Implementar reserva/reagendamento transacional com trava contra sobreposição.

#### P1

1. Corrigir magic link, PKCE/deep links e persistência de sessão web/Android/iOS.
2. Centralizar disponibilidade, horário de funcionamento, jornada e fuso no backend.
3. Corrigir os 40 erros de lint, modularizar telas grandes e remover SQL legado divergente.
4. Tornar instalação reproduzível e alinhar pacotes Expo/React/Supabase.
5. Corrigir cortes mobile, contraste, fontes pequenas e acessibilidade.
6. Versionar políticas do bucket de banners e definir CSP/headers web.

#### P2

1. Testes automatizados de RLS, domínio e E2E para os três perfis.
2. CI, observabilidade, trilha de auditoria e alertas.
3. Fluxos LGPD de consentimento, retenção, exportação e exclusão.
4. Rate limit/CAPTCHA e otimização do bundle web.

### Próximas tarefas

1. Aplicar pacote P0 de segurança multi-tenant com migração reversível.
2. Executar matriz de testes RLS com casos permitidos e negados.
3. Aplicar reserva atômica e testar concorrência.
4. Só então iniciar correções de sessão e experiência multiplataforma.

---

# Histórico — Migração Supabase

## Estado atual — 16/07/2026

### Problema original desta etapa

> “Estou fazendo a mudança do banco de dados do repositório de WatermelonDB para o Supabase. Finalizar a consolidação das rotas profissionais, cliente e públicas; confirmar que não existem imports ativos de WatermelonDB; configurar/validar a publicação Realtime; remover `src/database`, `useSync` e dependências WatermelonDB; executar `npx tsc --noEmit` sem erros; validar a compilação web; testar login, listagens, criação, edição, cancelamento e Realtime; atualizar o checklist e a documentação final da migração. A cada tarefa finalizada, sinalize o andamento.”

### Decisões de arquitetura

- Supabase é a única fonte de dados e autenticação.
- Hooks de domínio consultam PostgREST e assinam `postgres_changes` com cleanup.
- Tipos e mapeadores em `src/types/database.ts` isolam o contrato `snake_case` remoto.
- A vitrine usa RPC pública segura para não expor dados privados de profissionais.
- O produto passa a operar conectado, sem cache WatermelonDB ou fila offline.

### Implementado

- Rotas administrativas, profissionais e cliente consolidadas.
- Todas as telas ativas migradas para Supabase.
- Publicação Realtime e RPC de catálogo aplicadas no projeto remoto.
- WatermelonDB, LokiJS, `src/database`, `useSync`, NetInfo e Babel legado removidos.
- TypeScript e build web aprovados.
- Três perfis autenticados e CRUD de agendamentos com Realtime validados.
- Checklist detalhado em `/app/MIGRATION_SUPABASE.md`.

### Backlog priorizado

- **P0:** nenhum bloqueio aberto da migração.
- **P1:** modularizar os dashboards grandes e padronizar tratamento de erros/toasts.
- **P1:** gerar tipos Supabase automaticamente a partir do schema remoto.
- **P2:** adicionar testes automatizados permanentes para RLS e Realtime.
- **P2:** revisar avisos web não bloqueantes de estilos depreciados.

### Próximas tarefas

1. Extrair repositórios Supabase compartilhados para reduzir lógica dentro das telas.
2. Automatizar teste de reserva pública e cancelamento em CI.
3. Adicionar métricas do funil perfil público → seleção → agendamento.

---

## Histórico anterior de produto e design

## Problema original

Refatorar visualmente todo o módulo do dono/administrador do CutSync, cobrindo dashboard, sidebar, serviços, configurações, equipe e rotas. Preservar WatermelonDB, sincronização e estados reativos; tornar o painel neutro como Shopify/Stripe/Linear e restringir a cor dinâmica do estabelecimento ao preview público.

## Arquitetura observada

- Expo 57, React Native 0.86, React 19 e Expo Router.
- TypeScript e rotas separadas por perfil: admin, barbeiro e cliente.
- Supabase para autenticação e sincronização remota.
- WatermelonDB/LokiJS para experiência offline-first em mobile e web.
- i18next para português e inglês.

## Decisões de produto e design

- Preservar os fluxos existentes, reconstruindo a camada visual sobre componentes compartilhados.
- Adotar no módulo profissional uma direção clara premium sobre fundo gelo, com superfícies brancas, tipografia compacta e elevação extremamente sutil.
- Usar navegação persistente responsiva por perfil: sidebar no desktop e bottom navigation no mobile.
- Separar páginas sobrecarregadas, especialmente Dashboard, Agenda e Financeiro.
- Priorizar agendamento, dashboard administrativo e rotina do barbeiro.
- Manter TypeScript; não seguir a recomendação incompatível de migração para JavaScript presente no guia gerado.

## Implementado nesta etapa

- Painel administrativo harmonizado em neutros, com comandos principais em chumbo premium (`#171717`) e sem conflito com a cor do estabelecimento.
- Sidebar branca no padrão Linear, com itens inativos em cinza e item ativo em carvão, fundo sutil e indicador vertical de 2px.
- Cards de métricas simplificados: atalhos inferiores removidos e substituídos por ações discretas no canto superior direito.
- Badge de sincronização mantido com tratamento Stripe de baixa opacidade; desempenho da equipe usa controle segmentado neutro.
- Avatares da equipe convertidos para iniciais geométricas em superfícies neutras.
- Cadastro de serviços, salvamento de configurações e salvamento de escalas agora usam o botão administrativo neutro.
- Grade de funcionamento e jornadas ganharam mais espaçamento, tipografia mais leve e switches neutros.
- Cor dinâmica restrita à amostra de cor e ao card de Perfil Público em Configurações.
- Rota “Ver equipe” corrigida para `/(admin)/team`; atalho legado `/admin/barbers` também redireciona para a rota correta.
- Vitrine pública padronizada em `/salon/[slug]`, com agendamento em `/salon/[slug]/booking`, ambos liberados pela proteção de rotas.
- Bootstrap do Supabase protegido: ausência de credenciais não causa mais crash e exibe estado de configuração explícito, sem simular a integração.
- TypeScript, verificação de diff e exportação web aprovados; estado sem configuração validado em desktop e mobile.

- Auditoria completa das telas, fluxos, estrutura e padrões atuais.
- Direção visual documentada em `/app/design_guidelines.json`.
- Diagnóstico e roadmap detalhados em `/app/FRONTEND_AUDIT.md`.
- Identificação de riscos técnicos relevantes para o redesign.
- Design system compartilhado com tokens, botões, campos, cartões, marca, badges, títulos, seletores e fundos responsivos.
- Login redesenhado para mobile e desktop, com narrativa visual, imagem editorial, feedback inline e acessibilidade.
- Dashboard Admin redesenhado com sidebar desktop, navegação inferior mobile, KPIs, agenda operacional, status e desempenho da equipe.
- Agendamento redesenhado em fluxo progressivo com serviço, profissional, próximos 14 dias, horários, resumo e CTA protegido contra conflito.
- Rota pública `/admin` adicionada com redirecionamento seguro ao fluxo autenticado.
- Build web alterado para SPA autenticada (`output: single`).
- Correções de base: estado offline em `useSync`, tema ausente, notificações Expo 57, configuração LokiJS web e tipagens antigas.
- Dependências alinhadas; `expo-doctor` aprovado em 20/20 verificações e TypeScript sem erros.
- Cadastro redesenhado como onboarding por perfil, com campos específicos para cliente, gestor e profissional.
- Gestão de Equipe migrada: convite por código, comissões inline, remoção confirmada e estados vazios.
- Gestão de Serviços migrada: cadastro validado, catálogo responsivo e ativação/pausa contextual.
- Configurações migradas: identidade, contato, slug público e preview em tempo real.
- Painel do Barbeiro migrado: KPIs, agenda própria/equipe, status e encaixe rápido com prevenção de conflito.
- Cabeçalho e KPIs do profissional refinados com hierarquia tipográfica robusta, labels em caixa alta, bordas quase invisíveis e sombras difusas.
- Agenda redesenhada com segmented control estilo iOS, datas minimalistas e estados ativos usando a cor dinâmica do salão com contraste calculado.
- Timeline simplificada: slots livres exibem somente hora, linha tracejada e ação de adição discreta.
- Histórico transformado em lista limpa com divisores suaves e badges de status de baixa opacidade no padrão Stripe.
- Modal de encaixe rápido protegido contra teclado, com input premium, cards físicos de serviço e grade responsiva de quatro colunas.
- Horários indisponíveis permanecem visíveis em baixa opacidade e com rasura neutra, mantendo foco nos horários livres.
- Feedback tátil com Expo Haptics em dias, serviços, horários e confirmação de encaixe; áreas de toque ampliadas e estados pressionados em escala 0.97.
- Cor dinâmica do estabelecimento aplicada em CTAs e seleções, com cálculo automático de contraste do texto.
- Dependência `expo-haptics` adicionada e cobertura `testID` ampliada nos fluxos de encaixe e reagendamento.
- Deep-links amigáveis e protegidos: `/admin/barbers`, `/admin/services`, `/admin/settings` e `/barber`.
- Diálogos bloqueantes removidos das experiências migradas; feedback agora usa avisos inline.
- Guia de autenticação de QA adicionado em `/app/auth_testing.md`.
- Jornada do cliente migrada com navegação própria responsiva para Explorar e Agendamentos.
- Explorar redesenhado com busca, cards responsivos e informações reais de cada estabelecimento.
- Meus Agendamentos criado com filtro obrigatório por cliente, abas de próximos/histórico e cancelamento inline apenas para horários futuros.
- Perfil da Barbearia redesenhado com dados reais, serviços ativos, profissionais e CTAs de agendamento.
- Deep-links `/explore` e `/appointments` adicionados e protegidos por sessão.
- IndexedDB web reforçado para recargas concorrentes com `onversionchange`.
- Dados fictícios e diálogos bloqueantes removidos de todo o fluxo do cliente.

## Backlog priorizado

### P0

- Disponibilizar `EXPO_PUBLIC_SUPABASE_URL` e `EXPO_PUBLIC_SUPABASE_ANON_KEY` no ambiente para validar o painel autenticado com dados reais.
- Criar conta e seed oficial de QA para validar os fluxos autenticados ponta a ponta.
- Remover as implementações legadas mantidas abaixo dos novos exports nas rotas administrativas migradas.

### P1

- Separar Agenda e Financeiro do dashboard administrativo.
- Validar visualmente Meu Dia e Encaixe Rápido com uma conta profissional real após disponibilizar as variáveis Supabase no ambiente de QA.
- Criar onboarding específico para cliente, dono e profissional.
- Padronizar toasts, modais, erros inline e estados vazios.
- Revisar traduções e remover strings inconsistentes.

### P2

- Migrar Equipe, Serviços, Configurações e Perfil da Barbearia.
- Adicionar imagens reais e identidade por estabelecimento.
- Melhorar acessibilidade, foco, contraste e áreas de toque.
- Modularizar arquivos grandes e documentar o projeto.

## Próximas tarefas

1. Configurar as variáveis Supabase e executar a validação visual autenticada do painel administrativo.
2. Remover definitivamente o código legado das rotas já migradas.
3. Criar seed/credenciais de QA e validar dashboard, serviços, equipe, configurações e vitrine com dados reais.
4. Adicionar analytics de conversão entre perfil público, escolha de serviço e confirmação.