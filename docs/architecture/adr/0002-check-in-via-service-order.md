# ADR 0002 — Check-in via comanda

- Status: aceito
- Data: 2026-08-08

## Contexto

`appointments.status` já representa agenda e tem o contrato
`pending | confirmed | cancelled | completed | no_show`. Um estado `checked_in`
misturaria agenda com execução.

## Decisão

Check-in é derivado de `service_order.status = open`. O appointment continua
`confirmed` durante `open` e `in_service`; `finish_service_order` o conclui e move
a comanda para `awaiting_payment`.

## Consequências

Não será criada coluna/status `appointments.checked_in`. Toda UI consulta o read
model da comanda e não infere check-in de estado local.
