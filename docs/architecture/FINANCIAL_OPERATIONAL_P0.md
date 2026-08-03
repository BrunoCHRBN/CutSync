# Ciclo financeiro-operacional do estabelecimento — P0

Status: Etapa 0–2 implementadas; **Etapa 3 implementada e endurecida** (RPCs de
ciclo de `service_orders` — contratos SQL/TS alinhados, mappers fail-closed,
cobertura remove/read_only/blocked; stacked sobre Etapa 2); etapas 4+
planejadas, **não iniciadas**

Data da verificação: 2026-08-03  
Baseline Etapa 3: `p0/02-service-order-schema` @ `bf006dc49fe358e9f2216c44dc66a3fac79f699c`
Branch de implementação da Etapa 3: `p0/03-service-order-lifecycle-rpcs`
@ `ff1201e32fce99ec3cdb4686519ef338c5a1d772`
(PR base inicial = `p0/02-service-order-schema` até merge da Etapa 2)

Documentos irmãos:

- [`MOBILE_PRODUCT_CONTRACT.md`](./MOBILE_PRODUCT_CONTRACT.md)
- [`MULTI_APP_PRODUCT_CONTRACT.md`](./MULTI_APP_PRODUCT_CONTRACT.md)
- [`DOMAIN_VOCABULARY.md`](./DOMAIN_VOCABULARY.md)
- [`docs/platform-billing-rollout.md`](../platform-billing-rollout.md)

## 1. Objetivo

Construir o ciclo operacional e financeiro do estabelecimento:

```text
agendamento → check-in → atendimento → comanda (service_order)
  → pagamento → caixa → comissão → estorno → conciliação
```

Este documento é o **contrato canônico da Etapa 0**. Ele congela fronteiras,
máquinas de estado, capacidades, estratégia de money/idempotência/auditoria e a
ordem das migrations/RPCs. **Não cria schema financeiro nesta etapa.**

### 1.1 Vocabulário obrigatório deste P0

| Conceito | PT (UI) | EN (código/schema) | Evitar |
| --- | --- | --- | --- |
| Comanda do atendimento | comanda | `service_order` | `command`, `sale`, `comanda` como identificador |
| Item da comanda | item | `service_order_item` | — |
| Estado operacional da comanda | status da comanda | `service_orders.status` | misturar com saldo/pagamento |
| Estado financeiro da comanda | situação de pagamento | `payment_status` (campo **calculado** em RPC/view/leitura — **não** coluna em `service_orders`) | persistir, enviar do frontend ou tratar como status operacional |
| Método de pagamento da unidade | forma de pagamento | `establishment_payment_method` | misturar com `billing_*` |
| Pagamento registrado | pagamento | `order_payment_entry` | misturar com `billing_invoices` |
| Caixa físico | caixa | `cash_register` | — |
| Sessão de caixa | sessão de caixa | `cash_session` | — |
| Movimento de caixa | movimento de caixa | `cash_movement` | — |
| Política de comissão | política de comissão | `commission_policy` | tratar `memberships.commission_rate` como ledger |
| Lançamento de comissão | comissão | `commission_entry` | — |
| Ajuste de comissão | ajuste | `commission_adjustment` | rewrite silencioso de entry |
| Fechamento / payout de comissão | acerto / repasse | `commission_settlement` | — |
| Conta no provedor | conta do provedor | `payment_provider_account` | — |
| Evento do provedor | evento do provedor | `payment_provider_event` | — |
| Intenção no provedor | cobrança externa | `payment_intent` | — |
| Estorno | estorno | `payment_refund` | delete silencioso de pagamento |
| Snapshot de política do agendamento | política do agendamento | `appointment_policy_snapshot` | — |
| Resolução de cobrança do agendamento | decisão de cobrança | `appointment_charge_resolution` | — |
| Conciliação | conciliação | `reconciliation_*` | — |
| Override de capability | permissão excepcional | `membership_capability_overrides` | hardcode por pessoa na UI |
| Recibo de comando | — | `command_receipts` | usar “comanda” para esta tabela |

`command_receipts` permanece exclusivo para **idempotência de RPC**. Comanda
comercial = `service_order`.

## 2. Estado atual comprovado

Inventário inicial (Etapa 0, 2026-08-03): nenhuma tabela POS existia.
**Atualização Etapa 2:** passam a existir `service_orders`,
`service_order_items` e `service_order_events` (schema only). Continuam
inexistentes: `order_payment_entries`, `cash_registers`, `cash_sessions`,
`commission_policies`, `commission_entries`, `payment_intents`,
`payment_refunds`, `establishment_payment_methods`,
`appointment_policy_snapshots`, `appointment_charge_resolutions` e
`reconciliation_*` de POS.

### 2.1 `appointments` e estados

Não há enum Postgres de status. Status é `text` com CHECK:

```text
pending | confirmed | cancelled | completed | no_show
```

Fonte canônica do CHECK (ciclo Android):
`supabase/migrations/20260806000000_android_business_operational_cycle.sql`.

Contratos TypeScript alinhados:

- `AppointmentStatus` — `packages/database/src/models.ts`
- `BusinessAgendaStatus` — `packages/database/src/business.ts`
- `ClientAppointmentStatus` — `packages/domain/src/client-appointments.ts`

Transições server-side hoje:

| Caminho | RPC | Transições |
| --- | --- | --- |
| Business mobile | `apply_business_appointment_status` (+ wrappers) | `pending→confirmed`; `confirmed→completed\|no_show`; `pending\|confirmed→cancelled` |
| Web / Client | `update_appointment_status_v2` | `confirmed\|cancelled\|completed` apenas (**sem `no_show`**) |
| Walk-in | `create_business_appointment` | cria já em `confirmed` |

Terminais: `completed`, `cancelled`, `no_show`.  
**Não existe estado `checked_in` / check-in.**

### 2.2 `price_charged`

| Propriedade | Valor comprovado |
| --- | --- |
| Coluna | `public.appointments.price_charged` |
| Tipo | `numeric(12,2)` — **reais decimais, não centavos** |
| Migration | `20260811000000_appointment_price_charged_snapshot.sql` |
| Origem | trigger em create/reschedule via `get_effective_price` (após combos/promoções em `20260812000000_...`) |
| Uso | snapshot para relatórios de produção / comissão projetada |
| Mutação cliente | bloqueada no cancelamento (`IS NOT DISTINCT FROM`) |

Comentário SQL: snapshot monetário congelado no booking/reschedule; relatórios
não leem `services.price` ao vivo.

Lacuna: `get_business_appointment_detail` ainda expõe preço de catálogo ao vivo
como `listPrice`, não o snapshot `price_charged`.

### 2.3 `appointment_events`

Criada em `20260806000000_android_business_operational_cycle.sql`.

| Campo | Notas |
| --- | --- |
| `event_type` | `created \| confirmed \| completed \| cancelled \| rescheduled \| no_show \| client_linked` |
| Imutabilidade | trigger `BEFORE UPDATE OR DELETE` → `*_is_immutable` |
| Escrita | somente trigger `capture_appointment_event` em `appointments` |
| Grants | sem escrita `authenticated`; apps leem via RPC SECURITY DEFINER |

### 2.4 `command_receipts`

Mesma migration do ciclo Android. Tabela de **idempotência**, não de comanda.

| Campo | Papel |
| --- | --- |
| `request_id` | PK (UUID do cliente) |
| `actor_id`, `establishment_id`, `command_type` | escopo do comando |
| `request_hash` | SHA-256 do payload (`^[0-9a-f]{64}$`) |
| `response_payload` / `completed_at` | replay seguro; payload mínimo (ids/status) |

Fluxo: `claim_mobile_command` → mutação → `complete_mobile_command`.  
Conflito de hash/ator/tipo → `idempotency_conflict`.  
Web `update_appointment_status_v2` **não** usa `command_receipts`.

`command_type` de agenda já em uso (amostra): `appointment.created`,
`appointment.confirmed`, `appointment.completed`, `appointment.cancelled`,
`appointment.no_show`, `appointment.rescheduled`, além de blocos, clientes,
serviços, equipe e `membership.commission_updated`.

### 2.5 RPCs Business (operacionais relevantes)

Superfície tipada: `packages/database/src/business-rpc.generated.ts`  
Padrão: `SECURITY DEFINER`, `search_path` fixo, `target_request_id` nas mutações.

| RPC | Papel |
| --- | --- |
| `get_business_agenda_day` | leitura agenda |
| `get_available_slots` | slots |
| `get_business_appointment_detail` | detalhe + `allowedActions` |
| `confirm_business_appointment` | confirma |
| `complete_business_appointment` | conclui atendimento **sem pagamento** |
| `cancel_business_appointment` | cancela |
| `mark_business_appointment_no_show` | no-show |
| `reschedule_business_appointment` | remarca |
| `create_business_appointment` | walk-in / encaixe |
| `update_business_team_commission` | altera **taxa** (`memberships.commission_rate`) |

