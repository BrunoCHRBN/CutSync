BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_actor(actor_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', 'aal2')::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.clear_actor()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', '', true);
  PERFORM set_config('request.jwt.claims', '{}', true);
END;
$$;

DO $test$
<<financial_ops_foundation>>
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  professional_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  superadmin_id uuid := gen_random_uuid();
  unit_a_id uuid := gen_random_uuid();
  unit_b_id uuid := gen_random_uuid();
  unit_insert_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  context_record record;
  caps text[];
  flag_value boolean;
  denied boolean;
  updated_name text;
  has_insert_privilege boolean;
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'establishments'
      AND column_name = 'financial_ops_enabled'
  ) THEN
    RAISE EXCEPTION 'financial_ops_enabled column missing';
  END IF;

  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'financial-ops-owner@example.test', now()),
    (admin_id, 'financial-ops-admin@example.test', now()),
    (professional_id, 'financial-ops-pro@example.test', now()),
    (outsider_id, 'financial-ops-outsider@example.test', now()),
    (superadmin_id, 'financial-ops-superadmin@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  )
  VALUES
    (
      unit_a_id,
      'Financial Ops Unit A',
      'financial-ops-unit-a-' || substr(unit_a_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      true
    ),
    (
      unit_b_id,
      'Financial Ops Unit B',
      'financial-ops-unit-b-' || substr(unit_b_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      false
    );

  -- 1: default false for existing/new units
  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'default financial_ops_enabled must be false';
  END IF;

  -- Privileged write (no jwt subject): Control/internal path.
  PERFORM pg_temp.clear_actor();
  UPDATE public.establishments
  SET financial_ops_enabled = true
  WHERE id = unit_b_id;

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_a_id, 'Owner', 'financial-ops-owner@example.test', 'admin'),
    (admin_id, unit_a_id, 'Admin', 'financial-ops-admin@example.test', 'admin'),
    (professional_id, unit_a_id, 'Pro', 'financial-ops-pro@example.test', 'professional'),
    (outsider_id, NULL, 'Outsider', 'financial-ops-outsider@example.test', 'client'),
    (superadmin_id, NULL, 'Superadmin', 'financial-ops-superadmin@example.test', 'admin')
  ON CONFLICT (id) DO UPDATE
  SET establishment_id = EXCLUDED.establishment_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      deleted_at = NULL,
      updated_at = now();

  INSERT INTO public.superadmins(profile_id, granted_by)
  VALUES (superadmin_id, NULL);

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Financial Ops Org', 'active', owner_id);

  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  )
  VALUES (organization_id, owner_id, 'owner', 'active', owner_id);

  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  )
  VALUES
    (organization_id, unit_a_id, 'active', owner_id),
    (organization_id, unit_b_id, 'active', owner_id);

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, created_by
  )
  VALUES
    (owner_id, unit_a_id, 'admin', 'active', owner_id),
    (admin_id, unit_a_id, 'admin', 'active', owner_id),
    (professional_id, unit_a_id, 'professional', 'active', owner_id),
    (owner_id, unit_b_id, 'admin', 'active', owner_id);

  UPDATE public.billing_accounts
  SET billing_owner_profile_id = owner_id,
      owner_resolution_status = 'confirmed'
  WHERE establishment_id IN (unit_a_id, unit_b_id);

  -- 2/3/12: enabled unit returns true; isolation; boolean valid
  PERFORM pg_temp.set_actor(owner_id);
  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts()
  WHERE establishment_id = unit_a_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner missing context for unit A';
  END IF;
  IF context_record.financial_ops_enabled IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unit A flag must be false in context';
  END IF;

  SELECT * INTO context_record
  FROM public.get_my_business_operational_contexts()
  WHERE establishment_id = unit_b_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'owner missing context for unit B';
  END IF;
  IF context_record.financial_ops_enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'unit B flag must be true in context';
  END IF;

  -- 3: unit A must not report unit B configuration
  SELECT financial_ops_enabled INTO flag_value
  FROM public.get_my_business_operational_contexts()
  WHERE establishment_id = unit_a_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unit A leaked unit B financial_ops_enabled';
  END IF;

  -- 4: owner full
  caps := public.resolve_business_operational_capabilities(unit_a_id, owner_id, 'full');
  IF NOT (
    'reopen_cash' = ANY (caps)
    AND 'manage_admins' = ANY (caps)
    AND 'view_own_commission' = ANY (caps)
    AND 'view_unit_reports' = ANY (caps)
    AND 'manage_team_orders' = ANY (caps)
    AND 'take_payments' = ANY (caps)
    AND 'view_clients' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'owner full capabilities incomplete: %', caps;
  END IF;

  -- 5/10: admin full without reopen_cash
  caps := public.resolve_business_operational_capabilities(unit_a_id, admin_id, 'full');
  IF 'reopen_cash' = ANY (caps) THEN
    RAISE EXCEPTION 'admin must not receive reopen_cash by default';
  END IF;
  IF NOT (
    'manage_team_orders' = ANY (caps)
    AND 'operate_cash' = ANY (caps)
    AND 'close_cash' = ANY (caps)
    AND 'issue_refunds' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'admin full financial capabilities incomplete: %', caps;
  END IF;

  -- 6/9: professional defaults
  caps := public.resolve_business_operational_capabilities(
    unit_a_id, professional_id, 'full'
  );
  IF NOT (
    'view_orders' = ANY (caps)
    AND 'manage_own_orders' = ANY (caps)
    AND 'view_payments' = ANY (caps)
    AND 'view_own_commission' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'professional full defaults incomplete: %', caps;
  END IF;
  IF (
    'manage_team_orders' = ANY (caps)
    OR 'take_payments' = ANY (caps)
    OR 'view_cash' = ANY (caps)
    OR 'operate_cash' = ANY (caps)
    OR 'reopen_cash' = ANY (caps)
    OR 'manage_commission_policies' = ANY (caps)
    OR 'view_reconciliation' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'professional received administrative financial caps: %', caps;
  END IF;

  -- 7: read_only views only
  caps := public.resolve_business_operational_capabilities(unit_a_id, admin_id, 'read_only');
  IF (
    'manage_own_orders' = ANY (caps)
    OR 'take_payments' = ANY (caps)
    OR 'operate_cash' = ANY (caps)
    OR 'create_self_walk_in' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'read_only leaked mutations: %', caps;
  END IF;
  IF NOT (
    'view_orders' = ANY (caps)
    AND 'view_payments' = ANY (caps)
    AND 'view_cash' = ANY (caps)
    AND 'view_team_commission' = ANY (caps)
    AND 'view_reconciliation' = ANY (caps)
    AND 'view_unit_reports' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'admin read_only missing financial views: %', caps;
  END IF;

  -- 8: blocked empty
  caps := public.resolve_business_operational_capabilities(unit_a_id, owner_id, 'blocked');
  IF caps IS DISTINCT FROM ARRAY[]::text[] THEN
    RAISE EXCEPTION 'blocked must return empty capabilities: %', caps;
  END IF;

  -- 11: legacy capabilities remain
  caps := public.resolve_business_operational_capabilities(unit_a_id, owner_id, 'full');
  IF NOT (
    'view_own_agenda' = ANY (caps)
    AND 'manage_services' = ANY (caps)
    AND 'export_clients' = ANY (caps)
    AND 'manage_data_imports' = ANY (caps)
  ) THEN
    RAISE EXCEPTION 'legacy capabilities missing: %', caps;
  END IF;

  -- 13: no membership => no context
  PERFORM pg_temp.set_actor(outsider_id);
  IF EXISTS (SELECT 1 FROM public.get_my_business_operational_contexts()) THEN
    RAISE EXCEPTION 'outsider must not receive operational contexts';
  END IF;

  -- Owner operational remains blocked from flipping the flag
  PERFORM pg_temp.set_actor(owner_id);
  denied := false;
  BEGIN
    UPDATE public.establishments
    SET financial_ops_enabled = true
    WHERE id = unit_a_id;
  EXCEPTION
    WHEN OTHERS THEN
      denied := true;
      IF SQLERRM NOT ILIKE '%financial_ops_flag_immutable%' THEN
        RAISE EXCEPTION 'unexpected denial reason: %', SQLERRM;
      END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'owner update of financial_ops_enabled should fail';
  END IF;

  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'flag must remain false after denied write';
  END IF;

  -- Superadmin real can toggle the flag
  PERFORM pg_temp.set_actor(superadmin_id);
  UPDATE public.establishments
  SET financial_ops_enabled = true
  WHERE id = unit_a_id;
  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'superadmin failed to enable financial_ops_enabled';
  END IF;

  UPDATE public.establishments
  SET financial_ops_enabled = false
  WHERE id = unit_a_id;
  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'superadmin failed to disable financial_ops_enabled';
  END IF;

  -- Owner can still update other establishment fields without touching the flag
  PERFORM pg_temp.set_actor(owner_id);
  UPDATE public.establishments
  SET name = 'Financial Ops Unit A Renamed'
  WHERE id = unit_a_id;
  SELECT name, financial_ops_enabled INTO updated_name, flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF updated_name IS DISTINCT FROM 'Financial Ops Unit A Renamed' THEN
    RAISE EXCEPTION 'owner update of unrelated establishment field failed';
  END IF;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'unrelated update must not change financial_ops_enabled';
  END IF;

  -- UPDATE that includes the flag with the same value must not block
  UPDATE public.establishments
  SET name = 'Financial Ops Unit A Stable',
      financial_ops_enabled = false
  WHERE id = unit_a_id;
  SELECT name, financial_ops_enabled INTO updated_name, flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF updated_name IS DISTINCT FROM 'Financial Ops Unit A Stable' THEN
    RAISE EXCEPTION 'same-value flag update blocked unrelated field write';
  END IF;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'same-value flag update altered the flag unexpectedly';
  END IF;

  -- INSERT with financial_ops_enabled = true must be denied for authenticated
  -- non-superadmin (trigger), whether or not INSERT privilege exists.
  has_insert_privilege := has_table_privilege('authenticated', 'public.establishments', 'INSERT');
  denied := false;
  BEGIN
    INSERT INTO public.establishments(
      id, name, slug, account_status, timezone, financial_ops_enabled
    ) VALUES (
      unit_insert_id,
      'Financial Ops Insert Attack',
      'financial-ops-insert-' || substr(unit_insert_id::text, 1, 8),
      'active',
      'America/Sao_Paulo',
      true
    );
  EXCEPTION
    WHEN insufficient_privilege THEN
      denied := true;
    WHEN OTHERS THEN
      denied := true;
      IF SQLERRM NOT ILIKE '%financial_ops_flag_immutable%'
        AND SQLSTATE <> '42501'
      THEN
        RAISE EXCEPTION 'unexpected INSERT denial: % / %', SQLSTATE, SQLERRM;
      END IF;
  END;
  IF NOT denied THEN
    RAISE EXCEPTION 'authenticated INSERT with financial_ops_enabled=true must fail';
  END IF;
  IF EXISTS (SELECT 1 FROM public.establishments WHERE id = unit_insert_id) THEN
    RAISE EXCEPTION 'INSERT attack row must not persist';
  END IF;

  -- Default-false INSERT path remains available to privileged/internal writers
  PERFORM pg_temp.clear_actor();
  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone
  ) VALUES (
    unit_insert_id,
    'Financial Ops Insert Default',
    'financial-ops-insert-' || substr(unit_insert_id::text, 1, 8),
    'active',
    'America/Sao_Paulo'
  );
  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments
  WHERE id = unit_insert_id;
  IF flag_value IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'privileged INSERT default must be false';
  END IF;

  -- service-role/internal path remains functional for enabling the flag
  UPDATE public.establishments
  SET financial_ops_enabled = true
  WHERE id = unit_a_id;
  SELECT financial_ops_enabled INTO flag_value
  FROM public.establishments
  WHERE id = unit_a_id;
  IF flag_value IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'privileged update of financial_ops_enabled failed';
  END IF;

  -- 15: billing SaaS remains present and separate
  IF NOT EXISTS (
    SELECT 1 FROM public.billing_accounts WHERE establishment_id = unit_a_id
  ) THEN
    RAISE EXCEPTION 'billing_accounts must remain intact';
  END IF;
  IF to_regclass('public.service_orders') IS NOT NULL THEN
    RAISE EXCEPTION 'Etapa 1 must not create service_orders';
  END IF;

  RAISE NOTICE 'financial_ops_foundation checks passed (insert_privilege=%)',
    has_insert_privilege;
END;
$test$;

ROLLBACK;
