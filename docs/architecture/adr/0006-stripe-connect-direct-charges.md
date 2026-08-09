# ADR 0006 — Stripe Connect com cobranças diretas

- Status: aceito
- Data: 2026-08-08

## Decisão

Contas de pagamento pertencem à entidade legal e unidades apontam para elas com
vigência. O primeiro ciclo usa direct charges na connected account, sem application
fee, destination charge ou separate charges/transfers.

Eventos brutos são persistidos antes de normalizar, com
`UNIQUE(provider, external_event_id)`. Duplicidade ou ordem inversa provoca nova
consulta do objeto no provedor. Metadata contém somente IDs internos e ambiente.

## Consequências

Connect é server-side e usa `STRIPE_PAYMENTS_*`, separado de `STRIPE_BILLING_*`.
Mudança de recebedor nunca transfere sinal silenciosamente. Marketplace e split
exigem ADR e contrato posteriores.
