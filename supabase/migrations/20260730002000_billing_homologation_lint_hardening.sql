BEGIN;
-- Forward-only lint hardening for the RPCs exercised by onboarding,
-- governance, invitations and professional profile management.

CREATE OR REPLACE FUNCTION public.upsert_my_professional_profile(
  requested_slug text,
  requested_bio text DEFAULT NULL,
  requested_portfolio_url text DEFAULT NULL,
  requested_instagram_url text DEFAULT NULL,
  requested_gallery_urls jsonb DEFAULT '[]'::jsonb,
  requested_is_public boolean DEFAULT false
)
RETURNS TABLE (profile_id uuid, profile_slug text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_slug text := lower(trim(requested_slug));
  generated_id uuid;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.professional_profiles profile
    WHERE profile.user_id = (SELECT auth.uid())
  ) AND NOT EXISTS (
    SELECT 1 FROM public.memberships membership
    WHERE membership.profile_id = (SELECT auth.uid())
      AND membership.role IN ('professional', 'admin') AND membership.status = 'active'
  ) THEN RAISE EXCEPTION 'professional_membership_required'; END IF;
  IF normalized_slug !~ '^[a-z0-9][a-z0-9-]{2,62}$' THEN RAISE EXCEPTION 'invalid_slug'; END IF;
  IF char_length(COALESCE(requested_bio, '')) > 1000 THEN RAISE EXCEPTION 'bio_too_long'; END IF;
  IF NOT public.is_safe_public_url(NULLIF(trim(requested_portfolio_url), ''))
    OR NOT public.is_safe_public_url(NULLIF(trim(requested_instagram_url), ''))
  THEN RAISE EXCEPTION 'invalid_public_url'; END IF;
  IF NOT public.is_valid_professional_gallery(COALESCE(requested_gallery_urls, '[]'::jsonb))
  THEN RAISE EXCEPTION 'invalid_gallery'; END IF;

  INSERT INTO public.professional_profiles(
    user_id, slug, bio, portfolio_url, instagram_url, gallery_urls, is_public
  ) VALUES (
    (SELECT auth.uid()), normalized_slug, NULLIF(trim(requested_bio), ''),
    NULLIF(trim(requested_portfolio_url), ''), NULLIF(trim(requested_instagram_url), ''),
    COALESCE(requested_gallery_urls, '[]'::jsonb), requested_is_public
  )
  ON CONFLICT (user_id) DO UPDATE SET
    slug = EXCLUDED.slug, bio = EXCLUDED.bio, portfolio_url = EXCLUDED.portfolio_url,
    instagram_url = EXCLUDED.instagram_url, gallery_urls = EXCLUDED.gallery_urls,
    is_public = EXCLUDED.is_public, updated_at = now()
  RETURNING id INTO generated_id;

  UPDATE public.memberships AS membership
  SET professional_profile_id = generated_id, updated_at = now()
  WHERE membership.profile_id = (SELECT auth.uid())
    AND membership.role IN ('professional', 'admin')
    AND membership.status = 'active';

  INSERT INTO public.authorization_audit_log(actor_id, action, target_profile_id, metadata)
  VALUES ((SELECT auth.uid()), 'professional_profile.updated', (SELECT auth.uid()),
    jsonb_build_object('slug', normalized_slug, 'is_public', requested_is_public));

  RETURN QUERY SELECT generated_id, normalized_slug;
END;
$$;
CREATE OR REPLACE FUNCTION public.create_establishment_invite_v2(
  target_establishment_id uuid,
  target_contact text,
  target_role text
)
RETURNS TABLE (invitation_id uuid, raw_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  normalized_contact text := lower(trim(target_contact));
  generated_token text := encode(extensions.gen_random_bytes(32), 'hex');
  generated_id uuid;
  generated_expiry timestamptz := now() + interval '24 hours';
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_role NOT IN ('admin', 'professional') THEN RAISE EXCEPTION 'invalid_role'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.establishments establishment
    WHERE establishment.id = target_establishment_id
  ) THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF target_role = 'admin' AND NOT public.is_superadmin() THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_role = 'professional'
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin'])
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  UPDATE public.establishment_invites AS invitation
  SET status = 'revoked', revoked_at = now()
  WHERE invitation.establishment_id = target_establishment_id
    AND lower(invitation.target_contact) = normalized_contact
    AND invitation.role = target_role
    AND invitation.status = 'pending';

  INSERT INTO public.establishment_invites (
    establishment_id, target_contact, role, token_hash, expires_at, created_by
  ) VALUES (
    target_establishment_id, normalized_contact, target_role,
    encode(extensions.digest(generated_token, 'sha256'), 'hex'),
    generated_expiry, (SELECT auth.uid())
  )
  RETURNING id INTO generated_id;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()), 'invite.created', generated_id, 'invite',
    jsonb_build_object(
      'establishment_id', target_establishment_id,
      'role', target_role,
      'contact', normalized_contact
    )
  );

  RETURN QUERY SELECT generated_id, generated_token, generated_expiry;
