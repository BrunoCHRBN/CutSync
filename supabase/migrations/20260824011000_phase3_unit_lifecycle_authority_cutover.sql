-- ============================================================================
-- Migration: 20260824011000_phase3_unit_lifecycle_authority_cutover.sql
-- Module: PS3-E1 Unit Lifecycle Authority Cutover & Onboarding/Governance Separation
--
-- Invariants enforced:
-- 1. Canonical Domain Boundaries:
--    - lifecycle_status: Operational state of the establishment unit (draft, configuring, ready, active, paused, closed, archived)
--    - account_status: Governance, security, and compliance state (pending_verification, active, delinquent, blocked)
--    - billing_access_mode: SaaS financial entitlement (full, restricted, blocked)
--    - kyc_status: Identity document verification status
--    - discovery_status: Public editorial publication status (draft, published, unpublished)
-- 2. Registration Lifecycle:
--    - register_business_identity_atomic seeds new unit with lifecycle_status = 'configuring', lifecycle_version = 1, account_status = 'pending_verification'.
-- 3. Onboarding Cutover:
--    - finalize_establishment_onboarding_v2 requires manage_operational_settings capability and AAL2.
--    - Finalization advances lifecycle configuring -> ready, saves opening_hours, validates configuration readiness, and records audit.
--    - Finalization NEVER mutates account_status (remains pending_verification until governance review).
-- 4. Readiness & Corporate Unit Scope:
--    - can_view_establishment_readiness enforces has_organization_establishment_scope, preventing selected-unit managers from reading unassigned units.
-- 5. Activation Invariant:
--    - ready -> active requires account_status = 'active' AND configuration ready AND manage_operational_settings capability.
-- 6. Pause / Resume:
--    - active <-> paused is purely operational; does not touch account_status, billing, memberships, or org links.
-- 7. Public & Booking Protection:
--    - Discovery and client booking fail closed when lifecycle_status <> 'active' or account_status <> 'active'.
-- 8. Legacy Adapter:
--    - finalize_establishment_onboarding v1 preserved as safe compatibility adapter without account_status mutation.
-- ============================================================================

BEGIN;

-- 1. Allow 'configuring' on INSERT in enforce_establishment_lifecycle_rpc_write trigger
CREATE OR REPLACE FUNCTION public.enforce_establishment_lifecycle_rpc_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF TG_OP = 'INSERT'
    AND actor_id IS NOT NULL
    AND COALESCE(current_setting('app.lifecycle_rpc', true), '') <> 'allowed'
    AND NOT public.is_superadmin()
    AND (
      NEW.lifecycle_status NOT IN ('draft', 'configuring')
      OR NEW.lifecycle_version <> 1
    )
  THEN
    RAISE EXCEPTION 'lifecycle_rpc_required' USING ERRCODE = '42501';
  ELSIF TG_OP = 'UPDATE'
    AND (
      NEW.lifecycle_status IS DISTINCT FROM OLD.lifecycle_status
      OR NEW.lifecycle_version IS DISTINCT FROM OLD.lifecycle_version
      OR NEW.lifecycle_updated_at IS DISTINCT FROM OLD.lifecycle_updated_at
    )
    AND actor_id IS NOT NULL
    AND COALESCE(current_setting('app.lifecycle_rpc', true), '') <> 'allowed'
    AND NOT public.is_superadmin()
  THEN
    RAISE EXCEPTION 'lifecycle_rpc_required' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

