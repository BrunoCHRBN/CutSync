# ADR 0003 — Money em centavos e bridge legado

- Status: aceito
- Data: 2026-08-08

## Contexto

`appointments.price_charged` é snapshot legado `numeric(12,2)`. O domínio POS
precisa de aritmética determinística e contratos seguros para JavaScript.

## Decisão

Todo money novo usa inteiro em centavos, `BRL`, limite seguro e cálculo server-side.
A bridge decimal→centavos valida escala máxima de duas casas, range e arredondamento
exato; valor ambíguo falha fechado. O snapshot legado não é reescrito nesta fase.

## Consequências

Interfaces públicas usam sufixo `Cents`. Backfills são idempotentes e reconciliados
antes de cutover. Produção, recebido, caixa, comissão, fiscal, payout e lucro não
compartilham um único total semântico.