Não existem RPCs de check-in, abertura de comanda, pagamento, caixa, estorno ou
conciliação de atendimento.

Contrato temporário Business (padrão a preservar enquanto schema novo não for
homologado): manter superfície em `business-rpc.generated.ts` + caller frouxo em
`apps/business/src/features/connectivity/business-rpc.ts` mapeando ausência de
função para `backend_unavailable` — **não** editar `supabase.generated.ts`
fingindo schema remoto aplicado.

### 2.6 Capabilities

Lista atual em `packages/database/src/business.ts` → `BUSINESS_CAPABILITIES`.

Papéis operacionais: `owner | admin | professional`  
(`owner` não é `memberships.role`; é identidade resolvida).  
Modo de acesso SaaS: `full | read_only | blocked`.

Capacidades financeiras/operacionais **atuais**:

| Capability | Significado hoje |
| --- | --- |
| `view_own_commission` | ver própria taxa / projeção |
| `view_unit_reports` | relatórios densos da unidade (Web) |

Não existem as capabilities granulares do POS propostas na §6.  
Não existe `membership_capability_overrides`.

### 2.7 Relatórios

| Superfície | Situação |
| --- | --- |
| Web | `AdminReportsExperience` + `get_admin_report_v2` / details — produção realizada, valor agendado, ticket, ocupação, **comissão projetada** |
| Business | capability existe; **sem UI de relatório denso** |
| Control | financeiro SaaS apenas; `cashAvailability()` = `history_unavailable` para caixa de estabelecimento |

Copy e testes deixam explícito: produção ≠ caixa / receita recebida / lucro.
`no_show` não conta como produção/caixa.

### 2.8 Comissão atual

| Peça | Situação |
| --- | --- |
| Taxa | `memberships.commission_rate` (`numeric`, fração `0..1`, default `0.50`) |
| Atualização | `update_business_team_commission` + `command_receipts` |
| Valor | `sum(price_charged completed) * commission_rate` nos relatórios |
| Policies / ledger / adjustments / settlements | **inexistentes** |

### 2.9 Billing SaaS existente (`billing_*`)

Contexto **separado** — cobrança da assinatura CutSync (Stripe / Play / org),
não POS do estabelecimento.

Tabelas (amostra): `billing_plans`, `billing_accounts`, `billing_subscriptions`,
`billing_invoices`, `billing_events`, `billing_provider_products`,
`billing_coverage_assignments`, `billing_cutover_requests`, mais variantes
`organization_billing_*`.

Money SaaS: `*_cents integer` + `currency`.  
Migrations âncora: `20260725010000_platform_billing_web_first.sql`,
`20260726000000_multi_unit_organizations_and_billing.sql`,
`20260729000000_consolidated_billing_coverage.sql`.

**Proibido reutilizar** essas tabelas para comanda, pagamento de atendimento,
caixa, comissão ou estorno.

Control feature flags (`EXPO_PUBLIC_CLOUD_FINANCE_WRITE_ENABLED` etc.) governam
escritas **SaaS no Control**, não o POS do estabelecimento.

## 3. Fronteiras do domínio

| Bounded context | Responsabilidade | Não faz |
| --- | --- | --- |
| `appointments` | Compromisso, ocupação de agenda, status operacional do horário, snapshot `price_charged` para produção histórica | Não é caixa, pagamento, comissão paga nem comanda |
| `appointment_policy_snapshots` | Congela regras aplicáveis no booking (cancelamento tardio, no-show, sinal) | Não executa cobrança sozinha |
| `appointment_charge_resolutions` | Decisões reproduzíveis de retenção, waiver, estorno ligado ao appointment | Não substitui `order_payment_entries` |
| `service_orders` | Operação comercial do atendimento: somente estado operacional (`open→…→closed`/`voided`), itens, totais server-side | Não processa cartão; não é ledger de pagamento; **não** persiste `payment_status` |
| `establishment_payment_methods` | Formas de pagamento habilitadas na unidade (cash, pix, card…), ordenação e flags | Não é conta SaaS nem intent do provedor |
| `order_payment_entries` | Pagamentos **registrados** na comanda (método, valor em centavos, estado) | Não é fatura SaaS; não é gaveta por si só |
| `cash_registers` | Caixa físico lógico da unidade; P0 cria “Caixa principal” automático | Não calcula comissão |
| `cash_sessions` / `cash_movements` | Sessões e movimentos de dinheiro físico; contagem declarada na sessão | Não substitui provedor externo |
| `commission_policies` | Regras/versionamento de comissão da unidade | Não é payout |
| `commission_entries` | Ledger imutável/compensável provisionado no close com saldo resolvido | Não apaga; estorno gera compensação |
| `commission_adjustments` | Ajustes auditados sobre o ledger | Não rewrite silencioso |
| `commission_settlements` | Fechamento de período / registro de repasse | Não mistura com `billing_*` |
| `payment_provider_accounts` | Conta/config do provedor por establishment | Sem secrets em coluna de app |
| `payment_provider_events` | Eventos inbound idempotentes `UNIQUE(provider, external_event_id)` | Não é payment entry |
| `payment_intents` | Processamento externo: `authorized` / `captured` / `succeeded` quando couber | Não armazena PAN/CVV/secrets |
| `payment_refunds` | Estornos / reversões compensatórias | Não apaga `order_payment_entries` |
| `reconciliation_*` | Divergências provedor ↔ ledger / caixa | Não é relatório de produção |
| `membership_capability_overrides` | Permissões excepcionais por membership (ex.: recepcionista) | **Tabela não criada na Etapa 0/1 doc**; só decisão de fronteira |
| `billing_*` | Assinatura SaaS CutSync | Fora do POS |

Regra de ouro: **totais monetários confiáveis só no backend**. Frontend pode
pré-visualizar com funções puras compartilhadas; nunca persistir total enviado
pelo cliente.

## 4. Diagrama textual — entidades e relacionamentos

```text
establishments
  ├── memberships (role, commission_rate legado)
  │     └── membership_capability_overrides   [FUTURO — decisão registrada; sem tabela nesta etapa]
  ├── establishment_payment_methods           [NOVO]
  ├── cash_registers                          [NOVO — P0: "Caixa principal" automático]
  │     └── cash_sessions  (1:N)              [NOVO — declared_count na sessão]
  │           └── cash_movements (1:N)        [NOVO]
  ├── commission_policies                     [NOVO]
  ├── commission_entries                      [NOVO]
  ├── commission_adjustments                  [NOVO]
  ├── commission_settlements                  [NOVO]
  ├── payment_provider_accounts               [NOVO]
  ├── payment_provider_events                 [NOVO — UNIQUE(provider, external_event_id)]
  ├── appointments
  │     ├── appointment_events                [imutável — já existe]
  │     ├── price_charged numeric(12,2)       [snapshot legado]
  │     ├── appointment_policy_snapshots      [NOVO]
  │     └── appointment_charge_resolutions    [NOVO]
  ├── service_orders                          [NOVO — comanda; só status operacional]
  │     ├── appointment_id?                   [UNIQUE parcial: WHERE appointment_id IS NOT NULL]
  │     ├── status                            [operacional — única máquina persistida]
  │     ├── establishment_client_id?
  │     ├── professional_id?
  │     ├── service_order_items               [NOVO — *_cents]
  │     ├── service_order_events              [NOVO — imutável]
  │     ├── order_payment_entries             [NOVO]
  │     │     ├── cash_movements?             [se método cash]
  │     │     ├── payment_intents?            [se provedor]
  │     │     └── payment_refunds             [compensatórios]
  │     └── commission_entries                [provisionados no close com saldo resolvido]
  │                                           [payment_status: calculado na leitura — não coluna]
  ├── reconciliation_runs / issues            [NOVO]
  └── command_receipts                        [já existe — idempotência transversal]

billing_* / organization_billing_*            [SaaS CutSync — outro bounded context]
```

Cardinalidades e invariantes (P0):

- `appointment` 0..1 → `service_order` **histórica**: no máximo **uma única
  comanda histórica por appointment**, independentemente do status
  (`open`/`in_service`/`awaiting_payment`/`closed`/`voided`). Proteção no banco:

  ```sql
  UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL
  ```

  O filtro parcial ignora apenas `appointment_id` nulo — **não** filtra por
  status. Walk-in sem `appointment_id` continua permitido (vários walk-ins
  sem appointment); appointment sem comanda continua permitido até o check-in.
  `voided` ou `closed` **não** liberam o appointment para nova comanda.
  Correção operacional ocorre sobre a mesma comanda (ex.:
  `reopen_voided_service_order`), nunca criando segunda `service_order`.