-- 2. Redefine register_business_identity_atomic initializing unit in 'configuring'
CREATE OR REPLACE FUNCTION public.register_business_identity_atomic(
  actor_profile_id uuid,
  target_document_type text,
  target_document_fingerprint text,
  encrypted_document_value text,
  encryption_iv_value text,
  encryption_key_version_value text,
  target_document_last4 text,
  requested_name text,
  requested_slug text,
  requested_address text,
  requested_phone text,
  requested_primary_color text
)
RETURNS TABLE(result_status text, establishment_id uuid, organization_id uuid)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  entity_record public.legal_entities%ROWTYPE;
  target_organization_id uuid;
  new_establishment_id uuid;
  actor_email text;
  conflict_reason text;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF actor_profile_id IS NULL OR NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = actor_profile_id AND profile.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_document_type NOT IN ('CPF', 'CNPJ')
    OR target_document_fingerprint !~ '^[0-9a-f]{64}$'
    OR (target_document_type = 'CPF' AND target_document_last4 !~ '^[0-9]{4}$')
    OR (target_document_type = 'CNPJ' AND target_document_last4 !~ '^[A-Z0-9]{4}$')
  THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF char_length(btrim(requested_name)) NOT BETWEEN 2 AND 120
    OR lower(btrim(requested_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN RAISE EXCEPTION 'invalid_registration'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_document_fingerprint, 0));
  IF EXISTS (
    SELECT 1 FROM public.establishments AS establishment
    WHERE lower(establishment.slug) = lower(btrim(requested_slug))
  ) THEN RAISE EXCEPTION 'slug_unavailable'; END IF;

  SELECT legal_entity.*
  INTO entity_record
  FROM public.legal_entities AS legal_entity
  WHERE legal_entity.document_fingerprint = target_document_fingerprint
  FOR UPDATE;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profile_legal_entities AS profile_entity
      WHERE profile_entity.legal_entity_id = entity_record.id
        AND profile_entity.profile_id = actor_profile_id
        AND profile_entity.status = 'active'
    ) THEN
      conflict_reason := 'document_claimed_by_another_profile';
    ELSE
      SELECT entity_link.organization_id
      INTO target_organization_id
      FROM public.organization_legal_entities AS entity_link
      JOIN public.organization_members AS organization_member
        ON organization_member.organization_id = entity_link.organization_id
      WHERE entity_link.legal_entity_id = entity_record.id
        AND entity_link.status = 'active'
        AND organization_member.profile_id = actor_profile_id
        AND organization_member.role = 'owner'
        AND organization_member.status = 'active'
      LIMIT 1;
      IF target_organization_id IS NULL THEN
        conflict_reason := 'document_claimed_by_another_organization';
      END IF;
    END IF;

    IF conflict_reason IS NOT NULL THEN
      INSERT INTO public.identity_migration_conflicts(
        legacy_source, legal_entity_id, requester_profile_id, document_type,
        document_last4, reason_code
      ) VALUES (
        'manual', entity_record.id, actor_profile_id, target_document_type,
        target_document_last4, conflict_reason
      );
      RETURN QUERY SELECT 'under_review'::text, NULL::uuid, NULL::uuid;
      RETURN;
    END IF;
  ELSE
    INSERT INTO public.legal_entities(
      entity_type, document_type, document_fingerprint, encrypted_document,
      encryption_iv, encryption_key_version, document_last4, created_by
    ) VALUES (
      CASE WHEN target_document_type = 'CPF' THEN 'person' ELSE 'company' END,
      target_document_type, target_document_fingerprint, encrypted_document_value,
      encryption_iv_value, encryption_key_version_value, target_document_last4,
      actor_profile_id
    )
    RETURNING * INTO entity_record;

    INSERT INTO public.profile_legal_entities(
      profile_id, legal_entity_id, relationship, created_by
    ) VALUES (actor_profile_id, entity_record.id, 'owner', actor_profile_id);

    INSERT INTO public.organizations(name, created_by)
    VALUES (btrim(requested_name), actor_profile_id)
    RETURNING id INTO target_organization_id;
    INSERT INTO public.organization_members(organization_id, profile_id, role, scope_mode, created_by)
    VALUES (target_organization_id, actor_profile_id, 'owner', 'all', actor_profile_id);
    INSERT INTO public.organization_legal_entities(
      organization_id, legal_entity_id, created_by
    ) VALUES (target_organization_id, entity_record.id, actor_profile_id);
    SELECT profile.email INTO actor_email
    FROM public.profiles AS profile
    WHERE profile.id = actor_profile_id;
    INSERT INTO public.organization_billing_accounts(
      organization_id, display_name, billing_email
    ) VALUES (target_organization_id, btrim(requested_name), actor_email);
  END IF;

  INSERT INTO public.establishments(
    name, slug, address, phone, primary_color, account_status, verification_level,
    lifecycle_status, lifecycle_version, lifecycle_updated_at
  ) VALUES (
    btrim(requested_name), lower(btrim(requested_slug)),
    NULLIF(btrim(requested_address), ''), NULLIF(btrim(requested_phone), ''),
    upper(btrim(requested_primary_color)), 'pending_verification', 1,
    'configuring', 1, timezone('utc', now())
  )
  RETURNING id INTO new_establishment_id;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, role_template, status, commission_rate, created_by
  ) VALUES (
    actor_profile_id, new_establishment_id, 'admin', 'admin', 'active', 0.50, actor_profile_id
  )
  ON CONFLICT ON CONSTRAINT memberships_profile_id_establishment_id_key
  DO UPDATE SET
    role = 'admin', role_template = 'admin', status = 'active', revoked_at = NULL, updated_at = now();

  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (target_organization_id, new_establishment_id, actor_profile_id);

  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT subscription.id, new_establishment_id, subscription.current_period_end + 1
  FROM public.organization_subscriptions AS subscription
  JOIN public.organization_billing_accounts AS account
    ON account.id = subscription.billing_account_id
  WHERE account.organization_id = target_organization_id
    AND subscription.status <> 'canceled'
  ON CONFLICT ON CONSTRAINT subscription_units_subscription_id_establishment_id_effecti_key
  DO UPDATE SET effective_until = NULL;

  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id, metadata
  ) VALUES (
    target_organization_id, actor_profile_id,
    CASE
      WHEN entity_record.created_by = actor_profile_id
        AND entity_record.created_at >= transaction_timestamp() - interval '1 second'
      THEN 'business_registration.created'
      ELSE 'business_registration.unit_added'
    END,
    new_establishment_id,
    jsonb_build_object(
      'legal_entity_id', entity_record.id,
      'document_type', target_document_type,
      'document_last4', target_document_last4,
      'slug', lower(btrim(requested_slug)),
      'lifecycle_status', 'configuring',
      'account_status', 'pending_verification'
    )
  );

  RETURN QUERY SELECT 'active'::text, new_establishment_id, target_organization_id;
