BEGIN;

\set ON_ERROR_STOP on

CREATE OR REPLACE FUNCTION pg_temp.set_capability_actor(
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
  professional_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  unit_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  professional_membership_id uuid;
  grant_approval_id uuid;
  deny_approval_id uuid;
  grant_decision_request_id uuid := gen_random_uuid();
  deny_override_id uuid;
  revocation_approval_id uuid;
  revocation_request_id uuid := gen_random_uuid();
  request_receipt jsonb;
  decision_receipt jsonb;
  override_receipt jsonb;
  capabilities text[];
  aal1_denied boolean := false;
  self_approval_denied boolean := false;
  outsider_denied boolean := false;
  replay_after_revocation_denied boolean := false;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (owner_id, 'cap-owner@example.test', now()),
    (admin_id, 'cap-admin@example.test', now()),
    (professional_id, 'cap-professional@example.test', now()),
    (outsider_id, 'cap-outsider@example.test', now());

  INSERT INTO public.establishments(
    id, name, slug, account_status, timezone, share_agendas
  ) VALUES (
    unit_id,
    'Capability Unit',
    'capability-unit-' || substr(unit_id::text, 1, 8),
    'active',
    'America/Sao_Paulo',
    false
  );

  INSERT INTO public.profiles(id, establishment_id, name, email, role)
  VALUES
    (owner_id, unit_id, 'Capability Owner', 'cap-owner@example.test', 'admin'),
    (admin_id, unit_id, 'Capability Admin', 'cap-admin@example.test', 'admin'),
    (
      professional_id, unit_id, 'Capability Professional',
      'cap-professional@example.test', 'professional'
    ),
    (outsider_id, NULL, 'Capability Outsider', 'cap-outsider@example.test', 'client')
  ON CONFLICT (id) DO UPDATE SET
    establishment_id = EXCLUDED.establishment_id,
    name = EXCLUDED.name,
    email = EXCLUDED.email,
    role = EXCLUDED.role;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, created_by
  ) VALUES
    (owner_id, unit_id, 'admin', 'admin', 'active', owner_id),
    (admin_id, unit_id, 'admin', 'admin', 'active', owner_id),
    (
      professional_id, unit_id, 'professional', 'professional',
      'active', owner_id
    );

  SELECT membership.id INTO professional_membership_id
  FROM public.memberships AS membership
  WHERE membership.profile_id = professional_id
    AND membership.establishment_id = unit_id;

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (organization_id, 'Capability Org', 'active', owner_id);
  INSERT INTO public.organization_members(
    organization_id, profile_id, role, status, created_by
  ) VALUES (organization_id, owner_id, 'owner', 'active', owner_id);
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, status, linked_by
  ) VALUES (organization_id, unit_id, 'active', owner_id);

  capabilities := public.resolve_business_operational_capabilities(
    unit_id, professional_id, 'full'
  );
  IF 'view_team_agenda' = ANY(capabilities)
    OR 'take_payments' = ANY(capabilities)
    OR NOT ('request_appointment_reassignment' = ANY(capabilities))
  THEN
    RAISE EXCEPTION 'professional template is not fail-closed: %', capabilities;
  END IF;

  UPDATE public.memberships
  SET role_template = 'reception'
  WHERE id = professional_membership_id;
  capabilities := public.resolve_business_operational_capabilities(
    unit_id, professional_id, 'full'
  );
  IF NOT ('manage_clients' = ANY(capabilities))
    OR 'take_payments' = ANY(capabilities)
  THEN
    RAISE EXCEPTION 'reception template is invalid: %', capabilities;
  END IF;
  UPDATE public.memberships
  SET role_template = 'professional'
  WHERE id = professional_membership_id;

  PERFORM pg_temp.set_capability_actor(admin_id, 'aal1');
  BEGIN
    PERFORM public.request_capability_override_approval(
      unit_id, professional_membership_id, 'take_payments', 'grant',
      'Grant temporarily for cashier coverage.', gen_random_uuid()
    );
  EXCEPTION WHEN OTHERS THEN
    aal1_denied := SQLERRM LIKE '%aal2_required%';
  END;
  IF NOT aal1_denied THEN
    RAISE EXCEPTION 'AAL1 capability override request was not denied';
  END IF;

  PERFORM pg_temp.set_capability_actor(admin_id);
  request_receipt := public.request_capability_override_approval(
    unit_id, professional_membership_id, 'take_payments', 'grant',
    'Grant temporarily for cashier coverage.', gen_random_uuid()
  );
  grant_approval_id := (request_receipt->>'approvalRequestId')::uuid;

  BEGIN
    PERFORM public.decide_capability_override_approval(
      grant_approval_id, 1, 'approved',
      'Self approval must never be accepted.', gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    self_approval_denied := true;
  END;
  IF NOT self_approval_denied THEN
    RAISE EXCEPTION 'requester approved their own override';
  END IF;

  PERFORM pg_temp.set_capability_actor(owner_id);
  decision_receipt := public.decide_capability_override_approval(
    grant_approval_id, 1, 'approved',
    'Approved for documented temporary coverage.', grant_decision_request_id
  );
  IF decision_receipt->>'status' <> 'approved'
    OR (decision_receipt->>'version')::integer <> 2
  THEN
    RAISE EXCEPTION 'approval decision failed: %', decision_receipt;
  END IF;
  decision_receipt := public.decide_capability_override_approval(
    grant_approval_id, 1, 'approved',
    'Approved for documented temporary coverage.', grant_decision_request_id
  );
  IF NOT (decision_receipt->>'replayed')::boolean
    OR (decision_receipt->>'version')::integer <> 2
  THEN
    RAISE EXCEPTION 'approval decision replay failed: %', decision_receipt;
  END IF;

  PERFORM pg_temp.set_capability_actor(admin_id);
  override_receipt := public.apply_membership_capability_override(
    grant_approval_id, 2, now() + interval '2 hours', gen_random_uuid()
  );
  IF override_receipt->>'effect' <> 'grant' THEN
    RAISE EXCEPTION 'grant override was not applied: %', override_receipt;
  END IF;
  capabilities := public.resolve_business_operational_capabilities(
    unit_id, professional_id, 'full'
  );
  IF NOT ('take_payments' = ANY(capabilities)) THEN
    RAISE EXCEPTION 'explicit grant did not override the template: %', capabilities;
  END IF;
  IF 'take_payments' = ANY(public.resolve_business_operational_capabilities(
    unit_id, professional_id, 'read_only'
  )) THEN
    RAISE EXCEPTION 'mutation capability leaked into read-only access';
  END IF;

  request_receipt := public.request_capability_override_approval(
    unit_id, professional_membership_id, 'take_payments', 'deny',
    'Deny payment collection after coverage ended.', gen_random_uuid()
  );
  deny_approval_id := (request_receipt->>'approvalRequestId')::uuid;

  PERFORM pg_temp.set_capability_actor(owner_id);
  PERFORM public.decide_capability_override_approval(
    deny_approval_id, 1, 'approved',
    'Approved to remove temporary payment authority.', gen_random_uuid()
  );
  PERFORM pg_temp.set_capability_actor(admin_id);
  override_receipt := public.apply_membership_capability_override(
    deny_approval_id, 2, NULL, gen_random_uuid()
  );
  deny_override_id := (override_receipt->>'overrideId')::uuid;
  capabilities := public.resolve_business_operational_capabilities(
    unit_id, professional_id, 'full'
  );
  IF 'take_payments' = ANY(capabilities) THEN
    RAISE EXCEPTION 'explicit deny did not win over explicit grant: %', capabilities;
  END IF;

  request_receipt := public.request_capability_override_revocation(
    deny_override_id,
    'Revoke the deny after a separately approved review.',
    gen_random_uuid()
  );
  revocation_approval_id := (request_receipt->>'approvalRequestId')::uuid;
  PERFORM pg_temp.set_capability_actor(owner_id);
  PERFORM public.decide_capability_override_approval(
    revocation_approval_id, 1, 'approved',
    'Approved after reviewing the restored coverage need.', gen_random_uuid()
  );
  PERFORM pg_temp.set_capability_actor(admin_id);
  override_receipt := public.revoke_membership_capability_override(
    revocation_approval_id, 2, revocation_request_id
  );
  IF override_receipt->>'status' <> 'revoked'
    OR (override_receipt->>'replayed')::boolean
  THEN
    RAISE EXCEPTION 'approved override revocation failed: %', override_receipt;
  END IF;
  override_receipt := public.revoke_membership_capability_override(
    revocation_approval_id, 2, revocation_request_id
  );
  IF NOT (override_receipt->>'replayed')::boolean THEN
    RAISE EXCEPTION 'override revocation replay failed: %', override_receipt;
  END IF;
  capabilities := public.resolve_business_operational_capabilities(
    unit_id, professional_id, 'full'
  );
  IF NOT ('take_payments' = ANY(capabilities)) THEN
    RAISE EXCEPTION 'revoking deny did not restore the active grant: %', capabilities;
  END IF;

  UPDATE public.memberships
  SET status = 'revoked', revoked_at = now()
  WHERE profile_id = admin_id
    AND establishment_id = unit_id;
  BEGIN
    PERFORM public.revoke_membership_capability_override(
      revocation_approval_id, 2, revocation_request_id
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    replay_after_revocation_denied := true;
  END;
  IF NOT replay_after_revocation_denied THEN
    RAISE EXCEPTION 'revoked actor replayed override revocation';
  END IF;

  PERFORM pg_temp.set_capability_actor(outsider_id);
  BEGIN
    PERFORM public.request_capability_override_approval(
      unit_id, professional_membership_id, 'view_cash', 'grant',
      'Unauthorized outsider request must be denied.', gen_random_uuid()
    );
  EXCEPTION WHEN SQLSTATE '42501' THEN
    outsider_denied := true;
  END;
  IF NOT outsider_denied THEN
    RAISE EXCEPTION 'outsider requested a capability override';
  END IF;

  IF has_table_privilege('authenticated', 'public.approval_requests', 'SELECT')
    OR has_table_privilege(
      'authenticated', 'public.membership_capability_overrides', 'SELECT'
    )
  THEN
    RAISE EXCEPTION 'approval and override tables must remain RPC-only';
  END IF;
END;
$test$;

ROLLBACK;
