# Clientes por estabelecimento — plano de consolidação

Status: etapas 1 a 3 implementadas; etapas 4 a 7 planejadas

Data da verificação: 2026-08-01

Documento irmão: [`DATA_IMPORT_MIGRATION_PLAN.md`](./DATA_IMPORT_MIGRATION_PLAN.md)

## 1. Objetivo

Consolidar o domínio de clientes por estabelecimento como base única para agenda,
atendimento e migração entre plataformas, garantindo que:

- o estabelecimento possua uma carteira própria, independente de conta CutSync;
- o cliente autenticado seja reconhecido na unidade sem duplicar registros;
- nenhum cliente importado gere usuário, senha ou consentimento promocional automático;
- agendamentos novos e antigos possam ser atribuídos a um cliente da unidade;
- o motor de importação tenha onde escrever sem inventar entidades.

## 2. Ponto de partida — o que já existe

A migration `supabase/migrations/20260806000000_android_business_operational_cycle.sql`
já entregou boa parte da fundação. O plano abaixo é de **consolidação**, não de
criação do zero.

### 2.1 Já implementado

| Item | Situação |
| --- | --- |
| Tabela `establishment_clients` | Criada, com `display_name`, `phone`, `email`, `tags`, `notes`, `status` (`active`/`merged`), `merged_into_id`, autoria e timestamps |
| Índices de diretório | `establishment_clients_directory_idx`, `_phone_idx`, `_email_idx`, parciais em `status = 'active'` |
| Vínculo com perfil | Tabela `establishment_client_links` com `match_kind` (`confirmed_email`, `confirmed_phone`, `manual`), `status` (`pending`/`confirmed`/`rejected`), um confirmado por cliente e um perfil por unidade |
| Auditoria de unificação | `establishment_client_merge_events` |
| Coluna em agendamentos | `appointments.establishment_client_id` com trigger `enforce_appointment_establishment_client_tenant` |
| Capacidades | `view_clients` e `manage_clients` em `resolve_business_operational_capabilities` e em `packages/database/src/business.ts` |
| RPCs | `search_establishment_clients`, `get_establishment_client`, `create_establishment_client`, `update_establishment_client`, `merge_establishment_clients`, `queue_establishment_client_match`, `is_confirmed_establishment_client_match` |
| Criação implícita | `create_business_appointment` cria o cliente local quando recebe apenas nome/telefone |
| Business mobile | Telas de diretório, detalhe e criação de cliente já existem em `apps/business/src/screens/` |

### 2.2 Lacunas confirmadas

| Lacuna | Impacto |
| --- | --- |
| Sem `source`, `source_provider`, `external_id` | Importação não tem chave de idempotência; reprocessar arquivo duplica carteira |
| Sem `normalized_phone` / `normalized_email` | Duplicidade só é detectável por comparação exata; busca não tolera formatação |
| Sem `marketing_consent_status` / `marketing_consent_at` | Não há onde registrar `unknown` para cliente importado (exigência da Fase de LGPD) |
| Sem `first_appointment_at` / `last_appointment_at` | Diretório não mostra recorrência; prévia de importação não consegue priorizar cliente ativo |
| Sem estado `archived` | `status` só aceita `active` e `merged`; não há arquivamento reversível |
| Sem RPC de arquivamento | Diretório cresce indefinidamente |
| Sem `ensure_establishment_client_for_profile` | `create_client_appointment` → `create_appointment` grava `client_id` mas deixa `establishment_client_id` nulo: cliente que agenda pelo app não entra na carteira |
| Sem backfill | Agendamentos anteriores à migration não têm cliente local; a carteira nasce vazia mesmo em estabelecimento ativo |
| Web sem diretório | Somente o Business enxerga a carteira; o assistente de migração do Web não teria onde exibir resultado |
| Capacidades ausentes | Faltam `manage_data_imports` e `export_clients` |

### 2.3 Decisão de contrato mantida

O plano original propunha uma coluna `profile_id` diretamente em
`establishment_clients`. **Mantemos o modelo atual de `establishment_client_links`**,
que é mais forte: registra consentimento, origem do casamento, rejeição e histórico.
Uma coluna direta perderia a rejeição e permitiria vínculo silencioso por
coincidência de contato — exatamente o que a Fase de LGPD proíbe.

Modelo de identidade consolidado:

