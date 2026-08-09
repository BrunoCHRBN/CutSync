BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Phase 1, slice 1: additive role templates and backend-persisted app context.
-- memberships.role remains the legacy projection while consumers migrate.

ALTER TABLE public.memberships
  ADD COLUMN IF NOT EXISTS role_template text;

UPDATE public.memberships
SET role_template = CASE
  WHEN role = 'admin' THEN 'admin'
  ELSE 'professional'
END
WHERE role_template IS NULL;

ALTER TABLE public.memberships
  ALTER COLUMN role_template SET NOT NULL;

ALTER TABLE public.memberships
  DROP CONSTRAINT IF EXISTS memberships_role_template_check;
ALTER TABLE public.memberships
  ADD CONSTRAINT memberships_role_template_check CHECK (
    role_template IN (
      'admin',
      'professional',
      'reception',
      'cashier',
      'finance',
      'manager'
    )
  );

COMMENT ON COLUMN public.memberships.role_template IS
  'Operational role template. memberships.role remains a temporary legacy projection; owner is derived from organization authority.';

CREATE OR REPLACE FUNCTION public.sync_membership_legacy_role_projection()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.role_template IS NULL
    OR (TG_OP = 'UPDATE'
      AND NEW.role IS DISTINCT FROM OLD.role
      AND NEW.role_template IS NOT DISTINCT FROM OLD.role_template)
  THEN
    NEW.role_template := CASE
      WHEN NEW.role = 'admin' THEN 'admin'
      ELSE 'professional'
    END;
  END IF;

  -- Fail closed for legacy consumers: only the admin template projects admin.
  NEW.role := CASE
    WHEN NEW.role_template = 'admin' THEN 'admin'
    ELSE 'professional'
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS sync_membership_legacy_role_projection
  ON public.memberships;
CREATE TRIGGER sync_membership_legacy_role_projection
BEFORE INSERT OR UPDATE OF role, role_template ON public.memberships
FOR EACH ROW
EXECUTE FUNCTION public.sync_membership_legacy_role_projection();

REVOKE ALL ON FUNCTION public.sync_membership_legacy_role_projection()
  FROM PUBLIC, anon, authenticated;

CREATE TABLE public.user_app_active_contexts (
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id text NOT NULL CHECK (app_id IN ('web', 'business', 'client', 'control')),
  context_kind text NOT NULL CHECK (
    context_kind IN ('personal', 'establishment', 'organization')
  ),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (profile_id, app_id),
  CONSTRAINT user_app_active_context_target_check CHECK (
    (context_kind = 'personal'
      AND establishment_id IS NULL
      AND organization_id IS NULL)
    OR
    (context_kind = 'establishment'
      AND establishment_id IS NOT NULL
      AND organization_id IS NULL)
    OR
    (context_kind = 'organization'
      AND establishment_id IS NULL
      AND organization_id IS NOT NULL)
  )
);

CREATE TABLE public.user_app_context_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id text NOT NULL CHECK (app_id IN ('web', 'business', 'client', 'control')),
  request_id uuid NOT NULL,
  context_kind text NOT NULL CHECK (
    context_kind IN ('personal', 'establishment', 'organization')
  ),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, app_id, request_id)
);

CREATE INDEX user_app_context_events_profile_created_idx
  ON public.user_app_context_events(profile_id, created_at DESC);

