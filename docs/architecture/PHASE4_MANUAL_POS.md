# Fase 4 — POS manual

Estado: **implementação funcional concluída, matriz JWT/AAL2 aprovada em
Homolog e superfícies Web/Android validadas pelo operador; Gate G7 em
pré-fechamento, aguardando apenas CI no HEAD corretivo**.

## Escopo desta fatia

A fundação do POS manual estende a comanda existente sem misturar seus estados:

- `service_orders.status` continua exclusivamente operacional;
- a situação financeira é reconstruída por `order_payment_entries`;
- todo dinheiro novo atravessa contratos em centavos inteiros e `BRL`;
- `cash`, `external_pix` e `external_card` são operações declaradas;
- void cria lançamento compensatório e preserva o original;
- pagamento, void e fechamento usam `requestId`, `expectedVersion` e lock;
- tabelas ficam sem acesso direto de `anon` e `authenticated`;
- nenhum objeto `billing_*`, Stripe, caixa, comissão, refund ou fiscal é reutilizado.

## Contratos server-side

Tabelas:

- `establishment_payment_methods`
- `order_payment_entries`
- `order_payment_events`

RPCs:

- `list_establishment_payment_methods`
- `configure_establishment_payment_method`
- `record_order_payment`
- `void_order_payment`
- `get_service_order_payment_summary`
- `close_service_order` reconciliado com o saldo calculado

O read model de resumo retorna `paymentStatus`, totais, saldo, versão, corte dos
dados, correlação e a sequência completa de entries. Nesta fatia, os estados
atingíveis são `unpaid`, `partially_paid` e `paid`; estados de refund permanecem
reservados para a Fase 6.

## Autorização

- listar/resumir: `view_payments`/acesso de leitura da comanda;
- configurar método: `manage_operational_settings`;
- registrar: `take_payments`;
- estornar lançamento manual: `void_payments` e AAL2;
- fechar: autoridade existente sobre a comanda e saldo zero.

O flag `establishments.financial_ops_enabled` continua `false` por default e é
verificado por todos os RPCs públicos da fatia.

## Superfícies entregues na Fatia 2

Business:

- a Gestão permite configurar dinheiro, PIX externo e maquininha por
  `manage_operational_settings`, com versão, idempotência e confirmação do
  servidor;
- quando a comanda não encontra meios ativos, oferece acesso direto a essa
  configuração no próprio Business;
- a comanda em `awaiting_payment` apresenta total produzido, valor recebido e
  saldo como dimensões distintas;
- pagamentos parciais e mistos são registrados como entries independentes;
- método, valor e referência são enviados apenas por RPC e a confirmação só é
  exibida depois da resposta do servidor;
- void exige capability, motivo e AAL2 no backend, criando compensação;
- fechamento só é oferecido com saldo calculado igual a zero e permanece
  protegido por versão e lock no servidor;
- uma falha de rede preserva o mesmo `requestId` enquanto a tela permanece
  montada, permitindo replay idempotente sem afirmar sucesso local.

Web:

- a seção de meios de pagamento permite configurar dinheiro, PIX externo e
  cartão externo por capability;
- o detalhe do atendimento permite registrar pagamentos parciais e mistos,
  consultar a timeline de lançamentos e fechar a comanda somente após saldo
  zero confirmado pelo backend;
- estorno manual cria compensação, exige `void_payments` na apresentação e
  continua protegido por AAL2 no RPC;
- a interface falha fechada quando `financial_ops_enabled` está desligado;
- conflitos de versão recarregam o read model antes de apresentar o resultado;
- a cópia e os contratos mantêm POS manual separado de `billing_*` e Stripe.

Nenhuma das duas superfícies acessa diretamente as tabelas do ledger.

## Resiliência e concorrência entregues na Fatia 3

- `record_payment`, `void_payment` e `close_service_order` usam uma outbox
  persistida no armazenamento seguro do Business e isolada por usuário;
