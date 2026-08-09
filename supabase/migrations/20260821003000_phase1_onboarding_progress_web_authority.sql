BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Phase 1, slice 4: resumable onboarding metadata and Web authority cutover.
-- No personal onboarding answers or documents are stored in these tables.

CREATE TABLE public.user_onboarding_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id text NOT NULL CHECK (app_id IN ('web', 'business', 'client', 'control')),
  intent text NOT NULL CHECK (intent IN (
    'client_account',
    'establishment_request',
    'professional_profile',
    'establishment_operations',
    'payments',
    'fiscal'
  )),
  context_kind text NOT NULL CHECK (
    context_kind IN ('personal', 'establishment', 'organization')
  ),
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  current_step text NOT NULL CHECK (
    current_step ~ '^[a-z][a-z0-9_]{1,79}$'
  ),
  status text NOT NULL CHECK (
    status IN ('in_progress', 'paused', 'blocked', 'completed', 'abandoned')
  ),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  last_request_id uuid NOT NULL,
  last_resumed_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_onboarding_progress_target_check CHECK (
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
  ),
  CONSTRAINT user_onboarding_progress_completion_check CHECK (
    (status = 'completed' AND completed_at IS NOT NULL)
    OR (status <> 'completed' AND completed_at IS NULL)
  ),
  CONSTRAINT user_onboarding_progress_scope_unique UNIQUE NULLS NOT DISTINCT (
    profile_id, app_id, intent, context_kind, establishment_id, organization_id
  )
);

