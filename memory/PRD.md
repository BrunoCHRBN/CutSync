# PRD — CutSync · Painel Administrativo Premium

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