- o payload persistido é validado de forma fail-closed, limitado a 20 comandos
  e descartado depois de sete dias;
- o replay preserva o `requestId` original após reinício, retorno ao foreground
  ou nova abertura da tela;
- falha de rede mantém `offline_pending`; conflito remove o comando local e
  exige nova leitura; erro desconhecido permanece em `manual_review`;
- enquanto existir operação pendente ou em revisão, novas mutações financeiras
  da comanda ficam bloqueadas na apresentação e continuam protegidas no backend;
- o teste `scripts/validate-phase4-concurrency.mjs` usa duas sessões PostgreSQL
  físicas: uma mantém o lock da comanda e a concorrente falha por versão, sem
  duplicar o ledger.

## Evidência local

Executado em banco descartável criado por
`scripts/reset-supabase-reconciled.ps1`, preservando migrations históricas
duplicadas:

- reset reconciliado completo, incluindo as migrations aditivas de acesso ao
  resumo financeiro;
- `supabase/tests/phase4_manual_pos.sql` verde;
- lint do schema público sem erros;
- advisors de segurança e performance sem erros;
- typechecks de packages compartilhados, Business e Web verdes;
- lint de Business e Web sem erros (avisos preexistentes do Web preservados);
- teste concorrente confirmado com `1` entry, `6000` centavos e um único avanço
  de versão;
- 54 testes unitários focados de contratos, mappers, API, outbox, reatribuição
  e superfícies verdes.

Em 12/08/2026, a reprodução local foi renovada após a inclusão da operação Web:

- registro de recebimento parcial ou misto usa os métodos ativos retornados
  pelo backend e envia `requestId` e `expectedVersion`;
- timeline financeira apresenta os lançamentos confirmados sem consultar nem
  editar tabelas diretamente;
- estorno exige motivo e permanece sujeito a AAL2/capability no RPC;
- fechamento só é oferecido com saldo calculado igual a zero e continua sendo
  revalidado pelo backend;
- SQL/RLS, concorrência física (`1|6000|4`), lint do schema, advisors de
  segurança/performance e bundle Web passaram no banco descartável.

## Evidência Android local da Fatia 6

Em 11/08/2026, uma build local release do Business foi instalada via ADB no
emulador Android `x86_64`, apontando para CutSync Homolog. Um fixture técnico
descartável, sem credenciais no repositório, comprovou:

- login e contexto owner/admin;
- abertura da comanda `awaiting_payment` com produção de R$ 100,00;
- método manual `Dinheiro` vindo do backend;
- lançamento confirmado de R$ 40,00;
- avanço da versão da comanda de 3 para 4;
- situação calculada `partially_paid`, recebido R$ 40,00 e saldo R$ 60,00;
- remoção posterior de usuários, unidade, atendimento, ledger e estado local
  do fixture.

A validação revelou um defeito que não aparecia nos mocks: os adaptadores de
service order e POS destacavam `client.rpc` da instância Supabase. Como o SDK
usa `this.rest.rpc`, a chamada falhava antes de alcançar o backend. Os dois
adaptadores agora preservam o receiver com `bind(client)`, e testes de regressão
com um método dependente de `this` protegem o contrato.

Artefato local de evidência, restrito ao emulador `x86_64`:

- caminho: `apps/business/android/app/build/outputs/apk/release/app-release.apk`;
- SHA-256: `6E7CCFB9ACF6BCBC04E0E066AA930F93013001007999D948E63672B51A1CB2D5`.

A compilação multi-ABI local encontrou o limite de caminho do CMake no
Windows/OneDrive em `armeabi-v7a`. A build EAS Preview continua obrigatória
para a homologação em Android físico ARM.

## Evidência Android Preview da configuração operacional

Em 12/08/2026, a Preview APK Business build 3 foi gerada pelo EAS para CutSync
Homolog e inspecionada antes da instalação:

