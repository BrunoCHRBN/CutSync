-- ============================================================================
-- Migration: 20260824014000_phase3_unit_closure_orchestration.sql
-- Module: PS3-E2 Atomic Unit Closure Orchestration
--
-- Invariants enforced:
-- 1. Generic Setter Hardening:
--    - set_establishment_lifecycle_status() blocks direct transitions to 'closed' or 'archived'
--      with 'closure_orchestration_required'.
-- 2. Authority:
--    - Closure requires authenticated caller, AAL2 verification, and active Organization Owner
--      role linked to the establishment.
-- 3. Read-Only Preview:
--    - get_establishment_closure_preview() inspects future/past appointments, memberships,
--      invitations, active contexts, billing coverage, and financial blockers without mutations.
-- 4. Financial & Past Appointment Blockers:
--    - Unresolved past pending/confirmed appointments block closure ('unresolved_past_appointments').
--    - Non-terminal service orders or payment entries block closure ('closure_financial_blockers').
--    - Pending billing cutovers block closure ('pending_billing_cutover').
-- 5. Atomic Multi-Resource Closure:
--    - close_establishment_unit() atomically coordinates:
--      * Concurrency serialization lock (FOR UPDATE on establishment; booking FOR SHARE).
--      * Cancellation of future pending/confirmed appointments (never deleted).
--      * Editorial reset of discovery (draft + published_at NULL).
--      * Revocation of pending establishment invitations.
--      * Revocation of active operational memberships (org memberships preserved).
--      * Invalidation of active establishment contexts.
--      * Clearing of legacy profiles.establishment_id hint.
--      * Removal of active organization_establishments link and corporate unit scopes.
--      * Ending of active and scheduled billing coverage assignments.
--      * Incrementing lifecycle_version and advancing lifecycle_status to 'closed'.
--      * Recording immutable establishment_closure_events receipt with exact idempotency.
-- 6. Last Unit Support:
--    - Closing the last unit of an organization leaves the organization active with 0 units.
-- ============================================================================

BEGIN;

-- 1. Closure Events / Receipt Table
CREATE TABLE IF NOT EXISTS public.establishment_closure_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  request_id uuid NOT NULL UNIQUE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  expected_version integer NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  previous_status text NOT NULL,
  resulting_status text NOT NULL DEFAULT 'closed',
  previous_version integer NOT NULL,
  resulting_version integer NOT NULL,
  cancelled_appointment_count integer NOT NULL DEFAULT 0,
  revoked_membership_count integer NOT NULL DEFAULT 0,
  revoked_invitation_count integer NOT NULL DEFAULT 0,
  invalidated_context_count integer NOT NULL DEFAULT 0,
  ended_coverage_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_status IN ('ready', 'active', 'paused')),
  CHECK (resulting_status = 'closed'),
  CHECK (resulting_version = previous_version + 1)
);

CREATE INDEX IF NOT EXISTS establishment_closure_events_est_idx
  ON public.establishment_closure_events(establishment_id, created_at DESC);
CREATE INDEX IF NOT EXISTS establishment_closure_events_org_idx
  ON public.establishment_closure_events(organization_id, created_at DESC);

ALTER TABLE public.establishment_closure_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization owners view closure receipts" ON public.establishment_closure_events;
CREATE POLICY "Organization owners view closure receipts"
ON public.establishment_closure_events
FOR SELECT TO authenticated
USING (
  public.has_organization_role(organization_id, ARRAY['owner'])
  OR public.is_governance_user()
  OR EXISTS (SELECT 1 FROM public.superadmins WHERE profile_id = (SELECT auth.uid()))
);

REVOKE INSERT, UPDATE, DELETE ON public.establishment_closure_events FROM authenticated, anon, PUBLIC;
GRANT SELECT ON public.establishment_closure_events TO authenticated, service_role;

