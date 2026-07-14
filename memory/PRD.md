# PRD — CutSync Front-end

## Problema original

Analisar o repositório do SaaS CutSync, sugerir melhorias e preparar um redesign completo do front-end existente, priorizando os pontos de maior impacto e permitindo uma direção visual nova e marcante.

## Arquitetura observada

- Expo 57, React Native 0.86, React 19 e Expo Router.
- TypeScript e rotas separadas por perfil: admin, barbeiro e cliente.
- Supabase para autenticação e sincronização remota.
- WatermelonDB/LokiJS para experiência offline-first em mobile e web.
- i18next para português e inglês.

## Decisões de produto e design

- Preservar os fluxos existentes, reconstruindo a camada visual sobre componentes compartilhados.
- Adotar direção premium dark-first em obsidiana/zinc, com âmbar como identidade CutSync.
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

## Backlog priorizado

### P0

- Criar conta e seed oficial de QA para validar os fluxos autenticados ponta a ponta.
- Aplicar o `AdminShell` às páginas Equipe, Serviços e Configurações.
- Remover as implementações legadas mantidas abaixo dos novos exports nas três rotas migradas.

### P1

- Separar Agenda e Financeiro do dashboard administrativo.
- Redesenhar Meu Dia e Encaixe Rápido do barbeiro.
- Criar onboarding específico para cliente, dono e profissional.
- Padronizar toasts, modais, erros inline e estados vazios.
- Revisar traduções e remover strings inconsistentes.

### P2

- Migrar Equipe, Serviços, Configurações e Perfil da Barbearia.
- Adicionar imagens reais e identidade por estabelecimento.
- Melhorar acessibilidade, foco, contraste e áreas de toque.
- Modularizar arquivos grandes e documentar o projeto.

## Próximas tarefas

1. Redesenhar cadastro e onboarding específico para cliente, dono e profissional.
2. Migrar Equipe, Serviços e Configurações para o novo design system.
3. Redesenhar o painel do barbeiro e seu encaixe rápido.
4. Criar seed/credenciais de QA e validar Dashboard e Agendamento com dados reais.