- build EAS `1ac26a0e-8628-4b99-abc3-391e5d634497`;
- pacote `com.cutsync.business`, `versionCode=3`;
- SHA-256
  `679B98407EDFDE8234C6B217E5D64FC362984C31E1F7E249280E7DD098186AC8`;
- bundle confirmado com a rota de meios de pagamento, acesso direto pela
  comanda e RPC `configure_establishment_payment_method`;
- validação informada pelo operador em dispositivo: configuração de meios de
  pagamento pelo Business executada com sucesso e fluxo disponibilizado na
  comanda.

Essa evidência comprova a superfície owner/admin validada pelo operador. Não
substitui a matriz física restante de cashier, finance, professional, usuário
sem vínculo e replay após reinício sem rede.

## Evidência remota da Fatia 4

Projeto: CutSync Homolog (`sphbbqdgcreowxzjgibj`).

- backup de schema `public,auth` criado antes da escrita em
  `C:\Users\PICHAU\AppData\Local\CutSync\backups\phase4-20260811-122514`;
- `homolog-schema.sql`: SHA-256
  `2D1E2F889EC4CD2B876374995F1E14FD7639D5B3587A3445D5688193FFBEEF90`;
- `homolog-roles.sql`: SHA-256
  `168A95A9C745AF5ED4679751F90419AC9DC434240A213B03E32A06D5664C2308`;
- dry-run executado em workspace temporário reconciliado, apontando somente
  `20260824000000_phase4_manual_pos_foundation.sql`;
- migration aplicada e confirmada no histórico remoto como
  `20260824000000 / phase4_manual_pos_foundation`;
- tabelas, RLS, grants e RPCs da fatia confirmados no schema remoto;
- `supabase/tests/phase4_manual_pos.sql` executado remotamente dentro de
  transação com `ROLLBACK`, sem falhas de assertion;
- `anon` não executa `record_order_payment`; `authenticated` executa o RPC,
  mas não possui `SELECT` ou `INSERT` direto no ledger;
- nenhum FK para `billing_*` foi introduzido;
- advisors não reportaram erro ou aviso específico da Fase 4. Os avisos
  informativos de RLS sem policy são intencionais: as tabelas estão fechadas
  para os apps e são acessadas apenas por RPC;
- o CLI emitiu timeout apenas ao atualizar o cache de catálogo pós-aplicação;
  histórico, objetos e testes remotos foram reconsultados e confirmados;
- estado residual: zero unidades com `financial_ops_enabled`, zero métodos,
  entries, eventos, usuários técnicos e unidades técnicas da validação.

## Evidência remota da Fatia 5

O harness `scripts/validate-phase4-homolog-jwt.mjs` cria atores técnicos
descartáveis, usa sessões reais do Supabase Auth e sempre executa cleanup. A
execução em CutSync Homolog confirmou:

- JWTs reais de owner, admin, cashier, finance, professional e usuário sem
  vínculo;
- matriz de capabilities do POS e negação de outsider/cross-unit;
- `financial_ops_enabled=false` falhando de forma fechada;
- pagamento parcial e replay com o mesmo `requestId`, sem duplicar entry;
- finance e professional impedidos de registrar pagamento;
- void recusado em AAL1 e autorizado somente após TOTP real elevar a sessão a
  AAL2;
- void como lançamento compensatório e reconstrução do ledger com três
  entries;
- fechamento somente depois de saldo zero;
- tabelas protegidas contra leitura direta pelo app.

A homologação revelou que `finance` possuía `view_payments`, mas o resumo ainda
usava o guard legado da comanda. A correção foi feita sem reescrever migration
aplicada:

- `20260824001000_phase4_payment_summary_finance_access.sql` introduziu um
  guard de leitura financeira específico;
- `20260824002000_phase4_payment_summary_capability_scope.sql` removeu a
  decisão por nome de role e consolidou o escopo por capabilities efetivas;
