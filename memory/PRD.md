# PRD — CutSync · Módulo do Profissional

## Problema original

Refatorar completamente o visual e a disposição do módulo profissional do CutSync, nesta etapa cobrindo agenda, histórico e modal de encaixe rápido. Preservar as regras e integrações existentes, usar a cor dinâmica de cada salão e aplicar uma experiência mobile premium inspirada em Stripe, Superhuman, Fresha e Linear.

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

- Criar conta e seed oficial de QA para validar os fluxos autenticados ponta a ponta.
- Remover as implementações legadas mantidas abaixo dos novos exports nas três rotas migradas.

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

1. Remover definitivamente o código legado das rotas já migradas.
2. Criar seed/credenciais de QA e validar o módulo profissional autenticado com dados reais.
3. Criar perfil público por slug, compartilhável sem login.
4. Adicionar analytics de conversão entre perfil público, escolha de serviço e confirmação.