-- 2. Redefine set_establishment_lifecycle_status blocking direct closed/archived
CREATE OR REPLACE FUNCTION public.set_establishment_lifecycle_status(
  target_establishment_id uuid,
  target_lifecycle_status text,
  target_expected_version integer,
  target_reason text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_establishment public.establishments%ROWTYPE;
  existing_event public.establishment_lifecycle_events%ROWTYPE;
  transition_allowed boolean := false;
  previous_status text;
  previous_version integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_aal2();

  IF target_request_id IS NULL
    OR target_lifecycle_status NOT IN (
      'draft', 'configuring', 'ready', 'active',
      'paused', 'closed', 'archived'
    )
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'invalid_lifecycle_request' USING ERRCODE = '22023';
  END IF;

  -- PS3-E2 Invariant: Direct closure and archive are forbidden through the generic setter
  IF target_lifecycle_status IN ('closed', 'archived') THEN
    RAISE EXCEPTION 'closure_orchestration_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'manage_operational_settings', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_event
  FROM public.establishment_lifecycle_events AS event
  WHERE event.request_id = target_request_id;

  IF FOUND THEN
    IF existing_event.establishment_id <> target_establishment_id
      OR existing_event.resulting_status <> target_lifecycle_status
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'establishmentId', existing_event.establishment_id,
      'lifecycleStatus', existing_event.resulting_status,
      'version', existing_event.resulting_version,
      'requestId', existing_event.request_id,
      'replayed', true
    );
  END IF;

  SELECT * INTO current_establishment
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF current_establishment.lifecycle_version <> target_expected_version THEN
    RAISE EXCEPTION 'lifecycle_version_conflict' USING ERRCODE = '40001';
  END IF;

  previous_status := current_establishment.lifecycle_status;
  previous_version := current_establishment.lifecycle_version;

  transition_allowed := CASE current_establishment.lifecycle_status
    WHEN 'draft' THEN target_lifecycle_status = 'configuring'
    WHEN 'configuring' THEN target_lifecycle_status IN ('draft', 'ready')
    WHEN 'ready' THEN target_lifecycle_status IN ('configuring', 'active')
    WHEN 'active' THEN target_lifecycle_status = 'paused'
    WHEN 'paused' THEN target_lifecycle_status = 'active'
    ELSE false
  END;

  IF NOT transition_allowed THEN
    RAISE EXCEPTION 'invalid_lifecycle_transition' USING ERRCODE = '22023';
  END IF;

  IF target_lifecycle_status IN ('ready', 'active')
    AND NOT public.establishment_configuration_is_ready(target_establishment_id)
  THEN
    RAISE EXCEPTION 'establishment_not_operationally_configured'
      USING ERRCODE = '22023';
  END IF;

  IF target_lifecycle_status = 'active'
    AND current_establishment.account_status <> 'active'
  THEN
    RAISE EXCEPTION 'governance_not_active' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
  UPDATE public.establishments
  SET lifecycle_status = target_lifecycle_status,
      lifecycle_version = lifecycle_version + 1,
      lifecycle_updated_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id
  RETURNING * INTO current_establishment;
  PERFORM set_config('app.lifecycle_rpc', '', true);

  INSERT INTO public.establishment_lifecycle_events(
    establishment_id, actor_id, request_id, previous_status,
    resulting_status, previous_version, resulting_version, reason
  ) VALUES (
    target_establishment_id, actor_id, target_request_id,
    previous_status,
    target_lifecycle_status,
    previous_version,
    current_establishment.lifecycle_version,
    btrim(target_reason)
  );

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'establishment.lifecycle.changed',
    target_establishment_id,
    jsonb_build_object(
      'lifecycle_status', target_lifecycle_status,
      'version', current_establishment.lifecycle_version,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'establishmentId', target_establishment_id,
    'lifecycleStatus', current_establishment.lifecycle_status,
    'version', current_establishment.lifecycle_version,
    'requestId', target_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_establishment_lifecycle_status(uuid, text, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_establishment_lifecycle_status(uuid, text, integer, text, uuid) TO authenticated, service_role;

-- 3. Closure Preview RPC (Read Model)
CREATE OR REPLACE FUNCTION public.get_establishment_closure_preview(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_establishment public.establishments%ROWTYPE;
  target_org_id uuid;
  future_pending_appts integer := 0;
  future_confirmed_appts integer := 0;
  future_total_appts integer := 0;
  unresolved_past_appts integer := 0;
  active_memberships_count integer := 0;
  pending_invites_count integer := 0;
  active_contexts_count integer := 0;
  org_scopes_affected integer := 0;
  active_billing_coverage integer := 0;
  scheduled_billing_coverage integer := 0;
  pending_billing_cutovers integer := 0;
  non_terminal_service_orders integer := 0;
  non_terminal_payments integer := 0;
  blockers text[] := ARRAY[]::text[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  SELECT * INTO current_establishment
  FROM public.establishments
  WHERE id = target_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Organization check
  SELECT link.organization_id INTO target_org_id
  FROM public.organization_establishments AS link
  WHERE link.establishment_id = target_establishment_id
    AND link.status = 'active'
    AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
  LIMIT 1;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_owner_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_organization_role(target_org_id, ARRAY['owner'])
    AND NOT public.is_superadmin()
    AND NOT EXISTS (SELECT 1 FROM public.superadmins WHERE profile_id = actor_id)
  THEN
    RAISE EXCEPTION 'organization_owner_required' USING ERRCODE = '42501';
  END IF;

  -- Lifecycle status check
  IF current_establishment.lifecycle_status NOT IN ('ready', 'active', 'paused') THEN
    blockers := array_append(blockers, 'invalid_lifecycle_status_for_closure');
  END IF;

  -- Appointments counts
  SELECT
    count(*) FILTER (WHERE status = 'pending' AND date_time > timezone('utc', now())),
    count(*) FILTER (WHERE status = 'confirmed' AND date_time > timezone('utc', now())),
    count(*) FILTER (WHERE date_time > timezone('utc', now())),
    count(*) FILTER (WHERE date_time <= timezone('utc', now()))
  INTO
    future_pending_appts,
    future_confirmed_appts,
    future_total_appts,
    unresolved_past_appts
  FROM public.appointments
  WHERE establishment_id = target_establishment_id
    AND status IN ('pending', 'confirmed')
    AND deleted_at IS NULL;

  IF unresolved_past_appts > 0 THEN
    blockers := array_append(blockers, 'unresolved_past_appointments');
  END IF;

  -- Memberships count
  SELECT count(*) INTO active_memberships_count
  FROM public.memberships
  WHERE establishment_id = target_establishment_id
    AND status = 'active'
    AND revoked_at IS NULL;

  -- Pending invitations count
  SELECT count(*) INTO pending_invites_count
  FROM public.invitations
  WHERE establishment_id = target_establishment_id
    AND status = 'pending';

  -- Active contexts count
  SELECT count(*) INTO active_contexts_count
  FROM public.user_app_active_contexts
  WHERE establishment_id = target_establishment_id
    AND context_kind = 'establishment';

  -- Organization member scopes affected
  SELECT count(*) INTO org_scopes_affected
  FROM public.organization_member_establishment_scopes
  WHERE establishment_id = target_establishment_id
    AND revoked_at IS NULL;

  -- Billing coverage
  SELECT
    count(*) FILTER (WHERE status = 'active'),
    count(*) FILTER (WHERE status = 'scheduled')
  INTO
    active_billing_coverage,
    scheduled_billing_coverage
  FROM public.billing_coverage_assignments
  WHERE establishment_id = target_establishment_id
    AND status IN ('active', 'scheduled');

  -- Pending cutovers
  SELECT count(*) INTO pending_billing_cutovers
  FROM public.billing_cutover_requests
  WHERE status IN ('scheduled', 'reconciling')
    AND target_establishment_id = ANY(establishment_ids);

  IF pending_billing_cutovers > 0 THEN
    blockers := array_append(blockers, 'pending_billing_cutover');
  END IF;

  -- Financial blockers: service orders
  SELECT count(*) INTO non_terminal_service_orders
  FROM public.service_orders
  WHERE establishment_id = target_establishment_id
    AND status IN ('open', 'in_service', 'awaiting_payment');

  IF non_terminal_service_orders > 0 THEN
    blockers := array_append(blockers, 'closure_financial_blockers');
  END IF;

  -- Financial blockers: payment entries
  SELECT count(*) INTO non_terminal_payments
  FROM public.order_payment_entries
  WHERE establishment_id = target_establishment_id
    AND status IN ('pending', 'processing');

  IF non_terminal_payments > 0 AND NOT ('closure_financial_blockers' = ANY(blockers)) THEN
    blockers := array_append(blockers, 'closure_financial_blockers');
  END IF;

  RETURN jsonb_build_object(
    'establishmentId', current_establishment.id,
    'name', current_establishment.name,
    'lifecycleStatus', current_establishment.lifecycle_status,
    'lifecycleVersion', current_establishment.lifecycle_version,
    'organizationId', target_org_id,
    'futureAppointments', jsonb_build_object(
      'pending', future_pending_appts,
      'confirmed', future_confirmed_appts,
      'total', future_total_appts
    ),
    'unresolvedPastAppointments', unresolved_past_appts,
    'activeMemberships', active_memberships_count,
    'pendingInvitations', pending_invites_count,
    'activeContexts', active_contexts_count,
    'organizationScopesAffected', org_scopes_affected,
    'billing', jsonb_build_object(
      'activeCoverage', active_billing_coverage,
      'scheduledCoverage', scheduled_billing_coverage,
      'pendingCutover', pending_billing_cutovers > 0
    ),
    'financialBlockers', jsonb_build_object(
      'serviceOrders', non_terminal_service_orders,
      'cashSessions', 0,
      'paymentEntries', non_terminal_payments
    ),
    'canClose', cardinality(blockers) = 0,
    'blockers', to_jsonb(blockers)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_establishment_closure_preview(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_establishment_closure_preview(uuid) TO authenticated, service_role;

-- 4. Atomic Unit Closure Orchestrator RPC
CREATE OR REPLACE FUNCTION public.close_establishment_unit(
  target_establishment_id uuid,
  target_expected_lifecycle_version integer,
  target_reason text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_establishment public.establishments%ROWTYPE;
  existing_closure public.establishment_closure_events%ROWTYPE;
  target_org_id uuid;
  previous_status text;
  previous_version integer;
  resulting_version integer;

  future_cancelled_count integer := 0;
  unresolved_past_count integer := 0;
  revoked_memberships_count integer := 0;
  revoked_invitations_count integer := 0;
  invalidated_contexts_count integer := 0;
  ended_coverage_count integer := 0;
  non_terminal_orders_count integer := 0;
  non_terminal_payments_count integer := 0;
  pending_cutovers_count integer := 0;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_aal2();

  IF target_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id_required' USING ERRCODE = '22023';
  END IF;

  IF target_expected_lifecycle_version IS NULL OR target_expected_lifecycle_version <= 0 THEN
    RAISE EXCEPTION 'expected_version_required' USING ERRCODE = '22023';
  END IF;

  IF char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_closure_reason' USING ERRCODE = '22023';
  END IF;

  -- 1. Advisory transaction lock per request_id (serializes concurrent overlapping retries)
  PERFORM pg_advisory_xact_lock(hashtextextended(target_request_id::text, 0));

  -- Check existing closure receipt for exact idempotent replay
  SELECT * INTO existing_closure
  FROM public.establishment_closure_events
  WHERE request_id = target_request_id;

  IF FOUND THEN
    IF existing_closure.establishment_id <> target_establishment_id
      OR existing_closure.expected_version <> target_expected_lifecycle_version
      OR existing_closure.reason <> btrim(target_reason)
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'establishmentId', existing_closure.establishment_id,
      'organizationId', existing_closure.organization_id,
      'previousStatus', existing_closure.previous_status,
      'lifecycleStatus', existing_closure.resulting_status,
      'version', existing_closure.resulting_version,
      'cancelledAppointments', existing_closure.cancelled_appointment_count,
      'revokedMemberships', existing_closure.revoked_membership_count,
      'revokedInvitations', existing_closure.revoked_invitation_count,
      'invalidatedContexts', existing_closure.invalidated_context_count,
      'endedBillingCoverage', existing_closure.ended_coverage_count,
      'requestId', existing_closure.request_id,
      'replayed', true
    );
  END IF;

  -- 2. Lock establishment FOR UPDATE
  SELECT * INTO current_establishment
  FROM public.establishments
  WHERE id = target_establishment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF current_establishment.lifecycle_status = 'closed' THEN
    RAISE EXCEPTION 'establishment_already_closed' USING ERRCODE = '22023';
  END IF;

  IF current_establishment.lifecycle_status = 'archived' THEN
    RAISE EXCEPTION 'establishment_archived_immutable' USING ERRCODE = '22023';
  END IF;

  IF current_establishment.lifecycle_status NOT IN ('ready', 'active', 'paused') THEN
    RAISE EXCEPTION 'invalid_lifecycle_transition' USING ERRCODE = '22023';
  END IF;

  IF current_establishment.lifecycle_version <> target_expected_lifecycle_version THEN
    RAISE EXCEPTION 'lifecycle_version_conflict' USING ERRCODE = '40001';
  END IF;

  -- 3. Active Organization Link validation & Owner Authority check
  SELECT link.organization_id INTO target_org_id
  FROM public.organization_establishments AS link
  WHERE link.establishment_id = target_establishment_id
    AND link.status = 'active'
    AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
  LIMIT 1;

  IF target_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_owner_required' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_organization_role(target_org_id, ARRAY['owner'])
    AND NOT public.is_superadmin()
    AND NOT EXISTS (SELECT 1 FROM public.superadmins WHERE profile_id = actor_id)
  THEN
    RAISE EXCEPTION 'organization_owner_required' USING ERRCODE = '42501';
  END IF;

  -- 4. Financial & Cutover Blockers
  SELECT count(*) INTO pending_cutovers_count
  FROM public.billing_cutover_requests
  WHERE status IN ('scheduled', 'reconciling')
    AND target_establishment_id = ANY(establishment_ids);

  IF pending_cutovers_count > 0 THEN
    RAISE EXCEPTION 'pending_billing_cutover' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO non_terminal_orders_count
  FROM public.service_orders
  WHERE establishment_id = target_establishment_id
    AND status IN ('open', 'in_service', 'awaiting_payment');

  IF non_terminal_orders_count > 0 THEN
    RAISE EXCEPTION 'closure_financial_blockers' USING ERRCODE = '42501';
  END IF;

  SELECT count(*) INTO non_terminal_payments_count
  FROM public.order_payment_entries
  WHERE establishment_id = target_establishment_id
    AND status IN ('pending', 'processing');

  IF non_terminal_payments_count > 0 THEN
    RAISE EXCEPTION 'closure_financial_blockers' USING ERRCODE = '42501';
  END IF;

  -- 5. Unresolved past appointments check (must be regularized before closing)
  SELECT count(*) INTO unresolved_past_count
  FROM public.appointments
  WHERE establishment_id = target_establishment_id
    AND status IN ('pending', 'confirmed')
    AND date_time <= timezone('utc', now())
    AND deleted_at IS NULL;

  IF unresolved_past_count > 0 THEN
    RAISE EXCEPTION 'unresolved_past_appointments' USING ERRCODE = '42501';
  END IF;

  -- Enable internal RPC session bypass
  PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
  PERFORM set_config('app.closure_rpc', 'allowed', true);

  -- 6. Future Appointments bulk cancellation
  WITH cancelled_rows AS (
    UPDATE public.appointments
    SET status = 'cancelled',
        cancellation_reason_code = 'establishment_cancelled',
        cancellation_reason = 'establishment_cancelled',
        cancelled_by_role = 'admin',
        cancellation_note_internal = btrim(target_reason),
        updated_at = timezone('utc', now())
    WHERE establishment_id = target_establishment_id
      AND status IN ('pending', 'confirmed')
      AND date_time > timezone('utc', now())
      AND deleted_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO future_cancelled_count FROM cancelled_rows;

  -- 7. Discovery reset
  UPDATE public.establishments
  SET discovery_status = 'draft',
      published_at = NULL,
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'establishment.discovery.closed',
    target_establishment_id,
    jsonb_build_object('request_id', target_request_id, 'reason', btrim(target_reason))
  );

  -- 8. Pending invitations revocation
  WITH revoked_invites AS (
    UPDATE public.invitations
    SET status = 'revoked',
        revoked_at = timezone('utc', now())
    WHERE establishment_id = target_establishment_id
      AND status = 'pending'
    RETURNING id
  )
  SELECT count(*) INTO revoked_invitations_count FROM revoked_invites;

  -- 9. Active operational memberships revocation
  WITH revoked_members AS (
    UPDATE public.memberships
    SET status = 'revoked',
        revoked_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE establishment_id = target_establishment_id
      AND status = 'active'
      AND revoked_at IS NULL
    RETURNING id
  )
  SELECT count(*) INTO revoked_memberships_count FROM revoked_members;

  -- 10. Active contexts invalidation
  WITH deleted_contexts AS (
    DELETE FROM public.user_app_active_contexts
    WHERE establishment_id = target_establishment_id
      AND context_kind = 'establishment'
    RETURNING profile_id
  )
  SELECT count(*) INTO invalidated_contexts_count FROM deleted_contexts;

  -- 11. Legacy profile hint clearing (role is untouched)
  UPDATE public.profiles
  SET establishment_id = NULL,
      updated_at = timezone('utc', now())
  WHERE establishment_id = target_establishment_id;

  -- 12. Organization Link & Scopes ending (supports last unit closure)
  UPDATE public.organization_establishments
  SET status = 'removed',
      effective_until = CURRENT_DATE,
      updated_at = timezone('utc', now())
  WHERE organization_id = target_org_id
    AND establishment_id = target_establishment_id
    AND status = 'active'
    AND (effective_until IS NULL OR effective_until >= CURRENT_DATE);

  UPDATE public.organization_member_establishment_scopes
  SET revoked_at = timezone('utc', now()),
      revoked_by = actor_id,
      revocation_reason = 'unit_closed'
  WHERE organization_id = target_org_id
    AND establishment_id = target_establishment_id
    AND revoked_at IS NULL;

  UPDATE public.subscription_units unit
  SET effective_until = CURRENT_DATE
  WHERE unit.establishment_id = target_establishment_id
    AND (unit.effective_until IS NULL OR unit.effective_until > CURRENT_DATE);

  INSERT INTO public.organization_audit_log (
    organization_id, actor_id, action, establishment_id, metadata
  ) VALUES (
    target_org_id,
    actor_id,
    'organization.establishment_closed',
    target_establishment_id,
    jsonb_build_object('request_id', target_request_id, 'reason', btrim(target_reason))
  );

  -- 13. Billing coverage ending
  WITH ended_cov AS (
    UPDATE public.billing_coverage_assignments
    SET status = 'ended',
        effective_until = GREATEST(timezone('utc', now()), effective_from + interval '1 second'),
        reason = 'unit_closed',
        updated_at = timezone('utc', now())
    WHERE establishment_id = target_establishment_id
      AND status IN ('active', 'scheduled')
    RETURNING id
  )
  SELECT count(*) INTO ended_coverage_count FROM ended_cov;

  -- 14. Establishments update + Lifecycle event
  previous_status := current_establishment.lifecycle_status;
  previous_version := current_establishment.lifecycle_version;
  resulting_version := previous_version + 1;

  UPDATE public.establishments
  SET lifecycle_status = 'closed',
      lifecycle_version = resulting_version,
      lifecycle_updated_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id
  RETURNING * INTO current_establishment;

  INSERT INTO public.establishment_lifecycle_events (
    establishment_id, actor_id, request_id, previous_status,
    resulting_status, previous_version, resulting_version, reason
  ) VALUES (
    target_establishment_id, actor_id, target_request_id,
    previous_status,
    'closed',
    previous_version,
    resulting_version,
    btrim(target_reason)
  );

  -- 15. Closure receipt & Authorization audit
  INSERT INTO public.establishment_closure_events (
    request_id, establishment_id, organization_id, actor_id,
    expected_version, reason, previous_status, resulting_status,
    previous_version, resulting_version, cancelled_appointment_count,
    revoked_membership_count, revoked_invitation_count,
    invalidated_context_count, ended_coverage_count, metadata
  ) VALUES (
    target_request_id, target_establishment_id, target_org_id, actor_id,
    target_expected_lifecycle_version, btrim(target_reason), previous_status, 'closed',
    previous_version, resulting_version, future_cancelled_count,
    revoked_memberships_count, revoked_invitations_count,
    invalidated_contexts_count, ended_coverage_count,
    jsonb_build_object(
      'cancelledAppointments', future_cancelled_count,
      'revokedMemberships', revoked_memberships_count,
      'revokedInvitations', revoked_invitations_count,
      'invalidatedContexts', invalidated_contexts_count,
      'endedCoverage', ended_coverage_count
    )
  );

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'establishment.unit_closed',
    target_establishment_id,
    jsonb_build_object(
      'request_id', target_request_id,
      'organization_id', target_org_id,
      'previous_status', previous_status,
      'lifecycle_status', 'closed',
      'version', resulting_version,
      'cancelled_appointments', future_cancelled_count,
      'revoked_memberships', revoked_memberships_count,
      'revoked_invitations', revoked_invitations_count,
      'invalidated_contexts', invalidated_contexts_count,
      'ended_coverage', ended_coverage_count
    )
  );

  PERFORM set_config('app.lifecycle_rpc', '', true);
  PERFORM set_config('app.closure_rpc', '', true);

  RETURN jsonb_build_object(
    'establishmentId', current_establishment.id,
    'organizationId', target_org_id,
    'previousStatus', previous_status,
    'lifecycleStatus', current_establishment.lifecycle_status,
    'version', current_establishment.lifecycle_version,
    'cancelledAppointments', future_cancelled_count,
    'revokedMemberships', revoked_memberships_count,
    'revokedInvitations', revoked_invitations_count,
    'invalidatedContexts', invalidated_contexts_count,
    'endedBillingCoverage', ended_coverage_count,
    'requestId', target_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.close_establishment_unit(uuid, integer, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_establishment_unit(uuid, integer, text, uuid) TO authenticated, service_role;

-- 5. Harden Ingress: create_appointment with FOR SHARE lock
CREATE OR REPLACE FUNCTION public.create_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_client_name text DEFAULT NULL,
  target_client_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  establishment_status text;
  establishment_lifecycle text;
  actor_is_staff boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT establishment.account_status, establishment.lifecycle_status
  INTO establishment_status, establishment_lifecycle
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;

  actor_is_staff := public.is_superadmin()
    OR public.can_operate_business_appointment(target_establishment_id, target_professional_id);

  -- Client bookings require both active governance and active operational lifecycle
  IF NOT actor_is_staff THEN
    IF establishment_status <> 'active' OR establishment_lifecycle <> 'active' THEN
      RAISE EXCEPTION 'establishment_unavailable';
    END IF;
  ELSE
    -- Staff internal booking is blocked if governance blocks or unit is paused/closed/archived
    IF establishment_lifecycle IN ('paused', 'closed', 'archived')
      OR establishment_status IN ('blocked', 'delinquent')
    THEN
      RAISE EXCEPTION 'establishment_unavailable';
    END IF;
  END IF;

  PERFORM profile.id FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  RETURN public.create_appointment_before_schedule_blocks(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    target_client_name,
    target_client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated, service_role;

-- 6. Harden Ingress: create_business_appointment with FOR SHARE lock and lifecycle check
CREATE OR REPLACE FUNCTION public.create_business_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_request_id uuid,
  target_establishment_client_id uuid DEFAULT NULL,
  target_client_name text DEFAULT NULL,
  target_client_phone text DEFAULT NULL,
  target_client_email text DEFAULT NULL,
  target_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  establishment_status text;
  establishment_lifecycle text;
  selected_slot record;
  client_record public.establishment_clients%ROWTYPE;
  linked_profile_id uuid;
  created_appointment public.appointments%ROWTYPE;
  result jsonb;
BEGIN
  IF char_length(COALESCE(target_client_name, '')) > 120
    OR char_length(COALESCE(target_client_phone, '')) > 32
    OR char_length(COALESCE(target_client_email, '')) > 254
    OR char_length(COALESCE(target_notes, '')) > 2000
  THEN RAISE EXCEPTION 'invalid_client_details'; END IF;

  IF target_establishment_client_id IS NULL THEN
    PERFORM public.assert_valid_establishment_client_values(
      target_client_name,
      NULLIF(btrim(target_client_phone), ''),
      NULLIF(lower(btrim(target_client_email)), ''),
      ARRAY[]::text[],
      NULL
    );
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'appointment.created',
    jsonb_strip_nulls(jsonb_build_object(
      'professionalId', target_professional_id,
      'serviceId', target_service_id,
      'startsAt', target_date_time,
      'establishmentClientId', target_establishment_client_id,
      'clientName', NULLIF(btrim(target_client_name), ''),
      'clientPhone', NULLIF(btrim(target_client_phone), ''),
      'clientEmail', NULLIF(lower(btrim(target_client_email)), ''),
      'notes', NULLIF(btrim(target_notes), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  IF target_date_time IS NULL OR target_date_time < now() - interval '5 minutes' THEN
    RAISE EXCEPTION 'appointment_must_not_be_in_past';
  END IF;

  IF NOT public.can_operate_business_appointment(
    target_establishment_id, target_professional_id
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT establishment.timezone, establishment.account_status, establishment.lifecycle_status
  INTO target_timezone, establishment_status, establishment_lifecycle
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id
  FOR SHARE;

  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  IF establishment_lifecycle IN ('paused', 'closed', 'archived')
    OR establishment_status IN ('blocked', 'delinquent')
  THEN
    RAISE EXCEPTION 'establishment_unavailable';
  END IF;

  PERFORM profile.id
  FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  SELECT slot.* INTO selected_slot
  FROM public.compute_available_slots(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    (target_date_time AT TIME ZONE target_timezone)::date,
    NULL
  ) AS slot
  WHERE slot.starts_at = target_date_time;

  IF NOT FOUND THEN RAISE EXCEPTION 'appointment_outside_availability'; END IF;
  IF NOT selected_slot.available THEN
    IF selected_slot.unavailable_reason = 'busy' THEN
      result := jsonb_build_object(
        'errorCode', 'appointment_conflict',
        'professionalId', target_professional_id
      );
      PERFORM public.enqueue_business_operational_conflict(
        'appointment-conflict:' || target_request_id::text,
        target_establishment_id,
        target_professional_id,
        NULL
      );
      RETURN public.complete_mobile_command(target_request_id, result);
    END IF;
    RAISE EXCEPTION 'appointment_outside_availability';
  END IF;

  IF target_establishment_client_id IS NOT NULL THEN
    SELECT * INTO client_record
    FROM public.establishment_clients
    WHERE id = target_establishment_client_id
      AND establishment_id = target_establishment_id
      AND status = 'active'
    FOR UPDATE;
    IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  ELSE
    IF NULLIF(btrim(target_client_name), '') IS NULL THEN
      RAISE EXCEPTION 'client_name_required';
    END IF;
    INSERT INTO public.establishment_clients (
      establishment_id, display_name, phone, email, source,
      created_by, updated_by
    ) VALUES (
      target_establishment_id,
      btrim(target_client_name),
      NULLIF(btrim(target_client_phone), ''),
      NULLIF(lower(btrim(target_client_email)), ''),
      'manual',
      actor_id,
      actor_id
    )
    RETURNING * INTO client_record;
  END IF;

  SELECT profile.id INTO linked_profile_id
  FROM public.establishment_client_links AS link
  JOIN public.profiles AS profile ON profile.id = link.profile_id
  WHERE link.establishment_client_id = client_record.id
    AND link.status = 'active'
    AND profile.deleted_at IS NULL
  LIMIT 1;

  INSERT INTO public.appointments (
    establishment_id, professional_id, service_id, date_time,
    duration_minutes, ends_at, client_id, client_name, status,
    establishment_client_id, business_notes
  ) VALUES (
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    selected_slot.duration_minutes,
    target_date_time + make_interval(mins => selected_slot.duration_minutes),
    linked_profile_id,
    client_record.display_name,
    'confirmed',
    client_record.id,
    NULLIF(btrim(target_notes), '')
  )
  RETURNING * INTO created_appointment;

  result := jsonb_build_object(
    'appointmentId', created_appointment.id,
    'status', created_appointment.status,
    'startsAt', created_appointment.date_time,
    'endsAt', created_appointment.ends_at,
    'establishmentClientId', client_record.id
  );

  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.create_business_appointment(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_business_appointment(uuid, uuid, text, timestamptz, uuid, uuid, text, text, text, text) TO authenticated, service_role;

-- 7. Ensure internal helper grant is restricted to service_role
REVOKE ALL ON FUNCTION public.create_appointment_before_schedule_blocks(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_appointment_before_schedule_blocks(uuid, uuid, text, timestamptz, text, uuid) TO service_role;

COMMIT;