END;
$$;
CREATE OR REPLACE FUNCTION public.review_governance_verification(
  target_review_id uuid,
  target_decision text,
  reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  review public.governance_verification_reviews%ROWTYPE;
  old_status text;
  normalized_reason text := btrim(coalesce(reason, ''));
BEGIN
  IF NOT public.is_governance_user(
    ARRAY['SaaS_Editor','SaaS_Owner']::public.governance_role_enum[]
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_decision NOT IN ('approved','rejected') THEN
    RAISE EXCEPTION 'invalid_verification_decision';
  END IF;
  IF char_length(normalized_reason) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'verification_reason_required';
  END IF;

  SELECT verification_review.*
  INTO review
  FROM public.governance_verification_reviews AS verification_review
  WHERE verification_review.id = target_review_id
    AND verification_review.decision = 'submitted'
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'verification_review_not_pending'; END IF;

  SELECT establishment.kyc_status
  INTO old_status
  FROM public.establishments AS establishment
  WHERE establishment.id = review.establishment_id
  FOR UPDATE;

  UPDATE public.establishments AS establishment
  SET
    kyc_status = target_decision,
    verification_level = CASE
      WHEN target_decision = 'approved' THEN greatest(establishment.verification_level, 3)
      ELSE establishment.verification_level
    END,
    updated_at = now()
  WHERE establishment.id = review.establishment_id;

  UPDATE public.governance_verification_reviews AS verification_review
  SET
    decision = target_decision,
    reviewer_id = (SELECT auth.uid()),
    reason = normalized_reason
  WHERE verification_review.id = target_review_id;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()), 'governance.kyc.reviewed',
    review.establishment_id, 'establishment',
    jsonb_build_object(
      'review_id', target_review_id,
      'decision', target_decision,
      'previous_status', old_status,
      'reason_provided', true
    )
  );
  RETURN jsonb_build_object(
    'establishment_id', review.establishment_id,
    'decision', target_decision
  );
END;
$$;
CREATE OR REPLACE FUNCTION public.submit_client_account_deletion_request()
RETURNS TABLE (
  id uuid,
  status text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_id uuid := (SELECT auth.uid());
  request_row public.governance_privacy_requests%ROWTYPE;
BEGIN
  IF caller_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.profiles AS profile
    WHERE profile.id = caller_id
      AND profile.role = 'client'
      AND profile.deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'client_profile_required'; END IF;

  SELECT privacy_request.*
  INTO request_row
  FROM public.governance_privacy_requests AS privacy_request
  WHERE privacy_request.target_profile_id = caller_id
    AND privacy_request.status IN ('pending', 'processing', 'failed')
  ORDER BY privacy_request.created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    INSERT INTO public.governance_privacy_requests (
      target_profile_id, requested_by, request_reason
    ) VALUES (
      caller_id, caller_id,
      'Solicitação de exclusão iniciada pelo titular da conta CutSync.'
    )
    RETURNING * INTO request_row;

    INSERT INTO public.security_audit_logs (
      actor_id, action, target_id, target_type, changes
    ) VALUES (
      caller_id, 'client.account_deletion.requested',
      request_row.id, 'privacy_request',
      jsonb_build_object('status', 'pending', 'source', 'client_self_service')
    );
  END IF;

  RETURN QUERY
  SELECT request_row.id, request_row.status, request_row.created_at, request_row.updated_at;
END;
$$;
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
    INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
    VALUES (target_organization_id, actor_profile_id, 'owner', actor_profile_id);
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
    name, slug, address, phone, primary_color, account_status, verification_level
  ) VALUES (
    btrim(requested_name), lower(btrim(requested_slug)),
    NULLIF(btrim(requested_address), ''), NULLIF(btrim(requested_phone), ''),
    upper(btrim(requested_primary_color)), 'pending_verification', 1
  )
  RETURNING id INTO new_establishment_id;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, commission_rate, created_by
  ) VALUES (
    actor_profile_id, new_establishment_id, 'admin', 'active', 0.50, actor_profile_id
  )
  ON CONFLICT ON CONSTRAINT memberships_profile_id_establishment_id_key
  DO UPDATE SET
    role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();

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
    jsonb_build_object('document_type', target_document_type)
  );

  RETURN QUERY
  SELECT
    CASE
      WHEN (
        SELECT count(*)
        FROM public.organization_establishments AS organization_establishment
        WHERE organization_establishment.organization_id = target_organization_id
          AND organization_establishment.status = 'active'
      ) = 1
      THEN 'created'
      ELSE 'unit_added'
    END,
    new_establishment_id,
    target_organization_id;
END;
$$;
REVOKE ALL ON FUNCTION public.upsert_my_professional_profile(
  text, text, text, text, jsonb, boolean
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_establishment_invite_v2(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_governance_verification(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_client_account_deletion_request() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_business_identity_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_my_professional_profile(
  text, text, text, text, jsonb, boolean
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_establishment_invite_v2(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_governance_verification(uuid, text, text)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_client_account_deletion_request()
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_business_identity_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) TO service_role;
COMMIT;