- acesso de equipe exige `view_payments + view_orders` e
  `manage_team_orders` ou `view_financial_reports`;
- acesso do profissional exige `manage_own_orders` e correspondência com o
  executor da comanda.

As duas migrations foram criadas pelo CLI, validadas primeiro no banco
descartável e aplicadas por dry-run reconciliado. O cache de catálogo do CLI
voltou a expirar depois do apply; histórico, função efetiva e harness foram
reconsultados com sucesso. Advisors remotos de segurança e performance não
reportaram erros. Estado residual final: zero fixtures G7, zero unidades com a
flag habilitada e zero entries.

Não executado ou ainda não aprovado nesta fatia:

- aplicação em produção;
- execução verde do workflow no HEAD que contém a reconciliação aditiva dos
  read models de UI/UX;
- aprovação do Gate G7.

## Renovação de evidência para fechamento

Em 12/08/2026, após a validação funcional informada pelo operador em Web e
Android, a matriz automatizada foi executada novamente:

- banco descartável reconstruído com a sequência completa de migrations;
- suítes `phase4_manual_pos.sql`, `service_order_operational_date.sql`,
  `phase3_business_decision_read_models.sql` e
  `ui_ux_experience_read_models.sql` verdes;
- concorrência física confirmada como `1|6000|4`;
- lint e advisors locais de segurança/performance sem erros;
- typechecks Shared/Business, 54 testes unitários, lint e bundles Web/Business
  verdes;
- harness remoto verde em Homolog para owner, admin, cashier, finance,
  professional e outsider, com JWT real, TOTP/AAL2, isolamento cross-unit,
  replay idempotente, void compensatório, reconstrução e fechamento;
- cleanup remoto concluído (`FIXTURE_CLEANUP=PASS`);
- advisors remotos sem achados de nível erro; avisos globais preexistentes
  permanecem fora do escopo do G7.

O operador também confirmou em dispositivo físico os caminhos mobile do POS,
incluindo persistência e replay sem duplicação após indisponibilidade de rede e
reinício do aplicativo. Essa evidência é classificada como homologação física
informada pelo operador e complementa a matriz automatizada de backend.

O workflow da PR falhou depois que uma fatia posterior de UI/UX introduziu uma
referência a `profiles.profile_slug` e concatenação escalar em arrays. A
migration aditiva `20260812191333_reconcile_ui_ux_experience_read_models.sql`
corrige os dois contratos sem alterar migration potencialmente aplicada. O
workflow agora também executa a suíte de regressão desses read models.

## Preparação de CI e build física

- `.github/workflows/phase4-gate.yml` reproduz banco descartável, SQL,
  concorrência, contratos, binding RPC, outbox, typechecks Shared/Business,
  lint e bundles Web/Business;
- o workflow registra no summary a classificação e os limites da evidência;
- o Supabase local é encerrado mesmo quando uma etapa falha;
- `apps/business/.eas/workflows/phase4-g7-preview.yml` gera manualmente uma
  APK Preview com o environment `preview` e apresenta o checklist físico;
- o workflow EAS passou no validador de schema oficial em 11/08/2026;
- o workflow GitHub teve o YAML parseado localmente e sua matriz foi
  reproduzida localmente com sucesso: reset, SQL/RLS, concorrência, advisors,
  typechecks, testes, lint e bundles;
- o typecheck Web global não integra o gate específico porque o checkout limpo
  ainda possui erros preexistentes de tipagem de `Pressable.hovered`; a
  superfície alterada continua coberta por lint e bundle Web em instalação
  limpa;
- o workflow EAS é manual para evitar consumo involuntário de minutos.

## Pendências para decisão do Gate G7

1. consolidar a migration corretiva, a cobertura do workflow e este registro
   em commit focado, então executar o workflow da Fase 4 na PR #34;
2. registrar o resultado do CI e decidir explicitamente o Gate G7.