ALTER TABLE public.user_app_active_contexts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_app_context_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_app_active_contexts
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.user_app_context_events
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.is_context_target_authorized(
  target_profile_id uuid,
  target_app_id text,
  target_context_kind text,
  target_establishment_id uuid,
  target_organization_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN target_app_id NOT IN ('web', 'business', 'client', 'control') THEN false
    WHEN target_context_kind = 'personal' THEN
      target_establishment_id IS NULL
      AND target_organization_id IS NULL
      AND target_app_id IN ('web', 'client', 'control')
    WHEN target_context_kind = 'establishment' THEN
      target_establishment_id IS NOT NULL
      AND target_organization_id IS NULL
      AND target_app_id IN ('web', 'business')
      AND EXISTS (
        SELECT 1
        FROM public.memberships AS membership
        WHERE membership.profile_id = target_profile_id
          AND membership.establishment_id = target_establishment_id
          AND membership.status = 'active'
          AND membership.revoked_at IS NULL
      )
    WHEN target_context_kind = 'organization' THEN
      target_establishment_id IS NULL
      AND target_organization_id IS NOT NULL
      AND target_app_id IN ('web', 'business')
      AND EXISTS (
        SELECT 1
        FROM public.organization_members AS member
        JOIN public.organizations AS organization
          ON organization.id = member.organization_id
        WHERE member.profile_id = target_profile_id
          AND member.organization_id = target_organization_id
          AND member.status = 'active'
          AND member.revoked_at IS NULL
          AND organization.status = 'active'
      )
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION public.is_context_target_authorized(
  uuid, text, text, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_context_target_authorized(
  uuid, text, text, uuid, uuid
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_authorized_contexts(
  target_app_id text
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_app_id NOT IN ('web', 'business', 'client', 'control') THEN
    RAISE EXCEPTION 'invalid_app_context' USING ERRCODE = '22023';
  END IF;

  IF target_app_id IN ('web', 'client', 'control') THEN
    RETURN NEXT jsonb_build_object(
      'appId', target_app_id,
      'contextKind', 'personal',
      'establishmentId', NULL,
      'establishmentName', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'membershipId', NULL,
      'membershipRole', NULL,
      'roleTemplate', NULL,
      'organizationRole', NULL,
      'active', EXISTS (
        SELECT 1
        FROM public.user_app_active_contexts AS active_context
        WHERE active_context.profile_id = actor_id
          AND active_context.app_id = target_app_id
          AND active_context.context_kind = 'personal'
      ),
      'version', COALESCE((
        SELECT active_context.version
        FROM public.user_app_active_contexts AS active_context
        WHERE active_context.profile_id = actor_id
          AND active_context.app_id = target_app_id
          AND active_context.context_kind = 'personal'
      ), 0)
    );
  END IF;

  IF target_app_id IN ('web', 'business') THEN
    RETURN QUERY
    SELECT jsonb_build_object(
      'appId', target_app_id,
      'contextKind', 'establishment',
      'establishmentId', establishment.id,
      'establishmentName', establishment.name,
      'organizationId', NULL,
      'organizationName', NULL,
      'membershipId', membership.id,
      'membershipRole', membership.role,
      'roleTemplate', membership.role_template,
      'organizationRole', NULL,
      'active', active_context.profile_id IS NOT NULL,
      'version', COALESCE(active_context.version, 0)
    )
    FROM public.memberships AS membership
    JOIN public.establishments AS establishment
      ON establishment.id = membership.establishment_id
    LEFT JOIN public.user_app_active_contexts AS active_context
      ON active_context.profile_id = actor_id
      AND active_context.app_id = target_app_id
      AND active_context.context_kind = 'establishment'
      AND active_context.establishment_id = establishment.id
    WHERE membership.profile_id = actor_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
    ORDER BY establishment.name, establishment.id;

    RETURN QUERY
    SELECT jsonb_build_object(
      'appId', target_app_id,
      'contextKind', 'organization',
      'establishmentId', NULL,
      'establishmentName', NULL,
      'organizationId', organization.id,
      'organizationName', organization.name,
      'membershipId', NULL,
      'membershipRole', NULL,
      'roleTemplate', NULL,
      'organizationRole', member.role,
      'active', active_context.profile_id IS NOT NULL,
      'version', COALESCE(active_context.version, 0)
    )
    FROM public.organization_members AS member
    JOIN public.organizations AS organization
      ON organization.id = member.organization_id
    LEFT JOIN public.user_app_active_contexts AS active_context
      ON active_context.profile_id = actor_id
      AND active_context.app_id = target_app_id
      AND active_context.context_kind = 'organization'
      AND active_context.organization_id = organization.id
    WHERE member.profile_id = actor_id
      AND member.status = 'active'
      AND member.revoked_at IS NULL
      AND organization.status = 'active'
    ORDER BY organization.name, organization.id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_authorized_contexts(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_authorized_contexts(text)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.set_my_active_context(
  target_app_id text,
  target_context_kind text,
  target_establishment_id uuid,
  target_organization_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  existing_event public.user_app_context_events%ROWTYPE;
  next_context public.user_app_active_contexts%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL THEN
    RAISE EXCEPTION 'request_id_required' USING ERRCODE = '22023';
  END IF;

  IF NOT public.is_context_target_authorized(
    actor_id,
    target_app_id,
    target_context_kind,
    target_establishment_id,
    target_organization_id
  ) THEN
    RAISE EXCEPTION 'context_not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO existing_event
  FROM public.user_app_context_events AS event
  WHERE event.profile_id = actor_id
    AND event.app_id = target_app_id
    AND event.request_id = target_request_id;

  IF FOUND THEN
    IF existing_event.context_kind IS DISTINCT FROM target_context_kind
      OR existing_event.establishment_id IS DISTINCT FROM target_establishment_id
      OR existing_event.organization_id IS DISTINCT FROM target_organization_id
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;

    RETURN jsonb_build_object(
      'appId', existing_event.app_id,
      'contextKind', existing_event.context_kind,
      'establishmentId', existing_event.establishment_id,
      'organizationId', existing_event.organization_id,
      'version', existing_event.resulting_version,
      'requestId', existing_event.request_id,
      'replayed', true
    );
  END IF;

  INSERT INTO public.user_app_active_contexts(
    profile_id,
    app_id,
    context_kind,
    establishment_id,
    organization_id,
    version,
    updated_at
  )
  VALUES (
    actor_id,
    target_app_id,
    target_context_kind,
    target_establishment_id,
    target_organization_id,
    1,
    now()
  )
  ON CONFLICT (profile_id, app_id) DO UPDATE
  SET context_kind = EXCLUDED.context_kind,
      establishment_id = EXCLUDED.establishment_id,
      organization_id = EXCLUDED.organization_id,
      version = public.user_app_active_contexts.version + 1,
      updated_at = now()
  RETURNING * INTO next_context;

  INSERT INTO public.user_app_context_events(
    profile_id,
    app_id,
    request_id,
    context_kind,
    establishment_id,
    organization_id,
    resulting_version
  )
  VALUES (
    actor_id,
    target_app_id,
    target_request_id,
    target_context_kind,
    target_establishment_id,
    target_organization_id,
    next_context.version
  );

  INSERT INTO public.authorization_audit_log(
    actor_id,
    action,
    establishment_id,
    metadata
  )
  VALUES (
    actor_id,
    'identity.active_context.changed',
    target_establishment_id,
    jsonb_build_object(
      'app_id', target_app_id,
      'context_kind', target_context_kind,
      'organization_id', target_organization_id,
      'version', next_context.version,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'appId', next_context.app_id,
    'contextKind', next_context.context_kind,
    'establishmentId', next_context.establishment_id,
    'organizationId', next_context.organization_id,
    'version', next_context.version,
    'requestId', target_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_active_context(
  text, text, uuid, uuid, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.set_my_active_context(
  text, text, uuid, uuid, uuid
) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.invalidate_revoked_active_contexts()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'memberships'
    AND (NEW.status <> 'active' OR NEW.revoked_at IS NOT NULL)
  THEN
    DELETE FROM public.user_app_active_contexts
    WHERE profile_id = NEW.profile_id
      AND context_kind = 'establishment'
      AND establishment_id = NEW.establishment_id;
  ELSIF TG_TABLE_NAME = 'organization_members'
    AND (NEW.status <> 'active' OR NEW.revoked_at IS NOT NULL)
  THEN
    DELETE FROM public.user_app_active_contexts
    WHERE profile_id = NEW.profile_id
      AND context_kind = 'organization'
      AND organization_id = NEW.organization_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS invalidate_membership_active_context
  ON public.memberships;
CREATE TRIGGER invalidate_membership_active_context
AFTER UPDATE OF status, revoked_at ON public.memberships
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
EXECUTE FUNCTION public.invalidate_revoked_active_contexts();

DROP TRIGGER IF EXISTS invalidate_organization_active_context
  ON public.organization_members;
CREATE TRIGGER invalidate_organization_active_context
AFTER UPDATE OF status, revoked_at ON public.organization_members
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status OR OLD.revoked_at IS DISTINCT FROM NEW.revoked_at)
EXECUTE FUNCTION public.invalidate_revoked_active_contexts();

REVOKE ALL ON FUNCTION public.invalidate_revoked_active_contexts()
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.get_my_authorized_contexts(text) IS
  'Lists backend-authorized personal, establishment and organization contexts for one app. Local storage is only a selection hint.';
COMMENT ON FUNCTION public.set_my_active_context(text, text, uuid, uuid, uuid) IS
  'Persists an app-specific active context after server-side authority validation and idempotent audit.';

COMMIT;
