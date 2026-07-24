BEGIN;

DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  establishment_one uuid := gen_random_uuid();
  establishment_two uuid := gen_random_uuid();
  organization_id uuid;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'multi-owner@example.test', now()),
    (outsider_id, 'multi-outsider@example.test', now());
  INSERT INTO public.profiles(id, name, email, role)
  VALUES
    (owner_id, 'Owner Fixture', 'multi-owner@example.test', 'admin'),
    (outsider_id, 'Outsider Fixture', 'multi-outsider@example.test', 'admin');
  INSERT INTO public.establishments(id, name, slug, account_status)
  VALUES
    (establishment_one, 'Fixture One', 'fixture-multi-one', 'active'),
    (establishment_two, 'Fixture Two', 'fixture-multi-two', 'active');
  INSERT INTO public.memberships(profile_id, establishment_id, role, created_by)
  VALUES
    (owner_id, establishment_one, 'admin', owner_id),
    (owner_id, establishment_two, 'admin', owner_id),
    (outsider_id, establishment_two, 'admin', outsider_id);

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);

  organization_id := public.create_organization(establishment_one, 'Fixture Group');
  PERFORM public.add_organization_establishment(organization_id, establishment_two);

  IF (SELECT count(*) FROM public.organization_establishments
      WHERE organization_id = multi_unit_organizations_and_billing.organization_id
        AND status = 'active') <> 2 THEN
    RAISE EXCEPTION 'expected two active organization establishments';
  END IF;

  PERFORM set_config('request.jwt.claim.sub', outsider_id::text, true);
  BEGIN
    PERFORM public.get_organization_context(organization_id);
    RAISE EXCEPTION 'outsider unexpectedly read organization context';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;

  BEGIN
    PERFORM public.add_organization_establishment(organization_id, establishment_two);
    RAISE EXCEPTION 'outsider unexpectedly changed organization';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'organization_owner_required' THEN RAISE; END IF;
  END;

  PERFORM set_config('request.jwt.claim.sub', owner_id::text, true);
  PERFORM public.remove_organization_establishment(organization_id, establishment_two);

  IF EXISTS (
    SELECT 1 FROM public.organization_establishments
    WHERE organization_id = multi_unit_organizations_and_billing.organization_id
      AND establishment_id = establishment_two
      AND status = 'active'
  ) THEN RAISE EXCEPTION 'removed establishment remained active'; END IF;
END;
$test$;

ROLLBACK;
