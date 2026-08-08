# Architecture Decision Records

ADRs aceitos para o Plano Mestre Pré-Expansão v2.2. Um ADR novo substitui uma
decisão anterior; arquivos aceitos não são reescritos para esconder histórico.

| ADR | Decisão |
| --- | --- |
| [0001](./0001-customer-aware-appointment-reassignment.md) | Reatribuição exige workflow e decisão do cliente |
| [0002](./0002-check-in-via-service-order.md) | Check-in derivado de comanda aberta |
| [0003](./0003-money-cents-and-legacy-decimal-bridge.md) | Money novo em centavos e bridge do decimal legado |
| [0004](./0004-financial-state-machines.md) | Máquinas financeiras e operacionais separadas |
| [0005](./0005-saas-and-pos-bounded-contexts.md) | SaaS billing separado do POS |
| [0006](./0006-stripe-connect-direct-charges.md) | Connect com direct charges no primeiro ciclo |
| [0007](./0007-service-fiscal-namespace.md) | Fiscal operacional em `service_fiscal_*` |
| [0008](./0008-migration-reconciliation-and-cutover.md) | Migrations aditivas, dual read e cutover auditável |
