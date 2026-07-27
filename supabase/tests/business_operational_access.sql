BEGIN;

CREATE OR REPLACE FUNCTION pg_temp.set_business_actor(
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
    json_build_object(
      'sub', actor_id,
      'role', 'authenticated',
      'aal', actor_aal
    )::text,
    true
  );
END;
$$;

DO $test$
<<business_operational_access>>
DECLARE
  group_owner_id uuid := gen_random_uuid();
  unit_admin_id uuid := gen_random_uuid();
  professional_id uuid := gen_random_uuid();
  legacy_owner_id uuid := gen_random_uuid();
  blocked_professional_id uuid := gen_random_uuid();
  outsider_id uuid := gen_random_uuid();
  invitee_id uuid := gen_random_uuid();
  group_establishment_id uuid := gen_random_uuid();
  legacy_establishment_id uuid := gen_random_uuid();
  blocked_establishment_id uuid := gen_random_uuid();
  organization_id uuid := gen_random_uuid();
  group_service_id text := gen_random_uuid()::text;
  legacy_service_id text := gen_random_uuid()::text;
  own_appointment_id text := gen_random_uuid()::text;
  team_appointment_id text := gen_random_uuid()::text;
  isolated_appointment_id text := gen_random_uuid()::text;
  fixture_day date := date '2026-08-15';
  context_record record;
  identity_record record;
  invitation_record record;
  agenda_count integer;
  accepted_establishment_id uuid;
  accepted_role text;
