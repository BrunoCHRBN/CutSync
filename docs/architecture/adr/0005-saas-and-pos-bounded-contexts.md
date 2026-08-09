# ADR 0005 — Separação SaaS e POS

- Status: aceito
- Data: 2026-08-08

## Decisão

`billing_*`, `organization_billing_*`, Stripe billing e
`fiscal_documents/fiscal_events` existentes pertencem exclusivamente à assinatura
CutSync. Pagamentos de atendimento usam `establishment_payment_methods`,
`order_payment_entries` e seus ledgers próprios. Nenhum app acessa tabelas
financeiras diretamente.

O billing SaaS permanece com `enforcement_enabled=false` durante beta/cortesia até
gateway, CNPJ, fiscal e piloto serem aprovados explicitamente.

## Consequências

Checkout/retorno de assinatura não concede quitação de atendimento; POS não altera
entitlement SaaS. Secrets, webhooks, métricas e jobs recebem namespaces separados.
