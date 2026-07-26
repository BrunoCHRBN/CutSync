BEGIN;

-- Consolidates per-establishment Stripe billing and organization billing behind
-- one effective coverage resolver. Billing state never mutates
-- establishments.account_status, which remains a governance/security concern.

ALTER TABLE public.organization_billing_accounts
  ADD COLUMN IF NOT EXISTS billing_owner_profile_id uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS taxpayer_name text,
  ADD COLUMN IF NOT EXISTS municipal_registration text,
  ADD COLUMN IF NOT EXISTS fiscal_address jsonb NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.organization_billing_accounts AS account
SET billing_owner_profile_id = (
      SELECT member.profile_id
      FROM public.organization_members AS member
      WHERE member.organization_id = account.organization_id
        AND member.role = 'owner'
        AND member.status = 'active'
        AND member.revoked_at IS NULL
      ORDER BY member.created_at
      LIMIT 1
    ),
    updated_at = now()
WHERE account.billing_owner_profile_id IS NULL;

UPDATE public.organization_billing_accounts
SET taxpayer_name = display_name,
    updated_at = now()
WHERE taxpayer_name IS NULL;

CREATE OR REPLACE FUNCTION public.resolve_organization_billing_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.billing_owner_profile_id IS NULL THEN
    SELECT member.profile_id
    INTO NEW.billing_owner_profile_id
    FROM public.organization_members AS member
    WHERE member.organization_id = NEW.organization_id
      AND member.role = 'owner'
      AND member.status = 'active'
      AND member.revoked_at IS NULL
    ORDER BY member.created_at
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS resolve_organization_billing_owner_trigger
  ON public.organization_billing_accounts;
CREATE TRIGGER resolve_organization_billing_owner_trigger
BEFORE INSERT OR UPDATE OF organization_id, billing_owner_profile_id
ON public.organization_billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.resolve_organization_billing_owner();

ALTER TABLE public.organization_billing_plans
  ADD COLUMN IF NOT EXISTS entitlements jsonb NOT NULL
    DEFAULT '["business_web","business_app","appointments","team","services","reports"]'::jsonb
    CHECK (jsonb_typeof(entitlements) = 'array');

ALTER TABLE public.plan_unit_tiers
  ADD COLUMN IF NOT EXISTS unit_price_cents integer
    CHECK (unit_price_cents IS NULL OR unit_price_cents >= 0);

UPDATE public.organization_billing_plans
SET base_price_cents = 4990,
    currency = 'BRL',
    updated_at = now()
WHERE code = 'multi_unit_standard';

UPDATE public.plan_unit_tiers AS tier
SET unit_price_cents = CASE tier.unit_from
      WHEN 1 THEN 4990
      WHEN 2 THEN 4490
      WHEN 3 THEN 3990
      ELSE tier.unit_price_cents
    END,
    percentage_basis_points = CASE tier.unit_from
      WHEN 1 THEN 10000
      WHEN 2 THEN 9000
      WHEN 3 THEN 8000
      ELSE tier.percentage_basis_points
    END
FROM public.organization_billing_plans AS plan
WHERE plan.id = tier.plan_id
  AND plan.code = 'multi_unit_standard';

ALTER TABLE public.organization_subscriptions
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'internal'
    CHECK (provider IN ('stripe', 'google_play', 'internal')),
  ADD COLUMN IF NOT EXISTS external_customer_id text,
  ADD COLUMN IF NOT EXISTS external_subscription_id text,
  ADD COLUMN IF NOT EXISTS provider_event_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS cancel_at_period_end boolean NOT NULL DEFAULT false;

ALTER TABLE public.organization_subscriptions
  DROP CONSTRAINT IF EXISTS organization_subscriptions_status_check;
