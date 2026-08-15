-- ============================================================================
-- Migration: 20260824010000_phase4_corporate_contract_preservation.sql
-- Module: PS4-E3.3 Corporate Contract Preservation & Invitation Concurrency Hardening
--
-- Invariants enforced:
-- 1. get_organization_report preserves exact pre-PS4 metric calculations:
--    - range validation (end < start or end - start > 366 => invalid_report_range)
--    - appointment filter (deleted_at IS NULL)
--    - local date filtering ((appointment.date_time AT TIME ZONE unit.timezone)::date BETWEEN range_start AND range_end)
--    - scheduled_count & scheduled_value (status IN ('pending', 'confirmed'))
--    - occupied_minutes (status IN ('pending', 'confirmed', 'completed'))
--    - available_minutes via public.admin_report_available_minutes(unit.id, range_start, range_end, NULL)
--    - new_clients vs returning_clients based on prior completed appointments
--    - ONLY difference is filtering units by corporate scope authority.
-- 2. get_organization_context member scope privacy:
--    - Owners & governance receive full delegation topology.
--    - Non-owners (managers/finance) do NOT receive other members' scoped_establishment_ids.
-- 3. accept_organization_invitation identity & concurrency hardening:
--    - Verified email required from auth.users (email_confirmed_at IS NOT NULL).
--    - Invitation locked with FOR UPDATE to serialize concurrent acceptance attempts.
--    - Strict lock order: (1) invitation row lock, (2) verified email check, (3) target establishment link lock FOR SHARE, (4) member/scope mutation, (5) mark accepted, (6) audit log.
-- 4. effective_from & effective_until temporal link integrity:
--    - All corporate unit scoping checks require link.effective_from <= CURRENT_DATE AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE).
-- ============================================================================

BEGIN;

