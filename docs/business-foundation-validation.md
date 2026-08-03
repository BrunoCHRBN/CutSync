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

## Direção atual de homologação

Desde o primeiro ciclo operacional, Android é a única plataforma mobile de
produção e homologação do CutSync. A Fatia 1 preserva código compartilhado e
abstrações capazes de receber iOS no futuro, mas APNs, Apple Developer,
TestFlight, App Store, artefato iOS e teste em dispositivo Apple não são
bloqueadores atuais.

O export iOS registrado abaixo continua como evidência histórica de
compatibilidade estática do snapshot. Ele não declara homologação iOS nem cria
obrigação de repetir o export em cada entrega Android. Regras de domínio não
devem depender de APIs Android; deep links usam contratos abstratos,
notificações distinguem aplicativo e plataforma, e integrações nativas ficam
atrás de adaptadores.

As regras vigentes de propriedade de produto, cache em memória, comandos online
e idempotentes, invalidação por Realtime, deep links, push FCM, versionamento,
rollback e definição de pronto estão em
[`architecture/MOBILE_PRODUCT_CONTRACT.md`](./architecture/MOBILE_PRODUCT_CONTRACT.md).

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

## Limite atual da evidência de idempotência concorrente

O teste do ciclo Android cobre replay após perda de resposta com o mesmo
`request_id` e confirma uma única receipt, mutação, ocorrência de histórico e
notificação. Essa evidência é sequencial e não deve ser apresentada como teste
de concorrência.

Em 1 de agosto de 2026 não foi possível executar uma corrida confiável sem
alterar o estado remoto: a migration do ciclo existe em Homolog somente dentro
de uma transação não confirmada e revertida ao final. Duas sessões PostgreSQL
independentes não enxergam as tabelas, funções ou fixtures ainda não confirmadas
da outra sessão. O Docker local não estava em execução, portanto não havia um
Postgres/Supabase local para abrir duas conexões, e Homolog não possuía as
extensões `dblink` ou `pg_background`. Nenhuma extensão foi instalada e a
migration não foi confirmada remotamente apenas para fabricar essa evidência.

O critério concorrente permanece pendente até que a migration possa ser
aplicada a um banco dedicado de teste ou ao Homolog autorizado. Nesse ambiente,
o teste deve abrir duas conexões independentes, sincronizar o início de duas
chamadas críticas com o mesmo ator, estabelecimento, payload e `request_id`, e
confirmar respostas iguais e exatamente uma receipt, uma mutação, um evento e
uma notificação. Uma segunda corrida com o mesmo `request_id` e hash diferente
deve retornar `idempotency_conflict` sem efeitos adicionais.

## Estado de homologação

A Fatia 1 possui validação estática, bundles nativos e aplicação remota
confirmadas. A migration do ciclo operacional Android foi validada no Homolog
somente dentro de transação com `ROLLBACK` e ainda não foi aplicada de forma
persistente. O conjunto ainda não deve ser declarado homologado em dispositivos.

Em 1 de agosto de 2026, o Business `0.1.0` foi compilado localmente para
`x86_64` com `compileSdk`/`targetSdk` 36, instalado no AVD `Medium_Phone`
(Android 16/API 36) e aberto a frio e após reinício sem crash nativo ou
JavaScript. Sem as variáveis do ambiente EAS, a tela de acesso permaneceu
corretamente fail-closed como ambiente não configurado; essa evidência valida o
binário local e o bootstrap, não sessão, papel, push ou fluxo remoto.

Permanecem obrigatórios antes da homologação Android:

- repetir o development build com ambiente EAS válido e sessões reais; o
  bootstrap local em emulador, sem credenciais de ambiente, já foi validado;
- confirmar entrega real dos e-mails de convite e recuperação;
- abrir os deep links a frio, em background e com o app em foreground;
- repetir os fluxos via PostgREST com sessões JWT reais de owner, admin,
  profissional e usuário sem vínculo;
- validar troca entre unidade `full`, `read_only` e `blocked` sem novo login;
- confirmar visualmente que Gestão não existe para profissional e que seu deep
  link é recusado;
- conferir Hoje e Agenda em unidade vazia, erro de rede, timezone distinto e
  consulta própria/equipe;
- repetir em rede lenta, perda de conexão e reconexão, sem tratar cache como
  autorização;
- gerar as evidências Android do ciclo correspondente (Development build, APK
  Preview e, no encerramento do ciclo operacional, AAB para tracks interno e
  fechado).

Os testes SQL usam o papel `authenticated` e claims controladas no banco, mas
não substituem essa homologação com sessões reais e development builds.

iOS permanece preparado, porém não homologado. Sua ausência, assim como a de
APNs e de qualquer artefato para a App Store, não impede a homologação Android.
