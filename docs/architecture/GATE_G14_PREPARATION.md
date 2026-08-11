# Gate G14 — preparação de evidências

Status atual: **aprovado em 2026-08-11**.

A decisão final combina CI reproduzido, Homolog com identidades reais, evidência
Android automatizada/em emulador e validação assistida em aparelhos físicos.
A aprovação física das alterações móveis foi registrada explicitamente pelo
usuário responsável pelo produto em 2026-08-11.

Este documento acompanha a conclusão da Fase 3 sem confundir validação local,
CI, homologação com papéis reais e homologação em dispositivo.

## Matriz de critérios

| Critério G14 | Evidência automatizada | Evidência de homologação final |
|---|---|---|
| Matriz role × capability × contexto | RPCs fail-closed, testes SQL e harness Homolog com 11 atores Auth reais | Papéis aplicáveis validados no fluxo real; usuário sem vínculo permanece negado pelo backend |
| Timeline, responsabilidade e `correlationId` iguais | Read models Web/Business/Client e teste SQL compartilhado | Fluxo completo `solicitar → propor → aceitar → aplicar` aprovado, preservando a mesma solicitação e timeline |
| Deep links | Parser fail-closed, bundle das rotas dinâmicas e Business/Client homologados em emulador Android nos estados cold start, background e foreground | Alterações móveis e navegação final aprovadas em aparelhos físicos |
| Offline e replay | Outboxes Client e Business persistentes, mesmo `requestId`, isolamento por usuário/unidade e conflito com releitura; solicitação Business retomada após queda de rede e reinício no emulador | Comportamento móvel aprovado; idempotência também confirmada por SQL, unitários e harness Homolog |
| UI manipulada negada no backend | RPCs revalidam identidade, capability, unidade e versão; tentativa adulterada foi negada em Homolog | Autoridade permaneceu no backend durante a homologação real |
| Push | Evento imutável → filas Client/Business idempotentes → disparo imediato via `pg_net`, cron de contingência e dispatchers separados | Push e notificações internas aprovados nos aparelhos físicos para as partes do fluxo |

## Workflow preparado

O workflow `.github/workflows/phase3-gate.yml` executa:

1. reset integral do banco descartável;
2. cenários SQL da Fase 3;
3. lint e advisors locais do Supabase;
4. typecheck de todos os aplicativos;
5. testes focados de G14, deep links e contratos;
6. lint e bundles Web de Client e Business;
7. baseline de autorização com JWT real e TOTP;
8. registro explícito da evidência como `CI reproduzido`.

## Evidência local e CI confirmada — 2026-08-09

| Verificação | Resultado |
|---|---|
| Reset integral do Supabase local | Aprovado; cadeia completa de migrations reproduzida em banco descartável |
| Cenários SQL da Fase 3 | Aprovado; transação de teste concluída e revertida sem falhas |
| Supabase DB lint | Aprovado; nenhum erro no schema `public` |
| Advisors de segurança e desempenho | Aprovados no nível `error` |
| Typecheck compartilhado, Client, Business e Control | Aprovado |
| Testes focados de contratos, notificações e G14 | Aprovado; 31 testes após incluir a outbox Business |
| Lint Client e Business | Aprovado |
| Exportação Web Client e Business | Aprovada |
| Parse do workflow e `git diff --check` | Aprovado |

## Evidência CI reproduzida

- PR: `#33`, branch `codex/phase3-decision-center`.
- Commit consolidado e reproduzido: `1a8f0fb6ecb2796f86637943731ef375605fec38`.
- Workflow Phase 3 Gate: execução `31461300976`, concluída com sucesso em
  6m53s, incluindo o teste de grants do dispatcher Client.
- Workflows Phase 1 Gate (`31461301008`), Phase 2 Gate (`31461301120`),
  Install and Build (`31461300982`) e Schema Drift (`31461302290`) concluídos
  com sucesso no mesmo commit.
- A primeira tentativa do Phase 2 Gate (`31458264276`) falhou durante o startup
  do ambiente descartável porque o container `supabase_edge_runtime` encerrou
  com `Bus error`/HTTP 503, antes de executar os testes. A tentativa 2 do mesmo
  run concluiu com sucesso em 5m38s, incluindo reconstrução, SQL, schema,
  contratos e harness JWT/TOTP (`17 passed`), sem alteração de código.

## Fechamento em curso — 2026-08-11