- `service_order` 1 → N `service_order_items`.
- `service_order` 1 → N `order_payment_entries` (split payments).
- `cash_registers` 1:N `cash_sessions`; `cash_sessions` 1:N `cash_movements`.
- P0: um `cash_register` “Caixa principal” por establishment (criado
  automaticamente); no máximo **uma `cash_session` open** por register.
- `commission_entry` N por comanda/item/profissional; nunca sobrescrita —
  estorno gera entry compensatória.
- `payment_provider_events`: `UNIQUE (provider, external_event_id)`.
- `payment_status` **não** é coluna de `service_orders`; é calculado
  server-side a partir do total congelado + payments/refunds.

## 5. Máquinas de estado

### 5.1 Appointment (existente — preservar)

```text
pending ──confirm──► confirmed ──complete──► completed
   │                     │
   │                     ├──no_show──► no_show
   │                     │
   └──cancel◄────────────┘
         ▼
     cancelled
```

Com feature flag financeira **desligada**: comportamento atual permanece
(`complete` = fim operacional do horário, sem comanda).

Com flag **ligada**: o fluxo preferencial é

```text
confirmed
  → open_service_order (check-in)
  → start_service_order
  → finish_service_order   [= awaiting_payment + appointment.completed]
  → pagamentos em awaiting_payment
  → close_service_order    [= closed com saldo resolvido]
```

`finish_service_order` é a transição canônica que move o appointment para
`completed` **sem** significar pagamento recebido. O atalho legado
`complete_business_appointment` permanece disponível só com flag off (e, com
flag on, fica restrito/deprecado conforme etapa de integração — sem alterar
produção nesta Etapa 0).

### 5.2 Service order — estado operacional (proposta)

```text
open ──start──► in_service ──finish──► awaiting_payment ──close──► closed
  │                 │                        │
  └──── void ───────┴──────── void ──────────┘
                         ▼
                      voided
```

`voided` é alcançável a partir de qualquer estado **não encerrado**
(`open`, `in_service`, `awaiting_payment`) mediante autorização
(`void_orders`). De `closed`, não há void operacional ordinário — apenas
estornos/reversões/operações administrativas auditadas.

| Estado | Significado |
| --- | --- |
| `open` | Check-in realizado; comanda editável (itens/descontos autorizados) |
| `in_service` | Atendimento iniciado |
| `awaiting_payment` | Serviço finalizado; **itens congelados**; janela de pagamentos comuns |
| `closed` | Checkout finalizado; saldo resolvido; sem pagamentos comuns |
| `voided` | Anulação auditada; registro preservado |

Check-in P0 = `open_service_order` → status `open`, sem novo status em
`appointments`.

#### 5.2.1 RPCs canônicas de ciclo

| RPC | Efeito |
| --- | --- |
| `open_service_order` | Cria comanda em `open` (check-in); exige **uma única comanda histórica por appointment** |
| `start_service_order` | `open` → `in_service` |
| `finish_service_order` | `in_service` → `awaiting_payment`; **também** move o appointment ligado para `completed`; **não** significa pagamento recebido; congela itens |
| `close_service_order` | Exige saldo zero **ou** resolução explícita autorizada; `awaiting_payment` → `closed`; provisiona comissão (P0) |
| `void_service_order` | Anula comanda não encerrada → `voided` com auditoria |
| `reopen_voided_service_order` | (futura) reabre a **mesma** comanda `voided` para correção; não cria segunda comanda; ver §13 |

### 5.3 Service order — estado financeiro calculado (proposta)

**Decisão canônica do P0:** `payment_status` **não** será uma coluna
autoritativa persistida em `service_orders`.

O estado financeiro da comanda é **calculado server-side** a partir de:

- total congelado da `service_order`;
- `order_payment_entries` confirmados;
- pagamentos anulados (`voided` / não confirmados);
- `payment_refunds` concluídos;
- demais lançamentos compensatórios aplicáveis.

A API pode retornar `payment_status` como campo calculado em RPCs, views,
queries de leitura e contratos de resposta. O frontend **nunca** envia nem
persiste `payment_status` como fonte de verdade.

Estados financeiros:

```text
unpaid | partially_paid | paid | partially_refunded | refunded
```

Precedência mínima do cálculo:

| Valor | Regra |
| --- | --- |
| `unpaid` | Nenhum pagamento confirmado líquido |
| `partially_paid` | Valor líquido confirmado > 0 e < total da comanda |
| `paid` | Valor líquido confirmado = total da comanda e nenhum valor estornado |
| `partially_refunded` | Existem estornos concluídos, mas o valor líquido restante > 0 |
| `refunded` | Todo o valor originalmente confirmado foi estornado e o líquido resultante = 0 |

Regras pós-close / estorno:

- Uma `service_order` pode permanecer operacionalmente `closed` depois de um
  estorno.
- Nesse caso o `payment_status` calculado pode ser `partially_refunded` ou
  `refunded`.
- O status operacional **não** é reaberto automaticamente por causa de estorno.
- Divergências entre total, pagamentos e estornos geram **erro de RPC** ou
  **issue de conciliação** — nunca um estado financeiro silenciosamente
  incorreto.

**Pagamentos comuns** (`record_order_payment` / intents de captura ordinária)
ocorrem somente em `awaiting_payment`.  
Depois de `closed`: somente estornos, reversões e operações administrativas
auditadas — **não** pagamentos comuns.

### 5.4 Payment entry — `order_payment_entries` (proposta)

```text
pending ──confirm──► confirmed ──refund*──► partially_refunded | refunded
   │                    │
   ├──fail──► failed    └──void──► voided
   └──void──► voided
```

Estados canônicos do entry:

```text
pending | confirmed | failed | voided | partially_refunded | refunded
```

`authorized`, `captured` e `succeeded` ficam reservados a `payment_intents`
(provedor), não a `order_payment_entries`.

Valores sempre em **centavos inteiros**. Método referencia
`establishment_payment_methods`. Efeito em caixa/provedor via
`cash_movements` / `payment_intents` correlatos.

### 5.5 Cash register / session (proposta)

```text
cash_register (active)
  └── cash_session: open ──close──► closed
                       │
                       └──force_close──► closed (+ reconciliation issue se divergente)
```

Movimentos append-only (sem `close_count`):

```text
open_float | cash_in | cash_out | sale_cash | refund_cash
```

A **contagem declarada** no fechamento fica em colunas de `cash_sessions`
(ex.: `declared_count_cents`, `expected_count_cents`, `variance_cents`) — não
como tipo de movimento.

Reabertura (`reopen_cash`) é operação administrativa com capability própria e
auditoria; não é o fluxo diário padrão.

### 5.6 Comissão (proposta)

Domínio expandido:

| Entidade | Papel |
| --- | --- |
| `commission_policies` | Regras versionadas (percentual, escopo serviço/profissional, vigência) |
| `commission_entries` | Ledger provisionado |
| `commission_adjustments` | Ajustes auditados |
| `commission_settlements` | Fechamento de período / registro de payout |

Estado de entry (mínimo P0):

```text
accrued ──settle──► settled
   │
   └──reverse──► reversed  (entry compensatória; não delete)
```

**Provisioning P0:** comissão é provisionada (`accrued`) quando a comanda é
**fechada** (`close_service_order`) com **saldo resolvido**. Estornos posteriores
geram entries compensatórias (e adjustments quando necessário). Taxa/política
é snapshotada no lançamento — não reler política futura na leitura histórica.

`memberships.commission_rate` permanece legado de configuração/relatório até a
migração consciente para `commission_policies`.

### 5.7 Provider payment intent (proposta)

```text
created → requires_action → processing → authorized → captured → succeeded
                              │              │
                              ├──failed      └──cancelled
                              └──cancelled
```

Nem todos os provedores usam `authorized`/`captured`; quando não couber, a
máquina colapsa para o subconjunto suportado, sem vazar esses nomes para
`order_payment_entries`.

Infra correlata:

- `payment_provider_accounts` — conta/config por establishment + provider
- `payment_provider_events` — inbox idempotente com
  `UNIQUE (provider, external_event_id)`

Sem PAN/CVV/secrets no banco cliente.

### 5.8 Refund (proposta)

```text
requested → processing → succeeded | failed | cancelled
```

Sempre ligado a `order_payment_entry` / `payment_intent` de origem.  
Efeitos: atualiza estado do payment entry; `cash_movement` compensatório se
cash; commission reverse/adjustment se aplicável; pode exigir
`appointment_charge_resolution` quando a origem for política de no-show/sinal.

### 5.9 Appointment policy / charge resolution (proposta)

| Entidade | Papel |
| --- | --- |
| `appointment_policy_snapshots` | Congela no booking (ou alteração autorizada) as regras de cancelamento tardio, no-show, retenção de sinal, prazos e percentuais |
| `appointment_charge_resolutions` | Registra decisões reproduzíveis: cobrar, reter sinal, waiver, estornar, não cobrar — com actor, motivo e vínculos |

