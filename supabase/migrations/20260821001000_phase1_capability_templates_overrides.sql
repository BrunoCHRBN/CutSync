BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Phase 1, slice 2: capability templates, explicit overrides and approvals.
-- Direct table access remains closed; mutations are idempotent RPCs.

CREATE TABLE public.business_capability_catalog (
  capability text PRIMARY KEY CHECK (capability ~ '^[a-z][a-z0-9_]{2,79}$'),
  sensitive_override boolean NOT NULL DEFAULT false,
  read_only_allowed boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.business_role_template_capabilities (
  role_template text NOT NULL CHECK (role_template IN (
    'admin', 'professional', 'reception', 'cashier', 'finance', 'manager'
  )),
  capability text NOT NULL REFERENCES public.business_capability_catalog(capability)
    ON DELETE RESTRICT,
  PRIMARY KEY (role_template, capability)
);

INSERT INTO public.business_capability_catalog(
  capability,
  sensitive_override,
  read_only_allowed
)
VALUES
  ('view_own_agenda', false, true),
  ('view_team_agenda', false, true),
  ('create_self_walk_in', false, false),
  ('create_team_walk_in', false, false),
  ('manage_own_blocks', false, false),
  ('manage_team_blocks', false, false),
  ('view_services', false, true),
  ('manage_services', false, false),
  ('manage_team', false, false),
  ('manage_admins', true, false),
  ('view_own_commission', false, true),
  ('view_unit_reports', false, true),
  ('view_financial_reports', false, true),
  ('manage_operational_settings', false, false),
  ('view_clients', false, false),
  ('manage_clients', false, false),
  ('export_clients', false, false),
  ('manage_data_imports', false, false),
  ('request_appointment_reassignment', false, false),
  ('apply_appointment_reassignment', false, false),
  ('correct_appointment_assignment', true, false),
  ('view_orders', false, true),
  ('manage_own_orders', false, false),
  ('manage_team_orders', false, false),
  ('apply_order_discounts', false, false),
  ('void_orders', true, false),
  ('view_payments', false, true),
  ('take_payments', false, false),
  ('void_payments', true, false),
  ('issue_refunds', true, false),
  ('view_cash', false, true),
  ('operate_cash', false, false),
  ('close_cash', true, false),
  ('reopen_cash', true, false),
  ('view_team_commission', false, true),
  ('manage_commission_policies', true, false),
  ('close_commission_period', true, false),
  ('record_commission_payout', true, false),
  ('view_reconciliation', false, true),
  ('manage_reconciliation', true, false),
  ('view_fiscal', false, true),
  ('manage_fiscal', true, false),
  ('view_payment_provider', false, true),
  ('manage_payment_provider', true, false),
  ('approve_sensitive_actions', true, false);

INSERT INTO public.business_role_template_capabilities(role_template, capability)
SELECT 'professional', capability
FROM unnest(ARRAY[
  'view_own_agenda', 'create_self_walk_in',
  'manage_own_blocks', 'view_services', 'view_own_commission',
  'request_appointment_reassignment', 'view_orders', 'manage_own_orders',
  'view_payments'
]) AS capability;

INSERT INTO public.business_role_template_capabilities(role_template, capability)
SELECT 'reception', capability
FROM unnest(ARRAY[
  'view_own_agenda', 'view_team_agenda', 'create_self_walk_in',
  'create_team_walk_in', 'manage_own_blocks', 'manage_team_blocks',
  'view_services', 'view_clients', 'manage_clients',
  'request_appointment_reassignment', 'view_orders', 'manage_team_orders'
]) AS capability;

INSERT INTO public.business_role_template_capabilities(role_template, capability)
SELECT 'cashier', capability
FROM unnest(ARRAY[
  'view_own_agenda', 'view_team_agenda', 'view_services', 'view_clients',
  'view_orders', 'manage_team_orders', 'view_payments', 'take_payments',
  'void_payments', 'view_cash', 'operate_cash', 'close_cash'
]) AS capability;

INSERT INTO public.business_role_template_capabilities(role_template, capability)
SELECT 'finance', capability
FROM unnest(ARRAY[
  'view_services', 'view_unit_reports', 'view_financial_reports', 'view_orders',
  'view_payments', 'view_cash', 'view_team_commission', 'view_reconciliation',
  'manage_reconciliation', 'view_fiscal', 'view_payment_provider'
]) AS capability;

INSERT INTO public.business_role_template_capabilities(role_template, capability)
SELECT 'manager', capability
FROM public.business_capability_catalog
WHERE capability NOT IN (
  'manage_admins', 'reopen_cash', 'manage_payment_provider'
);

INSERT INTO public.business_role_template_capabilities(role_template, capability)
SELECT 'admin', capability
FROM public.business_capability_catalog
WHERE capability NOT IN ('manage_admins', 'reopen_cash');

CREATE TABLE public.approval_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  request_type text NOT NULL CHECK (request_type IN (
    'capability_override', 'elevated_refund', 'retention', 'reopen_cash',
    'banking_change', 'executor_correction', 'cross_unit_action'
  )),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  subject_membership_id uuid REFERENCES public.memberships(id) ON DELETE CASCADE,
  capability text REFERENCES public.business_capability_catalog(capability)
    ON DELETE RESTRICT,
  requested_effect text CHECK (requested_effect IN ('grant', 'deny')),
  justification text NOT NULL CHECK (char_length(btrim(justification)) BETWEEN 10 AND 500),
  status text NOT NULL DEFAULT 'pending' CHECK (
    status IN ('pending', 'approved', 'rejected', 'cancelled', 'expired')
  ),
  request_id uuid NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  decided_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  decision_request_id uuid UNIQUE,
  decision_reason text CHECK (
    decision_reason IS NULL
    OR char_length(btrim(decision_reason)) BETWEEN 10 AND 500
  ),
  decided_at timestamptz,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT approval_requests_scope_check CHECK (
    establishment_id IS NOT NULL OR organization_id IS NOT NULL
  ),
  CONSTRAINT capability_override_approval_payload_check CHECK (
    request_type <> 'capability_override'
    OR (
      establishment_id IS NOT NULL
      AND subject_membership_id IS NOT NULL
      AND capability IS NOT NULL
      AND requested_effect IS NOT NULL
    )
  )
);

