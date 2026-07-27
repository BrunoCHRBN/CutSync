BEGIN;

SET LOCAL search_path = pg_catalog, public;

-- Internal identity resolver. Local memberships remain authoritative for
-- operational access. Organization roles can refine an admin membership into
-- owner, but never create access without that local membership.
CREATE OR REPLACE FUNCTION public.resolve_business_operational_identity(
  target_establishment_id uuid,
  target_profile_id uuid
)
RETURNS TABLE (
  membership_id uuid,
  membership_role text,
  operational_role text,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH active_membership AS (
    SELECT membership.id, membership.role
    FROM public.memberships AS membership
    WHERE membership.profile_id = target_profile_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
    LIMIT 1
  ),
  active_organization AS (
    SELECT link.organization_id
    FROM public.organization_establishments AS link
    JOIN public.organizations AS organization
      ON organization.id = link.organization_id
     AND organization.status = 'active'
    WHERE link.establishment_id = target_establishment_id
      AND link.status = 'active'
      AND link.effective_from <= CURRENT_DATE
      AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
    ORDER BY link.effective_from DESC, link.created_at DESC
    LIMIT 1
  )
  SELECT
    membership.id,
    membership.role,
    CASE
      WHEN membership.role = 'professional' THEN 'professional'
      WHEN organization.organization_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.organization_members AS organization_member
          WHERE organization_member.organization_id = organization.organization_id
            AND organization_member.profile_id = target_profile_id
            AND organization_member.role = 'owner'
            AND organization_member.status = 'active'
            AND organization_member.revoked_at IS NULL
        )
      THEN 'owner'
      WHEN organization.organization_id IS NULL
        AND EXISTS (
          SELECT 1
          FROM public.billing_accounts AS billing_account
          WHERE billing_account.establishment_id = target_establishment_id
            AND billing_account.billing_owner_profile_id = target_profile_id
            AND billing_account.owner_resolution_status = 'confirmed'
        )
      THEN 'owner'
      ELSE 'admin'
    END,
    organization.organization_id
  FROM active_membership AS membership
  LEFT JOIN active_organization AS organization ON true;
$$;

CREATE OR REPLACE FUNCTION public.resolve_business_operational_capabilities(
  target_establishment_id uuid,
  target_profile_id uuid,
  target_access_mode text
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  identity_record record;
  team_agendas_shared boolean := false;
  capabilities text[] := ARRAY[]::text[];
BEGIN
  IF target_access_mode NOT IN ('full', 'read_only') THEN
    RETURN capabilities;
  END IF;

  SELECT *
  INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id,
    target_profile_id
  )
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN capabilities;
  END IF;

  SELECT COALESCE(establishment.share_agendas, false)
  INTO team_agendas_shared
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  capabilities := ARRAY[
    'view_own_agenda',
    'view_services',
    'view_own_commission'
  ];

  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'view_team_agenda',
      'view_unit_reports'
    ];
  ELSIF team_agendas_shared THEN
    capabilities := capabilities || ARRAY['view_team_agenda'];
  END IF;

  IF target_access_mode = 'read_only' THEN
    RETURN capabilities;
  END IF;

  capabilities := capabilities || ARRAY[
    'create_self_walk_in',
    'manage_own_blocks'
  ];

  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'create_team_walk_in',
      'manage_team_blocks',
      'manage_services',
      'manage_team',
      'manage_operational_settings'
    ];
  END IF;

  IF identity_record.operational_role = 'owner' THEN
    capabilities := capabilities || ARRAY['manage_admins'];
  END IF;

  RETURN capabilities;
END;
$$;