CREATE TABLE public.user_onboarding_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  progress_id uuid NOT NULL
    REFERENCES public.user_onboarding_progress(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  app_id text NOT NULL,
  request_id uuid NOT NULL,
  correlation_id uuid NOT NULL,
  previous_step text,
  resulting_step text NOT NULL,
  previous_status text,
  resulting_status text NOT NULL,
  previous_version integer NOT NULL CHECK (previous_version >= 0),
  resulting_version integer NOT NULL CHECK (resulting_version > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (profile_id, app_id, request_id)
);

CREATE INDEX user_onboarding_progress_profile_updated_idx
  ON public.user_onboarding_progress(profile_id, app_id, updated_at DESC);
CREATE INDEX user_onboarding_events_progress_created_idx
  ON public.user_onboarding_events(progress_id, created_at DESC);

ALTER TABLE public.user_onboarding_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_onboarding_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.user_onboarding_progress,
  public.user_onboarding_events
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.onboarding_allowed_actions(
  target_status text
)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT CASE target_status
    WHEN 'in_progress' THEN ARRAY['advance', 'pause', 'block', 'complete', 'abandon']
    WHEN 'paused' THEN ARRAY['resume', 'abandon']
    WHEN 'blocked' THEN ARRAY['resume', 'abandon']
    WHEN 'abandoned' THEN ARRAY['resume']
    ELSE ARRAY[]::text[]
  END;
$$;

REVOKE ALL ON FUNCTION public.onboarding_allowed_actions(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.onboarding_allowed_actions(text)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_onboarding_progress(
  target_app_id text,
  target_intent text DEFAULT NULL
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
  IF target_app_id NOT IN ('web', 'business', 'client', 'control')
    OR (target_intent IS NOT NULL AND target_intent NOT IN (
      'client_account', 'establishment_request', 'professional_profile',
      'establishment_operations', 'payments', 'fiscal'
    ))
  THEN
    RAISE EXCEPTION 'invalid_onboarding_filter' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT jsonb_build_object(
    'progressId', progress.id,
    'appId', progress.app_id,
    'intent', progress.intent,
    'contextKind', progress.context_kind,
    'establishmentId', progress.establishment_id,
    'organizationId', progress.organization_id,
    'currentStep', progress.current_step,
    'status', progress.status,
    'allowedActions', public.onboarding_allowed_actions(progress.status),
    'version', progress.version,
    'dataCutoffAt', now(),
    'correlationId', progress.last_request_id,
    'lastResumedAt', progress.last_resumed_at,
    'completedAt', progress.completed_at,
    'updatedAt', progress.updated_at
  )
  FROM public.user_onboarding_progress AS progress
  WHERE progress.profile_id = actor_id
    AND progress.app_id = target_app_id
    AND (target_intent IS NULL OR progress.intent = target_intent)
    AND public.is_context_target_authorized(
      actor_id,
      progress.app_id,
      progress.context_kind,
      progress.establishment_id,
      progress.organization_id
    )
  ORDER BY progress.updated_at DESC, progress.id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_my_onboarding_progress(
  target_app_id text,
  target_intent text,
  target_context_kind text,
  target_establishment_id uuid,
  target_organization_id uuid,
  target_current_step text,
  target_status text,
  target_expected_version integer,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  progress public.user_onboarding_progress%ROWTYPE;
  existing_event public.user_onboarding_events%ROWTYPE;
  previous_step text;
  previous_status text;
  previous_version integer := 0;
  transition_allowed boolean := false;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_request_id IS NULL
    OR target_expected_version < 0
    OR target_intent NOT IN (
      'client_account', 'establishment_request', 'professional_profile',
      'establishment_operations', 'payments', 'fiscal'
    )
    OR target_current_step !~ '^[a-z][a-z0-9_]{1,79}$'
    OR target_status NOT IN (
      'in_progress', 'paused', 'blocked', 'completed', 'abandoned'
    )
  THEN
    RAISE EXCEPTION 'invalid_onboarding_request' USING ERRCODE = '22023';
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
  FROM public.user_onboarding_events AS event
  WHERE event.profile_id = actor_id
    AND event.app_id = target_app_id
    AND event.request_id = target_request_id;
  IF FOUND THEN
    SELECT * INTO progress
    FROM public.user_onboarding_progress AS current_progress
    WHERE current_progress.id = existing_event.progress_id;
    IF NOT FOUND
      OR progress.intent <> target_intent
      OR progress.context_kind <> target_context_kind
      OR progress.establishment_id IS DISTINCT FROM target_establishment_id
      OR progress.organization_id IS DISTINCT FROM target_organization_id
      OR existing_event.resulting_step <> target_current_step
      OR existing_event.resulting_status <> target_status
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    RETURN jsonb_build_object(
      'progressId', progress.id,
      'appId', progress.app_id,
      'intent', progress.intent,
      'contextKind', progress.context_kind,
      'establishmentId', progress.establishment_id,
      'organizationId', progress.organization_id,
      'currentStep', existing_event.resulting_step,
      'status', existing_event.resulting_status,
      'allowedActions', public.onboarding_allowed_actions(existing_event.resulting_status),
      'version', existing_event.resulting_version,
      'dataCutoffAt', now(),
      'correlationId', existing_event.correlation_id,
      'requestId', existing_event.request_id,
      'replayed', true
    );
  END IF;

  SELECT * INTO progress
  FROM public.user_onboarding_progress AS current_progress
  WHERE current_progress.profile_id = actor_id
    AND current_progress.app_id = target_app_id
    AND current_progress.intent = target_intent
    AND current_progress.context_kind = target_context_kind
    AND current_progress.establishment_id IS NOT DISTINCT FROM target_establishment_id
    AND current_progress.organization_id IS NOT DISTINCT FROM target_organization_id
  FOR UPDATE;

  IF NOT FOUND THEN
    IF target_expected_version <> 0 OR target_status <> 'in_progress' THEN
      RAISE EXCEPTION 'onboarding_version_conflict' USING ERRCODE = '40001';
    END IF;
    INSERT INTO public.user_onboarding_progress(
      profile_id, app_id, intent, context_kind, establishment_id,
      organization_id, current_step, status, version, last_request_id
    ) VALUES (
      actor_id, target_app_id, target_intent, target_context_kind,
      target_establishment_id, target_organization_id, target_current_step,
      target_status, 1, target_request_id
    ) RETURNING * INTO progress;
  ELSE
    IF progress.version <> target_expected_version THEN
      RAISE EXCEPTION 'onboarding_version_conflict' USING ERRCODE = '40001';
    END IF;
    previous_step := progress.current_step;
    previous_status := progress.status;
    previous_version := progress.version;
    transition_allowed := CASE progress.status
      WHEN 'in_progress' THEN target_status IN (
        'in_progress', 'paused', 'blocked', 'completed', 'abandoned'
      )
      WHEN 'paused' THEN target_status IN ('in_progress', 'abandoned')
      WHEN 'blocked' THEN target_status IN ('in_progress', 'abandoned')
      WHEN 'abandoned' THEN target_status = 'in_progress'
      ELSE false
    END;
    IF NOT transition_allowed THEN
      RAISE EXCEPTION 'invalid_onboarding_transition' USING ERRCODE = '22023';
    END IF;

    UPDATE public.user_onboarding_progress
    SET current_step = target_current_step,
        status = target_status,
        version = version + 1,
        last_request_id = target_request_id,
        last_resumed_at = CASE
          WHEN target_status = 'in_progress' AND progress.status <> 'in_progress'
            THEN now()
          ELSE last_resumed_at
        END,
        completed_at = CASE WHEN target_status = 'completed' THEN now() ELSE NULL END,
        updated_at = now()
    WHERE id = progress.id
    RETURNING * INTO progress;
  END IF;

  INSERT INTO public.user_onboarding_events(
    progress_id, profile_id, app_id, request_id, correlation_id,
    previous_step, resulting_step, previous_status, resulting_status,
    previous_version, resulting_version
  ) VALUES (
    progress.id, actor_id, target_app_id, target_request_id, target_request_id,
    previous_step, progress.current_step, previous_status, progress.status,
    previous_version, progress.version
  );

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'onboarding.progress.changed',
    target_establishment_id,
    jsonb_build_object(
      'app_id', target_app_id,
      'intent', target_intent,
      'context_kind', target_context_kind,
      'organization_id', target_organization_id,
      'current_step', target_current_step,
      'status', target_status,
      'version', progress.version,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'progressId', progress.id,
    'appId', progress.app_id,
    'intent', progress.intent,
    'contextKind', progress.context_kind,
    'establishmentId', progress.establishment_id,
    'organizationId', progress.organization_id,
    'currentStep', progress.current_step,
    'status', progress.status,
    'allowedActions', public.onboarding_allowed_actions(progress.status),
    'version', progress.version,
    'dataCutoffAt', now(),
    'correlationId', target_request_id,
    'requestId', target_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_onboarding_progress(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.set_my_onboarding_progress(
  text, text, text, uuid, uuid, text, text, integer, uuid
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_onboarding_progress(text, text)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_my_onboarding_progress(
  text, text, text, uuid, uuid, text, text, integer, uuid
) TO authenticated, service_role;

-- Extend authorized context read models for Web presentation. Capabilities are
-- calculated by the backend and never inferred from profiles.role.
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
      'establishmentSlug', NULL,
      'organizationId', NULL,
      'organizationName', NULL,
      'membershipId', NULL,
      'membershipRole', NULL,
      'membershipStatus', NULL,
      'roleTemplate', NULL,
      'organizationRole', NULL,
      'commissionRate', NULL,
      'establishmentStatus', NULL,
      'capabilities', ARRAY[]::text[],
      'allowedActions', ARRAY[]::text[],
      'active', EXISTS (
        SELECT 1 FROM public.user_app_active_contexts AS active_context
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
      'establishmentSlug', establishment.slug,
      'organizationId', NULL,
      'organizationName', NULL,
      'membershipId', membership.id,
      'membershipRole', membership.role,
      'membershipStatus', membership.status,
      'roleTemplate', membership.role_template,
      'organizationRole', NULL,
      'commissionRate', membership.commission_rate,
      'establishmentStatus', establishment.account_status::text,
      'capabilities', capabilities.resolved,
      'allowedActions', capabilities.resolved,
      'active', active_context.profile_id IS NOT NULL,
      'version', COALESCE(active_context.version, 0)
    )
    FROM public.memberships AS membership
    JOIN public.establishments AS establishment
      ON establishment.id = membership.establishment_id
    CROSS JOIN LATERAL (
      SELECT public.resolve_business_operational_capabilities(
        establishment.id, actor_id, 'full'
      ) AS resolved
    ) AS capabilities
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
      'establishmentSlug', NULL,
      'organizationId', organization.id,
      'organizationName', organization.name,
      'membershipId', NULL,
      'membershipRole', NULL,
      'membershipStatus', NULL,
      'roleTemplate', NULL,
      'organizationRole', member.role,
      'commissionRate', NULL,
      'establishmentStatus', NULL,
      'capabilities', ARRAY[]::text[],
      'allowedActions', CASE member.role
        WHEN 'owner' THEN ARRAY[
          'manage_organization', 'view_organization_reports',
          'manage_organization_billing'
        ]
        WHEN 'finance' THEN ARRAY[
          'view_organization_reports', 'manage_organization_billing'
        ]
        ELSE ARRAY['view_organization_reports']
      END,
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

COMMENT ON TABLE public.user_onboarding_progress IS
  'Resumable onboarding state by app, intent and authorized context. Contains no form answers or personal documents.';
COMMENT ON FUNCTION public.set_my_onboarding_progress(
  text, text, text, uuid, uuid, text, text, integer, uuid
) IS
  'Idempotently advances resumable onboarding after revalidating the current authorized context.';

COMMIT;