CREATE INDEX approval_requests_pending_scope_idx
  ON public.approval_requests(establishment_id, status, expires_at)
  WHERE status = 'pending';

CREATE TABLE public.membership_capability_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  membership_id uuid NOT NULL REFERENCES public.memberships(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  capability text NOT NULL REFERENCES public.business_capability_catalog(capability)
    ON DELETE RESTRICT,
  effect text NOT NULL CHECK (effect IN ('grant', 'deny')),
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  justification text NOT NULL CHECK (char_length(btrim(justification)) BETWEEN 10 AND 500),
  granted_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  approval_request_id uuid NOT NULL UNIQUE
    REFERENCES public.approval_requests(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  revoked_at timestamptz,
  revocation_reason text CHECK (
    revocation_reason IS NULL
    OR char_length(btrim(revocation_reason)) BETWEEN 10 AND 500
  ),
  CHECK (valid_until IS NULL OR valid_until > valid_from)
);

CREATE UNIQUE INDEX membership_capability_overrides_one_active_effect_idx
  ON public.membership_capability_overrides(membership_id, capability, effect)
  WHERE revoked_at IS NULL;
CREATE INDEX membership_capability_overrides_resolution_idx
  ON public.membership_capability_overrides(
    membership_id, capability, effect, valid_from, valid_until
  )
  WHERE revoked_at IS NULL;

ALTER TABLE public.business_capability_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_role_template_capabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.membership_capability_overrides ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.business_capability_catalog,
  public.business_role_template_capabilities,
  public.approval_requests,
  public.membership_capability_overrides
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.resolve_business_operational_identity(
  target_establishment_id uuid,
  target_profile_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  membership_role text,
  operational_role text,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH active_membership AS (
    SELECT membership.id, membership.role
    FROM public.memberships AS membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
    LIMIT 1
  ),
  active_organization AS (
    SELECT link.organization_id
    FROM public.organization_establishments AS link
    JOIN public.organizations AS organization
      ON organization.id = link.organization_id
     AND organization.status = 'active'
    WHERE link.establishment_id = target_establishment_id
      AND link.status = 'active'
      AND link.effective_from <= CURRENT_DATE
      AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
    ORDER BY link.effective_from DESC, link.created_at DESC
    LIMIT 1
  )
  SELECT
    membership.id,
    membership.role,
    CASE
      WHEN organization.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.organization_members AS organization_member
          WHERE organization_member.organization_id = organization.organization_id
            AND organization_member.profile_id = target_profile_id
            AND organization_member.role = 'owner'
            AND organization_member.status = 'active'
            AND organization_member.revoked_at IS NULL
        )
      THEN 'owner'
      WHEN organization.organization_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.billing_accounts AS billing_account
          WHERE billing_account.establishment_id = target_establishment_id
            AND billing_account.billing_owner_profile_id = target_profile_id
            AND billing_account.owner_resolution_status = 'confirmed'
        )
      THEN 'owner'
      WHEN membership.role = 'admin' THEN 'admin'
      ELSE 'professional'
    END,
    organization.organization_id
  FROM active_membership AS membership
  LEFT JOIN active_organization AS organization ON true;
