# Allowlist de Compatibilidade Legada de Autoridade (PS1-E1C)

Este documento registra a allowlist canônica de exceções legítimas onde símbolos ou campos legados permanecem estritamente para propósitos de tipagem, compatibilidade de apresentação ou infraestrutura de plataforma.

Nenhum novo item pode ser adicionado sem justificativa técnica e aprovação de arquitetura.

---

## 1. Tabela de Exceções Permitidas

| Símbolo | Localização / Consumidor | Propósito / Motivo | Classificação | Substituto Canônico | Removal Phase | Risco |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `profile.role` | `apps/web/src/contexts/AuthContext.tsx` | Tipagem e adaptação passiva para consumidores antigos do contexto de autenticação | `LEGACY_PROJECTION` | `activeContext.capabilities` / `hasCapability` | PS4 | Baixo |
| `profile?.role` | `apps/web/src/components/governance/*` | Verificação de cargo na plataforma SaaS interna (`governance_profiles.role`: `SaaS_Viewer`, `SaaS_Editor`, `SaaS_Owner`), NÃO `public.profiles.role` | `GOVERNANCE_ROLE` | Mantido (domínio próprio de governança de plataforma) | Permanente | Baixo |
| `profiles.role` | `public.handle_new_user()` (Trigger) | Inicialização com valor `'client'` para satisfazer constraint `NOT NULL` do schema base | `LEGACY_PLACEHOLDER` | Neutralizado (não concede authority) | PS4 | Baixo |
| `memberships.role` | `public.memberships` / `project_legacy_role_from_template` | Projeção coarse legada (`admin` / `professional`) derivada de `memberships.role_template` | `LEGACY_PROJECTION` | `memberships.role_template` | PS4 | Baixo |
| `profiles.establishment_id` | `public.switch_active_establishment()` | Hint de último estabelecimento selecionado para clientes legados sem suporte a contextos | `LEGACY_HINT` | `user_app_active_contexts` / `set_my_active_context` | PS4 | Baixo |
| `profiles.commission_rate` | `public.profiles` | Taxa de comissão legada mantida temporariamente até a implementação da engine de comissões | `LEGACY_BUSINESS_PROJECTION` | `memberships.commission_rate` / `PS8 — Financial Operations` | PS8 | Baixo |

---

## 2. Regra de Governança de Código

Qualquer nova tentativa de ramificar lógica de negócio, autorização, RLS ou roteamento operacional moderno com:
- `profile.role === 'admin'` ou `profile.role === 'professional'`
- `profile.establishment_id`
- `membership.role === 'admin'`

será barrada pelos regression guards automatizados:
- **Frontend:** [`tests/unit/legacy-authorization-guard.unit.spec.ts`](file:///c:/Users/PICHAU/OneDrive/Desktop/CutSync/tests/unit/legacy-authorization-guard.unit.spec.ts)
- **Database:** [`supabase/tests/phase1_legacy_authority_guard.sql`](file:///c:/Users/PICHAU/OneDrive/Desktop/CutSync/supabase/tests/phase1_legacy_authority_guard.sql)