Estados mínimos de resolution:

```text
pending → decided → applied | waived | reversed
```

### 5.10 Reconciliation issue (proposta)

```text
open → investigating → resolved | written_off
```

Criada quando provedor, ledger interno ou contagem de caixa divergem além da
tolerância (tolerância = 0 centavos no P0, salvo configuração futura explícita).

## 6. Matriz de capacidades (proposta P0)

### 6.1 Capabilities granulares novas

Substituem a matriz ampla anterior (`manage_service_orders`, `manage_cash`,
`manage_refunds`, `manage_commissions`, etc.).

| Capability | owner | admin | professional | Notas |
| --- | --- | --- | --- | --- |
| `view_orders` | sim | sim | própria / time conforme agenda | Leitura de comandas |
| `manage_own_orders` | full | full | full (próprias) | open/start/finish/itens da própria comanda |
| `manage_team_orders` | full | full | não* | Comandas de outros profissionais |
| `apply_order_discounts` | full | full | não* | Descontos além da política padrão |
| `void_orders` | full | full | não* | Anular comanda não encerrada |
| `view_payments` | full | full | limitada* | Ver pagamentos da comanda no escopo |
| `take_payments` | full | full | não* | Registrar pagamento em `awaiting_payment` |
| `void_payments` | full | full | não | Anular payment entry pendente/erro |
| `issue_refunds` | full | full | não | Estornos |
| `view_cash` | full | full | não | Saldo/sessão |
| `operate_cash` | full | full | não | Abertura, sangria, reforço, sale_cash operacional |
| `close_cash` | full | full | não | Fechar sessão com contagem declarada |
| `reopen_cash` | full | não* | não | Reabertura administrativa (owner default) |
| `view_own_commission` | sim | sim | sim | **já existe** — passa a ler ledger quando flag on |
| `view_team_commission` | full | full | não | Ver comissões da equipe |
| `manage_commission_policies` | full | full | não | Políticas versionadas |
| `close_commission_period` | full | full | não | Settlement de período |
| `record_commission_payout` | full | full | não | Registrar repasse |
| `view_reconciliation` | full | full | não | Filas |
| `manage_reconciliation` | full | full | não | Resolver issues |
| `view_unit_reports` | sim | sim | não | **já existe** — evolui métricas quando flag on |

\*Default por role. Exceções (recepcionista, caixa, profissional com permissão
ampliada) serão suportadas por `membership_capability_overrides` — **decisão
registrada agora; tabela/RPC de override não são criadas nesta etapa
documental**.

Em `access_mode = read_only`: apenas capacidades de view (`view_orders`,
`view_payments`, `view_cash`, `view_own_commission`, `view_team_commission`,
`view_reconciliation`, `view_unit_reports`) quando o role base as tiver; **nenhuma
mutação financeira**.

`manage_admins` permanece owner-only. Capabilities SaaS (`billing_*` / payer)
não se misturam com POS.

### 6.2 Overrides futuros

```text
membership_capability_overrides
  membership_id + capability + effect(grant|deny) + audit fields
```

Resolver efetivo (futuro):

```text
effective = (role defaults ∪ grants) − denies
```

sujeito a `access_mode` e `financial_ops_enabled`.

## 7. Feature flags e rollout

### 7.1 Flag por estabelecimento

Introduzir configuração persistida por unidade (nome canônico proposto):

```text
establishments.financial_ops_enabled boolean NOT NULL DEFAULT false
```

(ou coluna em tabela de settings da unidade, se já houver âncora coerente na
etapa de schema — preferir coluna explícita e indexável).

Comportamento:

| Flag | Efeito |
| --- | --- |
| `false` (default) | Fluxos atuais intactos; RPCs financeiras novas retornam erro estável `financial_ops_disabled` |
| `true` | Libera check-in→comanda→pagamento… para aquela unidade |

Rollout: homolog → pilotos opt-in → expansão. Sem flag global obrigando todos os
tenants.

### 7.2 Contratos de app

- Business/Web: feature detection via contexto operacional (campo novo no
  `get_my_business_operational_contexts` / equivalente Web).
- Client: **não** opera caixa/comanda no P0; no máximo status de appointment.
- Control: continua só SaaS; sem inventar métricas `revenue|profit|cash` de
  estabelecimento.

Atualizar `MOBILE_PRODUCT_CONTRACT.md` / `MULTI_APP_PRODUCT_CONTRACT.md` somente
quando a Etapa correspondente entregar comportamento real atrás da flag.

## 8. Idempotência via `command_receipts`

Reutilizar o mecanismo existente; **não** criar tabela paralela de receipts.

Regras:

1. Toda mutação financeira/operacional sensível exige `request_id uuid`.
2. `command_type` namespaced, exemplos:

   ```text
   service_order.opened
   service_order.started
   service_order.item_upserted
   service_order.finished
   service_order.closed
   service_order.voided
   payment.recorded
   payment.voided
   payment.refunded
   cash.session_opened
   cash.session_closed
   cash.session_reopened
   cash.movement_recorded
   commission.accrued
   commission.reversed
   commission.policy_upserted
   commission.period_closed
   commission.payout_recorded
   payment_intent.created
   provider_event.ingested
   appointment_charge.resolved
   reconciliation.issue_resolved
   ```

3. Payload hash SHA-256; replay devolve `response_payload` sem reaplicar efeitos.
4. Resposta no receipt: **somente identificadores e status** (padrão
   `is_safe_mobile_command_response`) — sem PII, sem totais redundantes
   desnecessários, sem dados de cartão.
5. Concorrência: `SELECT … FOR UPDATE` no receipt + lock da entidade agregada
   (`service_order` / `cash_session`) dentro da mesma transação RPC.
6. Uma única comanda histórica por appointment: índice único parcial no banco
   (`UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL` — filtro só por
   nulo, **não** por status) + claim/lock na RPC (defense in depth). Falha
   operacional não se corrige criando outra comanda.
7. Web mutações novas deste domínio **devem** adotar o mesmo padrão (corrigir a
   assimetria atual de `update_appointment_status_v2` para escritas financeiras;
   agenda legada pode permanecer até etapa dedicada).

Cliente: `createMobileRequestId()` em `packages/domain/src/mobile-commands.ts`,
retido entre retries.

## 9. Auditoria e eventos imutáveis

Padrão a espelhar de `appointment_events`:

| Ledger / log | Política |
| --- | --- |
| `appointment_events` | já imutável — manter |
| `appointment_policy_snapshots` | append / versionado; sem rewrite silencioso |
| `appointment_charge_resolutions` | decisões append-only / compensáveis |
| `service_order_events` | append-only; UPDATE/DELETE rejeitados |
| `order_payment_entries` / refunds / cash_movements / commission_* | sem delete; correção = compensação |
| `payment_provider_events` | append-only; idempotência por unique key |
| `command_receipts` | append/complete; sem rewrite de hash |

Todo evento carrega: `establishment_id`, `actor_id`, `created_at`, `metadata`
jsonb objeto-seguro, e referência ao agregado.

RLS: `REVOKE` de escrita `authenticated`/`anon`; mutação só via RPC
`SECURITY DEFINER` com autorização e isolamento por `establishment_id`.

## 10. Centavos, moeda e fuso

### 10.1 Decisão de money no domínio novo

| Domínio | Representação | Decisão |
| --- | --- | --- |
| Novo POS (`service_order*`, payments, cash, commission, intents, refunds, methods) | **inteiros em centavos** (`integer` / `bigint`) + `currency` | Obrigatório |
| SaaS `billing_*` | `*_cents` | Mantém (já correto) |
| Legado `appointments.price_charged`, `services.price` | `numeric` decimal | **Congelado nesta etapa**; não migrar silenciosamente no P0 inteiro |

Conversão na fronteira (quando reportes unificados forem necessários):

```text
cents = round(numeric_reais * 100)  — apenas em RPC/report server-side
```

Moeda default: `establishments.currency` (`BRL`).  
P0 não introduz multi-moeda operacional além do campo; validar `currency`
igual à da unidade em toda RPC financeira.

### 10.2 Fuso horário

- Instantes: `timestamptz`.
- Dia operacional / abertura de caixa / filtros de relatório: converter com
  `establishments.timezone` (default `America/Sao_Paulo`), padrão já usado em
  agenda e `get_admin_report*`.
- “Hoje” do caixa = data local do establishment, não UTC date.

### 10.3 Totais e `payment_status`

Totais de comanda são **derivados no backend** a partir dos itens e regras de
desconto; payload do cliente envia linhas (serviço/produto/qtd/desconto
permitido), nunca `total_cents` autoritativo.

