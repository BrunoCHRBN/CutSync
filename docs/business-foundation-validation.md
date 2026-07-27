# CutSync Business — validação da Fatia 1

Data do registro: 26 de julho de 2026.

## Escopo entregue

A Fatia 1 evolui o aplicativo existente em `apps/business`, mantendo a versão
`0.1.0`, com:

- login, recuperação e redefinição de senha próprios;
- cadastro iniciado exclusivamente por convite e retorno seguro por deep link;
- grupos de rotas `(auth)`, `(callback)`, `(access)` e `(app)`;
- contexto multiunidade confirmado pelo backend e seleção persistida por usuário
  e dispositivo;
- papéis operacionais `owner`, `admin` e `professional`;
- acesso `full`, `read_only` e `blocked`;
- capacidades efetivas e navegação sem a aba Gestão para profissionais;
- telas Hoje, Agenda, Gestão e Conta em identidade visual própria do Business;
- leitura minimizada da agenda própria ou da equipe, calculada no timezone da
  unidade;
- políticas RLS, RPCs e guardas de mutação no Supabase.

Realtime, detalhes e mutações de atendimento, encaixes, CRUD completo de gestão,
notificações, Sentry/FCM e distribuição EAS permanecem fora desta fatia.

## Validação por commit

| Commit | Evidência executada | Resultado |
| --- | --- | --- |
| `chore(business): finalize operational app foundation` | `typecheck:business` e `lint:business` no snapshot isolado | Aprovado |
| `feat(business): add role-aware access and establishment selection` | `typecheck:business`, `typecheck:shared`, `lint:business` e 22 testes focados no snapshot isolado | Aprovado |
| `feat(business): add operational navigation shell` | `typecheck:business`, `lint:business` e export Android no snapshot isolado | Aprovado |
| `feat(business): add daily agenda foundation` | `typecheck:business`, `typecheck:shared`, `lint:business`, 35 testes focados e exports Android/iOS no snapshot isolado | Aprovado |

Os snapshots foram abertos em worktrees destacados para impedir que mudanças
paralelas do Control alterassem o resultado de cada commit.

## Testes locais

Comandos finais executados:

```text
npm run typecheck:business
npm run typecheck:shared
npm run lint:business
npx playwright test tests/unit/business-auth.unit.spec.ts tests/unit/business-contracts.unit.spec.ts tests/unit/business-foundation.unit.spec.ts tests/unit/business-operational-access.unit.spec.ts tests/unit/platform-billing.unit.spec.ts tests/unit/consolidated-billing-coverage.unit.spec.ts
npx expo export --platform android
npx expo export --platform ios
```

Resultados:

- 35 de 35 testes focados aprovados;
- bundle Android aprovado, com 1.356 módulos;
- bundle iOS aprovado, com 1.232 módulos;
- nenhuma fonte literal abaixo de 11 px em `apps/business/src`;
- versão do aplicativo preservada em `0.1.0`;
- nenhuma dependência de produção adicionada.

A suíte unitária integral do snapshot Business executou 145 testes: 140 passaram
e 5 falharam em baselines fora desta entrega:

- duas expectativas antigas das rotas de autenticação do Client;
- uma expectativa antiga da rota de descoberta do Client;
- 43 fontes literais antigas abaixo de 11 px em Web e Client;
- uma expectativa antiga do serviço P1 de Governança.

Nenhuma dessas cinco falhas aponta para arquivo de `apps/business`, contrato
Business ou migração desta fatia.

## Aplicação e validação remota

A migração
`supabase/migrations/20260801000000_business_operational_access.sql` foi:

1. executada com o teste SQL dentro de uma transação revertida;
2. aplicada isoladamente ao projeto Supabase conectado, sem `db push`;
3. registrada no histórico remoto como `20260801000000`;
4. verificada pela existência de
   `get_my_business_operational_contexts()` e
   `get_business_agenda_day(uuid,date,text)`;
5. testada novamente, após a aplicação, por
   `supabase/tests/business_operational_access.sql`.

O teste remoto cobre owner de organização, owner legado confirmado, admin,
profissional e usuário sem vínculo; `full`, `read_only` e `blocked`;
`share_agendas`; timezone; isolamento entre unidades; hierarquia e ciclo de
convites; negação de alteração direta de serviço e atendimento alheio; e
bloqueio dos RPCs legados que poderiam contornar a política operacional. As
fixtures são revertidas no fim do teste.

A allow-list remota do Supabase Auth também foi atualizada e relida com:

```text
cutsync-business://confirm-email
cutsync-business://reset-password
```

Os tipos foram gerados a partir do schema remoto aplicado. Para não incorporar
as alterações paralelas já existentes em `supabase.generated.ts`, apenas o
recorte dos RPCs consumidos pelo Business foi registrado em
`packages/database/src/business-rpc.generated.ts`.

## Estado de homologação

Esta entrega possui validação estática, bundles nativos e aplicação remota
confirmadas. Ela ainda não deve ser declarada homologada em dispositivos.

Permanecem obrigatórios antes da homologação:

- instalar um development build Android e um development build iOS;
- confirmar entrega real dos e-mails de convite e recuperação;
- abrir os deep links a frio, em background e com o app em foreground;
- repetir os fluxos via PostgREST com sessões JWT reais de owner, admin,
  profissional e usuário sem vínculo;
- validar troca entre unidade `full`, `read_only` e `blocked` sem novo login;
- confirmar visualmente que Gestão não existe para profissional e que seu deep
  link é recusado;
- conferir Hoje e Agenda em unidade vazia, erro de rede, timezone distinto e
  consulta própria/equipe.

Os testes SQL usam o papel `authenticated` e claims controladas no banco, mas
não substituem essa homologação com sessões reais e development builds.
