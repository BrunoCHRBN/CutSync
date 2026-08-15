# Establishment Lifecycle Architecture & Authority Cutover (PS3-E1)

## 1. Executive Summary

This document defines the canonical domain boundaries, authority matrix, state transitions, and integration invariants for CutSync establishments following the **PS3-E1** cutover.

Prior to PS3-E1, finishing the establishment onboarding wizard directly mutated `establishments.account_status = 'active'`, blending operational readiness with governance verification and platform risk management.

PS3-E1 completely decouples these concerns into 5 distinct orthogonal lifecycle models:

```text
Business Registration
        ↓
Organization + Unit Created
        ↓
lifecycle_status = 'configuring'
account_status   = 'pending_verification'
        ↓
Operational Setup (Opening hours, services, team)
        ↓
finalize_establishment_onboarding_v2()
        ↓
lifecycle_status = 'ready'
account_status   = 'pending_verification' (UNTOUCHED)
        ↓
Independent Governance Review
        ↓
account_status = 'active'
        ↓
Explicit Operational Activation (set_establishment_lifecycle_status)
        ↓
lifecycle_status = 'active'
```

---

## 2. Orthogonal Domain Dimensions

CutSync establishes strict boundaries between five operational and platform statuses:

| Dimension | Attribute / Function | Allowed / Resolved Values | Authority / Responsible Domain |
| :--- | :--- | :--- | :--- |
| **Operational Lifecycle** | `establishments.lifecycle_status` | `draft`, `configuring`, `ready`, `active`, `paused`, `closed`, `archived` | Operational Establishment Admin / Capability `manage_operational_settings` (AAL2) |
| **Platform Governance** | `establishments.account_status` | `pending_verification`, `active`, `delinquent`, `blocked` | Platform Governance Authority (backend-authorized governance roles, e.g. SaaS_Editor / SaaS_Owner / Superadmin). Business capabilities **NEVER** grant `account_status` mutation. |
| **Financial Entitlement** | `public.billing_access_mode(establishment_id)` *(Derived Function)* | `full`, `read_only`, `blocked` | SaaS Subscription Entitlement Engine. Inputs: active subscription, trial, transition, courtesy, grace period. **Billing lifecycle ≠ establishment lifecycle**. |
| **Identity Verification** | `establishments.kyc_status` | `unsubmitted`, `pending`, `approved`, `rejected` | SaaS Compliance / KYC Document Verification Review |
| **Marketplace Discovery** | `establishments.discovery_status` | `draft`, `published`, `unpublished` | Editorial / Marketplace Operations (`publish_establishment_discovery`, `unpublish_establishment_discovery`) |

---

## 3. Operational Lifecycle State Machine

```mermaid
stateDiagram-v2
    [*] --> configuring: register_business_identity_atomic()
    configuring --> ready: finalize_establishment_onboarding_v2()
    ready --> active: set_establishment_lifecycle_status(active) [Requires account_status = 'active']
    active --> paused: set_establishment_lifecycle_status(paused)
    paused --> active: set_establishment_lifecycle_status(active) [Requires account_status = 'active']
    active --> closed: ORCHESTRATION_REQUIRED_PS3_E2
    paused --> closed: ORCHESTRATION_REQUIRED_PS3_E2
    closed --> archived: ORCHESTRATION_REQUIRED_PS3_E2
```

### Transition Invariants:

1. **`configuring` $\rightarrow$ `ready`**:
   - Authorized by `manage_operational_settings` capability + AAL2.
   - Enforces `establishment_configuration_is_ready(establishment_id)`:
     - Opening hours configured and parsable.
     - At least 1 active service.
     - At least 1 active administrative or operational management membership.
   - Saves opening hours.
   - Increments `lifecycle_version`.
   - Records `establishment_lifecycle_events` and audit log.
   - **NEVER** mutates `account_status`.

2. **`ready` $\rightarrow$ `active`**:
   - Requires `account_status = 'active'` (Platform governance approval).
   - Requires `establishment_configuration_is_ready(...) = true`.
   - Requires `manage_operational_settings` capability + AAL2.
   - Fails with `governance_not_active` if platform governance has not approved the unit.

3. **`active` $\leftrightarrow$ `paused`**:
   - Purely operational state change for maintenance, holidays, or temporary pauses.
   - Does **NOT** mutate `account_status`.
   - Does **NOT** cancel subscriptions or revoke billing access.
   - Does **NOT** revoke establishment memberships or organization links.
   - Staff members retain authenticated business access to configure settings.
   - Public marketplace discovery (`get_public_establishment_experience`) and client appointment booking (`create_appointment`) fail closed.

4. **`closed` / `archived` (`ORCHESTRATION_REQUIRED_PS3_E2`)**:
   - Modern UI does **NOT** expose partial closure or premature self-service destruction.
   - Setter and schema allow these states for enum/model compatibility, but full multi-step closure orchestration (cancelling pending appointments, subscription seat reduction/proration, member revocation, active context teardown, archive immutability) is scheduled for **PS3-E2**.

---

## 4. Corporate Unit Scope Integration

Following **PS4-E3**, corporate membership authority is strictly partitioned from establishment operational capabilities:

- **Readiness Inspection (`get_establishment_readiness` / `can_view_establishment_readiness`)**:
  - Operational establishment members with management capabilities: **ALLOWED**.
  - Corporate organization members: **ALLOWED ONLY** if `scope_mode = 'all'` OR the target unit is explicitly in `organization_member_establishment_scopes` within effective temporal dates (`effective_from <= CURRENT_DATE` AND `effective_until >= CURRENT_DATE`).
  - Corporate members with selected scope on Unit A cannot inspect Unit C.
  - Governance roles (`is_governance_user()` / Superadmins): **ALLOWED**.

- **Operational Mutations (`finalize_establishment_onboarding_v2`, `set_establishment_lifecycle_status`)**:
  - Corporate organization scope **NEVER** confers operational business capabilities.
  - Mutations strictly require operational establishment capability `manage_operational_settings`.

---

## 5. Public Exposure & Booking Fail-Closed Guarantees

| Lifecycle Status | Account Status | Billing Access Mode | Discovery Status | Public Experience (`get_public_establishment_experience`) | Client Booking (`create_appointment`) | Staff Operational Access |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| `configuring` | `pending_verification` | Any | Any | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ✅ Allowed (setup) |
| `ready` | `pending_verification` | Any | Any | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ✅ Allowed (setup) |
| `ready` | `active` | Any | Any | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ✅ Allowed (pre-launch) |
| `active` | `active` | `full` | `published` | ✅ **200 OK** | ✅ **Allowed** | ✅ Allowed |
| `active` | `active` | `read_only` | `published` | ❌ `P0002` (if gated) | ❌ `establishment_unavailable` | ✅ Allowed (read-only) |
| `paused` | `active` | Any | `published` | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ✅ Allowed (management) |
| `closed` | Any | Any | Any | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ❌ Forbidden |
| `archived` | Any | Any | Any | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ❌ Forbidden |
| Any | `blocked` | Any | Any | ❌ `P0002` Not Found | ❌ `establishment_unavailable` | ❌ Blocked |

---

## 6. Compatibility & Legacy Adapters

- **`finalize_establishment_onboarding(uuid, text)` (Legacy V1 Adapter)**:
  - Preserved as a backward-compatible adapter.
  - Authorizes via `manage_operational_settings` or legacy admin membership.
  - Updates opening hours.
  - If configuration is ready, safely promotes `lifecycle_status` to `ready`.
  - **Does NOT write `account_status`** under any condition, preserving strict governance segregation.
