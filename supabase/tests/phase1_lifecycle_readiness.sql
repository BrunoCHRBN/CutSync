BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_lifecycle_actor(
  actor_id uuid,
  actor_aal text DEFAULT 'aal2'
)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', actor_id::text, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', actor_id, 'role', 'authenticated', 'aal', actor_aal)::text,
    true
  );
END;
$$;

DO $test$
DECLARE
  owner_id uuid := gen_random_uuid();
  admin_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  service_id text := gen_random_uuid()::text;
  first_request_id uuid := gen_random_uuid();
  readiness jsonb;
  receipt jsonb;
  direct_write_denied boolean := false;
  premature_ready_denied boolean := false;
  outsider_denied boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'lifecycle-owner@example.test', now()),
    (admin_id, 'lifecycle-admin@example.test', now()),
    (outsider_id, 'lifecycle-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, financial_ops_enabled
  ) VALUES (
    unit_id,
    'Lifecycle Unit',
    'lifecycle-unit-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false
  );

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_id, 'Lifecycle Owner', 'lifecycle-owner@example.test', 'admin'),
    (admin_id, unit_id, 'Lifecycle Admin', 'lifecycle-admin@example.test', 'admin'),
    (outsider_id, NULL, 'Lifecycle Outsider', 'lifecycle-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET
    establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (owner_id, unit_id, 'admin', 'admin', 'active', owner_id),
    (admin_id, unit_id, 'admin', 'admin', 'active', owner_id);

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Lifecycle Org', 'active', owner_id);
  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  ) VALUES (organization_id, owner_id, 'owner', 'active', owner_id);
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  ) VALUES (organization_id, unit_id, 'active', owner_id);

  PERFORM pg_temp.set_lifecycle_actor(admin_id);
  readiness := public.get_establishment_readiness(unit_id);
  IF (readiness->>'operationalReady')::boolean
    OR NOT (readiness->'blockers'->'operational' ? 'opening_hours_not_configured')
    OR (readiness->>'paymentsReady')::boolean
    OR (readiness->>'fiscalReady')::boolean
  THEN
    RAISE EXCEPTION 'initial readiness was not fail-closed: %', readiness;
  END IF;

  receipt := public.set_establishment_lifecycle_status(
    unit_id, 'configuring', 1,
    'Begin the documented operational configuration.', first_request_id
  );
  IF receipt->>'lifecycleStatus' <> 'configuring'
    OR (receipt->>'version')::integer <> 2
  THEN
    RAISE EXCEPTION 'draft to configuring failed: %', receipt;
  END IF;
  receipt := public.set_establishment_lifecycle_status(
    unit_id, 'configuring', 1,
    'Begin the documented operational configuration.', first_request_id
  );
  IF NOT (receipt->>'replayed')::boolean THEN
    RAISE EXCEPTION 'lifecycle request replay failed: %', receipt;
  END IF;

  BEGIN
    PERFORM public.set_establishment_lifecycle_status(
      unit_id, 'ready', 2,
      'Attempt readiness before required configuration.', gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    premature_ready_denied := true;
  END;
  IF NOT premature_ready_denied THEN
    RAISE EXCEPTION 'unit became ready without configuration';
  END IF;

  UPDATE public.establishments
  SET opening_hours = '{"monday":["09:00","18:00"]}'
  WHERE id = unit_id;
  INSERT INTO public.services(
    id, establishment_id, name, price, duration_minutes, is_active
  ) VALUES (service_id, unit_id, 'Configured Service', 50, 30, true);

  receipt := public.set_establishment_lifecycle_status(
    unit_id, 'ready', 2,
    'Required operational configuration is complete.', gen_random_uuid()
  );
  IF receipt->>'lifecycleStatus' <> 'ready'
    OR (receipt->>'version')::integer <> 3
  THEN
    RAISE EXCEPTION 'configuring to ready failed: %', receipt;
  END IF;

  readiness := public.get_establishment_readiness(unit_id);
  IF NOT (readiness->>'operationalReady')::boolean
    OR (readiness->>'paymentsReady')::boolean
    OR (readiness->>'fiscalReady')::boolean
    OR readiness->'checks'->>'financialOpsEnabled' <> 'false'
    OR NOT (readiness->'blockers'->'payments' ? 'financial_ops_disabled')
    OR NOT (
      readiness->'blockers'->'fiscal' ? 'service_fiscal_profile_not_configured'
    )
  THEN
    RAISE EXCEPTION 'calculated readiness is invalid: %', readiness;
  END IF;

  BEGIN
    UPDATE public.establishments
    SET lifecycle_status = 'closed', lifecycle_version = 99
    WHERE id = unit_id;
  EXCEPTION WHEN SQLSTATE '42501' THEN
    direct_write_denied := true;
  END;
  IF NOT direct_write_denied THEN
    RAISE EXCEPTION 'authenticated direct lifecycle write was accepted';
  END IF;

  PERFORM pg_temp.set_lifecycle_actor(outsider_id);
  BEGIN
    PERFORM public.get_establishment_readiness(unit_id);
  EXCEPTION WHEN SQLSTATE '42501' THEN
    outsider_denied := true;
  END;
  IF NOT outsider_denied THEN
    RAISE EXCEPTION 'outsider read establishment readiness';
  END IF;

  outsider_denied := false;
  BEGIN
    PERFORM public.set_establishment_lifecycle_status(
      unit_id, 'configuring', 1,
      'Begin the documented operational configuration.', first_request_id
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    outsider_denied := true;
  END;
  IF NOT outsider_denied THEN
    RAISE EXCEPTION 'outsider replayed lifecycle mutation';
  END IF;

  IF has_table_privilege(
    'authenticated', 'public.establishment_lifecycle_events', 'SELECT'
  ) THEN
    RAISE EXCEPTION 'lifecycle events must remain RPC-only';
  END IF;
END;
$test$;

ROLLBACK;
