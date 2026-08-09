# ADR 0001 — Reatribuição com decisão do cliente

- Status: aceito
- Data: 2026-08-08

## Contexto

O legado troca `appointments.professional_id` diretamente e registra apenas o
profissional anterior e um motivo. Isso não comprova preferência, ciência ou
aceite do cliente e pode alterar preço, recebedor ou responsabilidade.

## Decisão

Agendamento ligado a `client_id` ou `establishment_client_id` nunca muda de
profissional por `reschedule_appointment` ou modo ausência. A troca futura usa
preference snapshot, request versionada, decisão do cliente e timeline imutável.
Legados sem preferência são `specific`. `appointments.professional_id` permanece
projeção compatível até o cutover.

Walk-in realmente não ligado pode receber correção direta somente por owner/admin,
com reason code fechado, `requestId`, lock e auditoria. Profissional apenas solicita.
Com comanda aberta, a correção comum é proibida.

## Consequências

O Web deixa de afirmar “transferido” no fluxo legado. A indisponibilidade pode
manter ou cancelar o atendimento até a Central de Decisões existir. Tentativas
bloqueadas geram código técnico sem dados pessoais.