BEGIN
  INSERT INTO auth.users(id, email, email_confirmed_at)
  VALUES
    (group_owner_id, 'business-group-owner@example.test', now()),
    (unit_admin_id, 'business-unit-admin@example.test', now()),
    (professional_id, 'business-professional@example.test', now()),
    (legacy_owner_id, 'business-legacy-owner@example.test', now()),
    (
      blocked_professional_id,
      'business-blocked-professional@example.test',
      now()
    ),
    (outsider_id, 'business-outsider@example.test', now()),
    (invitee_id, 'business-invitee@example.test', now());

  INSERT INTO public.establishments(
    id,
    name,
    slug,
    account_status,
    timezone,
    share_agendas
  )
  VALUES
    (
      group_establishment_id,
      'Business Group Unit',
      'business-group-unit',
      'active',
      'America/Sao_Paulo',
      true
    ),
    (
      legacy_establishment_id,
      'Business Legacy Unit',
      'business-legacy-unit',
      'active',
      'America/Manaus',
      false
    ),
    (
      blocked_establishment_id,
      'Business Blocked Unit',
      'business-blocked-unit',
      'blocked',
      'America/Sao_Paulo',
      true
    );

  INSERT INTO public.profiles(
    id,
    establishment_id,
    name,
    email,
    role
  )
  VALUES
    (
      group_owner_id,
      group_establishment_id,
      'Group Owner Fixture',
      'business-group-owner@example.test',
      'admin'
    ),
    (
      unit_admin_id,
      group_establishment_id,
      'Unit Admin Fixture',
      'business-unit-admin@example.test',
      'admin'
    ),
    (
      professional_id,
      group_establishment_id,
      'Professional Fixture',
      'business-professional@example.test',
      'professional'
    ),
    (
      legacy_owner_id,
      legacy_establishment_id,
      'Legacy Owner Fixture',
      'business-legacy-owner@example.test',
      'admin'
    ),
    (
      blocked_professional_id,
      blocked_establishment_id,
      'Blocked Professional Fixture',
      'business-blocked-professional@example.test',
      'professional'
    ),
    (
      outsider_id,
      NULL,
      'Finance Only Fixture',
      'business-outsider@example.test',
      'client'
    ),
    (
      invitee_id,
      legacy_establishment_id,
      'Invitee Fixture',
      'business-invitee@example.test',
      'client'
    )
  ON CONFLICT (id) DO UPDATE
  SET establishment_id = EXCLUDED.establishment_id,
      name = EXCLUDED.name,
      email = EXCLUDED.email,
      role = EXCLUDED.role,
      deleted_at = NULL,
      updated_at = now();

  INSERT INTO public.memberships(
    profile_id,
    establishment_id,
    role,
    status,
    created_by
  )
  VALUES
    (
      group_owner_id,
      group_establishment_id,
      'admin',
      'active',
      group_owner_id
    ),
    (
      unit_admin_id,
      group_establishment_id,
      'admin',
      'active',
      group_owner_id
    ),
    (
      professional_id,
      group_establishment_id,
      'professional',
      'active',
      group_owner_id
    ),
    (
      legacy_owner_id,
      legacy_establishment_id,
      'admin',
      'active',
      legacy_owner_id
    ),
    (
      blocked_professional_id,
      blocked_establishment_id,
      'professional',
      'active',
      blocked_professional_id
    );

  INSERT INTO public.organizations(id, name, status, created_by)
  VALUES (
    organization_id,
    'Business Group Fixture',
    'active',
    group_owner_id
  );
  INSERT INTO public.organization_members(
    organization_id,
    profile_id,
    role,
    status,
    created_by
  )
  VALUES
    (
      organization_id,
      group_owner_id,
      'owner',
      'active',
      group_owner_id
    ),
    (
      organization_id,
      unit_admin_id,
      'manager',
      'active',
      group_owner_id
    ),
    (
      organization_id,
      outsider_id,
      'finance',
      'active',
      group_owner_id
    );
  INSERT INTO public.organization_establishments(
    organization_id,
    establishment_id,
    status,
    linked_by
  )
  VALUES (
    organization_id,
    group_establishment_id,
    'active',
    group_owner_id
  );

  UPDATE public.billing_accounts
  SET billing_owner_profile_id = legacy_owner_id,
      owner_resolution_status = 'confirmed'
  WHERE establishment_id = legacy_establishment_id;

  INSERT INTO public.services(
    id,
    establishment_id,
    name,
    price,
    duration_minutes,
    is_active
  )
  VALUES
    (
      group_service_id,
      group_establishment_id,
      'Group Service Fixture',
      50,
      30,
      true
    ),
    (
      legacy_service_id,
      legacy_establishment_id,
      'Legacy Service Fixture',
      60,
      30,
      true
    );

  INSERT INTO public.appointments(
    id,
    establishment_id,
    client_name,
    professional_id,
    service_id,
    date_time,
    duration_minutes,
    ends_at,
    status
  )
  VALUES
    (
      own_appointment_id,
      group_establishment_id,
      'Own Client Fixture',
      professional_id,
      group_service_id,
      (fixture_day + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
      30,
      (fixture_day + time '09:30') AT TIME ZONE 'America/Sao_Paulo',
      'pending'
    ),
    (
      team_appointment_id,
      group_establishment_id,
      'Team Client Fixture',
      group_owner_id,
      group_service_id,
      (fixture_day + time '10:00') AT TIME ZONE 'America/Sao_Paulo',
      30,
      (fixture_day + time '10:30') AT TIME ZONE 'America/Sao_Paulo',
      'pending'
    ),
    (
      isolated_appointment_id,
      legacy_establishment_id,
      'Isolated Client Fixture',
      legacy_owner_id,
      legacy_service_id,
      (fixture_day + time '11:00') AT TIME ZONE 'America/Manaus',
      30,
      (fixture_day + time '11:30') AT TIME ZONE 'America/Manaus',
      'pending'
    );

  PERFORM set_config(
    'request.jwt.claim.role',
    'authenticated',
    true
  );

  -- Active organization owner + local admin membership resolves to owner.
  PERFORM pg_temp.set_business_actor(group_owner_id);
  SELECT *
  INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = group_establishment_id;
  IF context_record.operational_role <> 'owner'
    OR context_record.access_mode <> 'full'
    OR NOT ('manage_admins' = ANY(context_record.capabilities))
    OR context_record.organization_id IS DISTINCT FROM organization_id
  THEN
    RAISE EXCEPTION 'group owner context was not resolved correctly';
  END IF;

  -- A corporate manager still needs the local admin membership and remains
  -- operational admin instead of being promoted to owner.
  PERFORM pg_temp.set_business_actor(unit_admin_id);
  SELECT *
  INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = group_establishment_id;
  IF context_record.operational_role <> 'admin'
    OR NOT ('manage_team' = ANY(context_record.capabilities))
    OR 'manage_admins' = ANY(context_record.capabilities)
  THEN
    RAISE EXCEPTION 'unit admin capabilities were not resolved correctly';
  END IF;

  -- Finance-only corporate access never creates an operational context.
  PERFORM pg_temp.set_business_actor(outsider_id);
  IF EXISTS (
    SELECT 1 FROM public.get_my_business_operational_contexts()
  ) THEN
    RAISE EXCEPTION 'finance-only member received an operational context';
  END IF;

  -- A confirmed individual billing owner is owner only while there is no
  -- active organization link.
  PERFORM pg_temp.set_business_actor(legacy_owner_id);
  SELECT *
  INTO identity_record
  FROM public.resolve_business_operational_identity(
    legacy_establishment_id,
    legacy_owner_id
  );
  IF identity_record.operational_role <> 'owner' THEN
    RAISE EXCEPTION 'legacy confirmed owner did not resolve as owner';
  END IF;

  INSERT INTO public.organization_establishments(
    organization_id,
    establishment_id,
    status,
    linked_by
  )
  VALUES (
    organization_id,
    legacy_establishment_id,
    'active',
    group_owner_id
  );
  SELECT *
  INTO identity_record
  FROM public.resolve_business_operational_identity(
    legacy_establishment_id,
    legacy_owner_id
  );
  IF identity_record.operational_role <> 'admin' THEN
    RAISE EXCEPTION 'active organization link did not disable legacy owner';
  END IF;
  UPDATE public.organization_establishments AS organization_link
  SET status = 'removed',
      effective_until = CURRENT_DATE,
      updated_at = now()
  WHERE organization_link.organization_id =
      business_operational_access.organization_id
    AND organization_link.establishment_id = legacy_establishment_id;

  -- An expired individual trial remains visible, but only with read
  -- capabilities.
  UPDATE public.billing_accounts
  SET trial_started_at = now() - interval '15 days',
      trial_ends_at = now() - interval '1 day',
      transition_ends_at = NULL,
      courtesy_ends_at = NULL
  WHERE establishment_id = legacy_establishment_id;
  SELECT *
  INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = legacy_establishment_id;
  IF context_record.operational_role <> 'owner'
    OR context_record.access_mode <> 'read_only'
    OR NOT ('view_services' = ANY(context_record.capabilities))
    OR 'manage_services' = ANY(context_record.capabilities)
    OR 'manage_admins' = ANY(context_record.capabilities)
  THEN
    RAISE EXCEPTION 'read-only owner context was not fail-closed';
  END IF;

  -- Missing billing coverage/account is exposed as blocked/unconfigured so the
  -- user can still switch units without receiving operational data.
  PERFORM pg_temp.set_business_actor(blocked_professional_id);
  SELECT *
  INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = blocked_establishment_id;
  IF context_record.access_mode <> 'blocked'
    OR context_record.billing_status <> 'unconfigured'
    OR cardinality(context_record.capabilities) <> 0
    OR cardinality(context_record.covered_establishment_ids) <> 0
  THEN
    RAISE EXCEPTION 'blocked context was not returned fail-closed';
  END IF;
  BEGIN
    PERFORM *
    FROM public.get_business_agenda_day(
      blocked_establishment_id,
      fixture_day,
      'own'
    );
    RAISE EXCEPTION 'blocked member unexpectedly read an agenda';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'business_access_blocked' THEN
      RAISE;
    END IF;
  END;

  -- Professionals receive own agenda and, only when share_agendas is enabled,
  -- the minimized team agenda. Other establishments never leak into the result.
  PERFORM pg_temp.set_business_actor(professional_id);
  SELECT count(*) INTO agenda_count
  FROM public.get_business_agenda_day(
    group_establishment_id,
    fixture_day,
    'own'
  );
  IF agenda_count <> 1 THEN
    RAISE EXCEPTION 'professional own agenda returned % rows', agenda_count;
  END IF;
  SELECT count(*) INTO agenda_count
  FROM public.get_business_agenda_day(
    group_establishment_id,
    fixture_day,
    'team'
  );
  IF agenda_count <> 2 THEN
    RAISE EXCEPTION 'shared team agenda returned % rows', agenda_count;
  END IF;

  UPDATE public.establishments
  SET share_agendas = false
  WHERE id = group_establishment_id;
  BEGIN
    PERFORM *
    FROM public.get_business_agenda_day(
      group_establishment_id,
      fixture_day,
      'team'
    );
    RAISE EXCEPTION 'professional read a team agenda without permission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN
      RAISE;
    END IF;
  END;
  UPDATE public.establishments
  SET share_agendas = true
  WHERE id = group_establishment_id;

  -- SECURITY DEFINER status RPCs cannot bypass own-vs-team scope.
  BEGIN
    PERFORM public.update_appointment_status_v2(
      team_appointment_id,
      'confirmed',
      NULL,
      NULL
    );
    RAISE EXCEPTION 'professional changed a team appointment';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN
      RAISE;
    END IF;
  END;
  PERFORM public.update_appointment_status_v2(
    own_appointment_id,
    'confirmed',
    NULL,
    NULL
  );
  IF (
    SELECT appointment.status
    FROM public.appointments AS appointment
    WHERE appointment.id = own_appointment_id
  ) <> 'confirmed' THEN
    RAISE EXCEPTION 'professional could not change the own appointment';
  END IF;

  -- No-membership actors cannot request operational agenda data.
  PERFORM pg_temp.set_business_actor(outsider_id);
  BEGIN
    PERFORM *
    FROM public.get_business_agenda_day(
      group_establishment_id,
      fixture_day,
      'team'
    );
    RAISE EXCEPTION 'outsider unexpectedly read the unit agenda';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN
      RAISE;
    END IF;
  END;

  -- Admins can invite professionals, but only owners/superadmins can invite
  -- administrators.
  PERFORM pg_temp.set_business_actor(unit_admin_id);
  PERFORM *
  FROM public.create_invitation(
    group_establishment_id,
    'business-professional-two@example.test',
    'professional'
  );
  BEGIN
    PERFORM *
    FROM public.create_invitation(
      group_establishment_id,
      'business-admin-denied@example.test',
      'admin'
    );
    RAISE EXCEPTION 'unit admin unexpectedly invited an administrator';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN
      RAISE;
    END IF;
  END;

  PERFORM pg_temp.set_business_actor(professional_id);
  BEGIN
    PERFORM *
    FROM public.create_invitation(
      group_establishment_id,
      'business-professional-denied@example.test',
      'professional'
    );
    RAISE EXCEPTION 'professional unexpectedly invited a teammate';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN
      RAISE;
    END IF;
  END;

  PERFORM pg_temp.set_business_actor(group_owner_id);
  PERFORM *
  FROM public.create_invitation(
    group_establishment_id,
    'business-admin-allowed@example.test',
    'admin'
  );

  -- Accepting an invitation adds the authoritative membership without changing
  -- the legacy profile establishment used by older clients.
  SELECT *
  INTO invitation_record
  FROM public.create_invitation(
    group_establishment_id,
    'business-invitee@example.test',
    'professional'
  );
  PERFORM pg_temp.set_business_actor(invitee_id);
  SELECT accepted.accepted_role, accepted.accepted_establishment_id
  INTO accepted_role, accepted_establishment_id
  FROM public.accept_invitation(
    invitation_record.raw_token
  ) AS accepted;
  IF accepted_role <> 'professional'
    OR accepted_establishment_id IS DISTINCT FROM group_establishment_id
  THEN
    RAISE EXCEPTION 'invitation did not create the expected membership';
  END IF;
  IF (
    SELECT profile.establishment_id
    FROM public.profiles AS profile
    WHERE profile.id = invitee_id
  ) IS DISTINCT FROM legacy_establishment_id THEN
    RAISE EXCEPTION 'invitation acceptance changed active establishment';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.profile_id = invitee_id
      AND membership.establishment_id = group_establishment_id
      AND membership.role = 'professional'
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'accepted invitation did not persist membership';
  END IF;
  BEGIN
    PERFORM *
    FROM public.accept_invitation(invitation_record.raw_token);
    RAISE EXCEPTION 'invitation token was accepted twice';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invalid_or_used_invitation' THEN
      RAISE;
    END IF;
  END;

  -- A valid token is still bound to the exact invited e-mail.
  PERFORM pg_temp.set_business_actor(group_owner_id);
  SELECT *
  INTO invitation_record
  FROM public.create_invitation(
    group_establishment_id,
    'business-other-email@example.test',
    'professional'
  );
  PERFORM pg_temp.set_business_actor(invitee_id);
  BEGIN
    PERFORM *
    FROM public.accept_invitation(invitation_record.raw_token);
    RAISE EXCEPTION 'invitation accepted by a different e-mail';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'invitation_email_mismatch' THEN
      RAISE;
    END IF;
  END;

  -- Expired tokens are rejected even for the matching confirmed identity.
  PERFORM pg_temp.set_business_actor(group_owner_id);
  SELECT *
  INTO invitation_record
  FROM public.create_invitation(
    group_establishment_id,
    'business-invitee@example.test',
    'professional'
  );
  UPDATE public.invitations
  SET expires_at = now() - interval '1 minute'
  WHERE id = invitation_record.invitation_id;
  PERFORM pg_temp.set_business_actor(invitee_id);
  BEGIN
    PERFORM *
    FROM public.accept_invitation(invitation_record.raw_token);
    RAISE EXCEPTION 'expired invitation was accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'expired_invitation' THEN
      RAISE;
    END IF;
  END;
END;
$test$;

-- Exercise the same RLS path used by direct Supabase table calls. A
-- professional cannot mutate services or another professional's appointment.
SELECT pg_temp.set_business_actor(
  (
    SELECT auth_user.id
    FROM auth.users AS auth_user
    WHERE auth_user.email = 'business-professional@example.test'
  )
);
SET LOCAL ROLE authenticated;

DO $rls$
DECLARE
  changed_rows integer := 0;
BEGIN
  BEGIN
    UPDATE public.services
    SET name = name
    WHERE name = 'Group Service Fixture';
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 0 THEN
      RAISE EXCEPTION 'professional changed a service directly';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;

  BEGIN
    UPDATE public.appointments
    SET status = 'confirmed'
    WHERE client_name = 'Team Client Fixture';
    GET DIAGNOSTICS changed_rows = ROW_COUNT;
    IF changed_rows <> 0 THEN
      RAISE EXCEPTION 'professional changed a team appointment directly';
    END IF;
  EXCEPTION WHEN insufficient_privilege THEN
    NULL;
  END;
END;
$rls$;

RESET ROLE;

-- Once blocked, even legacy SECURITY DEFINER reads must fail closed.
DO $blocked_reads$
<<blocked_reads>>
DECLARE
  owner_id uuid;
  establishment_id uuid;
  context_record record;
BEGIN
  SELECT auth_user.id
  INTO owner_id
  FROM auth.users AS auth_user
  WHERE auth_user.email = 'business-group-owner@example.test';

  SELECT establishment.id
  INTO establishment_id
  FROM public.establishments AS establishment
  WHERE establishment.slug = 'business-group-unit';

  PERFORM pg_temp.set_business_actor(owner_id);
  PERFORM set_config(
    'cutsync.governance_status_reason',
    'Business blocked read validation',
    true
  );

  UPDATE public.establishments
  SET account_status = 'blocked'
  WHERE id = establishment_id;

  SELECT *
  INTO context_record
  FROM public.get_my_business_operational_contexts() AS context
  WHERE context.establishment_id = blocked_reads.establishment_id;
  IF context_record.access_mode <> 'blocked'
    OR cardinality(context_record.capabilities) <> 0
  THEN
    RAISE EXCEPTION 'blocked owner context retained operational capabilities';
  END IF;

  BEGIN
    PERFORM * FROM public.get_establishment_team(establishment_id, true);
    RAISE EXCEPTION 'blocked owner read the team';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.list_establishment_invitations(establishment_id);
    RAISE EXCEPTION 'blocked owner read invitations';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.list_establishment_invites_v2(establishment_id);
    RAISE EXCEPTION 'blocked owner read v2 invitations';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM * FROM public.get_establishment_client_contacts(establishment_id);
    RAISE EXCEPTION 'blocked owner read client contacts';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_admin_report(
      establishment_id,
      date '2026-08-15',
      date '2026-08-15'
    );
    RAISE EXCEPTION 'blocked owner read reports';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'forbidden' THEN RAISE; END IF;
  END;
END;
$blocked_reads$;

ROLLBACK;