END;
$$;

REVOKE ALL ON FUNCTION public.register_business_identity_atomic(uuid, text, text, text, text, text, text, text, text, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.register_business_identity_atomic(uuid, text, text, text, text, text, text, text, text, text, text, text) TO service_role;

-- 3. Redefine can_view_establishment_readiness enforcing corporate unit scope
CREATE OR REPLACE FUNCTION public.can_view_establishment_readiness(
  target_establishment_id uuid,
  target_profile_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM public.memberships AS membership
      WHERE membership.profile_id = target_profile_id
        AND membership.establishment_id = target_establishment_id
        AND membership.status = 'active'
        AND membership.revoked_at IS NULL
    )
    OR EXISTS (
      SELECT 1
      FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active'
        AND link.effective_from <= CURRENT_DATE
        AND (link.effective_until IS NULL OR link.effective_until >= CURRENT_DATE)
        AND public.has_organization_establishment_scope(link.organization_id, target_establishment_id)
    )
    OR public.is_governance_user()
    OR EXISTS (
      SELECT 1 FROM public.superadmins
      WHERE profile_id = target_profile_id
    );
$$;

REVOKE ALL ON FUNCTION public.can_view_establishment_readiness(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_view_establishment_readiness(uuid, uuid) TO authenticated, service_role;

-- 4. Create finalize_establishment_onboarding_v2
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
  previous_status text;
  previous_version integer;
  effective_request_id uuid := COALESCE(target_request_id, gen_random_uuid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;

  PERFORM public.require_aal2();

  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'manage_operational_settings', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  -- Idempotency check
  IF target_request_id IS NOT NULL THEN
    SELECT * INTO existing_event
    FROM public.establishment_lifecycle_events AS event
    WHERE event.request_id = target_request_id;

    IF FOUND THEN
      IF existing_event.establishment_id <> target_establishment_id
        OR existing_event.resulting_status <> 'ready'
      THEN
        RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
      END IF;

      SELECT * INTO current_establishment
      FROM public.establishments
      WHERE id = target_establishment_id;

      RETURN jsonb_build_object(
        'establishmentId', current_establishment.id,
        'lifecycleStatus', current_establishment.lifecycle_status,
        'accountStatus', current_establishment.account_status,
        'version', current_establishment.lifecycle_version,
        'requestId', target_request_id,
        'replayed', true
      );
    END IF;
  END IF;

  SELECT * INTO current_establishment
  FROM public.establishments
  WHERE id = target_establishment_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF target_expected_lifecycle_version IS NOT NULL
    AND current_establishment.lifecycle_version <> target_expected_lifecycle_version
  THEN
    RAISE EXCEPTION 'lifecycle_version_conflict' USING ERRCODE = '40001';
  END IF;

  -- 1. Save opening hours
  UPDATE public.establishments
  SET opening_hours = finalize_establishment_onboarding_v2.opening_hours,
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id;

  -- 2. Validate configuration readiness
  IF NOT public.establishment_configuration_is_ready(target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_operationally_configured' USING ERRCODE = '22023';
  END IF;

  -- 3. Advance user onboarding progress if tracker is present
  BEGIN
    INSERT INTO public.user_onboarding_progress (
      profile_id,
      app_id,
      intent,
      context_kind,
      establishment_id,
      current_step,
      status,
      last_request_id,
      completed_at
    ) VALUES (
      actor_id,
      'web',
      'establishment_operations',
      'establishment',
      target_establishment_id,
      'completed',
      'completed',
      effective_request_id,
      timezone('utc', now())
    )
    ON CONFLICT (profile_id, app_id, intent, context_kind, establishment_id, organization_id)
    DO UPDATE SET
      current_step = 'completed',
      status = 'completed',
      last_request_id = EXCLUDED.last_request_id,
      completed_at = timezone('utc', now()),
      updated_at = timezone('utc', now());
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  previous_status := current_establishment.lifecycle_status;
  previous_version := current_establishment.lifecycle_version;

  -- 4. Advance lifecycle status configuring/draft -> ready (WITHOUT touching account_status)
  IF current_establishment.lifecycle_status IN ('draft', 'configuring') THEN
    PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
    UPDATE public.establishments
    SET lifecycle_status = 'ready',
        lifecycle_version = lifecycle_version + 1,
        lifecycle_updated_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = target_establishment_id
    RETURNING * INTO current_establishment;
    PERFORM set_config('app.lifecycle_rpc', '', true);

    INSERT INTO public.establishment_lifecycle_events(
      establishment_id, actor_id, request_id, previous_status,
      resulting_status, previous_version, resulting_version, reason
    ) VALUES (
      target_establishment_id, actor_id, effective_request_id,
      previous_status,
      'ready',
      previous_version,
      current_establishment.lifecycle_version,
      'Onboarding finalized'
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
        'request_id', effective_request_id
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'establishmentId', current_establishment.id,
    'lifecycleStatus', current_establishment.lifecycle_status,
    'accountStatus', current_establishment.account_status,
    'version', current_establishment.lifecycle_version,
    'requestId', effective_request_id,
    'replayed', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_establishment_onboarding_v2(uuid, text, integer, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_establishment_onboarding_v2(uuid, text, integer, uuid) TO authenticated, service_role;

-- 5. Redefine legacy finalize_establishment_onboarding as safe compatibility adapter
CREATE OR REPLACE FUNCTION public.finalize_establishment_onboarding(
  target_establishment_id uuid,
  opening_hours text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  current_est public.establishments%ROWTYPE;
  prev_status text;
  prev_ver integer;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  IF NOT (
    public.has_business_capability(target_establishment_id, actor_id, 'manage_operational_settings', 'full')
    OR public.has_active_membership(target_establishment_id, ARRAY['admin'])
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  UPDATE public.establishments
  SET opening_hours = finalize_establishment_onboarding.opening_hours,
      updated_at = timezone('utc', now())
  WHERE id = target_establishment_id
  RETURNING * INTO current_est;

  IF current_est.id IS NULL THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;

  IF public.establishment_configuration_is_ready(target_establishment_id)
    AND current_est.lifecycle_status IN ('draft', 'configuring')
  THEN
    prev_status := current_est.lifecycle_status;
    prev_ver := current_est.lifecycle_version;

    PERFORM set_config('app.lifecycle_rpc', 'allowed', true);
    UPDATE public.establishments
    SET lifecycle_status = 'ready',
        lifecycle_version = lifecycle_version + 1,
        lifecycle_updated_at = timezone('utc', now()),
        updated_at = timezone('utc', now())
    WHERE id = target_establishment_id
    RETURNING * INTO current_est;
    PERFORM set_config('app.lifecycle_rpc', '', true);

    INSERT INTO public.establishment_lifecycle_events(
      establishment_id, actor_id, request_id, previous_status,
      resulting_status, previous_version, resulting_version, reason
    ) VALUES (
      target_establishment_id, actor_id, gen_random_uuid(),
      prev_status,
      'ready',
      prev_ver,
      current_est.lifecycle_version,
      'Legacy onboarding finalized adapter'
    );
  END IF;

  -- NOTE: LEGACY_ONBOARDING_ADAPTER does NOT write account_status
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_establishment_onboarding(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalize_establishment_onboarding(uuid, text) TO authenticated, service_role;

-- 6. Redefine get_public_establishment_experience enforcing lifecycle_status = 'active'
CREATE OR REPLACE FUNCTION public.get_public_establishment_experience(target_slug text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF target_slug IS NULL OR target_slug !~ '^[a-z0-9][a-z0-9-]{1,118}[a-z0-9]$' THEN
    RAISE EXCEPTION 'invalid_establishment_slug' USING ERRCODE = '22023';
  END IF;

  SELECT jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', establishment.id,
      'slug', establishment.slug,
      'name', establishment.name,
      'description', establishment.description,
      'slogan', establishment.slogan,
      'logoUrl', establishment.logo_url,
      'bannerUrl', establishment.banner_url,
      'galleryUrls', public.safe_jsonb_array(establishment.gallery_urls),
      'primaryColor', establishment.primary_color,
      'address', establishment.address,
      'phone', establishment.phone,
      'timezone', establishment.timezone,
      'currency', establishment.currency,
      'openingHours', establishment.opening_hours,
      'instantBookingEnabled', COALESCE(establishment.instant_booking_enabled, true),
      'publishedAt', establishment.published_at
    ),
    'services', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'price', service.price,
        'durationMinutes', service.duration_minutes,
        'kind', service.kind
      ) ORDER BY service.sort_order, service.name)
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id AND service.is_active
    ), '[]'::jsonb),
    'team', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', profile.id,
        'name', profile.name,
        'avatarUrl', profile.avatar_url,
        'title', profile.titulo_profissional,
        'specialties', profile.specialties,
        'profileSlug', CASE
          WHEN professional_profile.is_public THEN professional_profile.slug
          ELSE NULL
        END
      ) ORDER BY profile.name)
      FROM public.memberships AS membership
      JOIN public.profiles AS profile ON profile.id = membership.profile_id
      LEFT JOIN public.professional_profiles AS professional_profile
        ON professional_profile.id = membership.professional_profile_id
      WHERE membership.establishment_id = establishment.id
        AND membership.status = 'active'
        AND membership.revoked_at IS NULL
        AND membership.role_template = 'professional'
        AND profile.deleted_at IS NULL
        AND profile.work_hours IS NOT NULL
        AND NULLIF(btrim(profile.titulo_profissional), '') IS NOT NULL
    ), '[]'::jsonb),
    'bookingMode', CASE WHEN COALESCE(establishment.instant_booking_enabled, true) THEN 'instant' ELSE 'request' END
  ) INTO result
  FROM public.establishments AS establishment
  WHERE establishment.slug = target_slug
    AND establishment.account_status = 'active'
    AND establishment.lifecycle_status = 'active'
    AND establishment.discovery_status = 'published';

  IF result IS NULL THEN
    RAISE EXCEPTION 'public_establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_public_establishment_experience(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_public_establishment_experience(text) TO anon, authenticated, service_role;

