# Plano Pré-Expansão v2.2 — acompanhamento de implementação

Este arquivo registra execução e evidências; o plano aprovado continua sendo o
contrato de escopo.

| Gate | Estado em 2026-08-08 | Evidência |
| --- | --- | --- |
| F0 contenção | homologada | migration `20260820000000`, UI Web fail-safe e matriz real owner/professional/client na Homolog |
| F0 migrations | reconciliada localmente e aplicada na Homolog | sete migrations aditivas `20260820000000`–`20260820006000`; produção apenas inventariada e preservada |
| F0 baseline | verde local e em CI | typechecks, lint, build Web, 29 testes focados, 42 arquivos SQL/RLS e workflows remotos verdes |
| F0 ADRs | implementados | ADRs 0001–0008 |
| F0 aprovação | **APROVADO** | PR `#30`, commit `afa189e`, CI Install and Build `218` e Schema Drift `103` |
| F1 | liberada, não iniciada | atividade interrompida após a aprovação do Gate F0 |
| F2–F10 | não iniciados | respeitam dependências do plano |

## Flags vinculantes

- `appointment_reassignment_enabled=false` por default.
- `financial_ops_enabled=false` por default nas unidades não opt-in.
- billing SaaS preserva `enforcement_enabled=false` durante beta/cortesia.
- `advance_payment_enabled` só será criado na Fase 6 e nascerá `false`.

## Classificação de evidências

- **Local confirmado:** comando executado com sucesso neste checkout.
- **CI reproduzido:** pipeline remoto executado sobre commit/PR identificado.
- **Homologado:** migration e fluxos reais verificados no projeto de homologação.
- **Produção homologada:** rollout produtivo e papéis reais verificados.

Migration presente, teste estático ou UI isolada não muda automaticamente a classe
para homologado.

## Evidência local da baseline

Executada em 2026-08-08 sobre banco Supabase local descartável, reconstruído com
os grants padrão equivalentes ao dump vinculado:

| Verificação | Resultado |
| --- | --- |
| `npm run typecheck:new-apps` | verde: Shared, Client, Business e Control |
| `npm run typecheck:web` | verde |
| `npm run lint` | verde; Web mantém 35 warnings não bloqueadores |
| suíte unitária focada pós-reconciliação (`playwright`, projeto `unit`) | 29/29 |
| todos os arquivos `supabase/tests/*.sql` via `psql -v ON_ERROR_STOP=1` | 42/42 |
| `npx supabase db lint --local --level warning` | sem erro; 1 warning preexistente em `analytics_private.strict_metric_comparison` |
| `npm run build:web` | verde; export Web concluído |
| `git diff --check` | verde |

O projeto unitário global também foi executado: 413/428 passaram. As 15 falhas
restantes são expectativas estáticas antigas em fluxos Client/Control/perfil
profissional fora do recorte F0; o recorte vinculado às alterações desta fase está
verde e a suíte global não é apresentada como concluída.

## Evidência remota

- Homologação: projeto `sphbbqdgcreowxzjgibj` (`CutSync Homolog`).
- Produção: projeto `hxoenfnszrrgaqxplzmd` (`CutSync.io`), inventariado em
  workspace CLI isolado, sem push, repair, deploy ou mudança de flag.
- Backups separados de roles, schema e data foram capturados para os dois
  ambientes em `C:\Users\PICHAU\AppData\Local\CutSync\backups\f0-20260808-152033`.
  Os dumps de dados são restritos porque podem conter dados pessoais.
- A Homolog recebeu somente as migrations aditivas inéditas
  `20260820000000`–`20260820006000`; o histórico remoto confirma todas as sete.
- `npx supabase db lint --linked --level warning` retornou zero erros e dois
  warnings não bloqueadores: o warning já conhecido de
  `analytics_private.strict_metric_comparison` e uma variável não lida em
  `public.push_changes`.
- `scripts/validate-gate-f0-homolog.ps1` passou com JWTs reais de owner/admin,
  professional e client: bloqueio da troca vinculada, erro por item no modo
  ausência, negação ao profissional, correção de walk-in pelo admin, replay
  idempotente, projeção legada e flag protegida desligada.
- A unidade e os usuários técnicos usaram identificadores aleatórios e foram
  removidos. A verificação posterior retornou zero fixtures residuais.

Esta entrega alcançou as classes **Local confirmado**, **CI reproduzido** e
**Homologado**. O workflow de schema drift está fixado explicitamente na Homolog,
e os tipos versionados foram regenerados desse ambiente.

## Aprovação do Gate F0

- Branch `codex/gate-f0-approval`, PR `#30`.
- Commit funcional validado `afa189e`.
- Install and Build run `218`: `success`.
- Supabase Schema Drift run `103`: `success` contra a Homolog.
- Gate F0: **APROVADO**.

A Fase 1 está liberada, mas não foi iniciada, respeitando a parada solicitada após
a aprovação do gate.
