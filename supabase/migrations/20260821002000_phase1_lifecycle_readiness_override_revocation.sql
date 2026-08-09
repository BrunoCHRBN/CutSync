BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Phase 1, slice 3: lifecycle/readiness and approved override revocation.

-- ---------------------------------------------------------------------------
-- Operational lifecycle, kept separate from account_status governance.
-- ---------------------------------------------------------------------------

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS lifecycle_status text,
  ADD COLUMN IF NOT EXISTS lifecycle_version integer,
  ADD COLUMN IF NOT EXISTS lifecycle_updated_at timestamptz;

UPDATE public.establishments AS establishment
SET lifecycle_status = CASE
      WHEN NULLIF(btrim(COALESCE(establishment.opening_hours, '')), '') IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.services AS service
          WHERE service.establishment_id = establishment.id
            AND service.is_active
            AND service.deleted_at IS NULL
        )
      THEN CASE
        WHEN establishment.account_status = 'active' THEN 'active'
        ELSE 'ready'
      END
      WHEN EXISTS (
        SELECT 1
        FROM public.memberships AS membership
        WHERE membership.establishment_id = establishment.id
          AND membership.status = 'active'
          AND membership.revoked_at IS NULL
      ) THEN 'configuring'
      ELSE 'draft'
    END,
    lifecycle_version = COALESCE(establishment.lifecycle_version, 1),
    lifecycle_updated_at = COALESCE(
      establishment.lifecycle_updated_at,
      establishment.updated_at,
      now()
    )
WHERE establishment.lifecycle_status IS NULL
  OR establishment.lifecycle_version IS NULL
  OR establishment.lifecycle_updated_at IS NULL;

ALTER TABLE public.establishments
  ALTER COLUMN lifecycle_status SET DEFAULT 'draft',
  ALTER COLUMN lifecycle_status SET NOT NULL,
  ALTER COLUMN lifecycle_version SET DEFAULT 1,
  ALTER COLUMN lifecycle_version SET NOT NULL,
  ALTER COLUMN lifecycle_updated_at SET DEFAULT now(),
  ALTER COLUMN lifecycle_updated_at SET NOT NULL;

ALTER TABLE public.establishments
  DROP CONSTRAINT IF EXISTS establishments_lifecycle_status_check;
ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_lifecycle_status_check CHECK (
    lifecycle_status IN (
      'draft', 'configuring', 'ready', 'active',
      'paused', 'closed', 'archived'
    )
  );
ALTER TABLE public.establishments
  DROP CONSTRAINT IF EXISTS establishments_lifecycle_version_check;
ALTER TABLE public.establishments
  ADD CONSTRAINT establishments_lifecycle_version_check CHECK (
    lifecycle_version > 0
  );

COMMENT ON COLUMN public.establishments.lifecycle_status IS
  'Operational lifecycle only. account_status remains the independent governance/security state.';

CREATE TABLE public.establishment_lifecycle_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  request_id uuid NOT NULL UNIQUE,
  previous_status text NOT NULL,
  resulting_status text NOT NULL,
  previous_version integer NOT NULL,
  resulting_version integer NOT NULL,
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (previous_status IN (
    'draft', 'configuring', 'ready', 'active', 'paused', 'closed', 'archived'
  )),
  CHECK (resulting_status IN (
    'draft', 'configuring', 'ready', 'active', 'paused', 'closed', 'archived'
  )),
  CHECK (resulting_version = previous_version + 1)
);

CREATE INDEX establishment_lifecycle_events_timeline_idx
  ON public.establishment_lifecycle_events(establishment_id, created_at DESC);