- A Homolog contém migrations aditivas até
  `20260823004000_phase3_immediate_notification_dispatch.sql` para avisos de
  reatribuição Client e Business, com envio imediato por `pg_net` e cron como
  contingência.
- O dispatcher `dispatch-business-notifications` foi publicado separado do
  dispatcher Client. As entregas observadas no fluxo real foram processadas
  uma única vez, sem erro registrado.
- A homologação manual em aparelhos Android físicos foi reportada pelo usuário
  como aprovada para o fluxo móvel completo, notificações no aplicativo e push
  da reatribuição. Essa evidência é classificada como validação física
  assistida, separada dos testes automatizados.
- A consulta remota dos casos mais recentes confirmou dois fluxos em
  `ready_to_apply`, com `accept_replacement`, proposta preservada, profissional
  anterior ainda vigente e nenhum evento `reassignment.applied`. Esse é o
  contrato esperado: o aceite do cliente não substitui a aplicação autorizada
  pelo estabelecimento.
- O Business agora destaca a reatribuição ativa no próprio atendimento e leva
  o operador para `Revisar e aplicar troca aceita`. O Client diferencia
  `Profissional atual` de `Substituto aceito (aguardando aplicação)`.
- A reconstrução descartável aplicou a cadeia completa até `20260823004000`;
  o teste SQL da Fase 3, DB lint e advisors locais passaram sem erros.
- Typechecks compartilhado, Client, Business e Control, lints, bundles Web e
  45 testes focados passaram localmente. O baseline com JWT real e TOTP também
  aprovou isolamento, revogação, decisão do cliente, aplicação e acesso direto
  negado às tabelas.
- Os advisors remotos de segurança e desempenho passaram no nível `error`. A
  consulta de observabilidade confirmou dois crons ativos, a função de disparo
  imediato, triggers Client/Business ativos e o enqueue de reatribuição
  Business presente.
- A auditoria final encontrou drift remoto nos grants de cinco RPCs internos do
  dispatcher Client, que estavam executáveis por `anon` e `authenticated`. A
  migration aditiva
  `20260811050241_phase3_harden_client_push_delivery_grants.sql` restaurou o
  contrato `service_role`-only em Homolog. O reset integral, o teste SQL G14,
  DB lint e advisors locais no nível `error` passaram após o hardening; o
  advisor remoto deixou de reportar essas cinco funções.
- O workflow da Fase 3 foi ampliado para incluir o contrato de notificações
  Business e para disparar quando o dispatcher for alterado.
- As builds Preview Android finais terminaram com sucesso: Business
  `bb8b6475-4f18-4473-89bc-9adb02b44c83` e Client
  `0a7f8877-1a76-417e-93ce-86908ef3ff02`.
- Os APKs foram enviados ao EAS a partir do workspace consolidado antes da
  criação do commit final. Por isso o EAS registra `681c360` como `gitCommitHash`,
  enquanto o código equivalente foi consolidado e verificado pelo CI no commit
  `f8146b0`. Essa limitação de proveniência foi aceita para este gate e não deve
  ser repetida em artefatos de produção.

### Critérios concluídos

- workflow G14 verde no commit consolidado;
- APKs finais Business e Client concluídos;
- fluxo móvel de solicitação, proposta, decisão do cliente e aplicação aprovado;
- profissional atual e substituto aceito apresentados como estados distintos
  até a aplicação server-side;
- notificações internas e push aprovados para as partes envolvidas;
- deep links, replay e idempotência cobertos pela combinação de aparelho,
  emulador, SQL, unitários e harness Homolog;
- aprovação explícita do responsável pelo produto registrada em 2026-08-11;
- hardening dos RPCs internos Client aplicado e validado localmente e em
  Homolog, e reproduzido no CI da PR.

## Evidência em Homolog

- Projeto alvo confirmado: `sphbbqdgcreowxzjgibj`.
- Backup pré-rollout salvo fora do repositório em
  `C:\Users\PICHAU\AppData\Local\CutSync\backups\phase3-20260809-174054`.
- Checksums SHA-256: dados
  `631A94F8A358A0B7550C31EA1BE1B01E7CD30D1CCDE152DB14796621997F7A6C`,
  roles `168A95A9C745AF5ED4679751F90419AC9DC434240A213B03E32A06D5664C2308`
  e schema
  `C39CE84538E7E42C6AC298F2A4E9A23CBAFDEC1D4C94831F50DEDD0BA54A93B1`.