```text
profiles.id
  → identidade global autenticada

establishment_clients.id
  → relação comercial com a unidade

establishment_client_links
  → ponte consentida entre as duas, com estado e auditoria

appointments.client_name
  → snapshot textual, compatibilidade com registros antigos
```

## 3. Etapa 1 — Enriquecimento da tabela

Status: implementada em
`supabase/migrations/20260807000000_establishment_client_enrichment.sql`,
`packages/domain/src/establishment-client.ts`,
`packages/validation/src/establishment-client.ts` e
`supabase/tests/establishment_client_enrichment.sql`.

Validação executada: `npm run typecheck:shared` e `npm run lint` sem erros.

Aplicada em homolog (`sphbbqdgcreowxzjgibj`) em 2026-08-01, nesta ordem: a matriz
de testes rodou junto com a migration dentro de uma transação encerrada em
`ROLLBACK`, e só depois a migration foi aplicada de verdade. As versões
`20260806000000` e `20260807000000` foram registradas em
`supabase_migrations.schema_migrations`, e
`packages/database/src/supabase.generated.ts` foi regerado a partir do schema
resultante.

O advisor de segurança apontou que uma função de gatilho `SECURITY DEFINER`
continua alcançável como RPC pelo PostgREST enquanto o `EXECUTE` não for
revogado. A migration passou a revogar `refresh_establishment_client_activity` e
`set_establishment_client_normalization` de `PUBLIC`, `anon` e `authenticated`;
o gatilho segue funcionando, porque executa como dono da tabela e não como quem
chamou.

Produção não foi tocada.

Duração estimada: 3 a 5 dias.

Migration nova, sem alterar as colunas existentes.

```sql
alter table public.establishment_clients
  add column source text not null default 'manual'
    check (source in ('manual', 'walk_in', 'client_booking', 'import')),
  add column source_provider text,
  add column external_id text,
  add column normalized_phone text,
  add column normalized_email text,
  add column marketing_consent_status text not null default 'unknown'
    check (marketing_consent_status in ('unknown', 'granted', 'revoked')),
  add column marketing_consent_at timestamptz,
  add column first_appointment_at timestamptz,
  add column last_appointment_at timestamptz,
  add column archived_at timestamptz;
```

Ajustes associados:

- estender o CHECK de `status` para `('active', 'archived', 'merged')` e alinhar
  `establishment_clients_merge_state_check`;
- índice único parcial de idempotência:

```sql
create unique index establishment_clients_external_unique
  on public.establishment_clients (establishment_id, source_provider, external_id)
  where external_id is not null;
```

- índices de normalização para busca e sugestão de duplicidade:

```sql
create index establishment_clients_normalized_phone_idx
  on public.establishment_clients (establishment_id, normalized_phone)
  where status = 'active' and normalized_phone is not null;

create index establishment_clients_normalized_email_idx
  on public.establishment_clients (establishment_id, normalized_email)
  where status = 'active' and normalized_email is not null;
```

- trigger `set_establishment_client_normalization` recalculando `normalized_phone`
  e `normalized_email` a cada `INSERT`/`UPDATE`, preservando sempre o valor
  original digitado;
- backfill dos dois campos normalizados para as linhas já existentes;
- trigger `refresh_establishment_client_activity` em `appointments` mantendo
  `first_appointment_at` e `last_appointment_at` a partir dos status
  `confirmed`, `completed` e `no_show`, com backfill. Os agregados entram já
  nesta etapa para que nenhuma coluna exista sem manutenção.

**Telefone e e-mail continuam sem unicidade rígida.** Responsáveis, familiares e
dependentes compartilham contato; a normalização serve para *sugerir* duplicidade,
nunca para bloquear cadastro ou unir automaticamente.

Definição de pronto:

- migration aplica sobre a base atual sem perda de linhas;
- `check:supabase-schema` sem divergência;
- linha existente recebe `source = 'manual'` e consentimento `unknown`;
- inserir o mesmo `(establishment_id, source_provider, external_id)` duas vezes falha;
- normalização em SQL e em TypeScript produz o mesmo resultado para a mesma
  tabela de casos.

Pendência resolvida na Etapa 3: `create_business_appointment` grava
`source = 'walk_in'` no cliente criado no balcão.

## 4. Etapa 2 — Ciclo de vida e agregados

