BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_phase1_actor(actor_id uuid)
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
  owner_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  context_request_id uuid := gen_random_uuid();
  reused_request_denied boolean := false;
  unauthorized_denied boolean := false;
  receipt jsonb;
  context_row jsonb;
  active_count integer;
  role_projection text;
  role_template_value text;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'phase1-owner@example.test', now()),
    (outsider_id, 'phase1-outsider@example.test', now());

  INSERT INTO public.establishments(id, name, slug, account_status, timezone)
  VALUES (
    unit_id,
    'Phase 1 Unit',
    'phase-1-unit-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo'
  );

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_id, 'Phase 1 Owner', 'phase1-owner@example.test', 'admin'),
    (outsider_id, NULL, 'Phase 1 Outsider', 'phase1-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET
    establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.memberships(
    profile_id,
    establishment_id,
    role,
    role_template,
    status,
    created_by
  )
  VALUES (
    owner_id,
    unit_id,
    'admin',
    'manager',
    'active',
    owner_id
  );

  SELECT role, role_template
  INTO role_projection, role_template_value
  FROM public.memberships AS membership
  WHERE membership.profile_id = owner_id
    AND membership.establishment_id = unit_id;

  IF role_projection <> 'professional' OR role_template_value <> 'manager' THEN
    RAISE EXCEPTION 'non-admin role template must project fail-closed legacy role';
  END IF;

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Phase 1 Org', 'active', owner_id);
  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  )
  VALUES (organization_id, owner_id, 'owner', 'active', owner_id);

  PERFORM pg_temp.set_phase1_actor(owner_id);

  SELECT context INTO context_row
  FROM (
    SELECT public.get_my_authorized_contexts('business') AS context
  ) AS authorized
  WHERE context->>'contextKind' = 'establishment'
    AND context->>'establishmentId' = unit_id::text;

  IF context_row IS NULL
    OR context_row->>'roleTemplate' <> 'manager'
    OR (context_row->>'active')::boolean
  THEN
    RAISE EXCEPTION 'authorized establishment context missing or invalid: %', context_row;
  END IF;

  receipt := public.set_my_active_context(
    'business', 'establishment', unit_id, NULL, context_request_id
  );
  IF receipt->>'establishmentId' <> unit_id::text
    OR (receipt->>'version')::integer <> 1
    OR (receipt->>'replayed')::boolean
  THEN
    RAISE EXCEPTION 'unexpected active context receipt: %', receipt;
  END IF;

  receipt := public.set_my_active_context(
    'business', 'establishment', unit_id, NULL, context_request_id
  );
  IF NOT (receipt->>'replayed')::boolean
    OR (receipt->>'version')::integer <> 1
  THEN
    RAISE EXCEPTION 'idempotent replay failed: %', receipt;
  END IF;

  BEGIN
    PERFORM public.set_my_active_context(
      'business', 'organization', NULL, organization_id, context_request_id
    );
  EXCEPTION WHEN SQLSTATE '22023' THEN
    reused_request_denied := true;
  END;
  IF NOT reused_request_denied THEN
    RAISE EXCEPTION 'request id reuse with another target must be denied';
  END IF;

  UPDATE public.memberships AS membership
  SET status = 'revoked', revoked_at = now()
  WHERE membership.profile_id = owner_id
    AND membership.establishment_id = unit_id;

  SELECT count(*) INTO active_count
  FROM public.user_app_active_contexts AS active_context
  WHERE active_context.profile_id = owner_id
    AND active_context.app_id = 'business';
  IF active_count <> 0 THEN
    RAISE EXCEPTION 'membership revocation did not invalidate active context';
  END IF;

  PERFORM pg_temp.set_phase1_actor(outsider_id);
  BEGIN
    PERFORM public.set_my_active_context(
      'business', 'establishment', unit_id, NULL, gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    unauthorized_denied := true;
  END;
  IF NOT unauthorized_denied THEN
    RAISE EXCEPTION 'outsider established unauthorized context';
  END IF;

  receipt := public.set_my_active_context(
    'client', 'personal', NULL, NULL, gen_random_uuid()
  );
  IF receipt->>'contextKind' <> 'personal' THEN
    RAISE EXCEPTION 'client personal context was not persisted';
  END IF;

  IF has_table_privilege('authenticated', 'public.user_app_active_contexts', 'SELECT')
    OR has_table_privilege('authenticated', 'public.user_app_context_events', 'SELECT')
  THEN
    RAISE EXCEPTION 'context tables must remain RPC-only';
  END IF;
END;
$test$;

ROLLBACK;