$$;

CREATE OR REPLACE FUNCTION public.resolve_business_operational_capabilities(
  target_establishment_id uuid,
  target_profile_id uuid,
  target_access_mode text
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  identity_record record;
  target_membership_id uuid;
  target_role_template text;
  base_capabilities text[] := ARRAY[]::text[];
BEGIN
  IF target_access_mode NOT IN ('full', 'read_only') THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id,
    target_profile_id
  )
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT membership.id, membership.role_template
  INTO target_membership_id, target_role_template
  FROM public.memberships AS membership
  WHERE membership.profile_id = target_profile_id
    AND membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
  LIMIT 1;

  IF identity_record.operational_role = 'owner' THEN
    SELECT COALESCE(array_agg(catalog.capability ORDER BY catalog.capability), ARRAY[]::text[])
    INTO base_capabilities
    FROM public.business_capability_catalog AS catalog
    WHERE catalog.active;
  ELSE
    SELECT COALESCE(array_agg(template.capability ORDER BY template.capability), ARRAY[]::text[])
    INTO base_capabilities
    FROM public.business_role_template_capabilities AS template
    JOIN public.business_capability_catalog AS catalog
      ON catalog.capability = template.capability
     AND catalog.active
    WHERE template.role_template = target_role_template;

    IF target_role_template = 'professional'
      AND COALESCE((
        SELECT establishment.share_agendas
        FROM public.establishments AS establishment
        WHERE establishment.id = target_establishment_id
      ), false)
      AND NOT ('view_team_agenda' = ANY(base_capabilities))
    THEN
      base_capabilities := base_capabilities || ARRAY['view_team_agenda'];
    END IF;
  END IF;

  RETURN ARRAY(
    SELECT catalog.capability
    FROM public.business_capability_catalog AS catalog
    WHERE catalog.active
      AND (target_access_mode = 'full' OR catalog.read_only_allowed)
      AND NOT EXISTS (
        SELECT 1
        FROM public.membership_capability_overrides AS override
        WHERE override.membership_id = target_membership_id
          AND override.establishment_id = target_establishment_id
          AND override.capability = catalog.capability
          AND override.effect = 'deny'
          AND override.revoked_at IS NULL
          AND override.valid_from <= now()
          AND (override.valid_until IS NULL OR override.valid_until > now())
      )
      AND (
        catalog.capability = ANY(base_capabilities)
        OR EXISTS (
          SELECT 1
          FROM public.membership_capability_overrides AS override
          WHERE override.membership_id = target_membership_id
            AND override.establishment_id = target_establishment_id
            AND override.capability = catalog.capability
            AND override.effect = 'grant'
            AND override.revoked_at IS NULL
            AND override.valid_from <= now()
            AND (override.valid_until IS NULL OR override.valid_until > now())
        )
      )
    ORDER BY catalog.capability
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.has_business_capability(
  target_establishment_id uuid,
  target_profile_id uuid,
  target_capability text,
  target_access_mode text DEFAULT 'full'
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT target_capability = ANY(
    public.resolve_business_operational_capabilities(
      target_establishment_id,
      target_profile_id,
      target_access_mode
    )
  );
$$;

REVOKE ALL ON FUNCTION public.has_business_capability(uuid, uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.has_business_capability(uuid, uuid, text, text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.request_capability_override_approval(
  target_establishment_id uuid,
  target_membership_id uuid,
  target_capability text,
  target_effect text,
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
  existing_request public.approval_requests%ROWTYPE;
  created_request public.approval_requests%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL OR target_effect NOT IN ('grant', 'deny') THEN
    RAISE EXCEPTION 'invalid_approval_request' USING ERRCODE = '22023';
  END IF;
  IF char_length(btrim(COALESCE(target_justification, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'approval_reason_required' USING ERRCODE = '22023';
  END IF;
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'manage_team', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.id = target_membership_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
  ) OR NOT EXISTS (
    SELECT 1 FROM public.business_capability_catalog AS catalog
    WHERE catalog.capability = target_capability AND catalog.active
  ) THEN
    RAISE EXCEPTION 'invalid_approval_target' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO existing_request
  FROM public.approval_requests AS approval
  WHERE approval.request_id = target_request_id;
  IF FOUND THEN
    IF existing_request.requested_by <> actor_id
      OR existing_request.establishment_id <> target_establishment_id
      OR existing_request.subject_membership_id <> target_membership_id
      OR existing_request.capability <> target_capability
      OR existing_request.requested_effect <> target_effect
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

  INSERT INTO public.approval_requests(
    establishment_id, request_type, requested_by, subject_membership_id,
    capability, requested_effect, justification, request_id
  ) VALUES (
    target_establishment_id, 'capability_override', actor_id,
    target_membership_id, target_capability, target_effect,
    btrim(target_justification), target_request_id
  ) RETURNING * INTO created_request;

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, target_profile_id, metadata
  )
  SELECT actor_id, 'capability_override.approval_requested',
    target_establishment_id, membership.profile_id,
    jsonb_build_object(
      'approval_request_id', created_request.id,
      'capability', target_capability,
      'effect', target_effect,
      'request_id', target_request_id
    )
  FROM public.memberships AS membership
  WHERE membership.id = target_membership_id;

  RETURN jsonb_build_object(
    'approvalRequestId', created_request.id,
    'status', created_request.status,
    'version', created_request.version,
    'requestId', created_request.request_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_capability_override_approval(
  target_approval_request_id uuid,
  target_expected_version integer,
  target_decision text,
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
  target_request public.approval_requests%ROWTYPE;
  actor_identity record;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL
    OR target_decision NOT IN ('approved', 'rejected')
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'invalid_approval_decision' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO target_request
  FROM public.approval_requests AS approval
  WHERE approval.id = target_approval_request_id
  FOR UPDATE;
  IF NOT FOUND OR target_request.request_type <> 'capability_override' THEN
    RAISE EXCEPTION 'approval_request_not_found' USING ERRCODE = 'P0002';
  END IF;
  IF target_request.requested_by = actor_id THEN
    RAISE EXCEPTION 'approval_separation_required' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO actor_identity
  FROM public.resolve_business_operational_identity(
    target_request.establishment_id, actor_id
  ) LIMIT 1;
  IF NOT FOUND OR actor_identity.operational_role <> 'owner' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF target_request.status <> 'pending'
    AND target_request.decision_request_id = target_request_id
    AND target_request.status = target_decision
    AND target_request.decided_by = actor_id
  THEN
    RETURN jsonb_build_object(
      'approvalRequestId', target_request.id,
      'status', target_request.status,
      'version', target_request.version,
      'requestId', target_request.decision_request_id,
      'replayed', true
    );
  END IF;
  IF target_request.status <> 'pending' THEN
    RAISE EXCEPTION 'approval_request_not_pending' USING ERRCODE = '22023';
  END IF;
  IF target_request.version <> target_expected_version THEN
    RAISE EXCEPTION 'approval_version_conflict' USING ERRCODE = '40001';
  END IF;
  IF target_request.expires_at <= now() THEN
    RAISE EXCEPTION 'approval_request_expired' USING ERRCODE = '22023';
  END IF;

  UPDATE public.approval_requests
  SET status = target_decision,
      decided_by = actor_id,
      decision_request_id = target_request_id,
      decision_reason = btrim(target_reason),
      decided_at = now(),
      version = version + 1,
      updated_at = now()
  WHERE id = target_request.id
  RETURNING * INTO target_request;

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'capability_override.approval_' || target_decision,
    target_request.establishment_id,
    jsonb_build_object(
      'approval_request_id', target_request.id,
      'capability', target_request.capability,
      'effect', target_request.requested_effect,
      'version', target_request.version
    )
  );

  RETURN jsonb_build_object(
    'approvalRequestId', target_request.id,
    'status', target_request.status,
    'version', target_request.version,
    'requestId', target_request.decision_request_id,
    'replayed', false
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_membership_capability_override(
  target_approval_request_id uuid,
  target_expected_approval_version integer,
  target_valid_until timestamptz,
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
  existing_override public.membership_capability_overrides%ROWTYPE;
  created_override public.membership_capability_overrides%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  PERFORM public.require_aal2();
  IF target_request_id IS NULL
    OR (target_valid_until IS NOT NULL AND target_valid_until <= now())
  THEN
    RAISE EXCEPTION 'invalid_override_request' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO approval
  FROM public.approval_requests AS target
  WHERE target.id = target_approval_request_id
  FOR UPDATE;
  IF NOT FOUND OR approval.request_type <> 'capability_override' THEN
    RAISE EXCEPTION 'approved_request_required' USING ERRCODE = '42501';
  END IF;
  IF approval.requested_by <> actor_id THEN
    RAISE EXCEPTION 'approval_requester_mismatch' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_business_capability(
    approval.establishment_id, actor_id, 'manage_team', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_override
  FROM public.membership_capability_overrides AS capability_override
  WHERE capability_override.request_id = target_request_id;
  IF FOUND THEN
    IF existing_override.approval_request_id <> target_approval_request_id THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'overrideId', existing_override.id,
      'membershipId', existing_override.membership_id,
      'capability', existing_override.capability,
      'effect', existing_override.effect,
      'requestId', existing_override.request_id,
      'replayed', true
    );
  END IF;

  IF approval.status <> 'approved'
    OR approval.version <> target_expected_approval_version
    OR approval.expires_at <= now()
  THEN
    RAISE EXCEPTION 'approved_request_required' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.membership_capability_overrides(
    membership_id, establishment_id, capability, effect, valid_until,
    justification, granted_by, approval_request_id, request_id
  ) VALUES (
    approval.subject_membership_id, approval.establishment_id,
    approval.capability, approval.requested_effect, target_valid_until,
    approval.justification, actor_id, approval.id, target_request_id
  ) RETURNING * INTO created_override;

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'capability_override.applied',
    approval.establishment_id,
    jsonb_build_object(
      'override_id', created_override.id,
      'membership_id', created_override.membership_id,
      'capability', created_override.capability,
      'effect', created_override.effect,
      'approval_request_id', approval.id,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'overrideId', created_override.id,
    'membershipId', created_override.membership_id,
    'capability', created_override.capability,
    'effect', created_override.effect,
    'requestId', created_override.request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.request_capability_override_approval(
  uuid, uuid, text, text, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decide_capability_override_approval(
  uuid, integer, text, text, uuid
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_membership_capability_override(
  uuid, integer, timestamptz, uuid
) FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.request_capability_override_approval(
  uuid, uuid, text, text, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_capability_override_approval(
  uuid, integer, text, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_membership_capability_override(
  uuid, integer, timestamptz, uuid
) TO authenticated, service_role;

COMMENT ON TABLE public.membership_capability_overrides IS
  'Explicit membership grants and denies. Active deny wins over grant and role template.';
COMMENT ON TABLE public.approval_requests IS
  'Versioned approvals for sensitive operational actions. SaaS billing remains separate.';

COMMIT;