Status: implementada em
`supabase/migrations/20260808000000_establishment_client_lifecycle.sql`,
`packages/database/src/business.ts` e
`supabase/tests/establishment_client_lifecycle.sql`.

Validação executada: a matriz de testes rodou junto com a migration dentro de
uma transação encerrada em `ROLLBACK`, e só depois a migration foi aplicada em
homolog (`sphbbqdgcreowxzjgibj`), com a versão `20260808000000` registrada em
`supabase_migrations.schema_migrations`. Em seguida
`packages/database/src/supabase.generated.ts` foi regerado, e
`npm run typecheck:shared`, `npm run lint` e a fatia de testes unitários de
contrato de negócio passaram sem erro. Produção não foi tocada.

O advisor de segurança não aponta as duas funções internas
(`ensure_establishment_client_for_profile` e
`resolve_merged_marketing_consent`), confirmando que o `EXECUTE` foi revogado.
As RPCs de cliente aparecem como `SECURITY DEFINER` alcançáveis por
`authenticated`, que é o desenho pretendido: cada uma checa capacidade antes de
ler ou escrever.

Duração estimada: 3 a 5 dias.

### 4.1 RPCs novas

| RPC | Responsabilidade |
| --- | --- |
| `archive_establishment_client` | Marca `archived_at`, exige `manage_clients`, recusa cliente com agendamento futuro ativo |
| `restore_establishment_client` | Desfaz o arquivamento |
| `ensure_establishment_client_for_profile` | Localiza ou cria o cliente local a partir de um `profile_id` confirmado, retornando o id |
| `export_establishment_clients` | Exportação paginada e auditada, exige `export_clients` |

`search_establishment_clients` e `get_establishment_client` passam a considerar
`archived_at` e a expor os campos novos. `merge_establishment_clients` precisa
propagar `first_appointment_at` (menor), `last_appointment_at` (maior) e o
consentimento mais restritivo entre sobrevivente e duplicata.

A unificação passou também a aceitar duplicata arquivada, limpando `archived_at`
ao marcar `merged` — sem isso o operador teria de restaurar a linha só para
dobrá-la em seguida, e a restrição de estado do ciclo de vida rejeitaria a
escrita.

### 4.2 Capacidades novas

Adicionar a `BUSINESS_CAPABILITIES` em `packages/database/src/business.ts` e ao
resolver SQL:

| Capacidade | Proprietário | Administrador | Profissional |
| --- | --- | --- | --- |
| `view_clients` | sim | sim | sim, limitado à própria agenda |
| `manage_clients` | sim | sim | não |
| `export_clients` | sim | sim | não |
| `manage_data_imports` | sim | sim | não |

Acesso `read_only` e `blocked` continuam falhando fechado, sem exceção para as
capacidades novas.

Correção da tabela acima: o profissional **não** recebe `view_clients`. O
resolver entregue na Fatia anterior já reservava a capacidade para proprietário
e administrador, e a matriz de testes existente afirma que o profissional recebe
`forbidden` em `search_establishment_clients`. Manter a linha original exigiria
afrouxar o acesso à carteira sem que nada no produto peça isso; a limitação "à
própria agenda" fica para quando houver tela que a justifique.

### 4.3 Três decisões tomadas na implementação

`ensure_establishment_client_for_profile` **não** foi exposta como RPC. Ela
escreve na carteira sem checar capacidade, porque quem chama é a própria pessoa
sendo registrada; publicá-la deixaria qualquer autenticado criar linha em
qualquer unidade. Ficou como função interna, revogada de `anon` e
`authenticated`, para a Etapa 3 chamar de dentro da transação do agendamento.
Ela devolve `NULL` em vez de levantar erro, para que um problema de CRM nunca
custe o agendamento.

Quando existe um vínculo `rejected` para o par (unidade, perfil), a função
devolve `NULL` em vez de criar uma linha nova. A pessoa disse que não é aquele
registro; abrir outro contornaria a recusa, e o índice de um perfil por unidade
bloquearia o vínculo de qualquer forma.

`update_establishment_client` ganhou `target_marketing_consent_status`, que não
estava na lista de 4.1. Sem isso `marketing_consent_status` seria uma coluna sem
caminho de escrita, e a Etapa 5 precisaria trocar a assinatura de novo.

Definição de pronto:

