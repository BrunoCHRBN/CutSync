# Changelog — CutSync Business

## 15/08/2026 — F4 Dashboard Hoje

- Saudação dinâmica pelo horário local e primeiro nome, mantendo o estabelecimento como sinal principal.
- Nova RPC `get_business_daily_metrics` para receita fechada, ticket médio e ocupação diária.
- RPC protegida por autenticação, `financialOpsEnabled`, capability `view_unit_reports`, timezone local e permissões restritas.
- Métricas financeiras permanecem completamente ocultas quando o contexto não possui produto e capability adequados.
- Receita usa comandas realmente fechadas no dia; ticket usa essas comandas; ocupação usa minutos disponíveis e agendados válidos.
- Próximo atendimento recebeu ações rápidas para confirmação autorizada, acesso à comanda e WhatsApp click-to-chat.
- WhatsApp usa `wa.me`, valida telefone, apenas pré-preenche a mensagem e nunca envia automaticamente.
- Adicionada rota de compatibilidade `/business/sign-in` para redirecionar ao acesso oficial do app Business.

### Validação F4
- TypeScript, ESLint, Expo web export e smoke externo: aprovados.
- Regressão F4: 14/14 após correção do fallback nulo de minutos disponíveis.
- E2E autenticado e aplicação da migration permanecem pendentes por ausência das variáveis públicas Supabase nesta prévia. Nenhuma API foi simulada.

## 15/08/2026 — F3 Agenda em timeline

- Faixa semanal de segunda a domingo com navegação, botão Hoje e indicadores de ocupação vindos da agenda real.
- Alternância entre Timeline e Lista sem perder data, escopo ou dados carregados.
- Timeline de 07:00 a 21:00 com slots de 30 minutos e blocos proporcionais à duração.
- Visão própria em uma coluna e visão da equipe com colunas horizontais por profissional.
- Bloqueios reais integrados via `get_business_schedule_blocks`, incluindo períodos que cruzam dias e dias inteiros.
- Linha de horário atual no dia de hoje e estados visuais por status de atendimento.
- Slots vazios respeitam capabilities por profissional e abrem o agendamento com data, hora e profissional pré-preenchidos.
- Cancelados e ausências foram removidos da timeline e agrupados em seção recolhida.

### Validação F3
- TypeScript, ESLint, Expo web export e smoke externo: aprovados.
- Testing agent: 8/8 regressões F3 aprovadas; nenhum bug de UI reportado.
- E2E autenticado pendente por ausência das variáveis públicas Supabase na prévia. Nenhuma API foi simulada.

## 15/08/2026 — F2 FAB e agendamento rápido

- Adicionado FAB “Agendar” persistente em Hoje e Agenda, visível apenas com acesso total e capability de criação.
- Fluxo de novo atendimento reorganizado em cinco etapas: Cliente, Serviço, Profissional, Horário e Revisão.
- Busca de clientes existentes e cadastro rápido no mesmo fluxo, com validação mínima de nome.
- Serviços exibem preço e duração; profissionais respeitam papel e membros ativos da equipe.
- Nova faixa horizontal de sete dias com navegação diária e grade de horários obtida pela RPC real `get_available_slots`.
- Trocar serviço, profissional ou data invalida o horário selecionado.
- Confirmação mantém request idempotente, invalida agenda/clientes, emite haptic e toast de sucesso antes de abrir o detalhe.
- Componentes F2 modularizados em `components/appointments`, com testIDs únicos e acessibilidade.

### Validação F2
- TypeScript, ESLint e Expo web export: aprovados.
- Smoke test externo: aprovado.
- Testing agent: 6/6 regressões estáticas aprovadas; nenhum bug de UI reportado.
- E2E autenticado pendente porque as variáveis públicas Supabase não estão disponíveis na prévia. Nenhuma API foi simulada.

## 15/08/2026 — F0 Preparação e F1 Quick wins

- Ativada a branch aprovada `codex/android-first-cycle` e instalado o monorepo com os pacotes do app Business.
- Adicionados `lucide-react-native` e `react-native-svg` ao workspace Business.
- Criado `BusinessEmptyState`, aplicado em Hoje e Agenda com títulos, descrições e ações contextuais.
- Gestão passou de cards com textos técnicos para lista plana com ícones, descrições amigáveis, capabilities e estados “Em breve”.
- Conta recebeu textos orientados ao usuário, fallback melhor de nome, confirmação de logout e linguagem simplificada para notificações e atualizações.
- Login recebeu proposta mais clara, validação de campos vazios e testIDs nas ações secundárias.
- Hoje e Agenda receberam linguagem simplificada, testIDs completos no escopo alterado e ações mais diretas.

### Validação
- TypeScript: aprovado.
- ESLint: aprovado sem erros ou avisos.
- Expo web export: aprovado.
- Smoke test externo da tela de acesso: aprovado.
- Testing agent: 95%; única observação de testID com acento corrigida depois do relatório.
- Fluxos autenticados não executados porque as variáveis públicas do Supabase não estão configuradas nesta prévia. Nenhuma API foi simulada.