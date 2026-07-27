BEGIN;

ALTER TABLE public.governance_users
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz,
  ADD COLUMN IF NOT EXISTS revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.governance_users
  DROP CONSTRAINT IF EXISTS governance_users_expiry_after_grant;

ALTER TABLE public.governance_users
  ADD CONSTRAINT governance_users_expiry_after_grant
  CHECK (expires_at IS NULL OR expires_at > granted_at);

CREATE OR REPLACE FUNCTION public.is_governance_user(
  allowed_roles public.governance_role_enum[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.governance_users
    WHERE profile_id = (SELECT auth.uid())
      AND is_active
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
      AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
  );
$$;

REVOKE ALL ON FUNCTION public.is_governance_user(public.governance_role_enum[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_governance_user(public.governance_role_enum[]) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_control_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_role public.governance_role_enum;
  actor_name text;
  actor_email text;
  actor_permissions text[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF coalesce((SELECT auth.jwt()->>'aal'), 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'control_aal2_required';
  END IF;

  SELECT
    governance.role,
    coalesce(profile.name, 'Membro da Governança'),
    coalesce(profile.email, '')
  INTO actor_role, actor_name, actor_email
  FROM public.governance_users AS governance
  JOIN public.profiles AS profile ON profile.id = governance.profile_id
  WHERE governance.profile_id = actor_id
    AND governance.is_active
    AND governance.revoked_at IS NULL
    AND (governance.expires_at IS NULL OR governance.expires_at > now());

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  actor_permissions := ARRAY[
    'control.dashboard.read',
    'control.live.read',
    'control.support.read',
    'control.governance.read',
    'control.knowledge.read',
    'control.billing.read'
  ];

  IF actor_role IN ('SaaS_Editor', 'SaaS_Owner') THEN
    actor_permissions := actor_permissions || ARRAY[
      'control.support.manage',
      'control.governance.manage',
      'control.knowledge.manage',
      'control.billing.manage'
    ];
  END IF;

  IF actor_role = 'SaaS_Owner' THEN
    actor_permissions := actor_permissions || ARRAY['control.access.manage'];
  END IF;

  RETURN jsonb_build_object(
    'profile_id', actor_id,
    'name', actor_name,
    'email', actor_email,
    'role', actor_role,
    'permissions', to_jsonb(actor_permissions)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_control_dashboard()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  local_day_start timestamptz;
  local_day_end timestamptz;
BEGIN
  PERFORM public.get_control_context();

  local_day_start := date_trunc('day', now() AT TIME ZONE 'America/Sao_Paulo')
    AT TIME ZONE 'America/Sao_Paulo';
  local_day_end := local_day_start + interval '1 day';

  RETURN jsonb_build_object(
    'generated_at', now(),
    'timezone', 'America/Sao_Paulo',
    'appointments_today', (
      SELECT count(*)
      FROM public.appointments
      WHERE deleted_at IS NULL
        AND date_time >= local_day_start
        AND date_time < local_day_end
    ),
    'completed_last_28_days', (
      SELECT count(*)
      FROM public.appointments
      WHERE deleted_at IS NULL
        AND status = 'completed'
        AND date_time >= now() - interval '28 days'
    ),
    'cancelled_last_28_days', (
      SELECT count(*)
      FROM public.appointments
      WHERE deleted_at IS NULL
        AND status = 'cancelled'
        AND date_time >= now() - interval '28 days'
    ),
    'active_establishments', (
      SELECT count(*)
      FROM public.establishments
      WHERE account_status = 'active'
    ),
    'pending_establishment_requests', (
      SELECT count(*)
      FROM public.establishment_requests
      WHERE status = 'pending'
    )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_control_users()
RETURNS TABLE (
  profile_id uuid,
  name text,
  email text,
  role public.governance_role_enum,
  is_active boolean,
  expires_at timestamptz,
  granted_at timestamptz,
  revoked_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  PERFORM public.get_control_context();
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    governance.profile_id,
    coalesce(profile.name, 'Usuário'),
    coalesce(profile.email, ''),
    governance.role,
    governance.is_active,
    governance.expires_at,
    governance.granted_at,
    governance.revoked_at
  FROM public.governance_users AS governance
  JOIN public.profiles AS profile ON profile.id = governance.profile_id
  ORDER BY governance.is_active DESC, governance.role DESC, profile.name;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_control_user_access(
  target_profile_id uuid,
  target_role public.governance_role_enum,
  target_expires_at timestamptz,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  updated_access public.governance_users%ROWTYPE;
  current_access public.governance_users%ROWTYPE;
  other_active_owner_count integer;
BEGIN
  PERFORM public.get_control_context();
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'access_reason_required';
  END IF;
  IF target_expires_at IS NOT NULL AND target_expires_at <= now() THEN
    RAISE EXCEPTION 'access_expiry_invalid';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = target_profile_id) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT *
  INTO current_access
  FROM public.governance_users
  WHERE profile_id = target_profile_id;

  IF FOUND
     AND current_access.role = 'SaaS_Owner'
     AND current_access.is_active
     AND current_access.revoked_at IS NULL
     AND (current_access.expires_at IS NULL OR current_access.expires_at > now())
     AND (target_role <> 'SaaS_Owner' OR target_expires_at IS NOT NULL)
  THEN
    SELECT count(*)
    INTO other_active_owner_count
    FROM public.governance_users
    WHERE profile_id <> target_profile_id
      AND role = 'SaaS_Owner'
      AND is_active
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now());

    IF other_active_owner_count = 0 THEN
      RAISE EXCEPTION 'last_owner_protected';
    END IF;
  END IF;

  PERFORM set_config('cutsync.governance_access_reason', btrim(reason), true);

  INSERT INTO public.governance_users (
    profile_id,
    role,
    granted_by,
    granted_at,
    updated_at,
    is_active,
    expires_at,
    revoked_at,
    revoked_by
  )
  VALUES (
    target_profile_id,
    target_role,
    actor_id,
    now(),
    now(),
    true,
    target_expires_at,
    NULL,
    NULL
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET role = EXCLUDED.role,
      granted_by = EXCLUDED.granted_by,
      granted_at = EXCLUDED.granted_at,
      updated_at = now(),
      is_active = true,
      expires_at = EXCLUDED.expires_at,
      revoked_at = NULL,
      revoked_by = NULL
  RETURNING * INTO updated_access;

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.changed',
    target_profile_id,
    'governance_user',
    jsonb_build_object(
      'role', target_role,
      'expires_at', target_expires_at,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'profile_id', updated_access.profile_id,
    'role', updated_access.role,
    'is_active', updated_access.is_active,
    'expires_at', updated_access.expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_control_user_access(
  target_profile_id uuid,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_access public.governance_users%ROWTYPE;
  active_owner_count integer;
BEGIN
  PERFORM public.get_control_context();
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'access_reason_required';
  END IF;

  SELECT *
  INTO target_access
  FROM public.governance_users
  WHERE profile_id = target_profile_id
    AND is_active
    AND revoked_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'governance_user_not_active';
  END IF;

  IF target_access.role = 'SaaS_Owner' THEN
    SELECT count(*)
    INTO active_owner_count
    FROM public.governance_users
    WHERE role = 'SaaS_Owner'
      AND is_active
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now());

    IF active_owner_count <= 1 THEN
      RAISE EXCEPTION 'last_owner_protected';
    END IF;
  END IF;

  PERFORM set_config('cutsync.governance_access_reason', btrim(reason), true);

  UPDATE public.governance_users
  SET is_active = false,
      revoked_at = now(),
      revoked_by = actor_id,
      updated_at = now()
  WHERE profile_id = target_profile_id;

  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.revoked',
    target_profile_id,
    'governance_user',
    jsonb_build_object('reason_provided', true)
  );

  RETURN jsonb_build_object('profile_id', target_profile_id, 'is_active', false);
END;
$$;

REVOKE ALL ON FUNCTION public.get_control_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_control_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_user_access(uuid, public.governance_role_enum, timestamptz, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_control_user_access(uuid, text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_control_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_control_dashboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_control_users() TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_control_user_access(uuid, public.governance_role_enum, timestamptz, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_control_user_access(uuid, text) TO authenticated;

COMMIT;
