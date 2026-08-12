# Fase 4 — POS manual

Estado: **Fatias 1 a 3 implementadas localmente, fundação da Fatia 4
homologada no banco, matriz JWT da Fatia 5 aprovada em Homolog e APK local da
Fatia 6 validado; Gate G7 ainda não aprovado**.

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

- reset completo até `20260824000000_phase4_manual_pos_foundation.sql`;
- `supabase/tests/phase4_manual_pos.sql` verde;
- lint do schema público sem erros;
- advisors de segurança e performance sem erros;
- typechecks de packages compartilhados, Business e Web verdes;
- lint de Business e Web sem erros (avisos preexistentes do Web preservados);
- teste concorrente confirmado com `1` entry, `6000` centavos e um único avanço
  de versão;
- 15 testes unitários de contratos, mappers, API, outbox e superfícies
  verdes.

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
- Android com papéis reais;
- desligamento real de rede e replay após reinício em Android físico;
- execução do workflow em PR;
- aprovação do Gate G7.

## Preparação de CI e build física

- `.github/workflows/phase4-gate.yml` reproduz banco descartável, SQL,
  concorrência, contratos, binding RPC, outbox, typechecks, lint e bundles;
- o workflow registra no summary a classificação e os limites da evidência;
- o Supabase local é encerrado mesmo quando uma etapa falha;
- `apps/business/.eas/workflows/phase4-g7-preview.yml` gera manualmente uma
  APK Preview com o environment `preview` e apresenta o checklist físico;
- o workflow EAS passou no validador de schema oficial em 11/08/2026;
- o workflow GitHub teve o YAML parseado localmente e sua matriz foi
  reproduzida com sucesso: reset, SQL/RLS, concorrência, advisors, typechecks,
  testes, lint e bundles;
- o workflow EAS é manual para evitar consumo involuntário de minutos.

## Próxima fatia

1. executar o workflow da Fase 4 em PR e registrar a evidência de CI;
2. disparar manualmente a EAS Preview da branch aprovada;
3. homologar owner, cashier, finance, professional e usuário sem vínculo no
   Android/Web — backend com JWT real concluído; superfícies físicas pendentes;
4. validar desligamento de rede, encerramento do app e replay no Android;
5. reunir as evidências e decidir explicitamente o Gate G7.
