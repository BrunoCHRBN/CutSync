-- ============================================================================
-- Migration: 20260824013000_phase3_onboarding_idempotency_editorial_decoupling.sql
-- Module: PS3-E1.3 Final Onboarding Idempotency & Editorial Decoupling
-- ============================================================================

-- 1. Ensure metadata column exists on establishment_lifecycle_events for robust replay snapshots
ALTER TABLE public.establishment_lifecycle_events
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb;

-- 2. Decouple lifecycle pause from editorial auto-unpublish
-- Redefine establishment_discovery_requirements to purely evaluate editorial & governance invariants
CREATE OR REPLACE FUNCTION public.establishment_discovery_requirements(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  res jsonb;
BEGIN
  SELECT jsonb_build_object(
    'account_active', COALESCE(establishment.account_status = 'active', false),
    'name_valid', (
      char_length(btrim(establishment.name)) >= 3
      AND btrim(establishment.name) !~* '^shop[[:space:]_-]*[0-9]+$'
    ),
    'slug_valid', btrim(establishment.slug) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$',
    'address_present', char_length(btrim(COALESCE(establishment.address, ''))) >= 3,
    'active_service_present', EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    )
  ) INTO res
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  RETURN res;
END;
$$;

REVOKE ALL ON FUNCTION public.establishment_discovery_requirements(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.establishment_discovery_requirements(uuid) TO authenticated, service_role;

-- 3. Trigger on establishments: only track editorial invariants (do not auto-unpublish on operational pause)
DROP TRIGGER IF EXISTS enforce_discovery_after_establishment_change ON public.establishments;
CREATE TRIGGER enforce_discovery_after_establishment_change
  AFTER UPDATE OF account_status, name, slug, address ON public.establishments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_establishment_discovery_eligibility();

-- 4. Redefine finalize_establishment_onboarding_v2 with exact idempotency, canonical progress & transaction integrity
CREATE OR REPLACE FUNCTION public.finalize_establishment_onboarding_v2(
  target_establishment_id uuid,
  opening_hours text,
  target_expected_lifecycle_version integer DEFAULT NULL,
  target_request_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_establishment public.establishments%ROWTYPE;
  existing_event public.establishment_lifecycle_events%ROWTYPE;
  existing_progress public.user_onboarding_progress%ROWTYPE;
  previous_status text;
  previous_version integer;
  tracker_prev_step text;
  tracker_prev_status text;
  tracker_prev_version integer;
BEGIN
  -- Strict contract validation: request_id and expected_version are mandatory
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  IF target_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_onboarding_request' USING ERRCODE = '22023';
  END IF;

  IF target_expected_lifecycle_version IS NULL OR target_expected_lifecycle_version <= 0 THEN
    RAISE EXCEPTION 'invalid_onboarding_request' USING ERRCODE = '22023';
  END IF;

  PERFORM public.require_aal2();

  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'manage_operational_settings', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- 1. Idempotency Check & Stable Original Replay
  SELECT * INTO existing_event
  FROM public.establishment_lifecycle_events AS event
  WHERE event.request_id = target_request_id;

  IF FOUND THEN
    -- Validate exact payload fingerprint
    IF existing_event.establishment_id <> target_establishment_id
      OR existing_event.resulting_status <> 'ready'
      OR existing_event.actor_id IS DISTINCT FROM actor_id
      OR COALESCE(existing_event.metadata->>'opening_hours', '') <> COALESCE(finalize_establishment_onboarding_v2.opening_hours, '')
    THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;

    -- Return the EXACT original recorded result snapshot (not the current live status)
    RETURN jsonb_build_object(
      'establishmentId', existing_event.establishment_id,
      'lifecycleStatus', existing_event.resulting_status,
      'accountStatus', COALESCE(
        existing_event.metadata->>'account_status',
        (SELECT account_status FROM public.establishments WHERE id = target_establishment_id)
      ),
      'version', existing_event.resulting_version,
      'requestId', target_request_id,
      'replayed', true
    );
  END IF;

  -- 2. Lock establishment row and validate state machine & optimistic token
  SELECT * INTO current_establishment
  FROM public.establishments
  WHERE id = target_establishment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  -- Reject finalize if establishment is already ready, active, paused, closed, or archived
  IF current_establishment.lifecycle_status NOT IN ('draft', 'configuring') THEN
    RAISE EXCEPTION 'onboarding_already_finalized' USING ERRCODE = '22023';
  END IF;

  -- Verify optimistic concurrency version
  IF current_establishment.lifecycle_version <> target_expected_lifecycle_version THEN
    RAISE EXCEPTION 'lifecycle_version_conflict' USING ERRCODE = '40001';
  END IF;

  -- 3. Save opening hours
  UPDATE public.establishments
  SET opening_hours = finalize_establishment_onboarding_v2.opening_hours,
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id;

  -- 4. Validate configuration readiness
  IF NOT public.establishment_configuration_is_ready(target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_operationally_configured' USING ERRCODE = '22023';
  END IF;

  -- 5. Canonical User Onboarding Progress Integration (Tracker is optional, but must remain consistent if present)
  SELECT * INTO existing_progress
  FROM public.user_onboarding_progress
  WHERE profile_id = actor_id
    AND app_id = 'web'
    AND intent = 'establishment_operations'
    AND context_kind = 'establishment'
    AND establishment_id = target_establishment_id
  FOR UPDATE;

  IF FOUND THEN
    IF existing_progress.status = 'in_progress' THEN
      tracker_prev_step := existing_progress.current_step;
      tracker_prev_status := existing_progress.status;
      tracker_prev_version := existing_progress.version;

      UPDATE public.user_onboarding_progress
      SET current_step = 'completed',
          status = 'completed',
          version = version + 1,
          last_request_id = target_request_id,
          completed_at = timezone('utc', now()),
          updated_at = timezone('utc', now())
      WHERE id = existing_progress.id
      RETURNING * INTO existing_progress;

      INSERT INTO public.user_onboarding_events(
        progress_id, profile_id, app_id, request_id, correlation_id,
        previous_step, resulting_step, previous_status, resulting_status,
        previous_version, resulting_version
      ) VALUES (
        existing_progress.id, actor_id, 'web', target_request_id, target_request_id,
        tracker_prev_step, 'completed', tracker_prev_status, 'completed',
        tracker_prev_version, existing_progress.version
      );

      INSERT INTO public.authorization_audit_log(
        actor_id, action, establishment_id, metadata
      ) VALUES (
        actor_id,
        'onboarding.progress.changed',
        target_establishment_id,
        jsonb_build_object(
          'app_id', 'web',
          'intent', 'establishment_operations',
          'context_kind', 'establishment',
          'current_step', 'completed',
          'status', 'completed',
          'version', existing_progress.version,
          'request_id', target_request_id
        )
      );
    ELSIF existing_progress.status <> 'completed' THEN
      RAISE EXCEPTION 'invalid_onboarding_transition' USING ERRCODE = '22023';
    END IF;
  END IF;

  previous_status := current_establishment.lifecycle_status;
  previous_version := current_establishment.lifecycle_version;

  -- 6. Advance lifecycle to 'ready' (increments lifecycle_version, preserves account_status)
  PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
  UPDATE public.establishments
  SET lifecycle_status = 'ready',
      lifecycle_version = lifecycle_version + 1,
      lifecycle_updated_at = timezone('utc', now()),
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id
  RETURNING * INTO current_establishment;
  PERFORM set_config('app.lifecycle_rpc', '', true);

  -- 7. Record lifecycle event with metadata snapshot
  INSERT INTO public.establishment_lifecycle_events(
    establishment_id, actor_id, request_id, previous_status,
    resulting_status, previous_version, resulting_version, reason,
    metadata
  ) VALUES (
    target_establishment_id, actor_id, target_request_id,
    previous_status,
    'ready',
    previous_version,
    current_establishment.lifecycle_version,
    'Onboarding finalized',
    jsonb_build_object(
      'opening_hours', finalize_establishment_onboarding_v2.opening_hours,
      'account_status', current_establishment.account_status,
      'resulting_status', 'ready',
      'resulting_version', current_establishment.lifecycle_version
    )
  );

  INSERT INTO public.authorization_audit_log(
    actor_id, action, establishment_id, metadata
  ) VALUES (
    actor_id,
    'establishment.onboarding_finalized',
    target_establishment_id,
    jsonb_build_object(
      'lifecycle_status', 'ready',
      'account_status', current_establishment.account_status,
      'version', current_establishment.lifecycle_version,
      'request_id', target_request_id
    )
  );

  RETURN jsonb_build_object(
    'establishmentId', current_establishment.id,
    'lifecycleStatus', current_establishment.lifecycle_status,
    'accountStatus', current_establishment.account_status,
    'version', current_establishment.lifecycle_version,
    'requestId', target_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_establishment_onboarding_v2(uuid, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_establishment_onboarding_v2(uuid, text, integer, uuid) TO authenticated, service_role;