-- 1. Redefine has_organization_establishment_scope with temporal validity
CREATE OR REPLACE FUNCTION public.has_organization_establishment_scope(
  target_organization_id uuid,
  target_establishment_id uuid,
  allowed_roles text[] DEFAULT NULL::text[]
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members member
    JOIN public.organizations organization
      ON organization.id = member.organization_id
     AND organization.status = 'active'
    JOIN public.organization_establishments link
      ON link.organization_id = member.organization_id
     AND link.establishment_id = target_establishment_id
     AND link.status = 'active'
     AND link.effective_from <= CURRENT_DATE
     AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
    WHERE member.organization_id = target_organization_id
      AND member.profile_id = (SELECT auth.uid())
      AND member.status = 'active'
      AND member.revoked_at IS NULL
      AND (allowed_roles IS NULL OR member.role = ANY(allowed_roles))
      AND (
        member.role = 'owner'
        OR member.scope_mode = 'all'
        OR (
          member.scope_mode = 'selected'
          AND EXISTS (
            SELECT 1
            FROM public.organization_member_establishment_scopes scope
            WHERE scope.organization_member_id = member.id
              AND scope.establishment_id = target_establishment_id
              AND scope.revoked_at IS NULL
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.has_organization_establishment_scope(uuid, uuid, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_organization_establishment_scope(uuid, uuid, text[]) TO authenticated, service_role;

-- 2. Redefine set_organization_member_unit_scope with temporal validity
CREATE OR REPLACE FUNCTION public.set_organization_member_unit_scope(
  target_organization_id uuid,
  target_profile_id uuid,
  target_scope_mode text,
  target_establishment_ids uuid[] DEFAULT NULL::uuid[],
  target_request_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_member public.organization_members%ROWTYPE;
  valid_count integer;
  input_est_id uuid;
  existing_request_metadata jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  IF target_scope_mode NOT IN ('all', 'selected') THEN
    RAISE EXCEPTION 'invalid_scope_mode';
  END IF;

  -- Normalize target_establishment_ids
  IF target_scope_mode = 'selected' AND target_establishment_ids IS NOT NULL THEN
    IF array_position(target_establishment_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_target_establishment_id';
    END IF;
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(target_establishment_ids) AS u WHERE u IS NOT NULL ORDER BY u)
    INTO target_establishment_ids;
  ELSE
    target_establishment_ids := NULL;
  END IF;

  -- Idempotency check on target_request_id
  IF target_request_id IS NOT NULL THEN
    SELECT metadata INTO existing_request_metadata
    FROM public.organization_audit_log
    WHERE organization_id = target_organization_id
      AND action = 'organization.member_unit_scope_updated'
      AND metadata->>'request_id' = target_request_id::text
    LIMIT 1;

    IF existing_request_metadata IS NOT NULL THEN
      IF (existing_request_metadata->>'target_profile_id')::uuid = target_profile_id
        AND (existing_request_metadata->>'scope_mode') = target_scope_mode
        AND (
          (target_scope_mode = 'all' AND (existing_request_metadata->'target_establishment_ids' IS NULL OR jsonb_array_length(existing_request_metadata->'target_establishment_ids') = 0))
          OR
          (existing_request_metadata->'target_establishment_ids' = to_jsonb(target_establishment_ids))
        )
      THEN
        -- Safe idempotent replay
        RETURN;
      ELSE
        RAISE EXCEPTION 'idempotency_key_reused';
      END IF;
    END IF;
  END IF;

  -- Lock member row
  SELECT * INTO target_member
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id
    AND status = 'active'
    AND revoked_at IS NULL
  FOR UPDATE;

  IF target_member.id IS NULL THEN
    RAISE EXCEPTION 'organization_member_not_found';
  END IF;

  IF target_member.role = 'owner' AND target_scope_mode = 'selected' THEN
    RAISE EXCEPTION 'owner_scope_requires_all';
  END IF;

  IF target_member.role = 'finance' AND target_scope_mode = 'selected' THEN
    RAISE EXCEPTION 'finance_scope_requires_all';
  END IF;

  IF target_scope_mode = 'all' THEN
    -- Revoke any active specific scopes when switching to 'all'
    UPDATE public.organization_member_establishment_scopes
    SET revoked_at = timezone('utc', now()),
        revoked_by = actor_id,
        revocation_reason = 'switched_to_all_scope'
    WHERE organization_member_id = target_member.id
      AND revoked_at IS NULL;

    UPDATE public.organization_members
    SET scope_mode = 'all',
        updated_at = timezone('utc', now())
    WHERE id = target_member.id;

  ELSIF target_scope_mode = 'selected' THEN
    -- If establishment IDs provided, validate they belong to target organization actively and currently effective
    IF target_establishment_ids IS NOT NULL AND array_length(target_establishment_ids, 1) > 0 THEN
      SELECT count(DISTINCT link.establishment_id) INTO valid_count
      FROM public.organization_establishments link
      WHERE link.organization_id = target_organization_id
        AND link.status = 'active'
        AND link.effective_from <= CURRENT_DATE
        AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
        AND link.establishment_id = ANY(target_establishment_ids);

      IF valid_count <> array_length(target_establishment_ids, 1) THEN
        RAISE EXCEPTION 'establishment_not_in_organization';
      END IF;

      -- Revoke active scopes not in target_establishment_ids
      UPDATE public.organization_member_establishment_scopes
      SET revoked_at = timezone('utc', now()),
          revoked_by = actor_id,
          revocation_reason = 'scope_removed_by_owner'
      WHERE organization_member_id = target_member.id
        AND revoked_at IS NULL
        AND establishment_id <> ALL(target_establishment_ids);

      -- Insert missing scopes
      FOREACH input_est_id IN ARRAY target_establishment_ids
      LOOP
        IF NOT EXISTS (
          SELECT 1 FROM public.organization_member_establishment_scopes
          WHERE organization_member_id = target_member.id
            AND establishment_id = input_est_id
            AND revoked_at IS NULL
        ) THEN
          INSERT INTO public.organization_member_establishment_scopes (
            organization_id,
            organization_member_id,
            establishment_id,
            granted_by
          ) VALUES (
            target_organization_id,
            target_member.id,
            input_est_id,
            actor_id
          );
        END IF;
      END LOOP;
    ELSE
      -- Empty target list: revoke all existing scopes
      UPDATE public.organization_member_establishment_scopes
      SET revoked_at = timezone('utc', now()),
          revoked_by = actor_id,
          revocation_reason = 'scope_cleared_by_owner'
      WHERE organization_member_id = target_member.id
        AND revoked_at IS NULL;
    END IF;

    UPDATE public.organization_members
    SET scope_mode = 'selected',
        updated_at = timezone('utc', now())
    WHERE id = target_member.id;
  END IF;

  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    target_profile_id,
    metadata
  ) VALUES (
    target_organization_id,
    actor_id,
    'organization.member_unit_scope_updated',
    target_profile_id,
    jsonb_build_object(
      'target_profile_id', target_profile_id,
      'previous_scope_mode', target_member.scope_mode,
      'scope_mode', target_scope_mode,
      'target_establishment_ids', target_establishment_ids,
      'request_id', target_request_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_organization_member_unit_scope(uuid, uuid, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_organization_member_unit_scope(uuid, uuid, text, uuid[], uuid) TO authenticated, service_role;

-- 3. Redefine get_my_organizations with temporal validity
CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_status text,
  member_role text,
  scope_mode text,
  establishment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    organization.id,
    organization.name,
    organization.status,
    member.role,
    member.scope_mode,
    CASE
      WHEN member.role = 'owner' OR member.scope_mode = 'all' THEN
        count(DISTINCT link.id) FILTER (
          WHERE link.status = 'active'
            AND link.effective_from <= CURRENT_DATE
            AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
        )
      ELSE
        count(DISTINCT scope.establishment_id) FILTER (
          WHERE scope.revoked_at IS NULL
            AND link.status = 'active'
            AND link.effective_from <= CURRENT_DATE
            AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
        )
    END AS establishment_count
  FROM public.organization_members member
  JOIN public.organizations organization
    ON organization.id = member.organization_id
   AND organization.status = 'active'
  LEFT JOIN public.organization_establishments link
    ON link.organization_id = organization.id
   AND link.status = 'active'
   AND link.effective_from <= CURRENT_DATE
   AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
  LEFT JOIN public.organization_member_establishment_scopes scope
    ON scope.organization_member_id = member.id
   AND scope.establishment_id = link.establishment_id
   AND scope.revoked_at IS NULL
  WHERE member.profile_id = (SELECT auth.uid())
    AND member.status = 'active'
    AND member.revoked_at IS NULL
  GROUP BY organization.id, organization.name, organization.status, member.role, member.scope_mode
  ORDER BY organization.name;
$$;

REVOKE ALL ON FUNCTION public.get_my_organizations() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated, service_role;

-- 4. Redefine get_organization_context with member scope privacy and temporal validity
CREATE OR REPLACE FUNCTION public.get_organization_context(target_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  member_record public.organization_members%ROWTYPE;
  org_record public.organizations%ROWTYPE;
  scoped_establishments jsonb;
  org_members jsonb;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  SELECT * INTO member_record
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND profile_id = actor_id
    AND status = 'active'
    AND revoked_at IS NULL;

  IF member_record.id IS NULL AND NOT public.is_governance_user() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO org_record
  FROM public.organizations
  WHERE id = target_organization_id
    AND status = 'active';

  IF org_record.id IS NULL THEN
    RAISE EXCEPTION 'organization_not_found';
  END IF;

  -- Establishments filtered by caller's scope and effective dates
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', est.id,
        'name', est.name,
        'slug', est.slug,
        'timezone', est.timezone,
        'currency', est.currency,
        'account_status', est.account_status
      )
      ORDER BY est.name
    ),
    '[]'::jsonb
  ) INTO scoped_establishments
  FROM public.organization_establishments link
  JOIN public.establishments est ON est.id = link.establishment_id
  WHERE link.organization_id = target_organization_id
    AND link.status = 'active'
    AND link.effective_from <= CURRENT_DATE
    AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
    AND (
      member_record.role = 'owner'
      OR member_record.scope_mode = 'all'
      OR public.has_organization_establishment_scope(target_organization_id, est.id)
      OR public.is_governance_user()
    );

  -- Members list: Privacy-preserving delegation disclosure
  -- Owners & governance receive full delegation topology.
  -- Non-owners receive member identity/role, but scoped_establishment_ids only for themselves, NULL for others.
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'profileId', m.profile_id,
        'name', p.name,
        'role', m.role,
        'scope_mode', m.scope_mode,
        'scoped_establishment_ids', CASE
          WHEN member_record.role = 'owner' OR public.is_governance_user() OR m.profile_id = actor_id THEN
            (
              SELECT COALESCE(jsonb_agg(s.establishment_id), '[]'::jsonb)
              FROM public.organization_member_establishment_scopes s
              WHERE s.organization_member_id = m.id
                AND s.revoked_at IS NULL
            )
          ELSE NULL
        END,
        'status', m.status
      )
      ORDER BY m.created_at
    ),
    '[]'::jsonb
  ) INTO org_members
  FROM public.organization_members m
  JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.organization_id = target_organization_id
    AND m.status = 'active'
    AND m.revoked_at IS NULL;

  result := jsonb_build_object(
    'organization', jsonb_build_object(
      'id', org_record.id,
      'name', org_record.name,
      'status', org_record.status
    ),
    'role', COALESCE(member_record.role, 'manager'),
    'scope_mode', COALESCE(member_record.scope_mode, 'all'),
    'establishments', scoped_establishments,
    'members', org_members
  );

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_context(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_context(uuid) TO authenticated, service_role;

-- 5. Redefine get_organization_report preserving exact pre-PS4 metric calculations + corporate scope filtering
CREATE OR REPLACE FUNCTION public.get_organization_report(
  target_organization_id uuid,
  range_start date,
  range_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF range_start IS NULL OR range_end IS NULL OR range_end < range_start OR range_end - range_start > 366 THEN
    RAISE EXCEPTION 'invalid_report_range';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner', 'manager', 'finance']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH units AS (
    SELECT establishment.id, establishment.name, establishment.timezone, establishment.currency
    FROM public.organization_establishments link
    JOIN public.establishments establishment ON establishment.id = link.establishment_id
    WHERE link.organization_id = target_organization_id
      AND link.status = 'active'
      AND link.effective_from <= CURRENT_DATE
      AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
      AND public.has_organization_establishment_scope(target_organization_id, link.establishment_id)
  ), unit_metrics AS (
    SELECT unit.id, unit.name, unit.timezone, unit.currency,
      count(appointment.id) AS appointment_count,
      count(*) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed')) AS scheduled_count,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(appointment.price_charged) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status IN ('pending', 'confirmed', 'completed')), 0) AS occupied_minutes,
      public.admin_report_available_minutes(unit.id, range_start, range_end, NULL) AS available_minutes,
      count(DISTINCT appointment.client_id) FILTER (WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed') AS identified_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS new_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS returning_clients
    FROM units unit
    LEFT JOIN public.appointments appointment
      ON appointment.establishment_id = unit.id
     AND appointment.deleted_at IS NULL
     AND (appointment.date_time AT TIME ZONE unit.timezone)::date BETWEEN range_start AND range_end
    LEFT JOIN public.services service ON service.id = appointment.service_id
    GROUP BY unit.id, unit.name, unit.timezone, unit.currency
  )
  SELECT jsonb_build_object(
    'organization_id', target_organization_id,
    'range_start', range_start,
    'range_end', range_end,
    'appointment_count', COALESCE(sum(appointment_count), 0),
    'completed_count', COALESCE(sum(completed_count), 0),
    'cancelled_count', COALESCE(sum(cancelled_count), 0),
    'scheduled_count', COALESCE(sum(scheduled_count), 0),
    'production_realized', COALESCE(sum(production_realized), 0),
    'scheduled_value', COALESCE(sum(scheduled_value), 0),
    'average_ticket', CASE WHEN sum(completed_count) > 0
      THEN round(sum(production_realized) / sum(completed_count), 2) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(occupied_minutes), 0),
    'available_minutes', COALESCE(sum(available_minutes), 0),
    'occupancy_rate', CASE WHEN sum(available_minutes) > 0
      THEN round(LEAST(sum(occupied_minutes) * 100.0 / sum(available_minutes), 100), 1) ELSE 0 END,
    'identified_clients', COALESCE(sum(identified_clients), 0),
    'new_clients', COALESCE(sum(new_clients), 0),
    'returning_clients', COALESCE(sum(returning_clients), 0),
    'units', COALESCE(jsonb_agg(to_jsonb(unit_metrics) ORDER BY name), '[]'::jsonb)
  ) INTO result
  FROM unit_metrics;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_organization_report(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_organization_report(uuid, date, date) TO authenticated, service_role;

-- 6. Redefine invite_organization_member_v2 with temporal validity
CREATE OR REPLACE FUNCTION public.invite_organization_member_v2(
  target_organization_id uuid,
  invited_email text,
  target_role text,
  target_scope_mode text DEFAULT 'all',
  target_establishment_ids uuid[] DEFAULT NULL::uuid[],
  target_request_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(invitation_id uuid, invitation_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_email text := lower(btrim(invited_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  created_invitation public.organization_invitations%ROWTYPE;
  valid_count integer;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;

  IF target_role NOT IN ('manager', 'finance') THEN
    RAISE EXCEPTION 'invalid_organization_role';
  END IF;

  IF target_scope_mode NOT IN ('all', 'selected') THEN
    RAISE EXCEPTION 'invalid_scope_mode';
  END IF;

  IF target_role = 'finance' AND target_scope_mode = 'selected' THEN
    RAISE EXCEPTION 'finance_scope_requires_all';
  END IF;

  IF target_scope_mode = 'selected' THEN
    IF target_establishment_ids IS NULL OR COALESCE(cardinality(target_establishment_ids), 0) = 0 THEN
      RAISE EXCEPTION 'target_establishments_required_for_selected_scope';
    END IF;

    IF array_position(target_establishment_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_target_establishment_id';
    END IF;

    -- Deduplicate target_establishment_ids
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(target_establishment_ids) AS u WHERE u IS NOT NULL ORDER BY u)
    INTO target_establishment_ids;

    SELECT count(DISTINCT link.establishment_id) INTO valid_count
    FROM public.organization_establishments link
    WHERE link.organization_id = target_organization_id
      AND link.status = 'active'
      AND link.effective_from <= CURRENT_DATE
      AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
      AND link.establishment_id = ANY(target_establishment_ids);

    IF valid_count <> array_length(target_establishment_ids, 1) THEN
      RAISE EXCEPTION 'establishment_not_in_organization';
    END IF;
  END IF;

  UPDATE public.organization_invitations
  SET status = 'revoked'
  WHERE organization_id = target_organization_id
    AND lower(organization_invitations.invited_email) = normalized_email
    AND status = 'pending';

  INSERT INTO public.organization_invitations (
    organization_id,
    invited_email,
    role,
    scope_mode,
    target_establishment_ids,
    token_hash,
    expires_at,
    created_by
  ) VALUES (
    target_organization_id,
    normalized_email,
    target_role,
    target_scope_mode,
    CASE WHEN target_scope_mode = 'selected' THEN target_establishment_ids ELSE NULL END,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    timezone('utc', now()) + interval '7 days',
    actor_id
  ) RETURNING * INTO created_invitation;

  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    metadata
  ) VALUES (
    target_organization_id,
    actor_id,
    'organization.member_invited',
    jsonb_build_object(
      'invitation_id', created_invitation.id,
      'role', target_role,
      'scope_mode', target_scope_mode,
      'establishment_ids', target_establishment_ids,
      'request_id', target_request_id
    )
  );

  RETURN QUERY SELECT created_invitation.id, raw_token, created_invitation.expires_at;
END;
$$;

REVOKE ALL ON FUNCTION public.invite_organization_member_v2(uuid, text, text, text, uuid[], uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invite_organization_member_v2(uuid, text, text, text, uuid[], uuid) TO authenticated, service_role;

-- 7. Redefine accept_organization_invitation with FOR UPDATE locking, verified email check, and temporal validity
CREATE OR REPLACE FUNCTION public.accept_organization_invitation(
  target_invitation_token text,
  target_request_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_email text;
  invitation public.organization_invitations%ROWTYPE;
  member_record public.organization_members%ROWTYPE;
  input_est_id uuid;
  valid_count integer;
  normalized_establishment_ids uuid[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  -- 1. Lock invitation row immediately to serialize concurrent attempts
  SELECT * INTO invitation
  FROM public.organization_invitations
  WHERE token_hash = encode(extensions.digest(target_invitation_token, 'sha256'), 'hex')
    AND status = 'pending'
    AND expires_at > timezone('utc', now())
  FOR UPDATE;

  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  -- 2. Validate actor and require confirmed email in auth.users
  SELECT lower(email) INTO actor_email
  FROM auth.users
  WHERE id = actor_id
    AND email_confirmed_at IS NOT NULL;

  IF actor_email IS NULL THEN
    RAISE EXCEPTION 'verified_email_required';
  END IF;

  IF lower(invitation.invited_email) <> actor_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch';
  END IF;

  -- 3. Lock & revalidate target establishment links with FOR SHARE
  IF invitation.scope_mode = 'selected' THEN
    IF invitation.target_establishment_ids IS NULL OR COALESCE(cardinality(invitation.target_establishment_ids), 0) = 0 THEN
      RAISE EXCEPTION 'target_establishments_required_for_selected_scope';
    END IF;

    IF array_position(invitation.target_establishment_ids, NULL) IS NOT NULL THEN
      RAISE EXCEPTION 'invalid_target_establishment_id';
    END IF;

    -- Deduplicate normalized array for acceptance
    SELECT ARRAY(SELECT DISTINCT u FROM unnest(invitation.target_establishment_ids) AS u WHERE u IS NOT NULL ORDER BY u)
    INTO normalized_establishment_ids;

    -- Concurrency row-locking & active currently effective link verification
    PERFORM 1
    FROM public.organization_establishments link
    WHERE link.organization_id = invitation.organization_id
      AND link.status = 'active'
      AND link.effective_from <= CURRENT_DATE
      AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
      AND link.establishment_id = ANY(normalized_establishment_ids)
    FOR SHARE;

    SELECT count(DISTINCT link.establishment_id) INTO valid_count
    FROM public.organization_establishments link
    WHERE link.organization_id = invitation.organization_id
      AND link.status = 'active'
      AND link.effective_from <= CURRENT_DATE
      AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
      AND link.establishment_id = ANY(normalized_establishment_ids);

    IF valid_count <> array_length(normalized_establishment_ids, 1) THEN
      RAISE EXCEPTION 'invitation_scope_no_longer_valid';
    END IF;
  END IF;

  -- 4. Upsert member record with scope_mode atomically
  INSERT INTO public.organization_members (
    organization_id,
    profile_id,
    role,
    scope_mode,
    status
  ) VALUES (
    invitation.organization_id,
    actor_id,
    invitation.role,
    COALESCE(invitation.scope_mode, 'all'),
    'active'
  )
  ON CONFLICT (organization_id, profile_id)
  DO UPDATE SET
    role = EXCLUDED.role,
    scope_mode = EXCLUDED.scope_mode,
    status = 'active',
    revoked_at = NULL,
    updated_at = timezone('utc', now())
  RETURNING * INTO member_record;

  -- 5. Scope mutation
  IF invitation.scope_mode = 'all' THEN
    UPDATE public.organization_member_establishment_scopes
    SET revoked_at = timezone('utc', now()),
        revoked_by = actor_id,
        revocation_reason = 'accepted_all_scope_invitation'
    WHERE organization_member_id = member_record.id
      AND revoked_at IS NULL;
  ELSIF invitation.scope_mode = 'selected' THEN
    -- Soft-revoke any old scopes not in invitation
    UPDATE public.organization_member_establishment_scopes
    SET revoked_at = timezone('utc', now()),
        revoked_by = actor_id,
        revocation_reason = 'reassigned_by_invitation'
    WHERE organization_member_id = member_record.id
      AND revoked_at IS NULL
      AND establishment_id <> ALL(normalized_establishment_ids);

    FOREACH input_est_id IN ARRAY normalized_establishment_ids
    LOOP
      IF NOT EXISTS (
        SELECT 1 FROM public.organization_member_establishment_scopes
        WHERE organization_member_id = member_record.id
          AND establishment_id = input_est_id
          AND revoked_at IS NULL
      ) THEN
        INSERT INTO public.organization_member_establishment_scopes (
          organization_id,
          organization_member_id,
          establishment_id,
          granted_by
        ) VALUES (
          invitation.organization_id,
          member_record.id,
          input_est_id,
          invitation.created_by
        );
      END IF;
    END LOOP;
  END IF;

  -- 6. Mark invitation accepted
  UPDATE public.organization_invitations
  SET status = 'accepted',
      accepted_at = timezone('utc', now()),
      accepted_by = actor_id
  WHERE id = invitation.id;

  -- 7. Audit log
  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    target_profile_id,
    metadata
  ) VALUES (
    invitation.organization_id,
    actor_id,
    'organization.member_accepted_invite',
    actor_id,
    jsonb_build_object(
      'invitation_id', invitation.id,
      'role', invitation.role,
      'scope_mode', invitation.scope_mode,
      'establishment_ids', normalized_establishment_ids,
      'request_id', target_request_id
    )
  );

  RETURN member_record.id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text, uuid) TO authenticated, service_role;

COMMIT;
