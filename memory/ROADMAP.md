# Roadmap — CutSync Business

## P0 — Próxima entrega
- **F5 Detalhe e checkout:** bottom sheet de atendimento, status autorizados, contato e fechamento de comanda.
- Aplicar a migration `20260817000000_business_daily_metrics.sql` no Supabase do ambiente alvo.
- Configurar as variáveis públicas Supabase da prévia e validar rotas autenticadas de Hoje, Agenda, Gestão e Conta.

## P1
- **F6 Polimento:** skeletons, microanimações, toasts globais e haptics.

## P2
- Repetir atendimento anterior e rascunhos de agendamento.

## Riscos acompanhados
- Não exibir valores financeiros sem capability.
- Resolver datas e horários no timezone do estabelecimento.
- Preservar o contrato das RPCs e nunca substituir integrações reais por dados simulados.