- Doze migrations aditivas das Fases 1–3 foram aplicadas; o histórico remoto
  passou a incluir versões até `20260823001000`.
- `supabase db lint` remoto terminou sem erros. Permanecem três avisos de
  variáveis SQL não utilizadas, sem alteração de autorização ou resultado.
- Harness técnico PostgREST com usuário temporário, sessão autenticada e limpeza
  posterior validou `get_my_authorized_contexts`,
  `get_my_business_operational_contexts` e `set_my_active_context`, todos com
  HTTP 200 e read models aceitos.
- O harness reproduzível `npm run test:g14:homolog -- sphbbqdgcreowxzjgibj`
  criou 11 atores Auth efêmeros e duas unidades isoladas, sem imprimir
  credenciais. A execução `17c36919`, correlação
  `2c49cec1-915d-4176-a5ca-975835d942d7`, aprovou matriz de papéis e
  capabilities, paridade de contextos, isolamento cross-unit, negação de
  comandos adulterados, idempotência, timeline Business/Client, proteção das
  tabelas e fila push idempotente. A limpeza das fixtures foi aprovada.

## Evidência Android

- A incompatibilidade nativa `EventEmitter` foi eliminada alinhando Expo SDK 57
  e React Native `0.86.2` no monorepo; `npm ls` confirmou uma única versão.
- O Business foi recompilado e instalado com sucesso em emulador Android 16.
- A tela de login renderizou sem erro nativo após reiniciar o Metro.
- A falha de contexto foi reproduzida e corrigida em duas causas locais: a RPC
  era invocada sem preservar o binding do cliente Supabase e o Hermes não
  oferecia `crypto.getRandomValues` ao gerador compartilhado de `requestId`.
- Business e Client agora usam `expo-crypto` `~57.0.1` para UUID v4 nativo. O
  APK Business foi recompilado, reinstalado sem limpar seus dados e confirmou
  `expo-crypto (57.0.1)` no build.
- A conta real já existente no emulador Android passou da tela de contexto e
  chegou a `Hoje na operação`. A execução integrada `17c36919` registrou
  `androidAuthentication=current-session-passed` e preservou a sessão.
- O validador diferencia autenticação Android de deep links: no modo de sessão
  atual ele registra `androidDeepLinks=not-executed-current-session`, sem
  promover evidência não executada.
- O carregamento das rotas protegidas agora aguarda tanto a restauração da
  sessão quanto a resolução do contexto operacional. Isso eliminou o redirecionamento
  prematuro para a seleção de estabelecimento durante cold start.
- O APK técnico release `com.cutsync.business.g14`, limitado a `x86_64` para o
  emulador, executou o cenário autorizado na Homolog. A execução `2ea1eef7`,
  correlação `0471938d-bdc5-491d-bb1c-5275edc21373`, aprovou autenticação da
  sessão owner, contexto de gestão, deep link dinâmico da decisão em cold start,
  background e foreground, e paridade do `correlationId` na timeline.
- A abertura estática de `cutsync-business:///clients` em cold start também
  chegou diretamente ao CRM, sem cair em `Hoje` ou na seleção de unidade.
- A fixture técnica ficou restrita ao estabelecimento autorizado selecionado;
  `ANDROID_AUTHORIZED_FIXTURE_CLEANUP=PASS` confirmou a limpeza e a restauração
  das flags após o ensaio. Capturas foram mantidas fora do repositório em
  `%LOCALAPPDATA%\CutSync\g14`.
- O APK Client anteriormente instalado apontava para outro projeto Supabase e,
  portanto, não podia autenticar contas da Homolog. O bundle foi diagnosticado
  sem expor chaves, reconstruído com o ambiente Development validado e reinstalado
  como versão `0.2.0`, `x86_64`, contendo o project ref da Homolog.
- A execução Client `43e0d0a5`, correlação
  `a90ba1fb-6339-48cf-b0bf-58566b426e6c`, aprovou sessão JWT real do cliente
  técnico, deep link `cutsync:///appointments/{appointmentId}` em cold start,
  background e foreground, paridade da timeline/correlação e limpeza integral
  das fixtures (`FIXTURE_CLEANUP=PASS`). O harness também limpa a sessão local
  efêmera após remover o usuário remoto, evitando deixar uma conta técnica
  inválida aberta no emulador.
- `expo-doctor` aprovou 19 de 20 verificações; o único aviso corresponde ao
  diretório Android gerado localmente e não versionado.

