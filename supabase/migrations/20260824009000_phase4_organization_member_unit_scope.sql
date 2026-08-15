BEGIN;

-- ============================================================================
-- PS4-E3 — Corporate Unit Scope Authority
-- Explicit establishment scoping for organization members (owner, manager, finance)
-- with strict isolation between corporate scope and establishment operational capabilities.
-- ============================================================================

-- 1. Add scope_mode to organization_members
ALTER TABLE public.organization_members
ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all'
CHECK (scope_mode IN ('all', 'selected'));

-- Ensure existing members are all defaulted to 'all'
UPDATE public.organization_members
SET scope_mode = 'all'
WHERE scope_mode IS NULL;

-- 2. Create organization_member_establishment_scopes table
CREATE TABLE IF NOT EXISTS public.organization_member_establishment_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_member_id uuid NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  granted_by uuid REFERENCES public.profiles(id),
  created_at timestamptz NOT NULL DEFAULT timezone('utc', now()),
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id),
  revocation_reason text
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_org_member_scope_active
ON public.organization_member_establishment_scopes(organization_member_id, establishment_id)
WHERE revoked_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_org_member_scope_lookup
ON public.organization_member_establishment_scopes(organization_id, establishment_id);

ALTER TABLE public.organization_member_establishment_scopes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Organization scopes are readable by owner or assigned member" ON public.organization_member_establishment_scopes;

CREATE POLICY "Organization scopes are readable by owner or assigned member"
ON public.organization_member_establishment_scopes
FOR SELECT
USING (
  public.has_organization_role(organization_id, ARRAY['owner'])
  OR EXISTS (
    SELECT 1 FROM public.organization_members member
    WHERE member.id = organization_member_establishment_scopes.organization_member_id
      AND member.profile_id = (SELECT auth.uid())
      AND member.status = 'active'
      AND member.revoked_at IS NULL
  )
  OR public.is_governance_user()
);

-- 3. Add scope columns to organization_invitations
ALTER TABLE public.organization_invitations
ADD COLUMN IF NOT EXISTS scope_mode text NOT NULL DEFAULT 'all'
CHECK (scope_mode IN ('all', 'selected'));

ALTER TABLE public.organization_invitations
ADD COLUMN IF NOT EXISTS target_establishment_ids uuid[] DEFAULT NULL;

-- 4. Canonical Primitive: has_organization_establishment_scope
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
     AND link.effective_until IS NULL
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

-- 5. Scope Management RPC (Owner Only)
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
    RAISE EXCEPTION 'owner_scope_must_be_all';
  END IF;

  IF target_member.role = 'finance' AND target_scope_mode = 'selected' THEN
    RAISE EXCEPTION 'finance_scope_requires_all';
  END IF;

  IF target_scope_mode = 'all' THEN
    -- Revoke existing active selected scopes
    UPDATE public.organization_member_establishment_scopes
    SET revoked_at = timezone('utc', now()),
        revoked_by = actor_id,
        revocation_reason = 'scope_mode_changed_to_all'
    WHERE organization_member_id = target_member.id
      AND revoked_at IS NULL;

    UPDATE public.organization_members
    SET scope_mode = 'all',
        updated_at = timezone('utc', now())
    WHERE id = target_member.id;

  ELSIF target_scope_mode = 'selected' THEN
    -- If establishment IDs provided, validate they belong to target organization actively
    IF target_establishment_ids IS NOT NULL AND array_length(target_establishment_ids, 1) > 0 THEN
      IF array_position(target_establishment_ids, NULL) IS NOT NULL THEN
        RAISE EXCEPTION 'invalid_target_establishment_id';
      END IF;

      -- Deduplicate target_establishment_ids
      SELECT ARRAY(SELECT DISTINCT u FROM unnest(target_establishment_ids) AS u WHERE u IS NOT NULL)
      INTO target_establishment_ids;

      SELECT count(DISTINCT link.establishment_id) INTO valid_count
      FROM public.organization_establishments link
      WHERE link.organization_id = target_organization_id
        AND link.status = 'active'
        AND link.effective_until IS NULL
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
            granted_by,
            created_at
          ) VALUES (
            target_organization_id,
            target_member.id,
            input_est_id,
            actor_id,
            timezone('utc', now())
          );
        END IF;
      END LOOP;
    ELSE
      -- Empty selection: revoke all active scopes
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

  -- Audit log
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