`payment_status` é **somente calculado** na leitura (RPC/view/query), a partir
do total congelado + `order_payment_entries` + `payment_refunds` +
compensações — **não** é coluna persistida em `service_orders` e **não** é
enviado pelo frontend como fonte de verdade.

## 11. Estratégia para não misturar com `billing_*`

1. Prefixo/nomes distintos: `service_order_*`, `order_payment_*`,
   `establishment_payment_methods`, `cash_*`, `commission_*`,
   `payment_provider_*`, `payment_intents`, `payment_refunds`,
   `appointment_policy_snapshots`, `appointment_charge_resolutions`,
   `reconciliation_*` — **nunca** `billing_*`.
2. Sem FK de POS → `billing_invoices` / `billing_subscriptions`.
3. Entitlement SaaS só governa `access_mode` (pode usar o produto); não cria
   fatura de atendimento.
4. Control UI/financeiro permanece SaaS; novas telas de POS ficam em Web/Business.
5. Observabilidade: tags `domain=establishment_financial_ops` vs
   `domain=platform_billing`.
6. Testes de contrato devem falhar se RPC POS tocar tabela `billing_%`.

## 12. Lista proposta de migrations e ordem

Próximo identificador coerente após `20260813000000_*`: série `20260814…`.
Timestamps abaixo são **proposta de ordem lógica**; o número final deve ser o
próximo livre no momento da implementação (há colisões históricas de timestamp
no repositório — não reutilizar nomes).

| # | Migration proposta | Conteúdo |
| --- | --- | --- |
| M1 | `20260814000000_financial_ops_foundation.sql` | **Implementada (Etapa 1)** — flag + capabilities granulares + exposição no contexto operacional |
| M2 | `…_service_orders_foundation.sql` | `service_orders` contém **somente o estado operacional**; items, events; **sem coluna `payment_status`** (estado financeiro calculado server-side quando o domínio de pagamentos existir); índice único parcial `UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL` (uma única comanda histórica por appointment); RLS/grants |
| M3 | `…_service_order_lifecycle_rpcs.sql` | `open` / `start` / `finish` / `close` / `void` (+ `reopen_voided_service_order` quando a etapa de RPCs decidir) + receipts + testes SQL de unicidade histórica e authz |
| M4 | `…_establishment_payment_methods.sql` | Formas de pagamento da unidade + seed mínimo |
| M5 | `…_order_payments_foundation.sql` | `order_payment_entries` (estados §5.4) + RPCs record/void |
| M6 | `…_cash_registers_and_sessions.sql` | `cash_registers` (Caixa principal auto), `cash_sessions` (declared count), `cash_movements` + RPCs |
| M7 | `…_commission_domain_foundation.sql` | `commission_policies`, `commission_entries`, `commission_adjustments`, `commission_settlements` + accrual no close |
| M8 | `…_payment_provider_foundation.sql` | `payment_provider_accounts`, `payment_provider_events` (`UNIQUE(provider, external_event_id)`), `payment_intents` |
| M9 | `…_payment_refunds.sql` | `payment_refunds` + efeitos compensatórios |
| M10 | `…_appointment_policy_and_charge_resolutions.sql` | `appointment_policy_snapshots`, `appointment_charge_resolutions` |
| M11 | `…_reconciliation_foundation.sql` | `reconciliation_runs` / `reconciliation_issues` + RPCs |
| M12 | `…_financial_ops_reporting_bridge.sql` | Relatórios: produção legado vs recebido/caixa (centavos), sem quebrar Web atual |

`membership_capability_overrides` entra em migration própria em etapa granular
posterior à fundação de capabilities — **não** nesta Etapa 0 documental.

Regras: não editar migrations já versionadas; cada entrega cria migration nova +
teste SQL transacional com `ROLLBACK`.

## 13. Lista proposta de RPCs e responsáveis

| RPC proposta | Agregado | Caps | App primário |
| --- | --- | --- | --- |
| `open_service_order` | service_order | `manage_own_orders` / `manage_team_orders` | Business / Web |
| `start_service_order` | service_order | `manage_own_orders` / `manage_team_orders` | Business / Web |
| `upsert_service_order_item` | service_order | manage orders (+ `apply_order_discounts` se desconto) | Business / Web |
| `remove_service_order_item` | service_order | manage orders | Business / Web |
| `finish_service_order` | service_order + appointment | manage orders | Business / Web |
| `close_service_order` | service_order + commission | manage orders | Business / Web |
| `void_service_order` | service_order | `void_orders` | Business / Web |
| `reopen_voided_service_order` | service_order | cap administrativa específica (futura) | Web (primário) |
| `get_service_order` / `list_service_orders_for_day` | leitura | `view_orders` | Business / Web |
| `list_establishment_payment_methods` | methods | autenticado com cap de pagamento/comanda | Business / Web |
| `record_order_payment` | payment | `take_payments` | Business / Web |
| `void_order_payment` | payment | `void_payments` | Business / Web |
| `request_payment_refund` | refund | `issue_refunds` | Web (primário) / Business |
| `open_cash_session` | cash | `operate_cash` | Business / Web |
| `close_cash_session` | cash | `close_cash` | Business / Web |
| `reopen_cash_session` | cash | `reopen_cash` | Web |
| `record_cash_movement` | cash | `operate_cash` | Business / Web |
| `get_cash_session` | cash | `view_cash` | Business / Web |
| `upsert_commission_policy` | commission_policies | `manage_commission_policies` | Web |
| `close_commission_period` | settlements | `close_commission_period` | Web |
| `record_commission_payout` | settlements | `record_commission_payout` | Web |
| `reverse_commission_entry` | commission | `manage_commission_policies` ou settlement caps | Web |
| `create_payment_intent` | intent | `take_payments` | backend / Web |
| `sync_payment_intent_status` | intent | service_role / webhook | Edge Function |
| `ingest_payment_provider_event` | provider_events | service_role | Edge Function |
| `resolve_appointment_charge` | charge_resolutions | caps admin + refunds conforme caso | Web |
| `list_reconciliation_issues` | recon | `view_reconciliation` | Web |
| `resolve_reconciliation_issue` | recon | `manage_reconciliation` | Web |

Leituras (`get_service_order`, listagens) podem incluir `payment_status` como
campo **calculado** na resposta — nunca como input do cliente nem coluna
autoritativa.

`reopen_voided_service_order` (nome canônico provisório; etapa de RPCs pode
ajustar): opera sobre a **mesma** `service_order`; exige capability
administrativa específica; motivo obrigatório; preserva histórico de anulação;
gera evento imutável; usa `request_id`, `command_receipts` e lock da comanda;
**não** cria nova `service_order`. Não implementada nesta revisão documental.

Todas: `SECURITY DEFINER`, `search_path` fixo, authz server-side,
`establishment_id` isolado, `request_id` + `command_receipts`, lock concorrente
quando mutarem saldo/totais.

Edge Functions de provedor usam `service_role` **somente no backend Deno**;
nunca em Web/Client/Business.

## 14. Riscos de regressão

| Superfície | Risco | Mitigação |
| --- | --- | --- |
| Web agenda | Alterar `complete`/`update_appointment_status_v2` para exigir comanda quebra unidades sem flag | Gate por `financial_ops_enabled`; default off |
| Web / Business | Confundir `finish` (completed) com pagamento | Copy + contratos; `payment_status` calculado separado do status operacional |
| Web / Business | Persistir ou enviar `payment_status` do cliente | Proibir coluna e input; só campo calculado na resposta |
| Web relatórios | Trocar `price_charged` decimal por centavos sem bridge quebra UI/números | Bridge explícita (M12); manter campos legados até migração de UI |
| Client | Expor pagamento ou mudar semântica de `completed` | Client fora do POS P0; status labels inalterados |
| Business | `complete_business_appointment` hoje encerra sem caixa | Flag off = comportamento atual; UI nova atrás da flag |
| Control | Contaminar analytics SaaS com “revenue” de unidade | Manter proibição de métricas cash/revenue inventadas |
| Billing SaaS | Reuso acidental de tabelas/RPCs | Code review + testes de fronteira |
| Nome `service_order` | Erros de reorder de catálogo já usam esse radical | Renomear códigos de catálogo ou usar `catalog_service_order_*` |
| Money dual | Misturar decimal e cents | Campos novos `*_cents`; legado intacto |
| Concorrência / duplicidade | Segunda comanda no mesmo appointment (mesmo após void/close); dois closes | `UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL` + receipts + `FOR UPDATE`; correção via `reopen_voided_service_order` |
| Homologação | Editar `supabase.generated.ts` antes do apply remoto | Contrato temporário Business |

## 15. Critérios de pronto do P0 completo

O P0 financeiro-operacional só está **pronto** quando todos os itens abaixo
forem verdadeiros:

1. Flag `financial_ops_enabled` default `false` e opt-in por establishment.
2. Ciclo completo atrás da flag:
   `confirmed` → `open` → `in_service` → `finish` (`awaiting_payment` +
   appointment `completed`) → pagamentos comuns → `close` (saldo resolvido) →
   cash (se espécie) → commission provisionada → refund compensatório →
   reconciliation mínima.
3. Estado operacional persistido e `payment_status` **calculado** permanecem
   separados; UI não trata `completed` do appointment como “pago”; frontend
   nunca envia/persiste `payment_status`.
4. Pagamentos comuns apenas em `awaiting_payment`; pós-`closed` só
   estorno/reversão/admin auditado; estorno não reabre status operacional.
5. Uma única comanda histórica por appointment protegida por
   `UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL` (filtro só nulo,
   não status); `voided`/`closed` não liberam nova comanda.
6. Nenhuma escrita `authenticated` direta nas tabelas financeiras novas.
7. Todas as mutações com RPC `SECURITY DEFINER` + `command_receipts` + isolamento
   por `establishment_id`.
8. Money novo em centavos inteiros; sem PAN/CVV/secrets.
9. Domínio de comissão com policies/entries/adjustments/settlements; accrual no
   close com saldo resolvido.
10. `cash_registers` + sessão com contagem declarada; Caixa principal automático.
11. `establishment_payment_methods` e fundação de provedor
    (`payment_provider_accounts` / `events` com unique de evento).
12. Snapshots/resolutions de política de appointment para no-show/sinal/waiver.
13. Relatórios distinguem **produção**, **recebido** e **caixa**.
14. `billing_*` intocado funcionalmente para POS.
15. Web, Client, Business e Control preservam fluxos atuais com flag off.
16. Testes SQL: authz negativa, isolamento, idempotência, concorrência, uma
    única comanda histórica por appointment (incluindo após `voided`/`closed`),
    e cálculo de `payment_status` sem coluna persistida; fixtures em `ROLLBACK`.
17. Typecheck shared/business/web + lint + unit e2e project unit verdes para
    contratos tocados.
18. Contratos TypeScript só após schema homologado (ou temporários explícitos no
    padrão Business).
19. Docs de produto atualizados na etapa que liberar UI.
20. Schema de `service_orders` (Etapa granular 2) **não** cria coluna
    `payment_status`.

### 15.1 Critério de pronto desta Etapa 0

- [x] Inventário comprovado no código
- [x] Fronteiras e máquinas de estado documentadas (revisão aplicada)
- [x] Capacidades granulares, flags, idempotência, auditoria, money, anti-`billing_*`
- [x] Ordem de migrations e RPCs proposta (revisão aplicada)
- [x] Ajustes residuais: `payment_status` só calculado; uma comanda histórica por appointment
- [x] Riscos e DoD do P0
- [x] Documento canônico em `docs/architecture/FINANCIAL_OPERATIONAL_P0.md`

### 15.2 Critério de pronto desta Etapa 1

- [x] Migration `20260814000000_financial_ops_foundation.sql`
- [x] `establishments.financial_ops_enabled` default `false` + trigger anti-escrita Business/Client
- [x] Capabilities granulares no resolver SQL + `packages/database/src/business.ts`
- [x] `financial_ops_enabled` no contexto `get_my_business_operational_contexts`
- [x] Contratos money em `packages/domain/src/money.ts` + validation thin wrappers
- [x] Testes unitários TS + teste SQL transacional
- [x] Sem tabelas de comanda/pagamento/caixa/comissão/provedor
- [ ] Homologação da migration no ambiente remoto (pendente)
- [x] Etapa 2 iniciada em branch dedicada após merge da Etapa 1

### 15.3 Critério de pronto desta Etapa 2

- [x] `service_orders` criado
- [x] `service_order_items` criado
- [x] `service_order_events` criado
- [x] sem `payment_status`
- [x] unique histórica por appointment
- [x] múltiplos walk-ins permitidos (assert no teste SQL; execução pendente)
- [x] money em cents
- [x] totals server-side
- [x] tenant integrity
- [x] items congelados após finish (`awaiting_payment`+)
- [x] eventos imutáveis
- [x] sem escrita direta authenticated
- [x] teste SQL transacional (artefato; **execução em Postgres pendente**)
- [x] teste unitário estático
- [x] Etapa 3 iniciada em branch empilhada
- [ ] migration homologada (`supabase db reset` / `psql` — pendente; sem
      PostgreSQL/Docker/`DATABASE_URL` neste ambiente)

### 15.4 Critério de pronto desta Etapa 3

- [x] Migration `20260816000000_service_order_lifecycle_rpcs.sql`
- [x] RPCs: open/start/upsert/remove/finish/close/void/reopen/get/list
- [x] Helpers: flag, authz own/team, lock+version, money→cents, safe receipts
- [x] Idempotência via `command_receipts` + command types `service_order.*`
- [x] `finish` completa appointment sem receipt paralelo / sem insert manual de
      `appointment_events`
- [x] `close` só com `total_cents = 0` (`service_order_balance_unresolved`)
- [x] Sem `payment_status`, pagamentos, caixa, comissão, UI
- [x] Contratos TS temporários + mappers fail-closed
- [x] `remove_service_order_item` usa argumento canônico
      `target_service_order_item_id` (SQL alinhado ao TS; upsert mantém
      `target_item_id`)
- [x] Mappers rejeitam nullable inválido pós-`jsonb_strip_nulls` (ausente/`null`
      → null tipado; valor inválido → mapper `null`)
- [x] Suite SQL: remoção por named args + replay/authz/freeze + `read_only` /
      `blocked` via billing real
- [x] Unitário estático isola cada função (claim/complete/versão/parity SQL↔TS)
- [x] Teste SQL transacional + unitário estático (artefatos)
- [ ] Execução SQL / homologação (**pendente** sem Postgres neste ambiente)
- [x] Etapa 4 não iniciada

## 16. Plano de etapas seguintes

### 16.1 Sequência lógica de produto (referência)

| Etapa de produto | Escopo |
| --- | --- |
| **P0** | Este documento (inventário + decisões) — concluído |
| **P1** | Flag + capabilities granulares + contratos de domínio/validação (sem tabelas de pagamento) |
| **P2** | Fundação e ciclo de `service_orders` (open→…→closed) + integração appointment |
| **P3** | Métodos de pagamento da unidade + `order_payment_entries` |
| **P4** | `cash_registers` / sessions / movements |
| **P5** | Domínio completo de comissão |
| **P6** | Provedor (`accounts` / `events` / `intents`) + refunds |
| **P7** | Policy snapshots + charge resolutions |
| **P8** | Reconciliation + reporting bridge + UI mínima + observabilidade |
| **P9** | Hardening e atualização dos contratos multi-app |

### 16.2 Fronteiras de PR/branch — 15 etapas granulares do plano de execução

A sequência de produto acima **não** substitui o fatiamento de entrega. As
fronteiras de PR/branch continuam sendo as **15 etapas granulares** do plano de
execução:

| Etapa granular | Entrega |
| --- | --- |
| **0** | Inventário e decisão arquitetural (este documento) — concluída |
| **1** | Flag `financial_ops_enabled` + capabilities granulares + contratos domain/validation — **implementada** |
| **2** | Schema `service_orders` / items / events + `UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL`; sem coluna `payment_status` — **implementada** (homologação SQL pendente) |
| **3** | RPCs de ciclo: open / start / finish / close / void / reopen / items / get / list — **implementada + endurecida** (stacked; contratos alinhados; homologação SQL pendente) |
| **4** | Integração appointment ↔ check-in/comanda (Business/Web, flag on) — **não iniciada** |
| **5** | `establishment_payment_methods` |
| **6** | `order_payment_entries` + record/void payment |
| **7** | `cash_registers` + `cash_sessions` + `cash_movements` |
| **8** | `commission_policies` + `commission_entries` (accrual no close) |
| **9** | `commission_adjustments` + `commission_settlements` |
| **10** | `payment_provider_accounts` + `payment_provider_events` + `payment_intents` |
| **11** | `payment_refunds` + efeitos compensatórios |
| **12** | `appointment_policy_snapshots` + `appointment_charge_resolutions` |
| **13** | `reconciliation_*` |
| **14** | Reporting bridge + UI mínima + observabilidade + contratos multi-app |

Cada etapa granular = branch própria a partir de base estável; **sem commit
direto em `master`**.

## 16.3 Etapa 1 — registro de implementação

### Artefatos

| Artefato | Local |
| --- | --- |
| Migration | `supabase/migrations/20260814000000_financial_ops_foundation.sql` |
| Teste SQL | `supabase/tests/financial_ops_foundation.sql` |
| Capabilities / contexto | `packages/database/src/business.ts` |
| Contrato RPC temporário Business | `packages/database/src/business-rpc.generated.ts` (regenerar `supabase.generated.ts` após homologação) |
| Money | `packages/domain/src/money.ts` |
| Validation (thin) | `packages/validation/src/money.ts` |
| Testes TS | `tests/unit/money.unit.spec.ts`, `tests/unit/financial-ops-foundation.unit.spec.ts`, `tests/unit/business-contracts.unit.spec.ts` |