### Solicitação de reatribuição pelo Business — 2026-08-10

- O detalhe autorizado do agendamento passou a expor `updatedAt`, usado como
  versão otimista por `request_appointment_reassignment`; o aplicativo não lê
  `appointments` diretamente.
- O botão `Solicitar reatribuição` só é apresentado com contexto `full`,
  capability confirmada pelo backend, responsabilidade elegível, atendimento
  futuro e status `pending` ou `confirmed`.
- O alerta de confirmação registra explicitamente que a troca não é aplicada
  naquele momento. A ação cria a solicitação server-side com `requestId`,
  `correlationId`, prazo e versão esperada, e navega para o detalhe confirmado.
- Typecheck compartilhado e Business, além do lint Business, passaram. Os testes
  focados desta fatia passaram com `24/24` cenários.
- O reset reconciliado completo aplicou a cadeia até `20260823001000`. O teste
  SQL transacional confirmou o mesmo `updatedAt`, execução negada a `anon`,
  execução concedida a `authenticated` e o fluxo de decisão existente.
- A migration `20260823001000_phase3_business_reassignment_request_ui.sql` foi
  aplicada na Homolog. A versão cronológica criada automaticamente pela API foi
  removida do histórico e `20260823001000` foi marcada como aplicada, com a
  função já validada e sem reexecutar DDL.
- No emulador Android, uma sessão owner existente abriu por deep link um
  atendimento técnico futuro, exibiu o botão, criou a solicitação por
  `operational_change` e navegou para `business-decision-detail-screen` em
  `requested`, versão 1. A correlação exibida na timeline coincidiu com a linha
  e o evento persistidos no backend.
- A fixture foi removida integralmente e
  `appointment_reassignment_enabled=false` foi restaurada. Capturas ficaram
  fora do repositório em `%LOCALAPPDATA%\CutSync\g14-runtime`; hashes SHA-256:
  `2C11C744AED77EBFD726D80585D9AF1AA48004CBB26BE2C86A4948AEEBA70273`
  e `272E102343E4A2C6E5DCD0108BF7ADF56EA64563204421DE11E9E9981A2C2DD3`.
- A solicitação agora é persistida no SecureStore antes da RPC. O outbox é
  isolado por usuário e unidade, aceita somente payloads conhecidos, preserva
  `requestId`/`correlationId`, serializa replay e classifica rede, conflito e
  revisão manual. A RPC possui timeout de 12 segundos; resposta tardia e replay
  continuam seguros pela idempotência server-side.
- No ensaio offline, a rede do emulador foi removida após o detalhe estar
  carregado, a solicitação foi iniciada e o processo foi encerrado durante a
  chamada. Com a rede restaurada, a reabertura do mesmo deep link recuperou o
  outbox e navegou para a decisão confirmada. O backend registrou exatamente uma
  solicitação `requested/v1` e um evento. A fixture foi removida, a flag voltou
  a `false` e a conectividade do emulador foi restaurada. Captura SHA-256:
  `BB02989F56EB4BA13794DB545C730DE6A55524F1A0A57814A3FA230083C39997`.

As evidências local, CI, matriz remota com papéis reais e autenticação/contexto
no emulador Android estão confirmadas. Os deep links de Business e Client nos
três estados e a retomada offline da solicitação Business após reinício estão
homologados. A validação assistida em aparelhos físicos aprovou as alterações
móveis, o fluxo de decisão, as notificações internas e o push. Com a repetição
verde do Phase 2 Gate registrada, não há pendência bloqueadora para G14.

## Aprovação

G14 foi aprovado em 2026-08-11 com as seguintes evidências:

- workflow G14 verde na PR `#33`, commit `1a8f0fb`;
- homologação com cliente, profissional, manager/admin e usuário sem vínculo;
- aparelhos Android físicos aprovados para o fluxo móvel e notificações;
- replay/idempotência comprovados por ensaio Android e testes server-side;
- timeline e `correlationId` protegidos pelos read models compartilhados e
  confirmados no harness Homolog;
- backend Homolog com migration `20260823004000`, dois crons de contingência,
  disparo imediato e triggers Client/Business ativos;
- aprovação explícita registrada, mantendo a limitação de proveniência EAS
  descrita neste documento.

**Decisão:** Gate G14 aprovado. A Fase 3 está concluída e a PR `#33` pode seguir
para merge, desde que os checks obrigatórios deste commit documental também
permaneçam verdes.
