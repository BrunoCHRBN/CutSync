BEGIN;

DO $test$
<<consolidated_billing_coverage>>
DECLARE
  owner_id uuid := gen_random_uuid();
  establishment_one uuid := gen_random_uuid();
  establishment_two uuid := gen_random_uuid();
  organization_id uuid;
  organization_account_id uuid;
  organization_plan_id uuid;
  organization_subscription_id uuid;
  cutover_time timestamptz := transaction_timestamp();
  resolved_scope text;
  resolved_access text;
  covered_ids uuid[];
  tier_total integer;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (owner_id, 'coverage-owner@example.test', now());
  INSERT INTO public.profiles(id, name, email, role)
  VALUES (owner_id, 'Coverage Owner', 'coverage-owner@example.test', 'admin')
  ON CONFLICT (id) DO UPDATE
  SET name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role;
  INSERT INTO public.establishments(id, name, slug, account_status)
  VALUES
    (establishment_one, 'Coverage One', 'coverage-one', 'active'),
    (establishment_two, 'Coverage Two', 'coverage-two', 'active');
  INSERT INTO public.memberships(profile_id, establishment_id, role, created_by)
  VALUES
    (owner_id, establishment_one, 'admin', owner_id),
    (owner_id, establishment_two, 'admin', owner_id);
  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id,
      owner_resolution_status = 'confirmed',
      trial_started_at = now() - interval '15 days',
      trial_ends_at = now() - interval '1 day',
      transition_ends_at = NULL
  WHERE establishment_id IN (establishment_one, establishment_two);

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object(
      'sub', owner_id,
      'role', 'authenticated',
      'aal', 'aal2'
    )::text,
    true
  );

  organization_id := public.create_organization(establishment_one, 'Coverage Group');
  PERFORM public.add_organization_establishment(organization_id, establishment_two);

  SELECT account.id
  INTO organization_account_id
  FROM public.organization_billing_accounts AS account
  WHERE account.organization_id = consolidated_billing_coverage.organization_id;
  IF (
    SELECT account.billing_owner_profile_id
    FROM public.organization_billing_accounts AS account
    WHERE account.id = organization_account_id
  ) IS DISTINCT FROM owner_id THEN
    RAISE EXCEPTION 'organization billing owner was not resolved';
  END IF;

  SELECT plan.id
  INTO organization_plan_id
  FROM public.organization_billing_plans AS plan
  WHERE plan.code = 'multi_unit_standard';

  INSERT INTO public.organization_subscriptions(
    billing_account_id,
    plan_id,
    status,
    enforcement_enabled,
    current_period_start,
    current_period_end
  ) VALUES (
    organization_account_id,
    organization_plan_id,
    'active',
    true,
    CURRENT_DATE,
    CURRENT_DATE + 29
  )
  RETURNING id INTO organization_subscription_id;

  UPDATE public.billing_coverage_assignments
  SET effective_from = LEAST(effective_from, cutover_time - interval '1 second'),
      status = 'ended',
      effective_until = cutover_time,
      reason = 'coverage_test_cutover'
  WHERE establishment_id IN (establishment_one, establishment_two)
    AND status = 'active';

  INSERT INTO public.billing_coverage_assignments(
    establishment_id,
    source_scope,
    organization_subscription_id,
    status,
    effective_from,
    created_by,
    reason
  ) VALUES
    (
      establishment_one, 'organization', organization_subscription_id,
      'active', cutover_time, owner_id, 'coverage_test'
    ),
    (
      establishment_two, 'organization', organization_subscription_id,
      'active', cutover_time, owner_id, 'coverage_test'
    );

  SELECT context.billing_scope, context.access_mode, context.covered_establishment_ids
  INTO resolved_scope, resolved_access, covered_ids
  FROM public.resolve_business_billing_context(establishment_one) AS context;
  IF resolved_scope <> 'organization' OR resolved_access <> 'full' THEN
    RAISE EXCEPTION
      'organization coverage did not grant full access: scope=%, access=%',
      resolved_scope,
      resolved_access;
  END IF;
  IF cardinality(covered_ids) <> 2 THEN
    RAISE EXCEPTION 'organization coverage did not expose both units';
  END IF;

  UPDATE public.organization_subscriptions
  SET status = 'past_due',
      grace_ends_at = now() + interval '7 days'
  WHERE id = organization_subscription_id;
  IF public.billing_access_mode(establishment_one) <> 'full'
     OR public.billing_access_mode(establishment_two) <> 'full'
  THEN
    RAISE EXCEPTION 'organization grace must preserve every covered unit';
  END IF;

  UPDATE public.organization_subscriptions
  SET grace_ends_at = now() - interval '1 second'
  WHERE id = organization_subscription_id;
  IF public.billing_access_mode(establishment_one) <> 'read_only'
     OR public.billing_access_mode(establishment_two) <> 'read_only'
  THEN
    RAISE EXCEPTION 'expired organization grace must restrict every covered unit';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.establishments
    WHERE id IN (establishment_one, establishment_two)
      AND account_status <> 'active'
  ) THEN
    RAISE EXCEPTION 'billing changed governance account_status';
  END IF;

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
      establishment_one,
      'establishment',
      account.id,
      'active',
      now(),
      'overlap_test'
    FROM public.billing_accounts AS account
    WHERE account.establishment_id = establishment_one;
    RAISE EXCEPTION 'overlapping coverage was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'overlapping_billing_coverage' THEN RAISE; END IF;
  END;

  SELECT sum(tier.unit_price_cents)
  INTO tier_total
  FROM public.plan_unit_tiers AS tier
  WHERE tier.plan_id = organization_plan_id
    AND tier.unit_from IN (1, 2, 3);
  -- Position 3 applies to both the third and fourth unit.
  tier_total := tier_total + (
    SELECT tier.unit_price_cents
    FROM public.plan_unit_tiers AS tier
    WHERE tier.plan_id = organization_plan_id
      AND tier.unit_from = 3
  );
  IF tier_total <> 17460 THEN
    RAISE EXCEPTION 'unexpected four-unit total: %', tier_total;
  END IF;
END;
$test$;

ROLLBACK;
