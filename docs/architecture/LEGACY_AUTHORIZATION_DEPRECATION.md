# Registro de Depreciação de Autoridade Legada (PS1-E1C)

Este documento estabelece o registro formal do ciclo de vida, substitutos modernos e critérios de remoção física (Removal Gates) para todos os contratos e colunas legadas de autoridade e identidade do CutSync.

---

## 1. Matriz Canônica de Depreciação

| Contrato Legado | Status Atual | Consumidores Atuais | Substituto Canônico Moderno | Pode Remover Agora? | Removal Gate (Critério de Remoção Física) |
| :--- | :--- | :--- | :--- | :---: | :--- |
| **`profiles.role`** | `LEGACY_PROJECTION` (Neutralizado) | Apenas fallback de `get_my_profile()` e clientes móveis não atualizados | `memberships.role_template` + `business_capability_catalog` | ❌ Não | Telemetria de clientes antigos zerada e aposentadoria final de RPCs v1. |
| **`profiles.establishment_id`** | `LEGACY_HINT` (Passivo) | Hint de último estabelecimento para clientes legados | `user_app_active_contexts` + `set_my_active_context()` | ❌ Não | Todos os clientes móveis e web consumirem exclusivamente o motor de contextos ativos. |
| **`profiles.commission_rate`** | `LEGACY_BUSINESS_PROJECTION` | Informação legada de comissão em perfil | `memberships.commission_rate` + **PS8 — Financial Operations** | ❌ Não | Implementação do motor unificado de repasses e comissões da Fase PS8. |
| **`memberships.role`** | `LEGACY_COARSE_PROJECTION` | Projeção legada ('admin'/'professional') | `memberships.role_template` (`admin`, `manager`, `reception`, `cashier`, `finance`, `professional`) | ❌ Não | Todos os convites, APIs e webhooks operarem nativamente com `role_template`. |
| **`profile_establishments`** | `DEAD_COMPATIBILITY_TABLE` | Nenhum consumidor ativo em código moderno | `public.memberships` | ❌ Não | Aposentadoria de triggers de sincronização legados na etapa de limpeza de schema. |
| **`switch_active_establishment()`** | `LEGACY_RPC` (v1) | Clientes móveis antigos sem suporte a contextos por aplicativo | `public.set_my_active_context(target_app, target_context_kind, target_establishment_id)` | ❌ Não | Telemetria `legacy.switch_active_establishment.used` registrar zero invocações em janela de 30 dias. |
| **`get_my_profile().role`** | `DYNAMIC_PROJECTION` | Contexto de autenticação frontend inicial | `get_my_authorized_contexts()` + `activeContext` | ❌ Não | Frontend não mais depender de campo `role` no objeto de usuário inicial. |

---

## 2. Invariantes Arquiteturais Consolidados

1. **Identidade Pessoal:** `auth.users` e `public.profiles` representam exclusivamente o indivíduo humano. Não guardam nem conferem autoridade operacional sobre nenhum estabelecimento comercial.
2. **Autoridade Operacional:** Decorre exclusivamente do vínculo ativo `public.memberships` (`role_template`), avaliado dinamicamente pela primitiva `public.has_business_capability(target_establishment_id, required_capability)`.
3. **Autoridade Corporativa:** Decorre de `public.organization_members.role` (`owner`, `manager`, `finance`) para escopos consolidados de rede multiunidade.
4. **Contexto Ativo:** Resoluções de tela e aplicativo decorrem de `public.user_app_active_contexts` isoladas por aplicativo (`web`, `business`, `client`, `control`).
