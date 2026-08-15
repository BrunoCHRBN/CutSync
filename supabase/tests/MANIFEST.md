# Supabase SQL Test Manifest

## ACTIVE suites

The following suites represent the canonical, authoritative regression test suite for all database migrations, authorization rules, lifecycle invariants, and capability boundaries:

1. `phase1_profile_role_neutralization.sql` - Validates deprecation and neutralization of legacy `profiles.role` as an authorization source.
2. `phase1_role_capability_matrix.sql` - Validates the canonical role-to-capability matrix mappings across system domains.
3. `phase1_capability_authority.sql` - Validates direct capability-based authorization checks (`has_business_capability`).
4. `phase1_service_order_capability_authority.sql` - Validates capability checks across service order mutations and financial boundaries.
5. `phase1_legacy_authority_guard.sql` - Validates containment and fail-closed behavior against legacy role array queries.
6. `phase1_lifecycle_readiness.sql` - Validates establishment readiness evaluation and administrative overrides.
7. `phase3_unit_lifecycle_authority_cutover.sql` - Validates unit lifecycle state machine, atomic business registration, and governance separation.
8. `phase4_organization_member_unit_scope.sql` - Validates corporate organization member unit scoping and corporate report boundaries.
9. `multi_unit_organizations_and_billing.sql` - Validates multi-unit corporate organization hierarchies and billing assignments.
10. `consolidated_billing_coverage.sql` - Validates subscription entitlement resolution, grace periods, and billing access modes.
11. `business_operational_access.sql` - Validates business operational access and capability delegation.
12. `client_booking.sql` - Validates client-side appointment booking and operational availability validation.
13. `public_discovery_publication.sql` - Validates publication lifecycle and editorial eligibility requirements.
14. `phase1_onboarding_web_authority.sql` - Validates user onboarding progress state machine and event logging.
15. `pending_business_access_and_media.sql` - Validates media bucket access and pending establishment access controls.
16. `public_discovery_boundary_integrity.sql` - Validates editorial publication preservation during operational pause/resume and fail-closed public listings.
17. `create_appointment_capability_guard.sql` - Validates capability-driven appointment creation, self-walk-in, team-walk-in, and superadmin break-glass.
18. `finalize_onboarding_v2_semantics.sql` - Validates onboarding finalization idempotency, payload fingerprinting, original snapshot replay, and transaction integrity.

---

## DEPRECATED suites

The following historical test suites were built during earlier project phases before subsequent architectural reconciliations (e.g. lifecycle separation, same-day operational date enforcement, financial ops foundation, and standardized authorization error codes). They are retained for historical auditability and are formally superseded by the active canonical suites:

1. `android_business_operational_cycle.sql`
   - **Reason**: Legacy mobile push delivery prototype test using deprecated delivery event type check constraint values.
   - **Replacement**: `phase3_notification_dispatch_runtime.sql` and `phase1_operational_role_projection.sql`.

2. `appointment_service_order_integration.sql`
   - **Reason**: Interim Etapa 4 negative assertion asserting that financial ops and cashier tables do not exist, which was invalidated when Financial Ops and Manual POS were introduced.
   - **Replacement**: `phase1_service_order_capability_authority.sql`.

3. `establishment_client_appointment_link.sql`
   - **Reason**: Legacy booking test creating appointments against units without initializing `lifecycle_status = 'active'` (defaults to `configuring`), triggering `establishment_unavailable`.
   - **Replacement**: `create_appointment_capability_guard.sql` and `client_booking.sql`.

4. `interactive_admin_reports.sql`
   - **Reason**: Early administrative report test asserting legacy error string (`forbidden`) instead of the standardized `authentication_required` exception code.
   - **Replacement**: `phase4_organization_member_unit_scope.sql`.

5. `phase2_reassignment_request_validate_propose.sql`
   - **Reason**: Phase 2 step test with hardcoded non-operational dates prior to migration `20260824003000` introducing the same-day operational date guard.
   - **Replacement**: `phase2_g13_policy_shadow_validation.sql` and `phase2_reassignment_decide_apply_close.sql`.

6. `service_order_lifecycle_rpcs.sql`
   - **Reason**: Interim Etapa 3 negative schema assertion asserting that payment and cashier tables do not exist.
   - **Replacement**: `phase1_service_order_capability_authority.sql`.

7. `service_orders_foundation.sql`
   - **Reason**: Early service orders foundation test using appointment dates outside today's operational date boundary.
   - **Replacement**: `phase1_service_order_capability_authority.sql`.

8. `transactional_booking_p0.sql`
   - **Reason**: Pre-lifecycle booking test asserting direct appointment insertion without setting `lifecycle_status = 'active'` and `account_status = 'active'`.
   - **Replacement**: `client_booking.sql` and `create_appointment_capability_guard.sql`.

9. `ui_ux_experience_read_models.sql`
   - **Reason**: Prototype UI read-model test attempting to publish unit discovery while `lifecycle_status` is `configuring` (prior to lifecycle boundary hardening).
   - **Replacement**: `public_discovery_boundary_integrity.sql`.

10. `ui_ux_product_events.sql`
    - **Reason**: Early product events test attempting direct SQL insertion into `product_events` table before RLS revocation and migration to security definer RPCs.
    - **Replacement**: `phase1_onboarding_web_authority.sql`.
