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

## Backlog priorizado

### P0

- Instalar dependências e validar build real do Expo.
- Corrigir inconsistências de base (`isOffline`, tema ausente e configuração do projeto).
- Criar tokens e componentes compartilhados.
- Criar navegação responsiva por perfil.
- Redesenhar Login, Visão Geral Admin e Agendamento.

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

1. Preparar e validar o ambiente de desenvolvimento.
2. Implementar design system e shells de navegação.
3. Construir as três telas-piloto.
4. Validar mobile e web antes de migrar as telas restantes.