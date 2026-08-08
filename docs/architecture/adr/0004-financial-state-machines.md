# ADR 0004 — Máquinas de estado separadas

- Status: aceito
- Data: 2026-08-08

## Decisão

- Comanda: `open | in_service | awaiting_payment | closed | voided`.
- Situação de pagamento: calculada como
  `unpaid | partially_paid | paid | partially_refunded | refunded`.
- Entry: `pending | processing | succeeded | failed | voided | disputed`.
- Refund, provider, caixa, comissão e fiscal têm ciclos próprios.

`service_orders` não recebe `payment_status` editável. Close exige saldo resolvido
ou autorização explícita. Void/refund/ajuste adicionam compensações; não apagam nem
reescrevem o lançamento original.

## Consequências

Relatórios podem ser reconstruídos por entries/eventos. “Atendimento concluído”
nunca significa “pago”, e “pago” nunca significa “conciliado” ou “lucro”.