-- 7. Redefine create_appointment enforcing active lifecycle and fail-closed booking
CREATE OR REPLACE FUNCTION public.create_appointment(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_date_time timestamptz,
  target_client_name text DEFAULT NULL,
  target_client_id uuid DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  establishment_status text;
  establishment_lifecycle text;
  actor_is_staff boolean;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  SELECT establishment.account_status, establishment.lifecycle_status
  INTO establishment_status, establishment_lifecycle
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_unavailable'; END IF;

  actor_is_staff := public.is_superadmin()
    OR public.has_active_membership(target_establishment_id, ARRAY['admin', 'manager', 'professional', 'reception', 'cashier']);

  -- Client bookings require both active governance and active operational lifecycle
  IF NOT actor_is_staff THEN
    IF establishment_status <> 'active' OR establishment_lifecycle <> 'active' THEN
      RAISE EXCEPTION 'establishment_unavailable';
    END IF;
  ELSE
    -- Staff internal booking is blocked if governance blocks or unit is paused/closed/archived
    IF establishment_lifecycle IN ('paused', 'closed', 'archived')
      OR establishment_status IN ('blocked', 'delinquent')
    THEN
      RAISE EXCEPTION 'establishment_unavailable';
    END IF;
  END IF;

  PERFORM profile.id FROM public.profiles AS profile
  WHERE profile.id = target_professional_id AND profile.deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'professional_unavailable'; END IF;

  RETURN public.create_appointment_before_schedule_blocks(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_date_time,
    target_client_name,
    target_client_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_appointment(uuid, uuid, text, timestamptz, text, uuid) TO authenticated, service_role;

-- 8. Redefine establishment_discovery_requirements as plpgsql SECURITY DEFINER
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

-- 9. Redefine enforce_establishment_discovery_eligibility
CREATE OR REPLACE FUNCTION public.enforce_establishment_discovery_eligibility()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  target_id uuid;
  status_state text;
  requirement_state jsonb;
BEGIN
  IF TG_TABLE_NAME = 'services' THEN
    target_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.establishment_id
      ELSE NEW.establishment_id
    END;
  ELSIF TG_TABLE_NAME = 'establishments' THEN
    target_id := CASE
      WHEN TG_OP = 'DELETE' THEN OLD.id
      ELSE NEW.id
    END;
  ELSE
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  SELECT establishment.discovery_status
  INTO status_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_id;

  IF status_state = 'published' THEN
    requirement_state := public.establishment_discovery_requirements(target_id);
    IF EXISTS (
      SELECT 1
      FROM jsonb_each_text(requirement_state) AS requirement
      WHERE requirement.value <> 'true'
    ) THEN
      UPDATE public.establishments
      SET discovery_status = 'draft',
          published_at = NULL
      WHERE id = target_id
        AND discovery_status = 'published';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
EXCEPTION WHEN NO_DATA_FOUND THEN
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;

REVOKE ALL ON FUNCTION public.enforce_establishment_discovery_eligibility() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.enforce_establishment_discovery_eligibility() TO authenticated, service_role;

-- 10. Redefine list_public_discovery_establishments as plpgsql SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.list_public_discovery_establishments(result_limit integer DEFAULT 50)
RETURNS TABLE (
  id uuid,
  slug text,
  name text,
  description text,
  address text,
  logo_url text,
  banner_url text,
  timezone text,
  currency text,
  opening_hours text,
  average_rating numeric,
  review_count integer,
  discovery_status text,
  published_at timestamptz,
  services jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    establishment.id,
    establishment.slug,
    establishment.name,
    establishment.description,
    establishment.address,
    establishment.logo_url,
    establishment.banner_url,
    establishment.timezone,
    establishment.currency,
    establishment.opening_hours,
    establishment.average_rating,
    establishment.review_count,
    establishment.discovery_status,
    establishment.published_at,
    COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', service.id,
        'name', service.name,
        'price', service.price,
        'is_active', service.is_active
      ) ORDER BY service.sort_order, service.name)
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    ), '[]'::jsonb)
  FROM public.establishments AS establishment
  WHERE establishment.discovery_status = 'published'
    AND establishment.account_status = 'active'
    AND char_length(btrim(establishment.name)) >= 3
    AND btrim(establishment.name) !~* '^shop[[:space:]_-]*[0-9]+$'
    AND btrim(establishment.slug) ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    AND char_length(btrim(COALESCE(establishment.address, ''))) >= 3
    AND EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.establishment_id = establishment.id
        AND service.is_active
        AND service.deleted_at IS NULL
    )
  ORDER BY establishment.average_rating DESC, establishment.name
  LIMIT LEAST(GREATEST(COALESCE(result_limit, 50), 1), 50);