-- 6. Updated get_my_organizations
DROP FUNCTION IF EXISTS public.get_my_organizations();

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
          WHERE link.status = 'active' AND link.effective_until IS NULL
        )
      ELSE
        count(DISTINCT scope.establishment_id) FILTER (
          WHERE scope.revoked_at IS NULL
            AND link.status = 'active'
            AND link.effective_until IS NULL
        )
    END AS establishment_count
  FROM public.organization_members member
  JOIN public.organizations organization
    ON organization.id = member.organization_id
   AND organization.status = 'active'
  LEFT JOIN public.organization_establishments link
    ON link.organization_id = organization.id
   AND link.status = 'active'
   AND link.effective_until IS NULL
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

-- 7. Updated get_organization_context
DROP FUNCTION IF EXISTS public.get_organization_context(uuid);

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

  -- Establishments filtered by caller's scope
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
    AND link.effective_until IS NULL
    AND (
      member_record.role = 'owner'
      OR member_record.scope_mode = 'all'
      OR public.has_organization_establishment_scope(target_organization_id, est.id)
      OR public.is_governance_user()
    );

  -- Members list (with their scope_mode and scoped establishment IDs)
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'profileId', m.profile_id,
        'name', p.name,
        'role', m.role,
        'scope_mode', m.scope_mode,
        'scoped_establishment_ids', (
          SELECT COALESCE(jsonb_agg(s.establishment_id), '[]'::jsonb)
          FROM public.organization_member_establishment_scopes s
          WHERE s.organization_member_id = m.id
            AND s.revoked_at IS NULL
        ),
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