-- Safe, current-actor predicates used by RLS and operational RPCs.
CREATE OR REPLACE FUNCTION public.has_business_capability(
  target_establishment_id uuid,
  target_capability text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    target_capability = ANY(
      public.resolve_business_operational_capabilities(
        target_establishment_id,
        (SELECT auth.uid()),
        COALESCE((
          SELECT billing.access_mode
          FROM public.resolve_business_billing_context(
            target_establishment_id
          ) AS billing
          LIMIT 1
        ), 'blocked')
      )
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.is_business_administrator(
  target_establishment_id uuid,
  require_full_access boolean DEFAULT false
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH identity AS (
    SELECT resolved.operational_role
    FROM public.resolve_business_operational_identity(
      target_establishment_id,
      (SELECT auth.uid())
    ) AS resolved
  ),
  access AS (
    SELECT COALESCE((
      SELECT billing.access_mode
      FROM public.resolve_business_billing_context(
        target_establishment_id
      ) AS billing
      LIMIT 1
    ), 'blocked') AS access_mode
  )
  SELECT COALESCE(
    EXISTS (
      SELECT 1
      FROM identity
      CROSS JOIN access
      WHERE identity.operational_role IN ('owner', 'admin')
        AND access.access_mode <> 'blocked'
        AND (NOT require_full_access OR access.access_mode = 'full')
    ),
    false
  );
$$;

CREATE OR REPLACE FUNCTION public.can_manage_business_invitation(
  target_establishment_id uuid,
  target_role text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN public.is_superadmin() THEN target_role IN ('admin', 'professional')
    WHEN target_role = 'admin'
      THEN public.has_business_capability(
        target_establishment_id,
        'manage_admins'
      )
    WHEN target_role = 'professional'
      THEN public.has_business_capability(
        target_establishment_id,
        'manage_team'
      )
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.can_operate_business_appointment(
  target_establishment_id uuid,
  target_professional_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    public.is_superadmin()
    OR public.has_business_capability(
      target_establishment_id,
      'create_team_walk_in'
    )
    OR (
      target_professional_id = (SELECT auth.uid())
      AND public.has_business_capability(
        target_establishment_id,
        'create_self_walk_in'
      )
    );
$$;

-- One row per active local membership, including read-only and blocked units.
-- Missing billing coverage is fail-closed and reported as unconfigured.
CREATE OR REPLACE FUNCTION public.get_my_business_operational_contexts()
RETURNS TABLE (
  membership_id uuid,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  timezone text,
  membership_role text,
  membership_status text,
  operational_role text,
  access_mode text,
  capabilities text[],
  billing_owner boolean,
  billing_status text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  current_period_ends_at timestamptz,
  billing_scope text,
  billing_account_id uuid,
  subscription_id uuid,
  organization_id uuid,
  covered_establishment_ids uuid[],
  payer_role text,
  pending_change_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  RETURN QUERY
  SELECT
    membership.id,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.timezone,
    membership.role,
    membership.status,
    identity.operational_role,
    COALESCE(billing.access_mode, 'blocked'),
    public.resolve_business_operational_capabilities(
      establishment.id,
      actor_id,
      COALESCE(billing.access_mode, 'blocked')
    ),
    COALESCE(billing.billing_owner_profile_id = actor_id, false),
    COALESCE(billing.billing_status, 'unconfigured'),
    billing.trial_ends_at,
    billing.grace_ends_at,
    billing.current_period_ends_at,
    billing.billing_scope,
    billing.billing_account_id,
    billing.subscription_id,
    COALESCE(identity.organization_id, billing.organization_id),
    COALESCE(billing.covered_establishment_ids, ARRAY[]::uuid[]),
    CASE
      WHEN billing.billing_scope = 'organization' THEN (
        SELECT CASE
          WHEN organization_member.role IN ('owner', 'finance')
            THEN organization_member.role
          ELSE NULL
        END
        FROM public.organization_members AS organization_member
        WHERE organization_member.organization_id = billing.organization_id
          AND organization_member.profile_id = actor_id
          AND organization_member.status = 'active'
          AND organization_member.revoked_at IS NULL
        LIMIT 1
      )
      WHEN billing.billing_owner_profile_id = actor_id THEN 'billing_owner'
      ELSE NULL
    END,
    billing.pending_change_at
  FROM public.memberships AS membership
  JOIN public.establishments AS establishment
    ON establishment.id = membership.establishment_id
  JOIN LATERAL public.resolve_business_operational_identity(
    establishment.id,
    actor_id
  ) AS identity ON true
  LEFT JOIN LATERAL (
    SELECT resolved.*
    FROM public.resolve_business_billing_context(establishment.id) AS resolved
    LIMIT 1
  ) AS billing ON true
  WHERE membership.profile_id = actor_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
  ORDER BY establishment.name, establishment.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_business_agenda_day(
  target_establishment_id uuid,
  target_local_date date,
  target_scope text
)
RETURNS TABLE (
  appointment_id text,
  establishment_id uuid,
  professional_id uuid,
  professional_name text,
  service_id text,
  service_name text,
  client_display_name text,
  starts_at timestamptz,
  ends_at timestamptz,
  appointment_status text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  target_access_mode text;
  local_day_start timestamptz;
  local_day_end timestamptz;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF target_local_date IS NULL THEN
    RAISE EXCEPTION 'local_date_required';
  END IF;
  IF target_scope NOT IN ('own', 'team') THEN
    RAISE EXCEPTION 'invalid_agenda_scope';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.resolve_business_operational_identity(
      target_establishment_id,
      actor_id
    )
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    establishment.timezone,
    COALESCE((
      SELECT billing.access_mode
      FROM public.resolve_business_billing_context(
        target_establishment_id
      ) AS billing
      LIMIT 1
    ), 'blocked')
  INTO target_timezone, target_access_mode
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  IF target_timezone IS NULL THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF target_access_mode = 'blocked' THEN
    RAISE EXCEPTION 'business_access_blocked';
  END IF;
  IF target_scope = 'own'
    AND NOT public.has_business_capability(
      target_establishment_id,
      'view_own_agenda'
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_scope = 'team'
    AND NOT public.has_business_capability(
      target_establishment_id,
      'view_team_agenda'
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  local_day_start := target_local_date::timestamp AT TIME ZONE target_timezone;
  local_day_end := (target_local_date + 1)::timestamp AT TIME ZONE target_timezone;

  RETURN QUERY
  SELECT
    appointment.id,
    appointment.establishment_id,
    appointment.professional_id,
    professional.name,
    appointment.service_id,
    service.name,
    COALESCE(
      NULLIF(btrim(appointment.client_name), ''),
      NULLIF(btrim(client.name), ''),
      'Cliente'
    ),
    appointment.date_time,
    appointment.ends_at,
    appointment.status
  FROM public.appointments AS appointment
  JOIN public.services AS service ON service.id = appointment.service_id
  JOIN public.profiles AS professional
    ON professional.id = appointment.professional_id
  LEFT JOIN public.profiles AS client ON client.id = appointment.client_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.date_time >= local_day_start
    AND appointment.date_time < local_day_end
    AND (
      target_scope = 'team'
      OR appointment.professional_id = actor_id
    )
  ORDER BY appointment.date_time, appointment.id;
END;
$$;

-- Services: operational members can consult the catalog, while only local
-- owner/admin actors with full access can mutate it. Public catalog policies
-- remain untouched for Client/Web compatibility.
DROP POLICY IF EXISTS "Members manage establishment services" ON public.services;
DROP POLICY IF EXISTS "Business members read services" ON public.services;
DROP POLICY IF EXISTS "Business admins insert services" ON public.services;
DROP POLICY IF EXISTS "Business admins update services" ON public.services;
DROP POLICY IF EXISTS "Business admins delete services" ON public.services;

CREATE POLICY "Business members read services"
ON public.services
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'view_services')
);

CREATE POLICY "Business admins insert services"
ON public.services
FOR INSERT
TO authenticated
WITH CHECK (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'manage_services')
);

CREATE POLICY "Business admins update services"
ON public.services
FOR UPDATE
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'manage_services')
)
WITH CHECK (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'manage_services')
);

CREATE POLICY "Business admins delete services"
ON public.services
FOR DELETE
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'manage_services')
);

-- Staff appointment visibility follows local role and share_agendas. The
-- existing client-owned policy is intentionally preserved.
DROP POLICY IF EXISTS "Members manage establishment appointments"
  ON public.appointments;
DROP POLICY IF EXISTS "Business staff read appointments"
  ON public.appointments;
DROP POLICY IF EXISTS "Business staff insert appointments"
  ON public.appointments;
DROP POLICY IF EXISTS "Business staff update appointments"
  ON public.appointments;
DROP POLICY IF EXISTS "Business staff delete appointments"
  ON public.appointments;

CREATE POLICY "Business staff read appointments"
ON public.appointments
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'view_team_agenda')
  OR (
    professional_id = (SELECT auth.uid())
    AND public.has_business_capability(establishment_id, 'view_own_agenda')
  )
);