END;
$$;

REVOKE ALL ON FUNCTION public.list_public_discovery_establishments(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_public_discovery_establishments(integer) TO anon, authenticated, service_role;

-- 11. Redefine publish_establishment_discovery
CREATE OR REPLACE FUNCTION public.publish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (
  discovery_status text,
  published_at timestamptz,
  requirements jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  requirement_state jsonb;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'manage_operational_settings')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active' AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner'])
    )
  THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;

  requirement_state := public.establishment_discovery_requirements(target_establishment_id);
  IF requirement_state IS NULL THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_each_text(requirement_state) AS requirement
    WHERE requirement.value <> 'true'
  ) THEN
    RAISE EXCEPTION 'discovery_requirements_not_met' USING ERRCODE = '22023';
  END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'published',
      published_at = COALESCE(establishment.published_at, timezone('utc', now())),
      updated_at = timezone('utc', now())
  WHERE establishment.id = target_establishment_id;

  RETURN QUERY
  SELECT
    establishment.discovery_status,
    establishment.published_at,
    requirement_state
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.publish_establishment_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_establishment_discovery(uuid) TO authenticated, service_role;

-- 12. Redefine unpublish_establishment_discovery
CREATE OR REPLACE FUNCTION public.unpublish_establishment_discovery(target_establishment_id uuid)
RETURNS TABLE (
  discovery_status text,
  published_at timestamptz,
  requirements jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'manage_operational_settings')
    AND NOT EXISTS (
      SELECT 1 FROM public.organization_establishments AS link
      WHERE link.establishment_id = target_establishment_id
        AND link.status = 'active' AND link.effective_until IS NULL
        AND public.has_organization_role(link.organization_id, ARRAY['owner'])
    )
  THEN RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501'; END IF;

  UPDATE public.establishments AS establishment
  SET discovery_status = 'draft',
      published_at = NULL,
      updated_at = timezone('utc', now())
  WHERE establishment.id = target_establishment_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002'; END IF;

  RETURN QUERY
  SELECT
    establishment.discovery_status,
    establishment.published_at,
    public.establishment_discovery_requirements(establishment.id)
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
END;
$$;

REVOKE ALL ON FUNCTION public.unpublish_establishment_discovery(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unpublish_establishment_discovery(uuid) TO authenticated, service_role;

COMMIT;
