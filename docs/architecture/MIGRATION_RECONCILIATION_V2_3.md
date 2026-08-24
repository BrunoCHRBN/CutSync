# Reconciliação de migrations v2.3

Data da coleta: 2026-08-24
Base Git: `origin/master` em `2fb11e5`
Branch local isolada: `codex/supabase-drift-reconciliation`
Head versionado da PR #37: `6dc7de3`

## Resultado

A fonte Git foi reconciliada localmente com os ledgers e objetos materializados
de Homolog e Produção. A sequência executável não possui mais versões
duplicadas, recupera `20260824013000`–`20260824021000` e adiciona o hardening
aditivo `20260824022000`. A correção subsequente
`20260824190722_control_access_idempotency_and_event_hardening.sql` permanece
aditiva e fica ordenada antes de `20260825000000`.

Os ambientes remotos foram apenas inspecionados. Não houve `migration repair`,
`db push` efetivo ou DDL remoto. O baseline foi versionado na PR #37; a
`190722` e as validações desta rodada ainda estão somente no worktree local.

Homolog e Produção continuam sendo gates independentes. A última coleta remota,
anterior à `190722`, provou que não existe uma promoção única segura para os
dois ambientes:

| Ambiente | Ledger atual | Pendências comprovadas |
| --- | --- | --- |
| Homolog `sphbbqdgcreowxzjgibj` | contém `13000`–`21000`; não contém `22000`, `190722` nem `25000` | `22000`, `190722` e `25000` |
| Produção `hxoenfnszrrgaqxplzmd` | contém `25000`; não contém `13000`–`22000` nem `190722` | `13000`–`190722`, inseridas antes da última versão remota |

`20260826000000`, da Fatia 1 financeira, permanece fora desta branch e fora
desta reconciliação.

## Invariantes de segurança

1. Não executar `db push --include-all` enquanto qualquer arquivo aposentado
   `060/070/110` aparecer como pendente.
2. Não criar uma entrada `20260811000000`: suas intenções já estão registradas
   como `20260808041248` e `20260808041253`.
3. Não usar `migration repair` para esconder ausência de fonte local. O comando
   altera o ledger, não os objetos, grants ou RLS.
4. Não promover `22000`, `190722`, `25000` e `26000` como um lote implícito.
5. Não promover `13000`–`190722` em Produção sem ensaio específico do lote
   histórico, janela controlada e autorização separada.
6. Não reescrever `13000`–`21000`: essas versões já existem em Homolog. Toda
   correção deve ser uma migration posterior.

Referências operacionais oficiais:

- [Supabase migration repair](https://supabase.com/docs/reference/cli/supabase-migration-repair)
- [Supabase db push](https://supabase.com/docs/reference/cli/supabase-db-push)
- [Supabase migration fetch](https://supabase.com/docs/reference/cli/supabase-migration-fetch)

## Colisões históricas resolvidas

O diretório executável continha dois arquivos `20260806000000`, dois
`20260807000000` e dois `20260811000000`. O ledger aceita uma única entrada por
versão. Os efeitos dos quatro arquivos não canônicos já estavam materializados
e foram preservados nas versões únicas abaixo:

| Intenção | Versão executável canônica |
| --- | --- |
| Discovery e geolocalização | `20260808041238` |
| Favoritos | `20260808041243` |
| Hardening de acesso | `20260808041248` |
| Snapshot de preço | `20260808041253` |

Permanecem canônicas nas versões originais:

- `20260806000000_android_business_operational_cycle.sql`;
- `20260807000000_establishment_client_enrichment.sql`.

Os arquivos colidentes foram retirados de `supabase/migrations`. Seus nomes,
commits-fonte, hashes normalizados em LF e substitutos estão preservados em
`supabase/migration_evidence/duplicate_versions/README.md`.

## Recuperação da fonte de Chamados

As fontes foram recuperadas por merge de três vias calculado contra
`origin/master` e materializadas no worktree isolado sem modificar o checkout
sujo de origem:

| Faixa | Commit-fonte | Estado local |
| --- | --- | --- |
| `20260824013000` | `b13ca25d7bd9339821ea0a44985ac521e5f51580` | recuperada com contratos, Control e testes |
| `20260824014000`–`20260824020000` | `3192f85e587fe638088b434e069a09af47109ed1` | recuperada com contratos, Control e testes |
| `20260824021000` | `5e761f6e5f94a13463f74274cb75c4ac6b69d252` | recuperada byte a byte; já materializada em Homolog |

`reset-supabase-reconciled.ps1` protege por SHA-256 normalizado:

- os dois históricos ativos;
- as quatro versões reconciliadas e as duas bridges `190000/190100`;
- todas as versões recuperadas `13000`–`21000`;
- os hardenings aditivos `22000` e `190722`.

O reset falha se uma duplicata aposentada retornar ao diretório executável ou
se qualquer fonte já aplicada em Homolog for reescrita.

## Hardening `20260824022000`

A auditoria da `21000` encontrou dois bloqueadores no estado já materializado
em Homolog:

1. `service_role` possuía escrita direta nas settings e no ledger, contornando
   AAL2, capability, versão, justificativa e auditoria;
2. `actor_profile_id ... ON DELETE SET NULL` tentava reescrever um ledger cujo
   trigger rejeita `UPDATE`, bloqueando o offboarding físico de forma implícita.

A migration `22000`:

- fixa ownership das tabelas e funções privilegiadas em `postgres`;
- revoga todos os privilégios diretos de `PUBLIC`, `anon`, `authenticated` e
  `service_role` nas duas tabelas;
- mantém somente getter e setter para `authenticated`;
- bloqueia `TRUNCATE`, inserts forjados e updates diretos por trigger;
- exige escritor `postgres`, `auth.uid()` presente e sessão AAL2;
- impede alteração de `singleton` e `created_at`;
- captura estado/versão anterior na mesma transação e confronta
  `previous_settings`, `expected_version`, `resulting_version` e estado final;
- troca os dois FKs de ator para `ON UPDATE/DELETE RESTRICT`, validados;
- normaliza o snapshot `actor_name` para 160 caracteres e a justificativa.

A segregação de funções não foi alterada silenciosamente. Hoje um SaaS Owner
AAL2 ainda solicita e efetiva a mudança. Uma futura regra de dupla aprovação é
decisão explícita de produto; uma proposta segura é manter desligamento de
emergência por um Owner e exigir aprovador distinto para habilitações.

## Hardening `20260824190722`

A revisão de concorrência e imutabilidade encontrou três lacunas residuais nas
fontes recuperadas:

1. duas criações com o mesmo `client_request_id` podiam passar pelo primeiro
   lookup simultaneamente e disputar a constraint única;
2. o replay do fluxo Control legado não comparava todos os campos semânticos e
   a decisão não comparava a justificativa normalizada;
3. `corporate_case_events` bloqueava `UPDATE` e `DELETE`, mas ainda não possuía
   trigger de `TRUNCATE` nem revogação final do acesso direto de `service_role`.

A migration `190722`:

- adquire `pg_advisory_xact_lock` por RPC e UUID antes do primeiro lookup das
  duas criações, fazendo o retry concorrente observar o vencedor em vez de
  vazar `unique_violation`;
- compara ator, beneficiário, ação, perfis solicitado/origem, validade,
  justificativa e ticket no replay legado;
- inclui a justificativa normalizada no contrato idempotente da decisão;
- persiste a versão esperada pela aprovação, rejeita comandos nulos e inclui a
  versão no fingerprint; o backfill usa a versão resultante do audit log e
  falha fechado quando não há evidência suficiente para reconstruir a ordem;
- mantém ownership explícito em `postgres` e ACLs de execução estreitas para
  as três RPCs `SECURITY DEFINER` substituídas;
- revoga todo acesso direto a `corporate_case_events` de `PUBLIC`, `anon`,
  `authenticated` e `service_role` e adiciona trigger `BEFORE TRUNCATE` por
  statement.

O arquivo é protegido no reset pelo SHA-256 normalizado em LF
`796831D6B7D027E4926025DF01350912BC5C02CE3A22AFB7C9AFEFCAAA19D2B9`.

## Ajustes de aplicação e CI

- o perfil `control.cases.configure` agora entra pela raiz `/chamados` e aterrissa
  em `/chamados/configuracao` quando não possui outra capacidade de casos;
- editar flags ou justificativa invalida e fecha uma confirmação já aberta;
- os tipos Supabase foram regenerados do banco descartável local;
- o cast amplo de `supabase.rpc` foi removido em favor dos contratos gerados;
- `generate-supabase-types.sh` aceita `SUPABASE_TYPES_LOCAL=true` sem alterar o
  modo remoto padrão;
- o Phase 1 Gate agora executa os oito SQL de Chamados, lint/advisors,
  concorrência real, typechecks, 140 testes unitários, lint e bundle Control;
- o monitor pós-integração de Homolog separa drift tipado de uma consulta de
  catálogo pela Management API read-only, cobrindo ledger, corpos, ACLs,
  ownership, colunas e triggers mesmo quando o hardening não altera tipos.

Os testes corporativos antigos também foram alinhados às regras posteriores:
ativam runtime somente pela RPC Owner/AAL2, usam helper temporário para
asserções white-box e materializam aprovadores elegíveis.

## Evidência local executada

As evidências originais da cadeia até `22000` foram repetidas na stack final
com a `190722`; os checks específicos da migration nova permanecem destacados.

- parser e hashes do reset: aprovados;
- 14 regressões unitárias focadas de hash, serialização, fingerprint, ACL e
  `TRUNCATE`: aprovadas;
- backfill exercitado sobre duas aprovações pré-migration: audit logs com
  versões resultantes `2,3` reconstruíram versões esperadas `1,2`; duas linhas
  sem evidência suficiente abortaram com `multiple_missing_ordinals`;
- SQL transacional da `190722`, todos os `corporate_*.sql` e concorrência em
  duas conexões: aprovados; o resultado `creates=1|1|1` inclui replay em nova
  transação depois de `target_valid_until`;
- replay Supabase descartável, sem seed, até `20260825000000`: aprovado;
- oito cenários SQL `corporate_*.sql`, em série e com rollback: aprovados;
- concorrência em duas conexões:
  - mesma chave: um ledger e versão `1|2`;
  - chaves distintas na mesma versão: uma vencedora, nenhuma linha perdedora e
    versão `1|0|3`;
- `supabase db lint --local --schema public --level error`: zero achados;
- advisors de segurança e desempenho no nível error: zero achados;
- `typecheck:shared` e `typecheck:control`: aprovados;
- seleção CI do Control: 140 testes aprovados;
- `lint:control`: aprovado;
- `build:control`: aprovado, incluindo `/chamados/configuracao`.

## Última evidência remota coletada

### Homolog

Na coleta anterior à criação da `190722`, o dry-run normal e `--include-all`
retornaram exatamente:

```text
20260824022000_corporate_case_runtime_hardening.sql
20260825000000_phase5_cash_operations.sql
```

Um dump somente de schema confirmou que `25000` não é apenas uma lacuna do
ledger: estão ausentes `cash_registers`, `cash_sessions`, `cash_movements`,
`cash_session_events`, as cinco RPCs de caixa e os dois triggers principais.
Logo, `25000` é promoção funcional pendente e não deve ser marcada como aplicada
por `migration repair`.

A `190722` ainda não participou de uma nova inspeção remota nesta rodada. O
próximo dry-run deve tratá-la como pendência adicional entre `22000` e `25000`.

### Produção

Na coleta anterior à `190722`, o ledger continha `20260825000000`, mas não
`13000`–`22000`. O dry-run normal falhou corretamente com
`LegacyDbPushMissingRemoteError` e o `--include-all` listou:

```text
20260824013000 20260824014000 20260824015000
20260824016000 20260824017000 20260824018000
20260824019000 20260824020000 20260824021000
20260824022000
```

Esse resultado não autoriza executar `--include-all`; apenas caracteriza a
ordem divergente do ledger produtivo. Uma nova coleta deve também listar a
`190722` antes de qualquer decisão de promoção.

## Gates restantes

### G1 — revisar e integrar a reconciliação

O baseline está na PR #37. Revisar o delta local da `190722`, testes e CI antes
de qualquer novo stage, commit ou push.

### G2 — promover somente o par `22000` + `190722` em Homolog

Após integração e autorização remota específica, preparar um artefato/worktree
que contenha `22000` e `190722` como únicas pendências, nessa ordem. O push
genérico da branch atual também aplicaria `25000` e não é aceitável como
hardening isolado.

Antes da janela, executar a pré-verificação read-only das aprovações legadas e
seus audit logs. Qualquer fingerprint ambíguo deve bloquear a promoção para
reconciliação explícita, sem ordenar registros por timestamp ou UUID.

Validar depois da promoção: ACLs, ownership, FKs, triggers, Owner AAL2, Editor,
Owner AAL1, idempotência e concorrência.

### G3 — decidir e homologar `25000` separadamente

Caixa ainda não existe em Homolog. A promoção requer seu próprio gate funcional
e testes de papéis reais. Não usar `migration repair`.

### G4 — integrar e rebasear a Fatia 1 financeira

Após a reconciliação entrar em `master`, rebasear a branch da PR #36 e manter
`20260826000000` isolada. Um push dessa fatia antes de G2/G3 agregaria pendências
anteriores de forma implícita.

### G5 — planejar Produção separadamente

Produção exige um ensaio do lote histórico `13000`–`190722`, incluindo a
transição `21000` → `22000` → `190722`, homologação autenticada e rollback.
Só então solicitar autorização específica para a janela produtiva.

## Pendências de produto fora da reconciliação

- `automation_enabled` e `legacy_redirects_enabled` ainda não têm consumidores
  operacionais completos;
- dupla aprovação para alterações críticas ainda depende de decisão de produto;
- Homolog precisa de validação autenticada com identidades reais antes de
  qualquer promoção produtiva;
- o grant SQL residual de `authenticated` em
  `client_favorite_establishments` continua bloqueado por RLS, mas deve ser
  removido por uma migration futura aditiva.
