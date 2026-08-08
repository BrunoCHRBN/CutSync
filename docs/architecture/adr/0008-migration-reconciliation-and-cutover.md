# ADR 0008 — Reconciliação de migrations e cutover

- Status: aceito
- Data: 2026-08-08

## Contexto

Há versões locais duplicadas e versões remotas sem arquivo correspondente. Renomear
uma migration potencialmente aplicada pode corromper o significado do histórico.

## Decisão

Migrations existentes não são renomeadas/removidas sem evidência por ambiente,
backup e runbook. Diferenças são corrigidas por migration aditiva de versão inédita,
criada inicialmente pelo CLI. Cada mudança segue dual read, shadow validation,
backfill idempotente, feature flag default off, cutover e depreciação posterior.

Repair de histórico é excepcional: exige checksum/filename, schema efetivo,
dependências, backup restaurável e aprovação explícita. Produção não é inferida de
homologação.

## Consequências

O inventário em `MIGRATION_RECONCILIATION_V2_2.md` é gate. Um checkout não é
reprodutível enquanto migrations remotas-only não forem recuperadas ou substituídas
por uma baseline aditiva comprovadamente equivalente.
