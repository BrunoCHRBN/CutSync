# Auditoria de Segurança e Code Review — Controle de Acesso (CutSync)

**Escopo:** roles `client`, `professional` e `admin`/dono de estabelecimento (backend Supabase/Postgres + frontends `apps/web`, `apps/business`, `apps/client`).
**Data:** 2026-06
**Modelo de autorização:** a fonte de verdade é a tabela `public.memberships` (`role ∈ {admin, professional}`, `status`). `profiles.role` é apenas um espelho de compatibilidade. Escrita direta em tabelas sensíveis (`appointments`, `establishments`, `profiles`, `services`, `professional_services`) está revogada de `authenticated`; toda mutação passa por RPCs `SECURITY DEFINER` com verificação de papel server-side. Superadmin/governança são tabelas separadas com RLS própria.

**Veredito geral:** a base de autorização é **madura e bem projetada** (P0 hardening aplicado, triggers anti-escalonamento, tokens de convite de 256 bits, matching por e-mail confirmado, colunas PII de `profiles` revogadas em nível de coluna). Foram encontradas **não conformidades pontuais de segregação de acesso e de lógica**, listadas abaixo. As de severidade **Crítica/Alta foram corrigidas** nesta entrega.

---

## Resumo dos achados

| # | Severidade | Área | Status |
|---|-----------|------|--------|
| A1 | 🔴 Alto | `get_establishment_team` expõe comissão/e-mail/telefone dos colegas a `professional` | ✅ Corrigido |
| A2 | 🔴 Alto | `establishment_reviews` legível por `anon` (vaza `client_id` + vínculo) | ✅ Corrigido |
| A3 | 🔴 Alto | Notas internas (`cancellation_note_internal`, `business_notes`) retornadas via `SELECT *` a staff | ✅ Corrigido |
| M1 | 🟠 Médio | Cliente podia alterar `profiles.email` diretamente | ✅ Corrigido |
| M2 | 🟠 Médio | Review permitida em agendamento `confirmed` no passado (no-show) | ✅ Corrigido |
| M3 | 🟠 Médio | Superfície RPC duplicada (`update_appointment_status` v1 + v2) | ⏳ Backlog |
| B1 | 🟡 Baixo | Código morto de cadastro legado com role escolhida pelo cliente | ⏳ Backlog |
| B2 | 🟡 Baixo | Gate de rota no `_layout` usa `profile.role` como fallback (apenas UX) | ⏳ Backlog |

> Pontos verificados e **sem problema**: RLS de `governance_users`, `security_audit_logs`, `superadmins`; imutabilidade de logs de auditoria; constraint anti-overlap de agenda (`EXCLUDE gist`); transições de status server-side com `cancelled_by_role` decidido pelo servidor (sem spoof); PII de `profiles` já revogada em nível de coluna; circuit breaker de billing/inadimplência via triggers; `create_appointment` impede profissional agendar em nome de terceiros e cliente só agenda para si.

---

## Achados detalhados

### A1 — 🔴 Profissional enxerga comissão e contato dos colegas
**Arquivo:** `supabase/migrations/20260721001000_allow_professionals_get_team.sql` → `get_establishment_team`.
A função concedia `commission_rate`, `email` e `phone` de **todos** os membros a qualquer chamador com `has_active_membership(..., ['admin','professional'])`. Ou seja, um **profissional** conseguia ler a comissão e os contatos de todos os colegas e do dono — quebra de segregação de acesso e exposição de dado sensível de negócio.

**Correção aplicada:** `commission_rate`, `email` e `phone` só são retornados quando o chamador é **admin/superadmin** ou é o **próprio membro**. Profissionais continuam vendo a equipe (nome, avatar, título, especialidades). Ver migração `20260811000000`.

---

### A2 — 🔴 Avaliações legíveis publicamente (vaza `client_id`)
**Arquivo:** `supabase/migrations/20260720006000_establishment_ratings_and_reviews.sql`.
```sql
CREATE POLICY "Anyone can read reviews" ON public.establishment_reviews FOR SELECT USING (true);
```
`SELECT` liberado a `anon`, expondo `client_id` (UUID de usuário), comentários e o vínculo cliente↔estabelecimento a qualquer visitante — permite enumeração e correlação de perfis. A média/contagem pública já vive em `establishments.average_rating`/`review_count`, então a tabela bruta não precisa ser pública. Nenhum frontend lê avaliações de terceiros de forma pública (o app do cliente lê apenas as próprias, filtrando por `client_id`).