ALTER TABLE public.establishment_lifecycle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.establishment_lifecycle_events
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.establishment_configuration_is_ready(
  target_establishment_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    NULLIF(btrim(COALESCE(establishment.opening_hours, '')), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1
      FROM public.memberships AS membership
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.revoked_at IS NULL
        AND membership.role_template IN ('admin', 'manager')
    )
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
$$;

CREATE OR REPLACE FUNCTION public.can_view_establishment_readiness(
  target_establishment_id uuid,
  target_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.memberships AS membership
      WHERE membership.profile_id = target_profile_id
        AND membership.establishment_id = target_establishment_id
        AND membership.status = 'active'
        AND membership.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_establishments AS link
      JOIN public.organization_members AS member
        ON member.organization_id = link.organization_id
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active'
        AND link.effective_from <= CURRENT_DATE
        AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
        AND member.profile_id = target_profile_id
        AND member.status = 'active'
        AND member.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1 FROM public.superadmins
      WHERE profile_id = target_profile_id
    );
$$;

CREATE OR REPLACE FUNCTION public.get_establishment_readiness(
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
  establishment_record public.establishments%ROWTYPE;
  opening_hours_configured boolean;
  active_service_configured boolean;
  management_membership_configured boolean;
  configuration_ready boolean;
  governance_allows_operation boolean;
  lifecycle_allows_operation boolean;
  manual_payment_method_configured boolean := false;
  service_fiscal_profile_configured boolean := false;
  operational_ready boolean;
  payments_ready boolean;
  fiscal_ready boolean;
  operational_blockers text[] := ARRAY[]::text[];
  payment_blockers text[] := ARRAY[]::text[];
  fiscal_blockers text[] := ARRAY[]::text[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_view_establishment_readiness(target_establishment_id, actor_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO establishment_record
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  opening_hours_configured := NULLIF(
    btrim(COALESCE(establishment_record.opening_hours, '')), ''
  ) IS NOT NULL;
  SELECT EXISTS (
    SELECT 1 FROM public.services AS service
    WHERE service.establishment_id = target_establishment_id
      AND service.is_active
      AND service.deleted_at IS NULL
  ) INTO active_service_configured;
  SELECT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
      AND membership.role_template IN ('admin', 'manager')
  ) INTO management_membership_configured;

  configuration_ready := opening_hours_configured
    AND active_service_configured
    AND management_membership_configured;
  governance_allows_operation := establishment_record.account_status = 'active';
  lifecycle_allows_operation := establishment_record.lifecycle_status IN ('ready', 'active');
  operational_ready := configuration_ready
    AND governance_allows_operation
    AND lifecycle_allows_operation;

  -- Phase 4 will replace this conservative default with method-status rules
  -- in the same migration that creates establishment_payment_methods. Avoid a
  -- forward relation reference so schema lint remains reproducible in Phase 1.
  manual_payment_method_configured := false;
  payments_ready := operational_ready
    AND establishment_record.financial_ops_enabled
    AND manual_payment_method_configured;

  -- Existing fiscal_documents/fiscal_events belong to SaaS billing and are
  -- deliberately ignored. Phase 8 will calculate this from service_fiscal_*.
  service_fiscal_profile_configured := false;
  fiscal_ready := operational_ready AND service_fiscal_profile_configured;

  IF NOT opening_hours_configured THEN
    operational_blockers := operational_blockers || ARRAY['opening_hours_not_configured'];
  END IF;
  IF NOT active_service_configured THEN
    operational_blockers := operational_blockers || ARRAY['active_service_not_configured'];
  END IF;
  IF NOT management_membership_configured THEN
    operational_blockers := operational_blockers || ARRAY['management_membership_not_configured'];
  END IF;
  IF NOT governance_allows_operation THEN
    operational_blockers := operational_blockers || ARRAY['governance_not_active'];
  END IF;
  IF NOT lifecycle_allows_operation THEN
    operational_blockers := operational_blockers || ARRAY['lifecycle_not_ready'];
  END IF;
  IF NOT establishment_record.financial_ops_enabled THEN
    payment_blockers := payment_blockers || ARRAY['financial_ops_disabled'];
  END IF;
  IF NOT manual_payment_method_configured THEN
    payment_blockers := payment_blockers || ARRAY['payment_methods_not_configured'];
  END IF;
  IF NOT operational_ready THEN
    payment_blockers := payment_blockers || ARRAY['operational_not_ready'];
    fiscal_blockers := fiscal_blockers || ARRAY['operational_not_ready'];
  END IF;
  IF NOT service_fiscal_profile_configured THEN
    fiscal_blockers := fiscal_blockers || ARRAY['service_fiscal_profile_not_configured'];
  END IF;

  RETURN jsonb_build_object(
    'establishmentId', establishment_record.id,
    'lifecycleStatus', establishment_record.lifecycle_status,
    'accountStatus', establishment_record.account_status,
    'operationalReady', operational_ready,
    'paymentsReady', payments_ready,
    'fiscalReady', fiscal_ready,
    'checks', jsonb_build_object(
      'openingHoursConfigured', opening_hours_configured,
      'activeServiceConfigured', active_service_configured,
      'managementMembershipConfigured', management_membership_configured,
      'governanceAllowsOperation', governance_allows_operation,
      'lifecycleAllowsOperation', lifecycle_allows_operation,
      'financialOpsEnabled', establishment_record.financial_ops_enabled,
      'manualPaymentMethodConfigured', manual_payment_method_configured,
      'serviceFiscalProfileConfigured', service_fiscal_profile_configured
    ),
    'blockers', jsonb_build_object(
      'operational', to_jsonb(operational_blockers),
      'payments', to_jsonb(payment_blockers),
      'fiscal', to_jsonb(fiscal_blockers)
    ),
    'version', establishment_record.lifecycle_version,
    'dataCutoffAt', now()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_establishment_lifecycle_rpc_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT'
    AND actor_id IS NOT NULL
    AND COALESCE(current_setting('app.lifecycle_rpc', true), '') <> 'allowed'
    AND NOT public.is_superadmin()
    AND (
      NEW.lifecycle_status <> 'draft'
      OR NEW.lifecycle_version <> 1
    )
  THEN
    RAISE EXCEPTION 'lifecycle_rpc_required' USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE'
    AND (
      NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
      OR NEW.lifecycle_version IS DISTINCT FROM OLD.lifecycle_version
      OR NEW.lifecycle_updated_at IS DISTINCT FROM OLD.lifecycle_updated_at
    )
    AND actor_id IS NOT NULL
    AND COALESCE(current_setting('app.lifecycle_rpc', true), '') <> 'allowed'
    AND NOT public.is_superadmin()
  THEN
    RAISE EXCEPTION 'lifecycle_rpc_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_establishment_lifecycle_rpc_write
  ON public.establishments;
CREATE TRIGGER enforce_establishment_lifecycle_rpc_write
BEFORE INSERT OR UPDATE
ON public.establishments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_establishment_lifecycle_rpc_write();

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
    WHEN 'ready' THEN target_lifecycle_status IN ('configuring', 'active', 'closed')
    WHEN 'active' THEN target_lifecycle_status IN ('paused', 'closed')
    WHEN 'paused' THEN target_lifecycle_status IN ('active', 'closed')
    WHEN 'closed' THEN target_lifecycle_status = 'archived'
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
      lifecycle_updated_at = now(),
      updated_at = now()
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

-- ---------------------------------------------------------------------------
-- Approved revocation for explicit capability overrides.
-- ---------------------------------------------------------------------------

ALTER TABLE public.approval_requests
  ADD COLUMN IF NOT EXISTS approval_action text NOT NULL DEFAULT 'apply',
  ADD COLUMN IF NOT EXISTS target_override_id uuid
    REFERENCES public.membership_capability_overrides(id) ON DELETE RESTRICT;

ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS approval_requests_approval_action_check;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT approval_requests_approval_action_check CHECK (
    approval_action IN ('apply', 'revoke')
  );
ALTER TABLE public.approval_requests
  DROP CONSTRAINT IF EXISTS capability_override_approval_payload_check;
ALTER TABLE public.approval_requests
  ADD CONSTRAINT capability_override_approval_payload_check CHECK (
    request_type <> 'capability_override'
    OR (
      approval_action = 'apply'
      AND establishment_id IS NOT NULL
      AND subject_membership_id IS NOT NULL
      AND capability IS NOT NULL
      AND requested_effect IS NOT NULL
      AND target_override_id IS NULL
    )
    OR (
      approval_action = 'revoke'
      AND establishment_id IS NOT NULL
      AND subject_membership_id IS NOT NULL
      AND capability IS NOT NULL
      AND requested_effect IS NOT NULL
      AND target_override_id IS NOT NULL
    )
  );

ALTER TABLE public.membership_capability_overrides
  ADD COLUMN IF NOT EXISTS revocation_request_id uuid UNIQUE,
  ADD COLUMN IF NOT EXISTS revocation_approval_request_id uuid UNIQUE
    REFERENCES public.approval_requests(id) ON DELETE RESTRICT;

CREATE OR REPLACE FUNCTION public.request_capability_override_revocation(
  target_override_id uuid,
  target_justification text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_override public.membership_capability_overrides%ROWTYPE;
  existing_request public.approval_requests%ROWTYPE;
  created_request public.approval_requests%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL
    OR char_length(btrim(COALESCE(target_justification, ''))) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'invalid_revocation_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_override
  FROM public.membership_capability_overrides AS capability_override
  WHERE capability_override.id = target_override_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'active_override_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF NOT public.has_business_capability(
    target_override.establishment_id, actor_id, 'manage_team', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_request
  FROM public.approval_requests AS approval
  WHERE approval.request_id = target_request_id;
  IF FOUND THEN
    IF existing_request.requested_by <> actor_id
      OR existing_request.target_override_id <> target_override_id
      OR existing_request.approval_action <> 'revoke'
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'approvalRequestId', existing_request.id,
      'status', existing_request.status,
      'version', existing_request.version,
      'requestId', existing_request.request_id,
      'replayed', true
    );
  END IF;

  IF target_override.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'active_override_not_found' USING ERRCODE = 'P0002';
  END IF;

  INSERT INTO public.approval_requests(
    establishment_id, request_type, approval_action, requested_by,
    subject_membership_id, capability, requested_effect,
    target_override_id, justification, request_id
  ) VALUES (
    target_override.establishment_id, 'capability_override', 'revoke', actor_id,
    target_override.membership_id, target_override.capability,
    target_override.effect, target_override.id,
    btrim(target_justification), target_request_id
  ) RETURNING * INTO created_request;

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'capability_override.revocation_requested',
    target_override.establishment_id,
    jsonb_build_object(
      'approval_request_id', created_request.id,
      'override_id', target_override.id,
      'capability', target_override.capability,
      'effect', target_override.effect,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'approvalRequestId', created_request.id,
    'status', created_request.status,
    'version', created_request.version,
    'requestId', created_request.request_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_membership_capability_override(
  target_approval_request_id uuid,
  target_expected_approval_version integer,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  approval public.approval_requests%ROWTYPE;
  target_override public.membership_capability_overrides%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_revocation_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO approval
  FROM public.approval_requests AS target
  WHERE target.id = target_approval_request_id
  FOR UPDATE;
  IF NOT FOUND
    OR approval.request_type <> 'capability_override'
    OR approval.approval_action <> 'revoke'
  THEN
    RAISE EXCEPTION 'approved_revocation_required' USING ERRCODE = '42501';
  END IF;
  IF approval.requested_by <> actor_id THEN
    RAISE EXCEPTION 'approval_requester_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_business_capability(
    approval.establishment_id, actor_id, 'manage_team', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_override
  FROM public.membership_capability_overrides AS capability_override
  WHERE capability_override.revocation_request_id = target_request_id;
  IF FOUND THEN
    IF target_override.revocation_approval_request_id = target_approval_request_id THEN
      RETURN jsonb_build_object(
        'overrideId', target_override.id,
        'status', 'revoked',
        'requestId', target_override.revocation_request_id,
        'replayed', true
      );
    END IF;
    RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
  END IF;

  IF approval.status <> 'approved'
    OR approval.version <> target_expected_approval_version
    OR approval.expires_at <= now()
  THEN
    RAISE EXCEPTION 'approved_revocation_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO target_override
  FROM public.membership_capability_overrides AS capability_override
  WHERE capability_override.id = approval.target_override_id
  FOR UPDATE;
  IF NOT FOUND OR target_override.revoked_at IS NOT NULL THEN
    RAISE EXCEPTION 'active_override_not_found' USING ERRCODE = 'P0002';
  END IF;

  UPDATE public.membership_capability_overrides
  SET revoked_by = actor_id,
      revoked_at = now(),
      revocation_reason = approval.justification,
      revocation_request_id = target_request_id,
      revocation_approval_request_id = approval.id
  WHERE id = target_override.id
  RETURNING * INTO target_override;

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'capability_override.revoked',
    target_override.establishment_id,
    jsonb_build_object(
      'override_id', target_override.id,
      'capability', target_override.capability,
      'effect', target_override.effect,
      'approval_request_id', approval.id,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'overrideId', target_override.id,
    'status', 'revoked',
    'requestId', target_override.revocation_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.establishment_configuration_is_ready(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.can_view_establishment_readiness(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_establishment_readiness(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_establishment_lifecycle_rpc_write()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_establishment_lifecycle_status(
  uuid, text, integer, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.request_capability_override_revocation(
  uuid, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.revoke_membership_capability_override(
  uuid, integer, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_establishment_readiness(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_establishment_lifecycle_status(
  uuid, text, integer, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_capability_override_revocation(
  uuid, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_membership_capability_override(
  uuid, integer, uuid
) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_establishment_readiness(uuid) IS
  'Calculates operational, payments and service-fiscal readiness without editable readiness booleans or SaaS billing/fiscal reuse.';

COMMIT;