### Decisão flag × capabilities

```text
capabilities = autoridade potencial do usuário (role + access_mode)
financial_ops_enabled = disponibilidade do produto na unidade
```

A flag **não** remove capabilities do contexto quando está `false`. A UI/RPC
futura deve exigir as duas condições. Nenhum fluxo atual depende de
`financial_ops_enabled = true`.

Até a homologação de `20260814000000`, o mapper TypeScript
(`mapBusinessOperationalContext`) trata ausência de `financial_ops_enabled` no
payload como `false`, para não quebrar o Business contra backends ainda sem a
coluna/RPC atualizada. Valores não booleanos continuam inválidos.

### Superfície que altera a flag

- **Não:** Business, Client, nem UPDATE/INSERT autenticado de membership admin
  com `financial_ops_enabled = true`.
- **Sim (futuro):** Control / administração interna via `service_role` ou RPC
  administrativa dedicada (superadmin).
- Proteção: trigger `enforce_financial_ops_flag_write` em
  `BEFORE INSERT OR UPDATE OF financial_ops_enabled` — permite default `false`
  no INSERT; rejeita `true` para authenticated não-superadmin; UPDATE com o
  mesmo valor da flag não bloqueia.

### Web

O Web continua em `get_my_operational_contexts` (sem capabilities). O campo
`financial_ops_enabled` fica disponível no schema/`establishments` e no
contexto Business; não há mudança visual no Web nesta etapa.

### `membership_capability_overrides`

Decisão documental preservada; tabela **não** criada na Etapa 1.

## 16.4 Etapa 2 — registro de implementação

### Artefatos

| Artefato | Local |
| --- | --- |
| Migration | `supabase/migrations/20260815000000_service_orders_foundation.sql` |
| Teste SQL | `supabase/tests/service_orders_foundation.sql` |
| Teste unitário estático | `tests/unit/service-orders-foundation.unit.spec.ts` |

### Tabelas criadas

| Tabela | Papel |
| --- | --- |
| `public.service_orders` | Comanda comercial; só status operacional |
| `public.service_order_items` | Itens com snapshot e money em cents |
| `public.service_order_events` | Audit log append-only / imutável |

### Colunas e tipos relevantes (`service_orders`)

- `id uuid` PK; `establishment_id uuid` NOT NULL → `establishments`
- `appointment_id text` → `appointments(id)` (tipo real do projeto)
- `establishment_client_id uuid` → `establishment_clients` ON DELETE SET NULL
- `professional_id uuid` → `profiles` ON DELETE RESTRICT
- `status text` CHECK: `open | in_service | awaiting_payment | closed | voided`
- `currency text` NOT NULL DEFAULT `'BRL'` CHECK (`currency = 'BRL'`)
- Money: `subtotal_cents` / `discount_cents` / `total_cents` `bigint` (0…
  9007199254740991) com invariante
  `total_cents = subtotal_cents - discount_cents`
- **Sem** coluna `payment_status` (nem `financial_status` / `paid_status` /
  `settlement_status` / `balance_status`)
- Timestamps de ciclo + actors (`created_by`/`updated_by` obrigatórios;
  transitions opcionais ON DELETE SET NULL)
- `version bigint` NOT NULL DEFAULT 1; `UNIQUE (id, establishment_id)`
- `service_orders_transition_actor_chk`: timestamp e actor pareados
  (`started_at` ↔ `started_by`, `finished_*`, `closed_*`, `voided_*`)
- `service_orders_transition_chronology_chk`:
  `opened_at ≤ started_at ≤ finished_at ≤ closed_at`;
  `voided_at ≥ opened_at` e ≥ `started_at`/`finished_at` quando existirem

### Decisão final de totals

- Itens: `subtotal_cents` e `total_cents` são
  `GENERATED ALWAYS AS ... STORED` a partir de
  `quantity * unit_price_cents` e desconto.
- Comanda: totais **não** são gerados; função interna
  `recalculate_service_order_totals(uuid)` soma os itens, protege overflow,
  faz `FOR UPDATE` na comanda, atualiza `updated_at` e `version = version + 1`
  **sem** alterar `updated_by`.
- Trigger `AFTER INSERT OR UPDATE OR DELETE` em `service_order_items`.
- Função **não** é RPC de app; `EXECUTE` revogado de `PUBLIC`/`anon`/
  `authenticated`.
- Mutações de item (`enforce_service_order_items_mutable`) também fazem
  `SELECT … FOR UPDATE` na comanda **antes** de INSERT/UPDATE/DELETE, para
  serializar concorrência e impedir transição para `awaiting_payment` no meio
  da mutação. O recálculo reutiliza o mesmo lock da transação.
  Correção estrutural de lock (`FOR SHARE` → `FOR UPDATE`); concorrência
  runtime **não** foi validada só com teste estático.

### Índices

- `service_orders_one_per_appointment_idx` UNIQUE `(appointment_id) WHERE appointment_id IS NOT NULL`
- `(establishment_id, status, created_at DESC, id)`
- `(establishment_id, professional_id, created_at DESC)`
- `(establishment_id, establishment_client_id, created_at DESC)`
- items: `(service_order_id, sort_order, id)`, `(establishment_id, service_id)`,
  `(establishment_id, professional_id)`
- events: `(service_order_id, created_at DESC, id DESC)`,
  `(establishment_id, created_at DESC)`,
  `(actor_id, created_at DESC) WHERE actor_id IS NOT NULL`

### Invariantes de tenant

Trigger `enforce_service_order_tenant_integrity` (INSERT/UPDATE das chaves):

- appointment → mesmo `establishment_id` (`service_order_appointment_tenant_mismatch`)
- establishment_client → mesmo establishment (`service_order_client_tenant_mismatch`)
- professional → membership `active` na unidade
  (`service_order_professional_tenant_mismatch`)

Itens: FK composta `(service_order_id, establishment_id)` + trigger de
serviço/profissional (`service_order_item_*_tenant_mismatch`).

Ordem explícita dos triggers `BEFORE` em `service_order_items` (PostgreSQL
ordena alfabeticamente no mesmo timing/evento):

1. `service_order_items_10_mutability_guard` →
   `enforce_service_order_items_mutable` (parent imutável + freeze/`FOR UPDATE`)
2. `service_order_items_20_tenant_guard` →
   `enforce_service_order_item_tenant_integrity`

Assim, UPDATE de `establishment_id`/`service_order_id` falha canonicamente com
`service_order_item_parent_immutable` antes de qualquer mismatch de tenant.

### RLS / grants

- RLS habilitado nas três tabelas.
- `REVOKE ALL` de `PUBLIC`/`anon`/`authenticated` (sem policy de escrita e sem
  grant de leitura direta de app).
- `service_role`: SELECT/INSERT/UPDATE em orders; SELECT/INSERT/UPDATE/DELETE em
  items; SELECT/INSERT em events (+ sequence).
- Leitura/mutação de produto ficam para RPCs SECURITY DEFINER da Etapa 3.

### Imutabilidade e congelamento

- `DELETE` físico de `service_orders` → `service_orders_is_immutable`
  (reusa `reject_immutable_mobile_record`).
- Events: `UPDATE`/`DELETE` → `service_order_events_is_immutable`.
- Items mutáveis só com comanda em `open` | `in_service`; bloqueio
  `service_order_items_frozen` em `awaiting_payment` | `closed` | `voided`.
- Parent do item imutável: `service_order_id` e `establishment_id` não mudam
  após criação (`service_order_item_parent_immutable`). Correção operacional =
  remover item na comanda editável e criar outro na comanda correta; comanda
  congelada não permite remoção/alteração/transferência.

### Resultados dos testes

| Suite | Resultado |
| --- | --- |
| `tests/unit/service-orders-foundation.unit.spec.ts` | **11 passed** (inclui ordem determinística 10/20 dos triggers) |
| `supabase/tests/service_orders_foundation.sql` | ampliado (parent imutável, actor/timestamp, cronologia); **execução SQL ainda pendente** (sem `psql`/`DATABASE_URL`/Docker) |
| Homologação `supabase db reset` | **pendente** — não declarar homologada sem execução real |
| `typecheck:shared` / `typecheck:business` / `lint` | OK nesta correção |

### Status

- Etapa 2 (schema foundation): **implementada no branch**
- Homologação migration Etapa 2: **pendente**
- Etapa 3: ver §16.5

## 16.5 Etapa 3 — registro de implementação

### Artefatos