CREATE POLICY "Business staff insert appointments"
ON public.appointments
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_operate_business_appointment(establishment_id, professional_id)
);

CREATE POLICY "Business staff update appointments"
ON public.appointments
FOR UPDATE
TO authenticated
USING (
  public.can_operate_business_appointment(establishment_id, professional_id)
)
WITH CHECK (
  public.can_operate_business_appointment(establishment_id, professional_id)
);

CREATE POLICY "Business staff delete appointments"
ON public.appointments
FOR DELETE
TO authenticated
USING (
  public.can_operate_business_appointment(establishment_id, professional_id)
);

-- SECURITY DEFINER appointment RPCs still reach table triggers. This closes
-- their historical team-wide professional bypass while retaining Client-owned
-- booking, rescheduling and cancellation contracts.
CREATE OR REPLACE FUNCTION public.enforce_business_appointment_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  old_establishment_id uuid := CASE
    WHEN TG_OP = 'INSERT' THEN NULL
    ELSE OLD.establishment_id
  END;
  new_establishment_id uuid := CASE
    WHEN TG_OP = 'DELETE' THEN NULL
    ELSE NEW.establishment_id
  END;
  effective_establishment_id uuid := COALESCE(
    new_establishment_id,
    old_establishment_id
  );
  client_cancellation boolean := false;
  client_reschedule boolean := false;
BEGIN
  IF actor_id IS NULL OR public.is_superadmin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'UPDATE'
    AND old_establishment_id IS DISTINCT FROM new_establishment_id
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'INSERT'
    AND public.can_operate_business_appointment(
      NEW.establishment_id,
      NEW.professional_id
    )
  THEN
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE'
    AND public.can_operate_business_appointment(
      OLD.establishment_id,
      OLD.professional_id
    )
    AND public.can_operate_business_appointment(
      NEW.establishment_id,
      NEW.professional_id
    )
  THEN
    RETURN NEW;
  ELSIF TG_OP = 'DELETE'
    AND public.can_operate_business_appointment(
      OLD.establishment_id,
      OLD.professional_id
    )
  THEN
    RETURN OLD;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.client_id = actor_id
      AND public.billing_access_mode(effective_establishment_id) = 'full'
    THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE'
    OR OLD.client_id IS DISTINCT FROM actor_id
    OR NEW.client_id IS DISTINCT FROM actor_id
  THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  client_cancellation :=
    OLD.status IN ('pending', 'confirmed')
    AND NEW.status = 'cancelled'
    AND NEW.establishment_id = OLD.establishment_id
    AND NEW.professional_id = OLD.professional_id
    AND NEW.service_id = OLD.service_id
    AND NEW.date_time = OLD.date_time
    AND NEW.ends_at = OLD.ends_at
    AND NEW.duration_minutes = OLD.duration_minutes
    AND NEW.reschedule_count = OLD.reschedule_count
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at;

  IF client_cancellation THEN
    RETURN NEW;
  END IF;

  client_reschedule :=
    OLD.status IN ('pending', 'confirmed')
    AND NEW.status IN ('pending', 'confirmed')
    AND NEW.establishment_id = OLD.establishment_id
    AND NEW.reschedule_count = OLD.reschedule_count + 1
    AND NEW.deleted_at IS NOT DISTINCT FROM OLD.deleted_at
    AND NEW.cancellation_reason IS NOT DISTINCT FROM OLD.cancellation_reason
    AND NEW.cancellation_reason_code
      IS NOT DISTINCT FROM OLD.cancellation_reason_code
    AND NEW.cancellation_note_internal
      IS NOT DISTINCT FROM OLD.cancellation_note_internal
    AND NEW.cancelled_by_role IS NOT DISTINCT FROM OLD.cancelled_by_role;

  IF client_reschedule
    AND public.billing_access_mode(effective_establishment_id) = 'full'
  THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS enforce_business_appointment_scope
  ON public.appointments;