ALTER TABLE public.organization_subscriptions
  ADD CONSTRAINT organization_subscriptions_status_check
  CHECK (
    status IN (
      'trialing',
      'checkout_pending',
      'active',
      'past_due',
      'suspended',
      'canceled',
      'expired',
      'courtesy'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS organization_subscriptions_provider_external_idx
  ON public.organization_subscriptions(provider, external_subscription_id)
  WHERE external_subscription_id IS NOT NULL;

ALTER TABLE public.organization_billing_invoices
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'internal'
    CHECK (provider IN ('stripe', 'google_play', 'internal')),
  ADD COLUMN IF NOT EXISTS external_invoice_id text,
  ADD COLUMN IF NOT EXISTS number text,
  ADD COLUMN IF NOT EXISTS paid_cents integer NOT NULL DEFAULT 0
    CHECK (paid_cents >= 0),
  ADD COLUMN IF NOT EXISTS refunded_cents integer NOT NULL DEFAULT 0
    CHECK (refunded_cents >= 0),
  ADD COLUMN IF NOT EXISTS hosted_invoice_url text,
  ADD COLUMN IF NOT EXISTS invoice_pdf_url text,
  ADD COLUMN IF NOT EXISTS provider_event_created_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.organization_billing_invoices
  DROP CONSTRAINT IF EXISTS organization_billing_invoices_status_check;
ALTER TABLE public.organization_billing_invoices
  ADD CONSTRAINT organization_billing_invoices_status_check
  CHECK (
    status IN (
      'draft',
      'open',
      'paid',
      'void',
      'overdue',
      'uncollectible',
      'refunded',
      'partially_refunded'
    )
  );

CREATE UNIQUE INDEX IF NOT EXISTS organization_billing_invoices_provider_external_idx
  ON public.organization_billing_invoices(provider, external_invoice_id)
  WHERE external_invoice_id IS NOT NULL;

ALTER TABLE public.fiscal_documents
  ALTER COLUMN billing_invoice_id DROP NOT NULL,
  ADD COLUMN IF NOT EXISTS organization_billing_invoice_id uuid
    REFERENCES public.organization_billing_invoices(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX IF NOT EXISTS fiscal_documents_organization_invoice_idx
  ON public.fiscal_documents(organization_billing_invoice_id)
  WHERE organization_billing_invoice_id IS NOT NULL;
ALTER TABLE public.fiscal_documents
  ADD CONSTRAINT fiscal_documents_one_invoice_source_check
  CHECK (
    (billing_invoice_id IS NOT NULL)::integer
    + (organization_billing_invoice_id IS NOT NULL)::integer = 1
  );

CREATE TABLE public.billing_coverage_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  source_scope text NOT NULL CHECK (source_scope IN ('establishment', 'organization')),
  billing_account_id uuid REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  organization_subscription_id uuid
    REFERENCES public.organization_subscriptions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('scheduled', 'active', 'ended')),
  effective_from timestamptz NOT NULL,
  effective_until timestamptz,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reason text NOT NULL DEFAULT 'initial_backfill'
    CHECK (char_length(reason) BETWEEN 3 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until > effective_from),
  CHECK (
    (
      source_scope = 'establishment'
      AND billing_account_id IS NOT NULL
      AND organization_subscription_id IS NULL
    )
    OR
    (
      source_scope = 'organization'
      AND billing_account_id IS NULL
      AND organization_subscription_id IS NOT NULL
    )
  )
);

CREATE INDEX billing_coverage_establishment_effective_idx
  ON public.billing_coverage_assignments(
    establishment_id, status, effective_from DESC
  );
CREATE UNIQUE INDEX billing_coverage_one_scheduled_source_idx
  ON public.billing_coverage_assignments(establishment_id)
  WHERE status = 'scheduled';

CREATE OR REPLACE FUNCTION public.validate_billing_coverage_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  expected_establishment_id uuid;
  covered_by_organization boolean;
BEGIN
  -- Serialize coverage changes for one establishment without requiring an
  -- extension-backed exclusion constraint.
  PERFORM pg_advisory_xact_lock(
    pg_catalog.hashtextextended(NEW.establishment_id::text, 0)
  );

  IF NEW.source_scope = 'establishment' THEN
    SELECT account.establishment_id
    INTO expected_establishment_id
    FROM public.billing_accounts AS account
    WHERE account.id = NEW.billing_account_id;
    IF expected_establishment_id IS DISTINCT FROM NEW.establishment_id THEN
      RAISE EXCEPTION 'billing_account_establishment_mismatch';
    END IF;
  ELSE
    SELECT EXISTS (
      SELECT 1
      FROM public.organization_subscriptions AS subscription
      JOIN public.organization_billing_accounts AS account
        ON account.id = subscription.billing_account_id
      JOIN public.organization_establishments AS link
        ON link.organization_id = account.organization_id
       AND link.establishment_id = NEW.establishment_id
      WHERE subscription.id = NEW.organization_subscription_id
    ) INTO covered_by_organization;
    IF NOT covered_by_organization THEN
      RAISE EXCEPTION 'organization_subscription_establishment_mismatch';
    END IF;
  END IF;

  IF NEW.status = 'active' AND EXISTS (
    SELECT 1
    FROM public.billing_coverage_assignments AS existing
    WHERE existing.establishment_id = NEW.establishment_id
      AND existing.status = 'active'
      AND existing.id IS DISTINCT FROM NEW.id
      AND existing.effective_from < COALESCE(NEW.effective_until, 'infinity'::timestamptz)
      AND NEW.effective_from < COALESCE(existing.effective_until, 'infinity'::timestamptz)
  ) THEN
    RAISE EXCEPTION 'overlapping_billing_coverage';
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_billing_coverage_assignment_trigger
BEFORE INSERT OR UPDATE ON public.billing_coverage_assignments
FOR EACH ROW EXECUTE FUNCTION public.validate_billing_coverage_assignment();

ALTER TABLE public.billing_coverage_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members view effective billing coverage"
ON public.billing_coverage_assignments
FOR SELECT TO authenticated
USING (
  public.has_active_membership(establishment_id)
  OR (
    source_scope = 'organization'
    AND EXISTS (
      SELECT 1
      FROM public.organization_subscriptions AS subscription
      JOIN public.organization_billing_accounts AS account
        ON account.id = subscription.billing_account_id
      WHERE subscription.id = organization_subscription_id
        AND public.has_organization_role(
          account.organization_id,
          ARRAY['owner', 'finance']
        )
    )
  )
  OR public.is_governance_user()
);

REVOKE INSERT, UPDATE, DELETE
ON public.billing_coverage_assignments
FROM authenticated;
GRANT SELECT ON public.billing_coverage_assignments TO authenticated;

CREATE OR REPLACE FUNCTION public.initialize_individual_billing_coverage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.billing_coverage_assignments(
    establishment_id,
    source_scope,
    billing_account_id,
    status,
    effective_from,
    reason
  )
  SELECT
    NEW.establishment_id,
    'establishment',
    NEW.id,
    'active',
    COALESCE(
      NEW.operationally_activated_at,
      NEW.created_at,
      transaction_timestamp()
    ),
    'billing_account_created'
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.billing_coverage_assignments AS coverage
    WHERE coverage.establishment_id = NEW.establishment_id
      AND coverage.status = 'active'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_individual_billing_coverage_trigger
  ON public.billing_accounts;
CREATE TRIGGER initialize_individual_billing_coverage_trigger
AFTER INSERT ON public.billing_accounts
FOR EACH ROW EXECUTE FUNCTION public.initialize_individual_billing_coverage();

INSERT INTO public.billing_coverage_assignments(
  establishment_id,
  source_scope,
  billing_account_id,
  status,
  effective_from,
  reason
)
SELECT
  account.establishment_id,
  'establishment',
  account.id,
  'active',
  COALESCE(
    account.operationally_activated_at,
    account.created_at,
    transaction_timestamp()
  ),
  'initial_individual_backfill'
FROM public.billing_accounts AS account
WHERE NOT EXISTS (
  SELECT 1
  FROM public.billing_coverage_assignments AS coverage
  WHERE coverage.establishment_id = account.establishment_id
    AND coverage.status = 'active'
);

-- Preserve any organization enforcement that was explicitly enabled before
-- this migration. Default/off organization subscriptions remain individual
-- until a reconciled cutover is scheduled.
WITH enforced_units AS (
  SELECT DISTINCT ON (unit.establishment_id)
    unit.establishment_id,
    subscription.id AS organization_subscription_id
  FROM public.subscription_units AS unit
  JOIN public.organization_subscriptions AS subscription
    ON subscription.id = unit.subscription_id
  WHERE subscription.enforcement_enabled
    AND unit.effective_from <= CURRENT_DATE
    AND (unit.effective_until IS NULL OR unit.effective_until >= CURRENT_DATE)
  ORDER BY unit.establishment_id, unit.effective_from DESC
)
UPDATE public.billing_coverage_assignments AS coverage
SET effective_until = transaction_timestamp(),
    status = 'ended',
    reason = 'superseded_by_enforced_organization',
    updated_at = now()
FROM enforced_units
WHERE coverage.establishment_id = enforced_units.establishment_id
  AND coverage.source_scope = 'establishment'
  AND coverage.status = 'active';

INSERT INTO public.billing_coverage_assignments(
  establishment_id,
  source_scope,
  organization_subscription_id,
  status,
  effective_from,
  reason
)
SELECT DISTINCT ON (unit.establishment_id)
  unit.establishment_id,
  'organization',
  subscription.id,
  'active',
  transaction_timestamp(),
  'preserve_enforced_organization'
FROM public.subscription_units AS unit
JOIN public.organization_subscriptions AS subscription
  ON subscription.id = unit.subscription_id
WHERE subscription.enforcement_enabled
  AND unit.effective_from <= CURRENT_DATE
  AND (unit.effective_until IS NULL OR unit.effective_until >= CURRENT_DATE)
  AND NOT EXISTS (
    SELECT 1
    FROM public.billing_coverage_assignments AS coverage
    WHERE coverage.establishment_id = unit.establishment_id
      AND coverage.status = 'active'
  )
ORDER BY unit.establishment_id, unit.effective_from DESC;

CREATE OR REPLACE FUNCTION public.sync_organization_billing_owner()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  affected_organization_id uuid;
  current_owner_id uuid;
BEGIN
  affected_organization_id := CASE
    WHEN TG_OP = 'DELETE' THEN OLD.organization_id
    ELSE NEW.organization_id
  END;
  SELECT member.profile_id
  INTO current_owner_id
  FROM public.organization_members AS member
  WHERE member.organization_id = affected_organization_id
    AND member.role = 'owner'
    AND member.status = 'active'
    AND member.revoked_at IS NULL
  ORDER BY member.created_at
  LIMIT 1;

  UPDATE public.organization_billing_accounts
  SET billing_owner_profile_id = current_owner_id,
      updated_at = now()
  WHERE organization_id = affected_organization_id
    AND billing_owner_profile_id IS DISTINCT FROM current_owner_id;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_organization_billing_owner_trigger
  ON public.organization_members;
CREATE TRIGGER sync_organization_billing_owner_trigger
AFTER INSERT OR UPDATE OF role, status, revoked_at OR DELETE
ON public.organization_members
FOR EACH ROW EXECUTE FUNCTION public.sync_organization_billing_owner();

CREATE TABLE public.billing_cutover_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_subscription_id uuid NOT NULL
    REFERENCES public.organization_subscriptions(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'scheduled'
    CHECK (status IN ('scheduled', 'reconciling', 'applied', 'cancelled', 'failed')),
  cutover_at timestamptz NOT NULL,
  establishment_ids uuid[] NOT NULL CHECK (cardinality(establishment_ids) > 0),
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  applied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  applied_at timestamptz,
  failure_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX billing_cutover_one_pending_org_idx
  ON public.billing_cutover_requests(organization_subscription_id)
  WHERE status IN ('scheduled', 'reconciling');

ALTER TABLE public.billing_cutover_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Corporate finance views billing cutovers"
ON public.billing_cutover_requests
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM public.organization_subscriptions AS subscription
    JOIN public.organization_billing_accounts AS account
      ON account.id = subscription.billing_account_id
    WHERE subscription.id = organization_subscription_id
      AND public.has_organization_role(
        account.organization_id,
        ARRAY['owner', 'finance']
      )
  )
  OR public.is_governance_user()
);
REVOKE INSERT, UPDATE, DELETE ON public.billing_cutover_requests FROM authenticated;
GRANT SELECT ON public.billing_cutover_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_organization_billing_cutover(
  target_organization_id uuid,
  target_establishment_ids uuid[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_subscription_id uuid;
  target_period_end date;
  target_is_network boolean;
  selected_establishments uuid[];
  last_individual_period_end timestamptz;
  cutover_time timestamptz;
  request_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner'])
     AND NOT public.is_governance_user()
  THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  SELECT subscription.id, subscription.current_period_end, plan.is_network
  INTO target_subscription_id, target_period_end, target_is_network
  FROM public.organization_subscriptions AS subscription
  JOIN public.organization_billing_accounts AS account
    ON account.id = subscription.billing_account_id
  JOIN public.organization_billing_plans AS plan
    ON plan.id = subscription.plan_id
  WHERE account.organization_id = target_organization_id
    AND subscription.status <> 'canceled'
  FOR UPDATE;
  IF target_subscription_id IS NULL THEN
    RAISE EXCEPTION 'organization_subscription_required';
  END IF;

  SELECT array_agg(link.establishment_id ORDER BY link.establishment_id)
  INTO selected_establishments
  FROM public.organization_establishments AS link
  WHERE link.organization_id = target_organization_id
    AND link.status = 'active'
    AND link.effective_until IS NULL
    AND (
      target_establishment_ids IS NULL
      OR link.establishment_id = ANY(target_establishment_ids)
    );
  IF selected_establishments IS NULL THEN
    RAISE EXCEPTION 'organization_establishments_required';
  END IF;
  IF target_establishment_ids IS NOT NULL
     AND cardinality(selected_establishments) <> cardinality(target_establishment_ids)
  THEN
    RAISE EXCEPTION 'invalid_organization_establishment';
  END IF;
  IF cardinality(selected_establishments) >= 5 AND NOT target_is_network THEN
    RAISE EXCEPTION 'network_plan_required';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM unnest(selected_establishments) AS selected(establishment_id)
    WHERE public.billing_access_mode(selected.establishment_id) <> 'full'
  ) THEN
    RAISE EXCEPTION 'billing_regularization_required';
  END IF;

  SELECT max(subscription.current_period_ends_at)
  INTO last_individual_period_end
  FROM public.billing_subscriptions AS subscription
  JOIN public.billing_accounts AS account
    ON account.id = subscription.billing_account_id
  WHERE account.establishment_id = ANY(selected_establishments)
    AND subscription.status IN ('checkout_pending', 'active', 'past_due', 'cancelled')
    AND (
      subscription.current_period_ends_at IS NULL
      OR subscription.current_period_ends_at > now()
    );

  cutover_time := GREATEST(
    now(),
    (target_period_end + 1)::timestamptz,
    COALESCE(last_individual_period_end, '-infinity'::timestamptz)
  );

  INSERT INTO public.billing_cutover_requests(
    organization_subscription_id,
    cutover_at,
    establishment_ids,
    requested_by
  ) VALUES (
    target_subscription_id,
    cutover_time,
    selected_establishments,
    actor_id
  )
  RETURNING id INTO request_id;

  INSERT INTO public.billing_coverage_assignments(
    establishment_id,
    source_scope,
    organization_subscription_id,
    status,
    effective_from,
    created_by,
    reason
  )
  SELECT
    establishment_id,
    'organization',
    target_subscription_id,
    'scheduled',
    cutover_time,
    actor_id,
    'organization_cutover'
  FROM unnest(selected_establishments) AS establishment_id;

  -- Individual subscriptions that finish before the common cutover receive a
  -- server-side courtesy bridge. This avoids both a service gap and a partial
  -- refund while each Stripe subscription is cancelled at its own period end.
  UPDATE public.billing_accounts AS account
  SET courtesy_ends_at = cutover_time + interval '1 hour',
      updated_at = now()
  WHERE account.establishment_id = ANY(selected_establishments);

  INSERT INTO public.organization_billing_events(
    billing_account_id,
    subscription_id,
    actor_id,
    event_type,
    metadata
  )
  SELECT
    subscription.billing_account_id,
    subscription.id,
    actor_id,
    'billing.cutover_scheduled',
    jsonb_build_object(
      'cutover_request_id', request_id,
      'cutover_at', cutover_time,
      'unit_count', cardinality(selected_establishments)
    )
  FROM public.organization_subscriptions AS subscription
  WHERE subscription.id = target_subscription_id;

  RETURN request_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.finalize_organization_billing_cutover(
  target_cutover_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  request_record public.billing_cutover_requests%ROWTYPE;
BEGIN
  IF (SELECT auth.role()) <> 'service_role'
     AND NOT public.is_governance_user(
    ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO request_record
  FROM public.billing_cutover_requests
  WHERE id = target_cutover_request_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'cutover_request_not_found'; END IF;
  IF request_record.status NOT IN ('scheduled', 'reconciling') THEN
    RAISE EXCEPTION 'cutover_request_not_pending';
  END IF;
  IF now() < request_record.cutover_at THEN
    RAISE EXCEPTION 'cutover_not_due';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.organization_subscriptions AS subscription
    WHERE subscription.id = request_record.organization_subscription_id
      AND subscription.provider = 'stripe'
      AND subscription.external_subscription_id IS NOT NULL
      AND (
        subscription.status IN ('active', 'courtesy')
        OR (
          subscription.status = 'past_due'
          AND subscription.grace_ends_at > now()
        )
      )
  ) THEN
    RAISE EXCEPTION 'organization_subscription_not_ready';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.billing_subscriptions AS subscription
    JOIN public.billing_accounts AS account
      ON account.id = subscription.billing_account_id
    WHERE account.establishment_id = ANY(request_record.establishment_ids)
      AND subscription.status IN ('checkout_pending', 'active', 'past_due')
      AND (
        subscription.current_period_ends_at IS NULL
        OR subscription.current_period_ends_at > now()
      )
  ) THEN
    UPDATE public.billing_cutover_requests
    SET status = 'reconciling', updated_at = now()
    WHERE id = request_record.id;
    RAISE EXCEPTION 'individual_subscription_still_live';
  END IF;

  UPDATE public.billing_coverage_assignments
  SET effective_until = request_record.cutover_at,
      status = 'ended',
      updated_at = now()
  WHERE establishment_id = ANY(request_record.establishment_ids)
    AND status = 'active';

  UPDATE public.billing_coverage_assignments
  SET status = 'active',
      updated_at = now()
  WHERE establishment_id = ANY(request_record.establishment_ids)
    AND organization_subscription_id = request_record.organization_subscription_id
    AND status = 'scheduled';

  UPDATE public.billing_cutover_requests
  SET status = 'applied',
      applied_by = actor_id,
      applied_at = now(),
      updated_at = now()
  WHERE id = request_record.id;

  INSERT INTO public.organization_billing_events(
    billing_account_id,
    subscription_id,
    actor_id,
    event_type,
    metadata
  )
  SELECT
    subscription.billing_account_id,
    subscription.id,
    actor_id,
    'billing.cutover_applied',
    jsonb_build_object(
      'cutover_request_id', request_record.id,
      'cutover_at', request_record.cutover_at,
      'unit_count', cardinality(request_record.establishment_ids)
    )
  FROM public.organization_subscriptions AS subscription
  WHERE subscription.id = request_record.organization_subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_billing_context(
  target_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_organization_role(
    target_organization_id,
    ARRAY['owner', 'finance']
  ) AND NOT public.is_governance_user()
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT jsonb_build_object(
    'organization_id', account.organization_id,
    'billing_account_id', account.id,
    'billing_owner_profile_id', account.billing_owner_profile_id,
    'viewer_role', (
      SELECT member.role
      FROM public.organization_members AS member
      WHERE member.organization_id = account.organization_id
        AND member.profile_id = actor_id
        AND member.status = 'active'
        AND member.revoked_at IS NULL
      LIMIT 1
    ),
    'subscription', CASE WHEN subscription.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', subscription.id,
      'status', subscription.status,
      'enforcement_enabled', subscription.enforcement_enabled,
      'current_period_start', subscription.current_period_start,
      'current_period_end', subscription.current_period_end,
      'grace_ends_at', subscription.grace_ends_at,
      'cancel_at_period_end', subscription.cancel_at_period_end,
      'provider', subscription.provider,
      'has_external_customer', subscription.external_customer_id IS NOT NULL,
      'plan_code', plan.code,
      'plan_name', plan.name
    ) END,
    'tiers', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'unit_from', tier.unit_from,
        'unit_to', tier.unit_to,
        'unit_price_cents', tier.unit_price_cents
      ) ORDER BY tier.unit_from)
      FROM public.plan_unit_tiers AS tier
      WHERE tier.plan_id = subscription.plan_id
    ), '[]'::jsonb),
    'establishments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'establishment_id', link.establishment_id,
        'name', establishment.name,
        'coverage_scope', coverage.source_scope,
        'coverage_status', coverage.status,
        'effective_from', coverage.effective_from,
        'effective_until', coverage.effective_until
      ) ORDER BY establishment.name)
      FROM public.organization_establishments AS link
      JOIN public.establishments AS establishment
        ON establishment.id = link.establishment_id
      LEFT JOIN LATERAL (
        SELECT candidate.*
        FROM public.billing_coverage_assignments AS candidate
        WHERE candidate.establishment_id = link.establishment_id
          AND candidate.status IN ('active', 'scheduled')
        ORDER BY
          CASE candidate.status WHEN 'active' THEN 0 ELSE 1 END,
          candidate.effective_from DESC
        LIMIT 1
      ) AS coverage ON true
      WHERE link.organization_id = account.organization_id
        AND link.status = 'active'
        AND link.effective_until IS NULL
    ), '[]'::jsonb),
    'cutover', (
      SELECT jsonb_build_object(
        'id', request.id,
        'status', request.status,
        'cutover_at', request.cutover_at,
        'establishment_ids', request.establishment_ids
      )
      FROM public.billing_cutover_requests AS request
      WHERE request.organization_subscription_id = subscription.id
        AND request.status IN ('scheduled', 'reconciling')
      ORDER BY request.created_at DESC
      LIMIT 1
    )
  )
  INTO result
  FROM public.organization_billing_accounts AS account
  LEFT JOIN public.organization_subscriptions AS subscription
    ON subscription.billing_account_id = account.id
  LEFT JOIN public.organization_billing_plans AS plan
    ON plan.id = subscription.plan_id
  WHERE account.organization_id = target_organization_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_control_billing_cutovers()