-- 8. Updated get_organization_report
DROP FUNCTION IF EXISTS public.get_organization_report(uuid, date, date);

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
  actor_id uuid := (SELECT auth.uid());
  member_record public.organization_members%ROWTYPE;
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

  -- Build aggregated report filtered strictly by caller's unit scope
  WITH scoped_units AS (
    SELECT est.id, est.name, est.timezone, est.currency
    FROM public.organization_establishments link
    JOIN public.establishments est ON est.id = link.establishment_id
    WHERE link.organization_id = target_organization_id
      AND link.status = 'active'
      AND link.effective_until IS NULL
      AND (
        member_record.role = 'owner'
        OR member_record.scope_mode = 'all'
        OR public.has_organization_establishment_scope(target_organization_id, est.id)
        OR public.is_governance_user()
      )
  ),
  unit_metrics AS (
    SELECT
      u.id AS establishment_id,
      u.name,
      u.timezone,
      u.currency,
      count(a.id) AS appointment_count,
      count(a.id) FILTER (WHERE a.status = 'completed') AS completed_count,
      count(a.id) FILTER (WHERE a.status = 'cancelled') AS cancelled_count,
      count(a.id) FILTER (WHERE a.status = 'confirmed') AS scheduled_count,
      COALESCE(sum(COALESCE(a.price_charged, s.price, 0)) FILTER (WHERE a.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(COALESCE(a.price_charged, s.price, 0)) FILTER (WHERE a.status = 'confirmed'), 0) AS scheduled_value,
      COALESCE(sum(a.duration_minutes) FILTER (WHERE a.status = 'completed'), 0) AS occupied_minutes,
      -- Available minutes estimation based on 8h/day * working days in range
      GREATEST((range_end - range_start + 1) * 8 * 60, 1) AS available_minutes,
      count(DISTINCT a.client_id) FILTER (WHERE a.status = 'completed') AS identified_clients,
      count(DISTINCT a.client_id) FILTER (WHERE a.status = 'completed' AND a.created_at::date BETWEEN range_start AND range_end) AS new_clients,
      count(DISTINCT a.client_id) FILTER (WHERE a.status = 'completed' AND a.created_at::date < range_start) AS returning_clients
    FROM scoped_units u
    LEFT JOIN public.appointments a
      ON a.establishment_id = u.id
     AND a.date_time::date BETWEEN range_start AND range_end
    LEFT JOIN public.services s
      ON s.id = a.service_id
    GROUP BY u.id, u.name, u.timezone, u.currency
  )
  SELECT jsonb_build_object(
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

-- 9. Modern Organization Invitation v2
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
      AND link.effective_until IS NULL
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

-- 10. Updated accept_organization_invitation
DROP FUNCTION IF EXISTS public.accept_organization_invitation(text);
DROP FUNCTION IF EXISTS public.accept_organization_invitation(text, uuid);

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

  SELECT lower(email) INTO actor_email
  FROM public.profiles
  WHERE id = actor_id;

  SELECT * INTO invitation
  FROM public.organization_invitations
  WHERE token_hash = encode(extensions.digest(target_invitation_token, 'sha256'), 'hex')
    AND status = 'pending'
    AND expires_at > timezone('utc', now());

  IF invitation.id IS NULL THEN
    RAISE EXCEPTION 'invalid_or_expired_invitation';
  END IF;

  IF lower(invitation.invited_email) <> actor_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch';
  END IF;

  -- TOCTOU / Temporal Integrity: Revalidate all target establishments actively at accept time!
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

    -- Concurrency row-locking & active link verification on organization_establishments
    PERFORM 1
    FROM public.organization_establishments link
    WHERE link.organization_id = invitation.organization_id
      AND link.status = 'active'
      AND link.effective_until IS NULL
      AND link.establishment_id = ANY(normalized_establishment_ids)
    FOR SHARE;

    SELECT count(DISTINCT link.establishment_id) INTO valid_count
    FROM public.organization_establishments link
    WHERE link.organization_id = invitation.organization_id
      AND link.status = 'active'
      AND link.effective_until IS NULL
      AND link.establishment_id = ANY(normalized_establishment_ids);

    IF valid_count <> array_length(normalized_establishment_ids, 1) THEN
      RAISE EXCEPTION 'invitation_scope_no_longer_valid';
    END IF;
  END IF;

  -- Upsert member record with scope_mode atomically
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

  -- Clean up any previous active scopes for this member (e.g. from prior revoked membership)
  UPDATE public.organization_member_establishment_scopes
  SET revoked_at = timezone('utc', now()),
      revoked_by = actor_id,
      revocation_reason = 'invitation_accepted_scope_refresh'
  WHERE organization_member_id = member_record.id
    AND revoked_at IS NULL;

  -- If invitation was selected scope, assign scopes atomically
  IF invitation.scope_mode = 'selected'
    AND normalized_establishment_ids IS NOT NULL
    AND array_length(normalized_establishment_ids, 1) > 0
  THEN
    FOREACH input_est_id IN ARRAY normalized_establishment_ids
    LOOP
      INSERT INTO public.organization_member_establishment_scopes (
        organization_id,
        organization_member_id,
        establishment_id,
        granted_by,
        created_at
      ) VALUES (
        invitation.organization_id,
        member_record.id,
        input_est_id,
        invitation.created_by,
        timezone('utc', now())
      );
    END LOOP;
  END IF;

  UPDATE public.organization_invitations
  SET status = 'accepted',
      accepted_by = actor_id,
      accepted_at = timezone('utc', now())
  WHERE id = invitation.id;

  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    target_profile_id,
    metadata
  ) VALUES (
    invitation.organization_id,
    actor_id,
    'organization.invitation_accepted',
    actor_id,
    jsonb_build_object(
      'invitation_id', invitation.id,
      'scope_mode', invitation.scope_mode,
      'establishment_ids', normalized_establishment_ids,
      'request_id', target_request_id
    )
  );

  RETURN invitation.organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.accept_organization_invitation(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text, uuid) TO authenticated, service_role;

-- 11. Updated transfer_organization_ownership
DROP FUNCTION IF EXISTS public.transfer_organization_ownership(uuid, uuid);

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
  target_organization_id uuid,
  target_profile_id uuid,
  target_request_id uuid DEFAULT NULL::uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  IF actor_id = target_profile_id THEN
    RAISE EXCEPTION 'cannot_transfer_to_self';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id
      AND status = 'active'
      AND revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'target_must_be_active_member';
  END IF;

  -- Former owner becomes manager with scope_mode = 'all'
  UPDATE public.organization_members
  SET role = 'manager',
      scope_mode = 'all',
      updated_at = timezone('utc', now())
  WHERE organization_id = target_organization_id
    AND profile_id = actor_id;

  -- New owner becomes owner with scope_mode = 'all'
  UPDATE public.organization_members
  SET role = 'owner',
      scope_mode = 'all',
      updated_at = timezone('utc', now())
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id;

  -- Clean up any selected scopes for new owner if previously existed
  UPDATE public.organization_member_establishment_scopes
  SET revoked_at = timezone('utc', now()),
      revoked_by = actor_id,
      revocation_reason = 'promoted_to_owner'
  WHERE organization_member_id = (
    SELECT id FROM public.organization_members
    WHERE organization_id = target_organization_id AND profile_id = target_profile_id
  ) AND revoked_at IS NULL;

  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    target_profile_id,
    metadata
  ) VALUES (
    target_organization_id,
    actor_id,
    'organization.ownership_transferred',
    target_profile_id,
    jsonb_build_object('request_id', target_request_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid, uuid) TO authenticated, service_role;

-- 12. Updated update_organization_member_role
DROP FUNCTION IF EXISTS public.update_organization_member_role(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.update_organization_member_role(
  target_organization_id uuid,
  target_profile_id uuid,
  target_role text,
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
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  IF target_role NOT IN ('manager', 'finance') THEN
    RAISE EXCEPTION 'invalid_organization_role';
  END IF;

  SELECT * INTO target_member
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id
    AND status = 'active'
    AND revoked_at IS NULL;

  IF target_member.id IS NULL THEN
    RAISE EXCEPTION 'organization_member_not_found';
  END IF;

  IF target_member.role = 'owner' THEN
    RAISE EXCEPTION 'owner_role_requires_transfer';
  END IF;

  IF target_role = 'finance' THEN
    -- Finance must be scope_mode = 'all'
    UPDATE public.organization_member_establishment_scopes
    SET revoked_at = timezone('utc', now()),
        revoked_by = actor_id,
        revocation_reason = 'promoted_to_finance'
    WHERE organization_member_id = target_member.id
      AND revoked_at IS NULL;

    UPDATE public.organization_members
    SET role = 'finance',
        scope_mode = 'all',
        updated_at = timezone('utc', now())
    WHERE id = target_member.id;
  ELSE
    UPDATE public.organization_members
    SET role = target_role,
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
    'organization.member_role_updated',
    target_profile_id,
    jsonb_build_object(
      'previous_role', target_member.role,
      'new_role', target_role,
      'previous_scope_mode', target_member.scope_mode,
      'new_scope_mode', CASE WHEN target_role = 'finance' THEN 'all' ELSE target_member.scope_mode END,
      'scope_expanded', CASE WHEN target_member.scope_mode = 'selected' AND target_role = 'finance' THEN true ELSE false END,
      'role', target_role,
      'request_id', target_request_id
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.update_organization_member_role(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_organization_member_role(uuid, uuid, text, uuid) TO authenticated, service_role;

-- 13. Updated revoke_organization_member
DROP FUNCTION IF EXISTS public.revoke_organization_member(uuid, uuid);
DROP FUNCTION IF EXISTS public.revoke_organization_member(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.revoke_organization_member(
  target_organization_id uuid,
  target_profile_id uuid,
  target_reason text DEFAULT NULL::text,
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
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  SELECT * INTO target_member
  FROM public.organization_members
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id
    AND status = 'active'
    AND revoked_at IS NULL;

  IF target_member.id IS NULL THEN
    RAISE EXCEPTION 'organization_member_not_found';
  END IF;

  IF target_member.role = 'owner' THEN
    RAISE EXCEPTION 'cannot_revoke_owner';
  END IF;

  UPDATE public.organization_members
  SET status = 'revoked',
      revoked_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = target_member.id;

  UPDATE public.organization_member_establishment_scopes
  SET revoked_at = timezone('utc', now()),
      revoked_by = actor_id,
      revocation_reason = 'member_revoked'
  WHERE organization_member_id = target_member.id
    AND revoked_at IS NULL;

  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    target_profile_id,
    metadata
  ) VALUES (
    target_organization_id,
    actor_id,
    'organization.member_revoked',
    target_profile_id,
    jsonb_build_object('reason', target_reason, 'request_id', target_request_id)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.revoke_organization_member(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.revoke_organization_member(uuid, uuid, text, uuid) TO authenticated, service_role;

-- 14. Updated remove_organization_establishment (cleans up active member scopes on removed unit)
CREATE OR REPLACE FUNCTION public.remove_organization_establishment(
  target_organization_id uuid,
  target_establishment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;

  IF (
    SELECT count(*) FROM public.organization_establishments
    WHERE organization_id = target_organization_id
      AND status = 'active' AND effective_until IS NULL
  ) <= 1 THEN
    RAISE EXCEPTION 'organization_requires_one_establishment';
  END IF;

  UPDATE public.organization_establishments
  SET status = 'removed',
      effective_until = CURRENT_DATE,
      updated_at = timezone('utc', now())
  WHERE organization_id = target_organization_id
    AND establishment_id = target_establishment_id
    AND status = 'active'
    AND effective_until IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'organization_establishment_not_found';
  END IF;

  -- Revoke active scopes assigned to members for this establishment
  UPDATE public.organization_member_establishment_scopes
  SET revoked_at = timezone('utc', now()),
      revoked_by = actor_id,
      revocation_reason = 'establishment_removed_from_organization'
  WHERE organization_id = target_organization_id
    AND establishment_id = target_establishment_id
    AND revoked_at IS NULL;

  INSERT INTO public.organization_audit_log (
    organization_id,
    actor_id,
    action,
    establishment_id
  ) VALUES (
    target_organization_id,
    actor_id,
    'organization.establishment_removed',
    target_establishment_id
  );

  UPDATE public.subscription_units unit
  SET effective_until = subscription.current_period_end
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE unit.subscription_id = subscription.id
    AND unit.establishment_id = target_establishment_id
    AND unit.effective_until IS NULL
    AND account.organization_id = target_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.remove_organization_establishment(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_organization_establishment(uuid, uuid) TO authenticated, service_role;

-- 15. Scoped RLS on organization_establishments
DROP POLICY IF EXISTS "Members view organization establishments" ON public.organization_establishments;

CREATE POLICY "Members view organization establishments"
ON public.organization_establishments
FOR SELECT
USING (
  public.has_organization_establishment_scope(organization_id, establishment_id)
  OR public.has_organization_role(organization_id, ARRAY['owner'])
  OR public.is_governance_user()
);

-- 16. Scoped RLS on organization_audit_log
DROP POLICY IF EXISTS "Members view organization audit" ON public.organization_audit_log;

CREATE POLICY "Members view organization audit"
ON public.organization_audit_log
FOR SELECT
USING (
  public.has_organization_role(organization_id, ARRAY['owner', 'finance'])
  OR (
    public.has_organization_role(organization_id, ARRAY['manager'])
    AND (
      -- Manager with 'all' scope
      EXISTS (
        SELECT 1 FROM public.organization_members
        WHERE organization_id = public.organization_audit_log.organization_id
          AND profile_id = (SELECT auth.uid())
          AND status = 'active'
          AND scope_mode = 'all'
          AND revoked_at IS NULL
      )
      -- OR Event explicitly tied to an establishment in caller's scope
      OR (
        establishment_id IS NOT NULL
        AND public.has_organization_establishment_scope(organization_id, establishment_id)
      )
      -- OR Org-level event with metadata establishment_id in caller's scope
      OR (
        establishment_id IS NULL
        AND (metadata->>'establishment_id') IS NOT NULL
        AND public.has_organization_establishment_scope(organization_id, (metadata->>'establishment_id')::uuid)
      )
      -- OR Org-level event with NO establishment references in metadata
      OR (
        establishment_id IS NULL
        AND (metadata->>'establishment_id') IS NULL
        AND (metadata->>'target_establishment_id') IS NULL
        AND (metadata->'establishment_ids') IS NULL
        AND (metadata->'target_establishment_ids') IS NULL
      )
    )
  )
  OR public.is_governance_user()
);

COMMIT;
