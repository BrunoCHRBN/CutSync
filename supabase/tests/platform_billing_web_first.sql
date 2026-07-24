BEGIN;

DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  professional_id uuid := gen_random_uuid();
  fixture_establishment_id uuid := gen_random_uuid();
  account_id uuid;
  plan_id uuid;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'billing-owner@example.test', now()),
    (professional_id, 'billing-professional@example.test', now());
  INSERT INTO public.profiles(id, name, email, role)
  VALUES
    (owner_id, 'Billing Owner', 'billing-owner@example.test', 'admin'),
    (professional_id, 'Billing Professional', 'billing-professional@example.test', 'professional');
  INSERT INTO public.establishments(id, name, slug, account_status)
  VALUES (fixture_establishment_id, 'Billing Fixture', 'billing-fixture', 'active');
  INSERT INTO public.memberships(profile_id, establishment_id, role, created_by)
  VALUES
    (owner_id, fixture_establishment_id, 'admin', owner_id),
    (professional_id, fixture_establishment_id, 'professional', owner_id);

  SELECT id INTO account_id FROM public.billing_accounts
  WHERE billing_accounts.establishment_id = fixture_establishment_id;
  SELECT id INTO plan_id FROM public.billing_plans WHERE code = 'owner_monthly_brl';
  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id, owner_resolution_status = 'confirmed'
  WHERE id = account_id;

  IF public.billing_access_mode(fixture_establishment_id) <> 'full' THEN
    RAISE EXCEPTION 'newly activated establishment must be in trial';
  END IF;

  UPDATE public.billing_accounts
  SET trial_ends_at = now() - interval '1 second', transition_ends_at = NULL
  WHERE id = account_id;
  IF public.billing_access_mode(fixture_establishment_id) <> 'read_only' THEN
    RAISE EXCEPTION 'expired trial must be read only';
  END IF;

  INSERT INTO public.billing_subscriptions(
    billing_account_id, provider, external_subscription_id, status,
    current_period_ends_at, provider_event_created_at
  ) VALUES (
    account_id, 'stripe', 'sub_billing_fixture', 'active',
    now() + interval '1 month', now()
  );
  IF public.billing_access_mode(fixture_establishment_id) <> 'full' THEN
    RAISE EXCEPTION 'paid active period must grant full access';
  END IF;

  UPDATE public.billing_subscriptions
  SET status = 'past_due', grace_started_at = now(),
      grace_ends_at = now() + interval '7 days'
  WHERE external_subscription_id = 'sub_billing_fixture';
  IF public.billing_access_mode(fixture_establishment_id) <> 'full' THEN
    RAISE EXCEPTION 'past due inside grace must remain full';
  END IF;

  UPDATE public.billing_subscriptions
  SET grace_ends_at = now() - interval '1 second'
  WHERE external_subscription_id = 'sub_billing_fixture';
  IF public.billing_access_mode(fixture_establishment_id) <> 'read_only' THEN
    RAISE EXCEPTION 'expired grace must be read only';
  END IF;

  UPDATE public.establishments SET account_status = 'blocked' WHERE id = fixture_establishment_id;
  IF public.billing_access_mode(fixture_establishment_id) <> 'blocked' THEN
    RAISE EXCEPTION 'administrative block must override payment';
  END IF;

  IF NOT public.can_use_establishment_feature(fixture_establishment_id, 'billing') THEN
    RAISE EXCEPTION 'billing recovery must remain reachable';
  END IF;
  IF public.can_use_establishment_feature(fixture_establishment_id, 'new_booking') THEN
    RAISE EXCEPTION 'new booking must not be available while blocked';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', professional_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  BEGIN
    PERFORM public.get_my_billing_overview(fixture_establishment_id);
    RAISE EXCEPTION 'professional unexpectedly accessed billing details';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'billing_owner_required' THEN RAISE; END IF;
  END;
END;
$test$;

ROLLBACK;