RETURNS TABLE(
  cutover_request_id uuid,
  organization_id uuid,
  organization_name text,
  organization_subscription_id uuid,
  status text,
  cutover_at timestamptz,
  unit_count integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT
    request.id,
    account.organization_id,
    organization.name,
    request.organization_subscription_id,
    request.status,
    request.cutover_at,
    cardinality(request.establishment_ids)
  FROM public.billing_cutover_requests AS request
  JOIN public.organization_subscriptions AS subscription
    ON subscription.id = request.organization_subscription_id
  JOIN public.organization_billing_accounts AS account
    ON account.id = subscription.billing_account_id
  JOIN public.organizations AS organization
    ON organization.id = account.organization_id
  WHERE request.status IN ('scheduled', 'reconciling')
  ORDER BY request.cutover_at, organization.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_business_billing_context(
  target_establishment_id uuid
)
RETURNS TABLE(
  billing_scope text,
  billing_account_id uuid,
  subscription_id uuid,
  organization_id uuid,
  billing_owner_profile_id uuid,
  billing_status text,
  access_mode text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean,
  entitlements jsonb,
  covered_establishment_ids uuid[],
  enforcement_enabled boolean,
  pending_change_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  establishment_status text;
  coverage_record public.billing_coverage_assignments%ROWTYPE;
BEGIN
  SELECT establishment.account_status
  INTO establishment_status
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF establishment_status IS NULL THEN
    RETURN;
  END IF;

  SELECT coverage.*
  INTO coverage_record
  FROM public.billing_coverage_assignments AS coverage
  WHERE coverage.establishment_id = target_establishment_id
    AND coverage.status = 'active'
    AND coverage.effective_from <= now()
    AND (
      coverage.effective_until IS NULL
      OR coverage.effective_until > now()
    )
  ORDER BY coverage.effective_from DESC
  LIMIT 1;

  IF coverage_record.source_scope = 'organization' THEN
    RETURN QUERY
    SELECT
      'organization'::text,
      account.id,
      subscription.id,
      account.organization_id,
      account.billing_owner_profile_id,
      subscription.status,
      CASE
        WHEN establishment_status NOT IN ('active', 'pending_verification') THEN 'blocked'
        WHEN establishment_status = 'pending_verification' THEN 'full'
        WHEN NOT subscription.enforcement_enabled THEN 'full'
        WHEN subscription.status IN ('trialing', 'active') THEN 'full'
        WHEN subscription.status = 'past_due'
          AND subscription.grace_ends_at > now() THEN 'full'
        WHEN subscription.status = 'canceled'
          AND subscription.current_period_end >= CURRENT_DATE THEN 'full'
        ELSE 'read_only'
      END,
      NULL::timestamptz,
      subscription.grace_ends_at,
      (subscription.current_period_end + 1)::timestamptz,
      subscription.cancel_at_period_end,
      CASE
        WHEN establishment_status NOT IN ('active', 'pending_verification')
          THEN '[]'::jsonb
        WHEN NOT subscription.enforcement_enabled
          OR subscription.status IN ('trialing', 'active')
          OR (
            subscription.status = 'past_due'
            AND subscription.grace_ends_at > now()
          )
          OR (
            subscription.status = 'canceled'
            AND subscription.current_period_end >= CURRENT_DATE
          )
          THEN plan.entitlements
        ELSE '[]'::jsonb
      END,
      ARRAY(
        SELECT sibling.establishment_id
        FROM public.billing_coverage_assignments AS sibling
        WHERE sibling.organization_subscription_id = subscription.id
          AND sibling.status = 'active'
          AND sibling.effective_from <= now()
          AND (sibling.effective_until IS NULL OR sibling.effective_until > now())
        ORDER BY sibling.establishment_id
      ),
      subscription.enforcement_enabled,
      (
        SELECT min(pending.effective_from)
        FROM public.billing_coverage_assignments AS pending
        WHERE pending.establishment_id = target_establishment_id
          AND pending.status = 'scheduled'
      )
    FROM public.organization_subscriptions AS subscription
    JOIN public.organization_billing_accounts AS account
      ON account.id = subscription.billing_account_id
    JOIN public.organization_billing_plans AS plan
      ON plan.id = subscription.plan_id
    WHERE subscription.id = coverage_record.organization_subscription_id;
    RETURN;
  END IF;

  RETURN QUERY
  SELECT
    'establishment'::text,
    account.id,
    subscription.id,
    NULL::uuid,
    account.billing_owner_profile_id,
    COALESCE(
      subscription.status,
      CASE WHEN account.trial_ends_at > now() THEN 'trialing' ELSE 'none' END
    ),
    CASE
      WHEN establishment_status NOT IN ('active', 'pending_verification') THEN 'blocked'
      WHEN establishment_status = 'pending_verification' THEN 'full'
      WHEN account.transition_ends_at > now()
        OR account.trial_ends_at > now()
        OR account.courtesy_ends_at > now()
        OR subscription.status = 'courtesy'
        OR (
          subscription.status IN ('active', 'cancelled')
          AND subscription.current_period_ends_at > now()
        )
        OR (
          subscription.status = 'past_due'
          AND subscription.grace_ends_at > now()
        )
        THEN 'full'
      ELSE 'read_only'
    END,
    account.trial_ends_at,
    subscription.grace_ends_at,
    subscription.current_period_ends_at,
    COALESCE(subscription.cancel_at_period_end, false),
    CASE
      WHEN establishment_status IN ('active', 'pending_verification')
        AND (
          establishment_status = 'pending_verification'
          OR account.transition_ends_at > now()
          OR account.trial_ends_at > now()
          OR account.courtesy_ends_at > now()
          OR subscription.status = 'courtesy'
          OR (
            subscription.status IN ('active', 'cancelled')
            AND subscription.current_period_ends_at > now()
          )
          OR (
            subscription.status = 'past_due'
            AND subscription.grace_ends_at > now()
          )
        )
        THEN plan.entitlements
      ELSE '[]'::jsonb
    END,
    ARRAY[target_establishment_id],
    true,
    (
      SELECT min(pending.effective_from)
      FROM public.billing_coverage_assignments AS pending
      WHERE pending.establishment_id = target_establishment_id
        AND pending.status = 'scheduled'
    )
  FROM public.billing_accounts AS account
  JOIN public.billing_plans AS plan ON plan.id = account.plan_id
  LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM public.billing_subscriptions AS candidate
    WHERE candidate.billing_account_id = account.id
    ORDER BY
      candidate.provider_event_created_at DESC NULLS LAST,
      candidate.updated_at DESC
    LIMIT 1
  ) AS subscription ON true
  WHERE account.id = COALESCE(
    coverage_record.billing_account_id,
    (
      SELECT fallback.id
      FROM public.billing_accounts AS fallback
      WHERE fallback.establishment_id = target_establishment_id
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.billing_access_mode(
  target_establishment_id uuid
)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT context.access_mode
  FROM public.resolve_business_billing_context(target_establishment_id) AS context
  LIMIT 1;
$$;

DROP FUNCTION IF EXISTS public.get_my_business_access_context(uuid);
CREATE FUNCTION public.get_my_business_access_context(
  target_establishment_id uuid
)
RETURNS TABLE (
  establishment_id uuid,
  membership_role text,
  billing_owner boolean,
  account_status text,
  billing_status text,
  access_mode text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean,
  entitlements jsonb,
  billing_scope text,
  billing_account_id uuid,
  subscription_id uuid,
  organization_id uuid,
  covered_establishment_ids uuid[],
  payer_role text,
  pending_change_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(
      target_establishment_id,
      ARRAY['admin', 'professional']
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    membership.role,
    context.billing_owner_profile_id = actor_id,
    establishment.account_status,
    context.billing_status,
    context.access_mode,
    context.trial_ends_at,
    context.grace_ends_at,
    context.current_period_ends_at,
    context.cancel_at_period_end,
    CASE WHEN context.access_mode = 'full'
      THEN context.entitlements ELSE '[]'::jsonb END,
    context.billing_scope,
    context.billing_account_id,
    context.subscription_id,
    context.organization_id,
    context.covered_establishment_ids,
    CASE
      WHEN context.billing_scope = 'organization' THEN (
        SELECT member.role
        FROM public.organization_members AS member
        WHERE member.organization_id = context.organization_id
          AND member.profile_id = actor_id
          AND member.status = 'active'
          AND member.revoked_at IS NULL
        LIMIT 1
      )
      WHEN context.billing_owner_profile_id = actor_id THEN 'billing_owner'
      ELSE NULL
    END,
    context.pending_change_at
  FROM public.establishments AS establishment
  LEFT JOIN public.memberships AS membership
    ON membership.establishment_id = establishment.id
   AND membership.profile_id = actor_id
   AND membership.status = 'active'
  CROSS JOIN LATERAL public.resolve_business_billing_context(
    establishment.id
  ) AS context
  WHERE establishment.id = target_establishment_id;
END;
$$;

DROP FUNCTION IF EXISTS public.get_my_billing_overview(uuid);
CREATE FUNCTION public.get_my_billing_overview(
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
  context_record record;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT *
  INTO context_record
  FROM public.resolve_business_billing_context(target_establishment_id)
  LIMIT 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'billing_context_not_found'; END IF;

  IF context_record.billing_scope = 'organization' THEN
    IF context_record.billing_owner_profile_id IS DISTINCT FROM actor_id
       AND NOT public.has_organization_role(
         context_record.organization_id,
         ARRAY['owner', 'finance']
       )
       AND NOT public.is_superadmin()
    THEN
      RAISE EXCEPTION 'billing_owner_required';
    END IF;

    SELECT jsonb_build_object(
      'billing_scope', 'organization',
      'plan', jsonb_build_object(
        'name', plan.name,
        'price_cents', COALESCE(pricing.total_cents, 0),
        'base_price_cents', plan.base_price_cents,
        'currency', plan.currency,
        'interval_unit', 'month',
        'unit_count', cardinality(context_record.covered_establishment_ids),
        'unit_prices', COALESCE(pricing.unit_prices, '[]'::jsonb)
      ),
      'account', jsonb_build_object(
        'billing_email', account.billing_email,
        'organization_id', account.organization_id,
        'covered_establishment_ids', context_record.covered_establishment_ids,
        'pending_change_at', context_record.pending_change_at
      ),
      'subscription', to_jsonb(subscription)
        - 'external_customer_id'
        - 'external_subscription_id',
      'invoices', COALESCE((
        SELECT jsonb_agg(jsonb_build_object(
          'id', invoice.id,
          'number', NULL,
          'status', invoice.status,
          'total_cents', invoice.total_cents,
          'currency', invoice.currency,
          'paid_at', invoice.paid_at,
          'hosted_invoice_url', invoice.hosted_invoice_url,
          'invoice_pdf_url', invoice.invoice_pdf_url,
          'fiscal_status', fiscal.status,
          'fiscal_number', fiscal.number
        ) ORDER BY invoice.created_at DESC)
        FROM public.organization_billing_invoices AS invoice
        LEFT JOIN public.fiscal_documents AS fiscal
          ON fiscal.organization_billing_invoice_id = invoice.id
        WHERE invoice.subscription_id = subscription.id
      ), '[]'::jsonb)
    )
    INTO result
    FROM public.organization_subscriptions AS subscription
    JOIN public.organization_billing_accounts AS account
      ON account.id = subscription.billing_account_id
    JOIN public.organization_billing_plans AS plan
      ON plan.id = subscription.plan_id
    LEFT JOIN LATERAL (
      SELECT
        sum(priced.unit_price_cents)::integer AS total_cents,
        jsonb_agg(jsonb_build_object(
          'position', priced.position,
          'unit_price_cents', priced.unit_price_cents
        ) ORDER BY priced.position) AS unit_prices
      FROM (
        SELECT
          position,
          COALESCE((
            SELECT tier.unit_price_cents
            FROM public.plan_unit_tiers AS tier
            WHERE tier.plan_id = plan.id
              AND position >= tier.unit_from
              AND (tier.unit_to IS NULL OR position <= tier.unit_to)
            ORDER BY tier.unit_from DESC
            LIMIT 1
          ), plan.base_price_cents, 0) AS unit_price_cents
        FROM generate_series(
          1,
          cardinality(context_record.covered_establishment_ids)
        ) AS position
      ) AS priced
    ) AS pricing ON true
    WHERE subscription.id = context_record.subscription_id;
    RETURN result;
  END IF;

  IF context_record.billing_owner_profile_id IS DISTINCT FROM actor_id
     AND NOT public.is_superadmin()
  THEN
    RAISE EXCEPTION 'billing_owner_required';
  END IF;

  SELECT jsonb_build_object(
    'billing_scope', 'establishment',
    'plan', jsonb_build_object(
      'name', plan.name,
      'price_cents', plan.price_cents,
      'base_price_cents', plan.price_cents,
      'currency', plan.currency,
      'interval_unit', plan.interval_unit,
      'unit_count', 1,
      'unit_prices', jsonb_build_array(jsonb_build_object(
        'position', 1,
        'unit_price_cents', plan.price_cents
      ))
    ),
    'account', jsonb_build_object(
      'billing_email', account.billing_email,
      'trial_ends_at', account.trial_ends_at,
      'transition_ends_at', account.transition_ends_at,
      'covered_establishment_ids', ARRAY[target_establishment_id],
      'pending_change_at', context_record.pending_change_at
    ),
    'subscription', COALESCE((
      SELECT to_jsonb(subscription)
        - 'external_customer_id'
        - 'external_subscription_id'
      FROM public.billing_subscriptions AS subscription
      WHERE subscription.billing_account_id = account.id
      ORDER BY
        subscription.provider_event_created_at DESC NULLS LAST,
        subscription.updated_at DESC
      LIMIT 1
    ), '{}'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', invoice.id,
        'number', invoice.number,
        'status', invoice.status,
        'total_cents', invoice.total_cents,
        'currency', invoice.currency,
        'paid_at', invoice.paid_at,
        'hosted_invoice_url', invoice.hosted_invoice_url,
        'invoice_pdf_url', invoice.invoice_pdf_url,
        'fiscal_status', fiscal.status,
        'fiscal_number', fiscal.number
      ) ORDER BY invoice.created_at DESC)
      FROM public.billing_invoices AS invoice
      LEFT JOIN public.fiscal_documents AS fiscal
        ON fiscal.billing_invoice_id = invoice.id
      WHERE invoice.billing_account_id = account.id
    ), '[]'::jsonb)
  )
  INTO result
  FROM public.billing_accounts AS account
  JOIN public.billing_plans AS plan ON plan.id = account.plan_id
  WHERE account.id = context_record.billing_account_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_entitlement_for_establishment(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  context_record record;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_establishments AS link
       WHERE link.establishment_id = target_establishment_id
         AND link.status = 'active'
         AND link.effective_until IS NULL
         AND public.has_organization_role(
           link.organization_id,
           ARRAY['owner', 'finance']
         )
     )
     AND NOT public.is_governance_user()
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT *
  INTO context_record
  FROM public.resolve_business_billing_context(target_establishment_id)
  LIMIT 1;

  RETURN jsonb_build_object(
    'scope', context_record.billing_scope,
    'status', context_record.billing_status,
    'grace_ends_at', context_record.grace_ends_at,
    'enforcement_enabled', context_record.enforcement_enabled,
    'can_create_bookings', context_record.access_mode = 'full',
    'can_mutate_administration', context_record.access_mode = 'full',
    'can_read_and_export', context_record.access_mode <> 'blocked',
    'can_manage_existing_appointments', true
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_control_subscription_status(
  target_subscription_id uuid,
  target_status text,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  account_id uuid;
BEGIN
  IF NOT public.is_governance_user(
    ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_status NOT IN ('trialing', 'active', 'past_due', 'suspended', 'canceled') THEN
    RAISE EXCEPTION 'invalid_subscription_status';
  END IF;
  IF char_length(btrim(reason)) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'invalid_reason';
  END IF;

  UPDATE public.organization_subscriptions
  SET status = target_status,
      grace_ends_at = CASE
        WHEN target_status = 'past_due'
          THEN COALESCE(grace_ends_at, now() + interval '7 days')
        ELSE NULL
      END,
      canceled_at = CASE
        WHEN target_status = 'canceled' THEN now()
        ELSE canceled_at
      END,
      updated_at = now()
  WHERE id = target_subscription_id
  RETURNING billing_account_id INTO account_id;
  IF account_id IS NULL THEN RAISE EXCEPTION 'subscription_not_found'; END IF;

  INSERT INTO public.organization_billing_events(
    billing_account_id,
    subscription_id,
    actor_id,
    event_type,
    metadata
  ) VALUES (
    account_id,
    target_subscription_id,
    actor_id,
    'subscription.status_changed',
    jsonb_build_object('status', target_status, 'reason', btrim(reason))
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_control_plan(
  target_plan_code text,
  target_base_price_cents integer,
  target_currency text DEFAULT 'BRL'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  plan_id uuid;
BEGIN
  IF NOT public.is_governance_user(
    ARRAY['SaaS_Owner']::public.governance_role_enum[]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_base_price_cents < 0 OR target_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_plan_price';
  END IF;
  IF target_plan_code = 'multi_unit_standard'
     AND (
       target_base_price_cents <> 4990
       OR target_currency <> 'BRL'
     )
  THEN
    RAISE EXCEPTION 'standard_plan_price_fixed';
  END IF;

  UPDATE public.organization_billing_plans
  SET base_price_cents = target_base_price_cents,
      currency = target_currency,
      updated_at = now()
  WHERE code = target_plan_code
    AND active
  RETURNING id INTO plan_id;
  IF plan_id IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  RETURN plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_manual_billing_invoice(
  target_subscription_id uuid,
  target_due_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  subscription_record record;
  unit_count integer;
  subtotal integer := 0;
  total integer := 0;
  unit_snapshot jsonb := '[]'::jsonb;
  invoice_id uuid;
BEGIN
  IF NOT public.is_governance_user(
    ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT subscription.*, plan.code, plan.name, plan.base_price_cents,
    plan.currency, plan.is_network
  INTO subscription_record
  FROM public.organization_subscriptions AS subscription
  JOIN public.organization_billing_plans AS plan ON plan.id = subscription.plan_id
  WHERE subscription.id = target_subscription_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  IF subscription_record.base_price_cents IS NULL THEN
    RAISE EXCEPTION 'plan_price_required';
  END IF;

  SELECT count(*)
  INTO unit_count
  FROM public.billing_coverage_assignments AS coverage
  WHERE coverage.organization_subscription_id = target_subscription_id
    AND coverage.source_scope = 'organization'
    AND coverage.status = 'active'
    AND coverage.effective_from < (
      subscription_record.current_period_end + 1
    )::timestamptz
    AND (
      coverage.effective_until IS NULL
      OR coverage.effective_until > subscription_record.current_period_start::timestamptz
    );
  IF unit_count >= 5 AND NOT subscription_record.is_network THEN
    RAISE EXCEPTION 'network_plan_required';
  END IF;

  WITH ranked_units AS (
    SELECT
      coverage.establishment_id,
      establishment.name,
      row_number() OVER (
        ORDER BY coverage.effective_from, establishment.name, coverage.establishment_id
      ) AS position
    FROM public.billing_coverage_assignments AS coverage
    JOIN public.establishments AS establishment
      ON establishment.id = coverage.establishment_id
    WHERE coverage.organization_subscription_id = target_subscription_id
      AND coverage.source_scope = 'organization'
      AND coverage.status = 'active'
      AND coverage.effective_from < (
        subscription_record.current_period_end + 1
      )::timestamptz
      AND (
        coverage.effective_until IS NULL
        OR coverage.effective_until > subscription_record.current_period_start::timestamptz
      )
  ),
  priced AS (
    SELECT
      ranked_units.*,
      COALESCE((
        SELECT tier.unit_price_cents
        FROM public.plan_unit_tiers AS tier
        WHERE tier.plan_id = subscription_record.plan_id
          AND ranked_units.position >= tier.unit_from
          AND (tier.unit_to IS NULL OR ranked_units.position <= tier.unit_to)
        ORDER BY tier.unit_from DESC
        LIMIT 1
      ), subscription_record.base_price_cents) AS charged_cents
    FROM ranked_units
  )
  SELECT
    COALESCE(sum(subscription_record.base_price_cents), 0),
    COALESCE(sum(charged_cents), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'establishment_id', establishment_id,
      'establishment_name', name,
      'position', position,
      'base_price_cents', subscription_record.base_price_cents,
      'charged_cents', charged_cents
    ) ORDER BY position), '[]'::jsonb)
  INTO subtotal, total, unit_snapshot
  FROM priced;

  INSERT INTO public.organization_billing_invoices(
    subscription_id,
    period_start,
    period_end,
    due_date,
    status,
    currency,
    subtotal_cents,
    discount_cents,
    total_cents,
    unit_snapshot,
    plan_snapshot,
    issued_by
  ) VALUES (
    target_subscription_id,
    subscription_record.current_period_start,
    subscription_record.current_period_end,
    target_due_date,
    'open',
    subscription_record.currency,
    subtotal,
    subtotal - total,
    total,
    unit_snapshot,
    jsonb_build_object(
      'plan_id', subscription_record.plan_id,
      'code', subscription_record.code,
      'name', subscription_record.name,
      'base_price_cents', subscription_record.base_price_cents,
      'pricing_model', 'fixed_progressive_units'
    ),
    actor_id
  )
  RETURNING id INTO invoice_id;

  INSERT INTO public.organization_billing_events(
    billing_account_id,
    subscription_id,
    invoice_id,
    actor_id,
    event_type,
    metadata
  ) VALUES (
    subscription_record.billing_account_id,
    target_subscription_id,
    invoice_id,
    actor_id,
    'invoice.issued',
    jsonb_build_object('total_cents', total, 'unit_count', unit_count)
  );

  RETURN invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_business_billing_context(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.schedule_organization_billing_cutover(uuid, uuid[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_organization_billing_cutover(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_organization_billing_context(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_billing_cutovers()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_business_access_context(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_billing_overview(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_subscription_entitlement_for_establishment(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_subscription_status(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_manual_billing_invoice(uuid, date)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.resolve_business_billing_context(uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.schedule_organization_billing_cutover(uuid, uuid[])
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_organization_billing_cutover(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_organization_billing_context(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_control_billing_cutovers()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_business_access_context(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_billing_overview(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_entitlement_for_establishment(uuid)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_control_subscription_status(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_manual_billing_invoice(uuid, date)
  TO authenticated;

COMMIT;