- profissional sem `export_clients` não consegue baixar a base;
- cliente arquivado some da busca padrão e reaparece com filtro explícito;
- unificação preserva o consentimento mais restritivo.

As três estão cobertas pela matriz de testes, junto com: arquivamento recusado
diante de agendamento futuro ativo, arquivamento idempotente, edição bloqueada
em cliente arquivado, restauração limpando `archived_at`, busca tolerante a
telefone sem formatação, unificação carregando o menor `first_appointment_at` e
o maior `last_appointment_at`, resolução de perfil idempotente, recusa de
vínculo respeitada, e auditoria de exportação com o número de linhas que
saíram.

## 5. Etapa 3 — Integração com agendamentos

Status: implementada em
`supabase/migrations/20260809000000_establishment_client_appointment_link.sql`
e `supabase/tests/establishment_client_appointment_link.sql`.

Validação executada: a matriz de testes rodou junto com a migration dentro de
uma transação encerrada em `ROLLBACK`, e só depois a migration foi aplicada em
homolog (`sphbbqdgcreowxzjgibj`), com a versão `20260809000000` registrada.
O backfill vinculou os 12 agendamentos com `client_id` que estavam sem cliente
local; nenhum ficou só com nome. Em seguida
`packages/database/src/supabase.generated.ts` foi regerado, e
`npm run typecheck:shared` e `npm run lint` passaram sem erro. Produção não foi
tocada.

Duração estimada: 4 a 6 dias.

### 5.1 Cliente autenticado agendando pelo app

Hoje `create_client_appointment` → `create_appointment` grava `client_id` e deixa
`establishment_client_id` nulo. Passa a ser:

```text
auth.uid()
  ↓
link confirmado em establishment_client_links?
  ↓ sim                              ↓ não
usa o establishment_client            ensure_establishment_client_for_profile
  ↓                                   ↓ cria com source = 'client_booking'
grava establishment_client_id no agendamento
```

Esta etapa também corrige a origem do atendimento de balcão, gravando
`source = 'walk_in'` no cliente criado por `create_business_appointment`.

A criação deve ocorrer dentro da mesma transação do agendamento e não pode
introduzir novo modo de falha: se o cliente local não puder ser resolvido, o
agendamento ainda é criado com `establishment_client_id` nulo e o caso é
registrado para reconciliação posterior.

### 5.2 Cliente sem identificação

Continua permitido, sem alteração de comportamento:

```text
establishment_client_id = null
client_name = "Cliente balcão"
```

### 5.3 Backfill dos dados atuais

Duas populações distintas, com tratamentos diferentes.

**Agendamentos com `client_id`.** Para cada par
`(establishment_id, client_id)` sem cliente local, criar um
`establishment_clients` com `source = 'client_booking'`, um
`establishment_client_links` já `confirmed` com `match_kind = 'manual'`, e
atualizar os agendamentos correspondentes. O nome vem de `profiles.name`; o
contato só é copiado quando verificado.

**Agendamentos apenas com `client_name`.** Não unir por nome. Três linhas
"Maria Silva" podem ser uma pessoa ou três. Esses agendamentos permanecem com o
snapshot textual e `establishment_client_id` nulo até que exista contato
suficiente para resolução segura — o que normalmente ocorrerá durante a migração
de plataforma, com revisão humana.

O backfill roda em lotes, é idempotente e registra contagem antes e depois.

Definição de pronto:

- agendamento novo de cliente autenticado nasce vinculado;
- dois estabelecimentos não enxergam a carteira um do outro (teste de RLS);
- telefone repetido não causa união indevida (teste dedicado);
- reexecutar o backfill não cria segunda carteira;
- nenhum agendamento existente perde `client_id` ou `client_name`.

## 6. Etapa 4 — Diretório no Web

Status: implementada em `apps/web/src/features/establishment-clients/`
(lista/detalhe, archive/restore/merge, sugestão de duplicidade, nav em
`AdminShell`), com mapper compartilhado em
`packages/database/src/establishment-client.ts`. Validação local: typecheck/
lint do Web e dos pacotes compartilhados. Produção não foi tocada.

Duração estimada: 5 a 8 dias.

Entregas:

```text
apps/web/src/features/establishment-clients/
  components/
  hooks/
  screens/
  services/
  types/
```