CREATE TRIGGER enforce_business_appointment_scope
BEFORE INSERT OR UPDATE OR DELETE
ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_business_appointment_scope();

-- Schedule-block reads follow the same capabilities and fail closed while a
-- unit is blocked. Existing create/delete RPCs already enforce own-vs-team and
-- the billing write trigger enforces full access.
DROP POLICY IF EXISTS "Operational members read schedule blocks"
  ON public.schedule_blocks;
DROP POLICY IF EXISTS "Business staff read schedule blocks"
  ON public.schedule_blocks;
CREATE POLICY "Business staff read schedule blocks"
ON public.schedule_blocks
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'view_team_agenda')
  OR (
    professional_id = (SELECT auth.uid())
    AND public.has_business_capability(establishment_id, 'view_own_agenda')
  )
);

CREATE OR REPLACE FUNCTION public.get_schedule_blocks(
  target_establishment_id uuid,
  range_start timestamptz,
  range_end timestamptz,
  target_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  establishment_id uuid,
  professional_id uuid,
  starts_at timestamptz,
  ends_at timestamptz,
  kind text,
  reason text,
  created_by uuid,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF range_end <= range_start OR range_end > range_start + interval '31 days'
  THEN
    RAISE EXCEPTION 'invalid_schedule_block_range';
  END IF;
  IF NOT public.has_business_capability(
    target_establishment_id,
    'view_own_agenda'
  ) AND NOT public.is_superadmin() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF (
    target_professional_id IS NULL
    OR target_professional_id <> actor_id
  )
    AND NOT public.has_business_capability(
      target_establishment_id,
      'view_team_agenda'
    )
    AND NOT public.is_superadmin()
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    block.id,
    block.establishment_id,
    block.professional_id,
    block.starts_at,
    block.ends_at,
    block.kind,
    block.reason,
    block.created_by,
    block.created_at,
    block.updated_at
  FROM public.schedule_blocks AS block
  WHERE block.establishment_id = target_establishment_id
    AND block.deleted_at IS NULL
    AND (
      target_professional_id IS NULL
      OR block.professional_id = target_professional_id
    )
    AND block.starts_at < range_end
    AND block.ends_at > range_start
  ORDER BY block.starts_at, block.professional_id;
END;
$$;

-- Administrative read RPCs predate billing enforcement and bypass RLS by
-- design. Re-guard them so read_only remains readable and blocked returns no
-- operational or contact data.
CREATE OR REPLACE FUNCTION public.get_establishment_team(
  target_establishment_id uuid,
  include_administrators boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  establishment_id uuid,
  name text,
  role text,
  email text,
  phone text,
  avatar_url text,
  commission_rate numeric,
  work_hours text,
  specialties text,
  instagram text,
  titulo_profissional text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_is_administrator boolean :=
    public.is_superadmin()
    OR public.is_business_administrator(target_establishment_id, false);
BEGIN
  IF NOT actor_is_administrator
    AND NOT public.has_business_capability(
      target_establishment_id,
      'view_own_agenda'
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    membership.establishment_id,
    profile.name,
    membership.role,
    CASE WHEN actor_is_administrator THEN profile.email ELSE NULL END,
    CASE WHEN actor_is_administrator THEN profile.phone ELSE NULL END,
    profile.avatar_url,
    CASE
      WHEN actor_is_administrator THEN membership.commission_rate
      ELSE NULL::numeric
    END,
    profile.work_hours,
    profile.specialties,
    profile.instagram,
    profile.titulo_profissional
  FROM public.memberships AS membership
  JOIN public.profiles AS profile ON profile.id = membership.profile_id
  WHERE membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
    AND (include_administrators OR membership.role = 'professional')
    AND profile.deleted_at IS NULL
  ORDER BY profile.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_establishment_invitations(
  target_establishment_id uuid
)
RETURNS TABLE (
  id uuid,
  invited_email text,
  role text,
  status text,
  expires_at timestamptz,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(
      target_establishment_id,
      false
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    invitation.id,
    invitation.invited_email,
    invitation.role,
    CASE
      WHEN invitation.status = 'pending'
        AND invitation.expires_at <= now() THEN 'expired'
      ELSE invitation.status
    END,
    invitation.expires_at,
    invitation.created_at
  FROM public.invitations AS invitation
  WHERE invitation.establishment_id = target_establishment_id
  ORDER BY invitation.created_at DESC
  LIMIT 50;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_establishment_invites_v2(
  target_establishment_id uuid
)
RETURNS TABLE (
  id uuid,
  target_contact text,
  role text,
  status text,
  created_at timestamptz,
  expires_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(
      target_establishment_id,
      false
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    invitation.id,
    invitation.target_contact,
    invitation.role,
    CASE
      WHEN invitation.status = 'pending'
        AND invitation.expires_at <= now() THEN 'expired'
      ELSE invitation.status::text
    END,
    invitation.created_at,
    invitation.expires_at
  FROM public.establishment_invites AS invitation
  WHERE invitation.establishment_id = target_establishment_id
  ORDER BY invitation.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_establishment_client_contacts(
  target_establishment_id uuid
)
RETURNS TABLE (
  id uuid,
  name text,
  email text,
  phone text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(
      target_establishment_id,
      false
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT DISTINCT
    profile.id,
    profile.name,
    profile.email,
    profile.phone
  FROM public.appointments AS appointment
  JOIN public.profiles AS profile ON profile.id = appointment.client_id
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND profile.deleted_at IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_appointment_participant_names(
  target_appointment_ids text[]
)
RETURNS TABLE (
  appointment_id text,
  client_name text,
  professional_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    appointment.id,
    COALESCE(
      NULLIF(appointment.client_name, ''),
      client_profile.name,
      'Cliente'
    ),
    professional_profile.name
  FROM public.appointments AS appointment
  LEFT JOIN public.profiles AS client_profile
    ON client_profile.id = appointment.client_id
  JOIN public.profiles AS professional_profile
    ON professional_profile.id = appointment.professional_id
  WHERE appointment.id = ANY(
      COALESCE(target_appointment_ids, ARRAY[]::text[])
    )
    AND (
      public.is_superadmin()
      OR appointment.client_id = (SELECT auth.uid())
      OR (
        appointment.professional_id = (SELECT auth.uid())
        AND public.has_business_capability(
          appointment.establishment_id,
          'view_own_agenda'
        )
      )
      OR public.has_business_capability(
        appointment.establishment_id,
        'view_team_agenda'
      )
    );
$$;

-- Keep the large, audited report implementations intact and private. Public
-- wrappers enforce the Business access state before delegating to them.
DO $report_wrappers$
BEGIN
  IF to_regprocedure(
    'public.get_admin_report_before_business_access(uuid,date,date)'
  ) IS NULL THEN
    ALTER FUNCTION public.get_admin_report(uuid, date, date)
      RENAME TO get_admin_report_before_business_access;
  END IF;

  IF to_regprocedure(
    'public.get_admin_report_v2_before_business_access(uuid,date,date,uuid,text,text)'
  ) IS NULL THEN
    ALTER FUNCTION public.get_admin_report_v2(
      uuid,
      date,
      date,
      uuid,
      text,
      text
    ) RENAME TO get_admin_report_v2_before_business_access;
  END IF;

  IF to_regprocedure(
    'public.get_admin_report_details_before_business_access(uuid,date,date,text,uuid,text,text,date,integer,integer,text,integer)'
  ) IS NULL THEN
    ALTER FUNCTION public.get_admin_report_details(
      uuid,
      date,
      date,
      text,
      uuid,
      text,
      text,
      date,
      integer,
      integer,
      text,
      integer
    ) RENAME TO get_admin_report_details_before_business_access;
  END IF;
END;
$report_wrappers$;

CREATE OR REPLACE FUNCTION public.get_admin_report(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(
      target_establishment_id,
      false
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN public.get_admin_report_before_business_access(
    target_establishment_id,
    target_range_start,
    target_range_end
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_report_v2(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_professional_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(
      target_establishment_id,
      false
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN public.get_admin_report_v2_before_business_access(
    target_establishment_id,
    target_range_start,
    target_range_end,
    target_professional_id,
    target_service_id,
    target_status
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_admin_report_details(
  target_establishment_id uuid,
  target_range_start date,
  target_range_end date,
  target_dimension text,
  target_professional_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_status text DEFAULT NULL,
  target_day date DEFAULT NULL,
  target_day_of_week integer DEFAULT NULL,
  target_hour integer DEFAULT NULL,
  target_cursor text DEFAULT NULL,
  target_limit integer DEFAULT 25
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.is_business_administrator(
      target_establishment_id,
      false
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN public.get_admin_report_details_before_business_access(
    target_establishment_id,
    target_range_start,
    target_range_end,
    target_dimension,
    target_professional_id,
    target_service_id,
    target_status,
    target_day,
    target_day_of_week,
    target_hour,
    target_cursor,
    target_limit
  );
END;
$$;

-- Invitation hierarchy: only an operational owner can create/revoke admin
-- invitations. Owner/admin can manage professional invitations. Both require
-- full access; superadmins retain the existing recovery path.
CREATE OR REPLACE FUNCTION public.create_invitation(
  target_establishment_id uuid,
  target_email text,
  target_role text
)
RETURNS TABLE (
  invitation_id uuid,
  raw_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_email text := lower(btrim(target_email));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
    RAISE EXCEPTION 'invalid_email';
  END IF;
  IF target_role NOT IN ('admin', 'professional') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.establishments AS establishment
    WHERE establishment.id = target_establishment_id
  ) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF NOT public.can_manage_business_invitation(
    target_establishment_id,
    target_role
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked', revoked_at = now()
  WHERE establishment_id = target_establishment_id
    AND lower(invited_email) = normalized_email
    AND role = target_role
    AND status = 'pending';

  INSERT INTO public.invitations (
    establishment_id,
    invited_email,
    role,
    token_hash,
    expires_at,
    created_by
  ) VALUES (
    target_establishment_id,
    normalized_email,
    target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'),
    generated_expiry,
    (SELECT auth.uid())
  )
  RETURNING id INTO generated_id;

  INSERT INTO public.authorization_audit_log(
    actor_id,
    action,
    establishment_id,
    metadata
  ) VALUES (
    (SELECT auth.uid()),
    'invitation.created',
    target_establishment_id,
    jsonb_build_object(
      'invitation_id', generated_id,
      'role', target_role
    )
  );

  RETURN QUERY
  SELECT generated_id, generated_token, generated_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_establishment_invite_v2(
  target_establishment_id uuid,
  target_contact text,
  target_role text
)
RETURNS TABLE (
  invitation_id uuid,
  raw_token text,
  expires_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_contact text := lower(btrim(target_contact));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF target_role NOT IN ('admin', 'professional') THEN
    RAISE EXCEPTION 'invalid_role';
  END IF;
  IF normalized_contact = '' THEN
    RAISE EXCEPTION 'invalid_contact';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM public.establishments AS establishment
    WHERE establishment.id = target_establishment_id
  ) THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;
  IF NOT public.can_manage_business_invitation(
    target_establishment_id,
    target_role
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.establishment_invites
  SET status = 'revoked', revoked_at = now()
  WHERE establishment_id = target_establishment_id
    AND lower(target_contact) = normalized_contact
    AND role = target_role
    AND status = 'pending';

  INSERT INTO public.establishment_invites (
    establishment_id,
    target_contact,
    role,
    token_hash,
    expires_at,
    created_by
  ) VALUES (
    target_establishment_id,
    normalized_contact,
    target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'),
    generated_expiry,
    (SELECT auth.uid())
  )
  RETURNING id INTO generated_id;

  INSERT INTO public.security_audit_logs(
    actor_id,
    action,
    target_id,
    target_type,
    changes
  ) VALUES (
    (SELECT auth.uid()),
    'invite.created',
    generated_id,
    'invite',
    jsonb_build_object(
      'establishment_id', target_establishment_id,
      'role', target_role
    )
  );

  RETURN QUERY
  SELECT generated_id, generated_token, generated_expiry;
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_invitation(
  target_invitation_id uuid,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_invitation public.invitations%ROWTYPE;
BEGIN
  IF char_length(btrim(COALESCE(reason, ''))) NOT BETWEEN 5 AND 500 THEN
    RAISE EXCEPTION 'revocation_reason_required';
  END IF;

  SELECT *
  INTO target_invitation
  FROM public.invitations
  WHERE id = target_invitation_id
    AND status = 'pending'
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'invitation_not_pending';
  END IF;
  IF NOT public.can_manage_business_invitation(
    target_invitation.establishment_id,
    target_invitation.role
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.invitations
  SET status = 'revoked',
      revoked_at = now(),
      revocation_reason = btrim(reason)
  WHERE id = target_invitation_id;

  INSERT INTO public.authorization_audit_log(
    actor_id,
    action,
    establishment_id,
    metadata
  ) VALUES (
    (SELECT auth.uid()),
    'invitation.revoked',
    target_invitation.establishment_id,
    jsonb_build_object(
      'invitation_id', target_invitation.id,
      'role', target_invitation.role,
      'reason_provided', true
    )
  );
END;
$$;

-- Invitation acceptance creates only the authoritative membership. It keeps the
-- compatibility N:N link, but never changes profiles.establishment_id or the
-- device-local active establishment.
CREATE OR REPLACE FUNCTION public.accept_invitation(invitation_token text)
RETURNS TABLE (
  accepted_role text,
  accepted_establishment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  pending_invitation public.invitations%ROWTYPE;
  actor_id uuid := (SELECT auth.uid());
  current_email text;
  effective_role text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_invitation_token';
  END IF;

  SELECT lower(auth_user.email)
  INTO current_email
  FROM auth.users AS auth_user
  WHERE auth_user.id = actor_id
    AND auth_user.email_confirmed_at IS NOT NULL;
  IF current_email IS NULL THEN
    RAISE EXCEPTION 'verified_email_required';
  END IF;

  SELECT *
  INTO pending_invitation
  FROM public.invitations
  WHERE token_hash = encode(
    extensions.digest(invitation_token, 'sha256'),
    'hex'
  )
  FOR UPDATE;
  IF NOT FOUND OR pending_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_or_used_invitation';
  END IF;
  IF pending_invitation.expires_at <= now() THEN
    UPDATE public.invitations
    SET status = 'expired'
    WHERE id = pending_invitation.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;
  IF lower(pending_invitation.invited_email) <> current_email THEN
    RAISE EXCEPTION 'invitation_email_mismatch';
  END IF;

  INSERT INTO public.memberships(
    profile_id,
    establishment_id,
    role,
    status,
    commission_rate,
    created_by
  ) VALUES (
    actor_id,
    pending_invitation.establishment_id,
    pending_invitation.role,
    'active',
    0.50,
    pending_invitation.created_by
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = CASE
        WHEN public.memberships.role = 'admin' THEN 'admin'
        ELSE EXCLUDED.role
      END,
      status = 'active',
      revoked_at = NULL,
      revocation_reason = NULL,
      updated_at = now();

  SELECT membership.role
  INTO effective_role
  FROM public.memberships AS membership
  WHERE membership.profile_id = actor_id
    AND membership.establishment_id = pending_invitation.establishment_id;

  INSERT INTO public.profile_establishments(
    profile_id,
    establishment_id,
    role
  ) VALUES (
    actor_id,
    pending_invitation.establishment_id,
    effective_role
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = EXCLUDED.role,
      updated_at = now();

  UPDATE public.invitations
  SET status = 'accepted',
      accepted_by = actor_id,
      accepted_at = now()
  WHERE id = pending_invitation.id;

  INSERT INTO public.authorization_audit_log(
    actor_id,
    action,
    establishment_id,
    target_profile_id,
    metadata
  ) VALUES (
    actor_id,
    'invitation.accepted',
    pending_invitation.establishment_id,
    actor_id,
    jsonb_build_object(
      'invitation_id', pending_invitation.id,
      'role', effective_role
    )
  );

  RETURN QUERY
  SELECT effective_role, pending_invitation.establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_invitation_v2(invitation_token text)
RETURNS TABLE (
  accepted_role text,
  accepted_establishment_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  pending_invitation public.establishment_invites%ROWTYPE;
  actor_id uuid := (SELECT auth.uid());
  current_email text;
  current_phone text;
  effective_role text;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;
  IF invitation_token !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'invalid_invitation_token';
  END IF;

  SELECT lower(profile.email), profile.phone
  INTO current_email, current_phone
  FROM public.profiles AS profile
  WHERE profile.id = actor_id
    AND profile.deleted_at IS NULL;

  SELECT *
  INTO pending_invitation
  FROM public.establishment_invites
  WHERE token_hash = encode(
    extensions.digest(invitation_token, 'sha256'),
    'hex'
  )
  FOR UPDATE;
  IF NOT FOUND OR pending_invitation.status <> 'pending' THEN
    RAISE EXCEPTION 'invalid_or_used_invitation';
  END IF;
  IF pending_invitation.expires_at <= now() THEN
    UPDATE public.establishment_invites
    SET status = 'expired'
    WHERE id = pending_invitation.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;
  IF lower(pending_invitation.target_contact) <> current_email
    AND pending_invitation.target_contact <> current_phone
  THEN
    RAISE EXCEPTION 'invitation_contact_mismatch';
  END IF;

  INSERT INTO public.memberships(
    profile_id,
    establishment_id,
    role,
    status,
    commission_rate,
    created_by
  ) VALUES (
    actor_id,
    pending_invitation.establishment_id,
    pending_invitation.role,
    'active',
    0.50,
    pending_invitation.created_by
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = CASE
        WHEN public.memberships.role = 'admin' THEN 'admin'
        ELSE EXCLUDED.role
      END,
      status = 'active',
      revoked_at = NULL,
      revocation_reason = NULL,
      updated_at = now();

  SELECT membership.role
  INTO effective_role
  FROM public.memberships AS membership
  WHERE membership.profile_id = actor_id
    AND membership.establishment_id = pending_invitation.establishment_id;

  INSERT INTO public.profile_establishments(
    profile_id,
    establishment_id,
    role
  ) VALUES (
    actor_id,
    pending_invitation.establishment_id,
    effective_role
  )
  ON CONFLICT (profile_id, establishment_id) DO UPDATE
  SET role = EXCLUDED.role,
      updated_at = now();

  UPDATE public.establishment_invites
  SET status = 'accepted',
      accepted_by = actor_id,
      accepted_at = now(),
      lgpd_accepted = true
  WHERE id = pending_invitation.id;

  INSERT INTO public.security_audit_logs(
    actor_id,
    action,
    target_id,
    target_type,
    changes
  ) VALUES (
    actor_id,
    'invite.accepted',
    pending_invitation.id,
    'invite',
    jsonb_build_object(
      'establishment_id', pending_invitation.establishment_id,
      'role', effective_role
    )
  );

  RETURN QUERY
  SELECT effective_role, pending_invitation.establishment_id;
END;
$$;

DROP POLICY IF EXISTS "Business administrators read invitations"
  ON public.invitations;
DROP POLICY IF EXISTS "Business managers insert invitations"
  ON public.invitations;
DROP POLICY IF EXISTS "Business managers update invitations"
  ON public.invitations;
CREATE POLICY "Business administrators read invitations"
ON public.invitations
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.is_business_administrator(establishment_id, false)
);
CREATE POLICY "Business managers insert invitations"
ON public.invitations
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_business_invitation(establishment_id, role)
);
CREATE POLICY "Business managers update invitations"
ON public.invitations
FOR UPDATE
TO authenticated
USING (
  public.can_manage_business_invitation(establishment_id, role)
)
WITH CHECK (
  public.can_manage_business_invitation(establishment_id, role)
);

DROP POLICY IF EXISTS "Admins read invites of establishment"
  ON public.establishment_invites;
DROP POLICY IF EXISTS "Admins insert invites of establishment"
  ON public.establishment_invites;
DROP POLICY IF EXISTS "Admins update invites of establishment"
  ON public.establishment_invites;
DROP POLICY IF EXISTS "Business administrators read establishment invites"
  ON public.establishment_invites;
DROP POLICY IF EXISTS "Business managers insert establishment invites"
  ON public.establishment_invites;
DROP POLICY IF EXISTS "Business managers update establishment invites"
  ON public.establishment_invites;
CREATE POLICY "Business administrators read establishment invites"
ON public.establishment_invites
FOR SELECT
TO authenticated
USING (
  public.is_superadmin()
  OR public.is_business_administrator(establishment_id, false)
);
CREATE POLICY "Business managers insert establishment invites"
ON public.establishment_invites
FOR INSERT
TO authenticated
WITH CHECK (
  public.can_manage_business_invitation(establishment_id, role)
);
CREATE POLICY "Business managers update establishment invites"
ON public.establishment_invites
FOR UPDATE
TO authenticated
USING (
  public.can_manage_business_invitation(establishment_id, role)
)
WITH CHECK (
  public.can_manage_business_invitation(establishment_id, role)
);

-- A blocked administrator may still see their own membership/context, but not
-- enumerate the operational team through the base membership table.
DROP POLICY IF EXISTS "Memberships visible to authorized users"
  ON public.memberships;
DROP POLICY IF EXISTS "Business memberships visible to authorized users"
  ON public.memberships;
CREATE POLICY "Business memberships visible to authorized users"
ON public.memberships
FOR SELECT
TO authenticated
USING (
  profile_id = (SELECT auth.uid())
  OR public.is_superadmin()
  OR public.is_business_administrator(establishment_id, false)
);

-- Internal helpers are not an RPC surface. Current-actor predicates and public
-- Business RPCs are authenticated-only.
REVOKE ALL ON FUNCTION public.resolve_business_operational_identity(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_business_operational_capabilities(
  uuid,
  uuid,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_business_capability(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_business_administrator(uuid, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_manage_business_invitation(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.can_operate_business_appointment(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_business_operational_contexts()
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_business_agenda_day(uuid, date, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_schedule_blocks(
  uuid,
  timestamptz,
  timestamptz,
  uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_establishment_team(uuid, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_establishment_invitations(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_establishment_invites_v2(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_establishment_client_contacts(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_appointment_participant_names(text[])
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_report(uuid, date, date)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_report_v2(
  uuid,
  date,
  date,
  uuid,
  text,
  text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_report_details(
  uuid,
  date,
  date,
  text,
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  text,
  integer
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_admin_report_before_business_access(
  uuid,
  date,
  date
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_report_v2_before_business_access(
  uuid,
  date,
  date,
  uuid,
  text,
  text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_admin_report_details_before_business_access(
  uuid,
  date,
  date,
  text,
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  text,
  integer
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.create_invitation(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_establishment_invite_v2(uuid, text, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_invitation(uuid, text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invitation(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_invitation_v2(text)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.enforce_business_appointment_scope()
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.resolve_business_operational_identity(uuid, uuid)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_business_operational_capabilities(
  uuid,
  uuid,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.has_business_capability(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_business_administrator(uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_manage_business_invitation(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_operate_business_appointment(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_business_operational_contexts()
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_business_agenda_day(uuid, date, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_schedule_blocks(
  uuid,
  timestamptz,
  timestamptz,
  uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_establishment_team(uuid, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_establishment_invitations(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_establishment_invites_v2(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_establishment_client_contacts(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_appointment_participant_names(text[])
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report(uuid, date, date)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report_v2(
  uuid,
  date,
  date,
  uuid,
  text,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report_details(
  uuid,
  date,
  date,
  text,
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  text,
  integer
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report_before_business_access(
  uuid,
  date,
  date
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report_v2_before_business_access(
  uuid,
  date,
  date,
  uuid,
  text,
  text
) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_admin_report_details_before_business_access(
  uuid,
  date,
  date,
  text,
  uuid,
  text,
  text,
  date,
  integer,
  integer,
  text,
  integer
) TO service_role;
GRANT EXECUTE ON FUNCTION public.create_invitation(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_establishment_invite_v2(uuid, text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_invitation(uuid, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.accept_invitation_v2(text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_my_business_operational_contexts() IS
  'Authoritative Business memberships, role-aware capabilities and billing access. Never selects an active unit.';
COMMENT ON FUNCTION public.get_business_agenda_day(uuid, date, text) IS
  'Minimal role-scoped Business day agenda. Excludes phones and internal notes.';

NOTIFY pgrst, 'reload schema';

COMMIT;