| Artefato | Local |
| --- | --- |
| Migration | `supabase/migrations/20260816000000_service_order_lifecycle_rpcs.sql` |
| Teste SQL | `supabase/tests/service_order_lifecycle_rpcs.sql` |
| Teste unitário | `tests/unit/service-order-lifecycle-rpcs.unit.spec.ts` |
| Contratos TS | `packages/database/src/business.ts`, `business-rpc.generated.ts` |

### RPCs

`open_service_order`, `start_service_order`, `upsert_service_order_item`,
`remove_service_order_item`, `finish_service_order`, `close_service_order`,
`void_service_order`, `reopen_voided_service_order`, `get_service_order`,
`list_service_orders_for_day`.

Todas mutações: `SECURITY DEFINER` + `claim_mobile_command` /
`complete_mobile_command` + `request_id` + `FOR UPDATE` + `expected_version`
(exceto open) + `financial_ops_enabled`.

### Decisões desta etapa

- Authz: `manage_own_orders` (próprio) / `manage_team_orders` (equipe);
  leituras com `view_orders` + escopo.
- Open por appointment: seed de item a partir de `services.name` +
  `price_charged`→cents; uma comanda histórica absoluta.
- Finish: `in_service`→`awaiting_payment` e appointment `completed` via UPDATE
  (evento só pelo trigger existente).
- Close: **somente** `total_cents = 0`; positivo →
  `service_order_balance_unresolved` até `order_payment_entries`.
- Comissão **adiada**; void/reopen na mesma comanda.
- Receipts seguros: só `serviceOrderId` / `serviceOrderItemId` / `status` /
  `version` — sem `paymentStatus`.
- `remove_service_order_item`: argumento canônico
  `target_service_order_item_id` (clientes Supabase enviam por nome);
  `upsert_service_order_item` permanece com `target_item_id`.
- Evento `item_removed`: metadata só `itemId` + `serviceId` (sem descrição,
  preço, desconto ou dados pessoais).
- Mappers fail-closed para campos omitidos por `jsonb_strip_nulls`: ausente/
  `null` → `null`; valor presente inválido rejeita o payload inteiro.
- `access_mode=read_only`: get/list no escopo permitidos; mutações `forbidden`.
- `access_mode=blocked`: get/list e mutações `forbidden`.

### Testes / homologação

| Suite | Resultado |
| --- | --- |
| Unit lifecycle | **11 passed** (pós-hardening `ff1201e`) |
| SQL lifecycle + foundation | **pendente** (sem Postgres/`DATABASE_URL`) |
| Homologação | **pendente** — não declarar sem execução real |

### Status

- Etapa 3: **implementada e endurecida no branch empilhado** (`ff1201e`)
- Etapa 4 (UI/integração appointment): **não iniciada**
- Pagamentos / caixa / comissão / provider / refunds / UI: **não iniciados**

## 17. Divergências código atual × arquitetura proposta

Pontos em que o código de hoje **diverge** do alvo deste P0 (não são bugs desta
etapa; são débitos explícitos a fechar nas etapas seguintes):

1. **Domínio POS parcial** — Etapas 2–3 entregam schema + RPCs de ciclo de
   `service_orders`; continuam inexistentes payment methods, payments, cash
   registers/sessions, commission domain, provider foundation, refunds, policy
   snapshots/resolutions e reconciliation.
2. **`price_charged` é `numeric(12,2)`** — domínio novo exige centavos; snapshot
   de appointment permanece decimal legado até bridge consciente.
3. **`complete_*` ≠ `finish_service_order`** — fluxos legados ainda podem
   concluir appointment sem comanda; Etapa 3 introduz `finish_service_order`
   com janela `awaiting_payment`, mas UI/integração (Etapa 4) não consome isso.
   Não há `payment_status` calculado a partir de pagamentos.
4. **Separação operacional/financeiro incompleta** — status operacional da
   comanda existe; `payment_status` permanece só calculado (sem coluna) e sem
   entradas de pagamento ainda.
5. **Comissão é só taxa + projeção** — sem policies/entries/adjustments/settlements.
6. **Check-in de produto ainda não wired** — RPC `open_service_order` existe;
   UI/agenda (Etapa 4) não iniciada.
7. **Capabilities granulares da §6 existem na Etapa 1**; overrides por membership
   ainda não.
8. **Sem `membership_capability_overrides`**.
9. **Flag `financial_ops_enabled` existe** (Etapa 1); rollout opt-in ainda
   fechado (default `false`).
10. **Assimetría de idempotência** — Business mobile / RPCs de comanda usam
    `command_receipts`; Web `update_appointment_status_v2` não.
11. **Colisão semântica `service_order`** — erros de reorder de catálogo.
12. **Dualidade de money** — ops legado decimal vs SaaS cents vs POS cents.
13. **Contratos de produto** ainda marcam pagamento/caixa como fora do ciclo/MVP.
14. **Business detail** não prioriza `price_charged`.
15. **Business sem relatórios densos**.
16. **Nenhuma Edge Function de pagamento de atendimento**.
17. **Sem Caixa principal / métodos de pagamento de unidade / provider event
    inbox**.

## 18. Decisões tomadas nesta Etapa 0

1. Comanda comercial chama-se `service_order`; `command_receipts` fica só para
   idempotência.
2. `appointments` permanece agenda; não vira caixa/pagamento/comissão.
3. `billing_*` permanece SaaS; POS é bounded context novo.
4. Money novo = centavos inteiros; `price_charged` decimal não é reescrito nesta
   fundação.
5. Check-in = `open_service_order` (`open`), não novo status de appointment.
6. Estado operacional da comanda:
   `open → in_service → awaiting_payment → closed` (+ `voided` não-encerrado).
7. Estado financeiro da comanda é separado e **somente calculado**
   (`payment_status` não é coluna de `service_orders`):
   `unpaid | partially_paid | paid | partially_refunded | refunded`.
8. `finish_service_order` → `awaiting_payment` + appointment `completed`; não é
   pagamento.
9. `close_service_order` exige saldo resolvido (ou resolução autorizada) e
   provisiona comissão no P0.
10. Pagamentos comuns só em `awaiting_payment`; pós-`closed` só
    estorno/reversão/admin; estorno não reabre o status operacional.
11. Uma única comanda histórica por appointment:
    `UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL` + RPC/lock;
    `voided`/`closed` não liberam nova comanda; correção via operação auditada
    sobre a mesma comanda (ex.: `reopen_voided_service_order`).
12. Capabilities granulares da §6; overrides futuros via
    `membership_capability_overrides` (sem tabela nesta etapa).
13. Comissão = policies + entries + adjustments + settlements.
14. Caixa = `cash_registers` 1:N `cash_sessions` 1:N `cash_movements`; contagem
    declarada na sessão.
15. Provedor = accounts + events (unique) + intents; payment entry usa estados
    próprios.
16. Policy snapshots + charge resolutions para no-show/sinal/waiver.
17. Toda mutação sensível = RPC + `command_receipts` + isolamento por
    `establishment_id`.
18. Rollout = `financial_ops_enabled` default `false` por establishment.
19. Contratos TS gerados remotos não serão falsificados; usar contrato temporário
    Business até homologação.
20. Etapa 0 **não** cria tabelas nem altera fluxos de produção.
21. Entrega por PR segue as **15 etapas granulares** (§16.2), não só a sequência
    de produto.
22. Etapa granular 2 **não** cria coluna `payment_status` em `service_orders`.

## 19. Fora de escopo desta etapa

### Etapa 0/1 (histórico)

- Qualquer RPC/UI de comanda, pagamento, caixa ou comissão.
- Criação de `membership_capability_overrides` (só decisão de fronteira).

### Etapa 2 (histórico) — fora de escopo daquela entrega

- RPCs de ciclo (`open_service_order`, `start_service_order`,
  `finish_service_order`, `close_service_order`, `void_service_order`,
  `reopen_voided_service_order`, upsert/remove item, get/list).
- Métodos de pagamento, `order_payment_entries`, caixa, comissão, provedor,
  refunds, conciliação.
- UI / rotas / contratos TypeScript de leitura de comanda.
- Edição de `supabase.generated.ts`.
- Avanço para a Etapa 3 (feito depois, na Etapa 3).

### Etapa 3 (atual) — fora de escopo explícito

- Pagamentos, caixa, comissão, provedor, refunds, conciliação.
- UI / rotas / hooks / integração appointment de produto (Etapa 4).
- Edição de `supabase.generated.ts` (contratos temporários em
  `business-rpc.generated.ts`).
- Homologação sem execução real de SQL/`db reset`.

### Ainda fora do P0

- Escolha definitiva de provedor de pagamento (Stripe Connect, PSP BR, etc.).
- Emissão fiscal de atendimento (NFC-e/SAT).
- Folha de pagamento e rateio multi-unidade avançado.
