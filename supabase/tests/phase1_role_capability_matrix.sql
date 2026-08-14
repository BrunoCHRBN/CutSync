BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_matrix_actor(actor_id uuid)
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

DO $test$
DECLARE
  actor_ids uuid[] := ARRAY[
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(),
    gen_random_uuid(), gen_random_uuid(), gen_random_uuid()
  ];
  templates text[] := ARRAY[
    'admin', 'admin', 'professional', 'reception',
    'cashier', 'finance', 'manager'
  ];
  expected_roles text[] := ARRAY[
    'owner', 'admin', 'professional', 'reception',
    'cashier', 'finance', 'manager'
  ];
  outsider_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  capabilities text[];
  projected_role text;
  authorized_context jsonb;
  row_count integer;
  index integer;
BEGIN
  FOR index IN 1..array_length(actor_ids, 1) LOOP
    INSERT INTO auth.users(id, email, email_confirmed_at)
    VALUES (
      actor_ids[index],
      format('matrix-%s@example.test', index),
      now()
    );
  END LOOP;
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES (outsider_id, 'matrix-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  ) VALUES (
    unit_id,
    'Role Matrix Unit',
    'role-matrix-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false
  );

  FOR index IN 1..array_length(actor_ids, 1) LOOP
    INSERT INTO public.profiles(id, establishment_id, name, email, role)
    VALUES (
      actor_ids[index],
      NULL,
      format('Matrix Actor %s', index),
      format('matrix-%s@example.test', index),
      'client'
    )
    ON CONFLICT (id) DO UPDATE SET
      establishment_id = EXCLUDED.establishment_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role;

    INSERT INTO public.memberships(
      profile_id, establishment_id, role, role_template, status, created_by
    ) VALUES (
      actor_ids[index],
      unit_id,
      CASE WHEN templates[index] = 'admin' THEN 'admin' ELSE 'professional' END,
      templates[index],
      'active',
      actor_ids[1]
    );
  END LOOP;
  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES (
    outsider_id, NULL, 'Matrix Outsider', 'matrix-outsider@example.test', 'client'
  )
  ON CONFLICT (id) DO UPDATE SET role = EXCLUDED.role;

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Role Matrix Organization', 'active', actor_ids[1]);
  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  ) VALUES (
    organization_id, actor_ids[1], 'owner', 'active', actor_ids[1]
  );
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  ) VALUES (
    organization_id, unit_id, 'active', actor_ids[1]
  );

  FOR index IN 1..array_length(actor_ids, 1) LOOP
    PERFORM pg_temp.set_matrix_actor(actor_ids[index]);
    SELECT context INTO authorized_context
    FROM public.get_my_authorized_contexts('web') AS context
    WHERE context->>'contextKind' = 'establishment';
    IF authorized_context->>'roleTemplate' <> templates[index] THEN
      RAISE EXCEPTION 'authorized context role mismatch at %: %', index, authorized_context;
    END IF;

    SELECT context.operational_role INTO projected_role
    FROM public.get_my_business_operational_contexts() AS context;
    IF projected_role <> expected_roles[index] THEN
      RAISE EXCEPTION 'operational role mismatch at %: expected %, got %',
        index, expected_roles[index], projected_role;
    END IF;

    capabilities := public.resolve_business_operational_capabilities(
      unit_id, actor_ids[index], 'full'
    );
    CASE expected_roles[index]
      WHEN 'owner' THEN
        IF NOT ('manage_admins' = ANY(capabilities))
          OR NOT ('reopen_cash' = ANY(capabilities))
          OR NOT ('manage_payment_provider' = ANY(capabilities))
        THEN RAISE EXCEPTION 'owner capabilities invalid: %', capabilities;
        END IF;
      WHEN 'admin' THEN
        IF NOT ('manage_team' = ANY(capabilities))
          OR NOT ('approve_sensitive_actions' = ANY(capabilities))
          OR NOT ('view_team_orders' = ANY(capabilities))
          OR NOT ('void_orders' = ANY(capabilities))
          OR 'manage_admins' = ANY(capabilities)
        THEN RAISE EXCEPTION 'admin capabilities invalid: %', capabilities;
        END IF;
      WHEN 'professional' THEN
        IF NOT ('view_own_agenda' = ANY(capabilities))
          OR NOT ('view_orders' = ANY(capabilities))
          OR 'view_team_agenda' = ANY(capabilities)
          OR 'view_team_orders' = ANY(capabilities)
        THEN RAISE EXCEPTION 'professional capabilities invalid: %', capabilities;
        END IF;
      WHEN 'reception' THEN
        IF NOT ('manage_clients' = ANY(capabilities))
          OR NOT ('view_team_orders' = ANY(capabilities))
          OR 'void_orders' = ANY(capabilities)
          OR 'take_payments' = ANY(capabilities)
        THEN RAISE EXCEPTION 'reception capabilities invalid: %', capabilities;
        END IF;
      WHEN 'cashier' THEN
        IF NOT ('take_payments' = ANY(capabilities))
          OR NOT ('view_team_orders' = ANY(capabilities))
          OR 'manage_team_orders' = ANY(capabilities)
          OR 'void_orders' = ANY(capabilities)
          OR 'manage_services' = ANY(capabilities)
        THEN RAISE EXCEPTION 'cashier capabilities invalid: %', capabilities;
        END IF;
      WHEN 'finance' THEN
        IF NOT ('view_financial_reports' = ANY(capabilities))
          OR NOT ('view_orders' = ANY(capabilities))
          OR NOT ('view_payments' = ANY(capabilities))
          OR NOT ('view_cash' = ANY(capabilities))
          OR 'view_team_orders' = ANY(capabilities)
          OR 'take_payments' = ANY(capabilities)
        THEN RAISE EXCEPTION 'finance capabilities invalid: %', capabilities;
        END IF;
      WHEN 'manager' THEN
        IF NOT ('manage_services' = ANY(capabilities))
          OR NOT ('approve_sensitive_actions' = ANY(capabilities))
          OR NOT ('view_team_orders' = ANY(capabilities))
          OR NOT ('void_orders' = ANY(capabilities))
          OR 'manage_payment_provider' = ANY(capabilities)
        THEN RAISE EXCEPTION 'manager capabilities invalid: %', capabilities;
        END IF;
    END CASE;
  END LOOP;

  PERFORM pg_temp.set_matrix_actor(outsider_id);
  SELECT count(*) INTO row_count
  FROM public.get_my_authorized_contexts('web') AS context
  WHERE context->>'contextKind' <> 'personal';
  IF row_count <> 0
    OR cardinality(public.resolve_business_operational_capabilities(
      unit_id, outsider_id, 'full'
    )) <> 0
  THEN
    RAISE EXCEPTION 'outsider received an operational context or capability';
  END IF;

  UPDATE public.memberships
  SET status = 'revoked', revoked_at = now()
  WHERE profile_id = actor_ids[7]
    AND establishment_id = unit_id;
  PERFORM pg_temp.set_matrix_actor(actor_ids[7]);
  SELECT count(*) INTO row_count
  FROM public.get_my_business_operational_contexts();
  IF row_count <> 0
    OR cardinality(public.resolve_business_operational_capabilities(
      unit_id, actor_ids[7], 'full'
    )) <> 0
  THEN
    RAISE EXCEPTION 'revoked manager retained operational authority';
  END IF;
END;
$test$;

ROLLBACK;
