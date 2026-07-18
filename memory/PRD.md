# PRD — CutSync

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