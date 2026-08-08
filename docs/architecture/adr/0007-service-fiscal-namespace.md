# ADR 0007 — Fiscal operacional em `service_fiscal_*`

- Status: aceito
- Data: 2026-08-08

## Decisão

Fiscal de atendimento usa somente `service_fiscal_profiles`,
`service_fiscal_operations`, `service_fiscal_documents`,
`service_fiscal_document_links` e `service_fiscal_events`. É proibida FK/alias para
invoices do billing SaaS.

Profile pertence à entidade legal e pode ter configuração aplicável por unidade.
Emissão é assíncrona, idempotente, com retry e `manual_review`; pagamento e
atendimento não aguardam autorização fiscal. Credenciais ficam em secrets e
produção exige aprovação do contador.

## Consequências

Serviço e produto podem gerar operações distintas. Cancelamento/substituição
fiscal ocorre depois da resolução financeira, por adapter nacional, municipal ou
terceiro.