**Correção aplicada:** política pública removida; leitura restrita ao **autor**, **admins do estabelecimento** e **superadmin**. Ver migração `20260811000000`.

---

### A3 — 🔴 Notas internas expostas a staff via `SELECT *`
**Arquivos:** `apps/web/src/hooks/useAppointments.ts`, `apps/web/src/hooks/useNextAppointment.ts` (`.select('*')`); colunas `appointments.cancellation_note_internal` e `appointments.business_notes`.
O comentário da própria migração declara *"Internal administrative note. Never expose through client-facing RPCs or UI"*, mas o `SELECT *` das telas de agenda retornava essas colunas. Como a RLS de `appointments` permite que um **profissional** leia agendamentos da equipe quando `share_agendas` está ligado (`view_team_agenda`), a nota interna vazava entre papéis.

**Correção aplicada:**
- Frontend: os dois hooks passaram a listar colunas explícitas (sem as notas internas).
- Backend (defesa em profundidade): `REVOKE SELECT (cancellation_note_internal, business_notes)` de `anon`/`authenticated`; mantido para `service_role`. A escrita segue via RPC `update_appointment_status_v2` (SECURITY DEFINER). Ver migração `20260811000000`.

---

### M1 — 🟠 Cliente alterava o próprio `profiles.email`
**Arquivo:** `supabase/migrations/20260721004000_allow_profile_safe_updates.sql`.
O grant dinâmico de `UPDATE` excluía apenas `id/role/establishment_id/commission_rate/deleted_at/created_at`, deixando `email` gravável pelo usuário. Isso diverge de `auth.users.email` e pode poluir fluxos que casam por e-mail.

**Correção aplicada:** `REVOKE UPDATE (email) ON public.profiles FROM authenticated`. O e-mail canônico permanece o do provedor de auth. Ver migração `20260811000000`.

---

### M2 — 🟠 Avaliação de agendamento não concluído
A política de `INSERT` de reviews aceitava `status = 'confirmed' AND date_time < now()`, permitindo avaliar **no-shows**/atendimentos apenas confirmados. Endurecido para exigir `status = 'completed'` e coerência do `establishment_id`. Corrigido junto de A2.

---

### M3 — 🟠 Superfície de RPC duplicada (backlog)
Coexistem `update_appointment_status` (v1, aceita motivo livre) e `update_appointment_status_v2` (usada pelo frontend), ambas concedidas a `authenticated`; `reschedule_appointment` também é redefinida entre migrações. Recomenda-se **revogar/depreciar a v1** para reduzir superfície e o risco de motivo de cancelamento não padronizado. Não corrigido nesta entrega (não é exploração de privilégio; ambos os caminhos validam papel server-side).

---

### B1 — 🟡 Código morto de cadastro legado (backlog)
`apps/web/src/app/(auth)/register.tsx` contém `LegacyRegisterScreen` com seleção de role pelo cliente e `insert` direto em `establishments`. É **inalcançável** (retorna `RegisterExperience` antes) e o `INSERT` em `establishments` está revogado, mas deve ser removido para evitar confusão/reintrodução acidental.

### B2 — 🟡 Fallback de role no gate de rotas (backlog)
`apps/web/src/app/_layout.tsx` deriva `effectiveRole` de `activeContext`/`contexts` e cai em `profile.role`. É apenas navegação de UX (a autorização real é server-side), mas o fallback pode exibir brevemente o dashboard errado durante a carga do contexto operacional.

---

## Correções aplicadas nesta entrega
- **Migração:** `supabase/migrations/20260811000000_access_control_audit_hardening.sql` (A1, A2, A3, M1, M2).
- **Frontend:** `apps/web/src/hooks/useAppointments.ts` e `apps/web/src/hooks/useNextAppointment.ts` (A3 — colunas explícitas).

> ⚠️ **Ação necessária:** a migração precisa ser aplicada no banco Supabase (`supabase db push` / pipeline de migrações). Não há Postgres local neste ambiente para execução; a migração foi validada apenas quanto à sintaxe/estrutura.

## Recomendações de backlog (não bloqueantes)
1. Depreciar `update_appointment_status` v1 (M3).
2. Remover `LegacyRegisterScreen` (B1).
3. Bloquear renderização de dashboard até `operationalContext` resolver, evitando flash de role (B2).
4. Avaliar Column-Level Security nativa para `commission_rate` como reforço adicional ao filtro por RPC.