Funcionalidades: lista paginada com busca tolerante a acento e formatação,
detalhe com histórico de agendamentos, criação e edição, arquivamento,
sugestão de duplicidade com nível de confiança, unificação com confirmação
explícita, e estado de vínculo com perfil CutSync.

A camada de serviço segue o padrão do Web: `supabase.rpc()` tipado por
`@cutsync/database` e tradução de erro por helper de domínio, como já ocorre em
`packages/domain/src/appointment-errors.ts`.

## 7. Etapa 5 — Ajustes no Business

Duração estimada: 2 a 3 dias.

As telas já existem. O ajuste é de contrato:

- exibir e editar consentimento promocional;
- exibir origem do cliente (manual, balcão, agendamento, importação);
- exibir recorrência a partir dos agregados;
- arquivar e restaurar;
- exibir estado do vínculo com perfil.

Segue o padrão de `apps/business/src/features/clients/business-clients-api.ts`
sobre `callBusinessRpc`.

## 8. Etapa 6 — Pacotes compartilhados

Executada junto das etapas anteriores, não ao final.

| Pacote | Conteúdo |
| --- | --- |
| `packages/domain/src/establishment-client.ts` | Estados, transições de `status`, origem, consentimento, códigos de erro |
| `packages/database/src/establishment-client.ts` | Mapeamento das respostas RPC para o modelo de domínio |
| `packages/validation/src/establishment-client.ts` | Normalização e validação de telefone brasileiro, e-mail, tags e notas |

A normalização de telefone e e-mail precisa existir em TypeScript **e** em SQL,
com o mesmo resultado. Um teste de referência compartilhado deve provar a
equivalência: divergência entre as duas implementações produz duplicidade
silenciosa na importação.

## 9. Etapa 7 — Testes

| Camada | Cobertura |
| --- | --- |
| Unitário | Normalização de telefone e e-mail, transições de `status`, precedência de consentimento na unificação |
| SQL | RLS por estabelecimento, capacidades novas, criação, arquivamento, vínculo com perfil, unificação, idempotência de `external_id`, tentativa de operar em unidade alheia |
| Integração | Agendamento de cliente autenticado gerando carteira, backfill idempotente, busca com acento e formatação |

Os testes SQL seguem o formato das matrizes existentes em `supabase/tests/`
(PL/pgSQL com `pg_temp.set_actor` e `pg_temp.expect_error`), acompanhando
`supabase/tests/android_business_operational_cycle.sql`.

## 10. Sequência de PRs

| # | PR | Depende de |
| --- | --- | --- |
| 1 | `domain: add establishment client contracts` | — |
| 2 | `validation: add client normalization helpers` | 1 |
| 3 | `database: enrich establishment_clients with source and consent` — feito | — |
| 4 | `database: add client lifecycle rpcs and capabilities` — feito | 3 |
| 5 | `database: link client bookings to establishment clients` — feito | 4 |
| 6 | `database: backfill profile-linked establishment clients` — feito (na mesma migration) | 5 |
| 7 | `web: add establishment client directory` — feito (código local) | 2, 4 |
| 8 | `business: expose client origin, consent and archiving` | 2, 4 |
| 9 | `testing: add establishment client sql coverage` | 6 |

## 11. Marco de conclusão

A etapa está pronta quando o motor de importação puder assumir, sem exceções:

- que existe uma carteira por unidade com chave de idempotência externa;
- que criar cliente não cria conta nem consentimento;
- que duplicidade é sugerida, nunca aplicada sozinha;
- que agenda futura pode apontar para um cliente local;
- que Web e Business leem o mesmo contrato.

Somente então a construção do importador descrita em
[`DATA_IMPORT_MIGRATION_PLAN.md`](./DATA_IMPORT_MIGRATION_PLAN.md) deve começar.

## 12. Estimativa

| Etapa | Estimativa |
| --- | --- |
| 1 — Enriquecimento da tabela | 3–5 dias |
| 2 — Ciclo de vida e agregados | 3–5 dias |
| 3 — Integração com agendamentos | 4–6 dias |
| 4 — Diretório no Web | 5–8 dias |
| 5 — Ajustes no Business | 2–3 dias |
| 6 — Pacotes compartilhados | paralelo |
| 7 — Testes | 3–4 dias |

Total sequencial estimado: 4 a 6 semanas. Com banco e interfaces em paralelo,
3 a 4 semanas.
