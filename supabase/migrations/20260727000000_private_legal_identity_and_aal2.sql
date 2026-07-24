BEGIN;

CREATE TABLE public.legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('person', 'company')),
  document_type text NOT NULL CHECK (document_type IN ('CPF', 'CNPJ')),
  document_fingerprint text NOT NULL UNIQUE CHECK (document_fingerprint ~ '^[0-9a-f]{64}$'),
  encrypted_document text NOT NULL,
  encryption_iv text NOT NULL,
  encryption_key_version text NOT NULL,
  -- CPF suffix is numeric; a CNPJ suffix may contain letters in positions 11-12.
  document_last4 text NOT NULL CHECK (document_last4 ~ '^[A-Z0-9]{4}$'),
  verification_status text NOT NULL DEFAULT 'pending'
    CHECK (verification_status IN ('pending', 'verified', 'disputed', 'rejected')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (entity_type = 'person' AND document_type = 'CPF')
    OR (entity_type = 'company' AND document_type = 'CNPJ')
  )
);

CREATE TABLE public.profile_legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id) ON DELETE RESTRICT,
  relationship text NOT NULL CHECK (relationship IN ('owner', 'representative')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (profile_id, legal_entity_id)
);

CREATE TABLE public.organization_legal_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  legal_entity_id uuid NOT NULL REFERENCES public.legal_entities(id) ON DELETE RESTRICT,
  relationship text NOT NULL DEFAULT 'primary_holder'
    CHECK (relationship = 'primary_holder'),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (organization_id, legal_entity_id)
);

CREATE UNIQUE INDEX organization_legal_entities_one_active_holder_idx
  ON public.organization_legal_entities(organization_id)
  WHERE relationship = 'primary_holder' AND status = 'active';
CREATE UNIQUE INDEX organization_legal_entities_entity_one_active_org_idx
  ON public.organization_legal_entities(legal_entity_id)
  WHERE relationship = 'primary_holder' AND status = 'active';

CREATE TABLE public.identity_migration_conflicts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  legacy_source text NOT NULL CHECK (legacy_source IN ('establishment', 'establishment_request', 'manual')),
  legacy_record_id uuid,
  legal_entity_id uuid REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  requester_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_type text CHECK (document_type IN ('CPF', 'CNPJ')),
  document_last4 text CHECK (document_last4 IS NULL OR document_last4 ~ '^[A-Z0-9]{4}$'),
  reason_code text NOT NULL CHECK (reason_code IN (
    'secure_backfill_required', 'invalid_legacy_document', 'ambiguous_owner',
    'document_claimed_by_another_profile', 'document_claimed_by_another_organization'
  )),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'linked', 'rejected', 'evidence_requested')),
  resolution_reason text,
  resolved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.billing_accounts
  ADD COLUMN legal_entity_id uuid REFERENCES public.legal_entities(id) ON DELETE RESTRICT;
CREATE INDEX billing_accounts_legal_entity_idx
  ON public.billing_accounts(legal_entity_id)
  WHERE legal_entity_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.normalize_brazil_phone_e164(input_phone text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE digits text := regexp_replace(COALESCE(input_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF digits = '' THEN RETURN NULL; END IF;
  IF digits LIKE '55%' AND char_length(digits) IN (12, 13) THEN
    digits := substr(digits, 3);
  END IF;
  IF char_length(digits) NOT IN (10, 11)
    OR digits ~ '^([0-9])\1+$'
    OR substr(digits, 1, 2) = '00'
  THEN RAISE EXCEPTION 'invalid_phone'; END IF;
  RETURN '+55' || digits;
END;
$$;

UPDATE public.profiles
SET phone = public.normalize_brazil_phone_e164(phone)
WHERE phone IS NOT NULL
  AND char_length(
    CASE WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '55%'
      AND char_length(regexp_replace(phone, '[^0-9]', '', 'g')) IN (12, 13)
      THEN substr(regexp_replace(phone, '[^0-9]', '', 'g'), 3)
      ELSE regexp_replace(phone, '[^0-9]', '', 'g') END
  ) IN (10, 11);
UPDATE public.establishments
SET phone = public.normalize_brazil_phone_e164(phone)
WHERE phone IS NOT NULL
  AND char_length(
    CASE WHEN regexp_replace(phone, '[^0-9]', '', 'g') LIKE '55%'
      AND char_length(regexp_replace(phone, '[^0-9]', '', 'g')) IN (12, 13)
      THEN substr(regexp_replace(phone, '[^0-9]', '', 'g'), 3)
      ELSE regexp_replace(phone, '[^0-9]', '', 'g') END
  ) IN (10, 11);

CREATE OR REPLACE FUNCTION public.normalize_phone_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.phone := public.normalize_brazil_phone_e164(NEW.phone);
  RETURN NEW;
END;
$$;
CREATE TRIGGER normalize_profile_phone_e164
  BEFORE INSERT OR UPDATE OF phone ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_column();
CREATE TRIGGER normalize_establishment_phone_e164
  BEFORE INSERT OR UPDATE OF phone ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.normalize_phone_column();

CREATE UNIQUE INDEX identity_migration_conflicts_legacy_pending_idx
  ON public.identity_migration_conflicts(legacy_source, legacy_record_id)
  WHERE status = 'pending' AND legacy_record_id IS NOT NULL;

ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.identity_migration_conflicts ENABLE ROW LEVEL SECURITY;

-- Raw encrypted values and deterministic fingerprints are server-only. Authenticated
-- callers receive masked projections exclusively through SECURITY DEFINER functions.
REVOKE ALL ON public.legal_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.profile_legal_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.organization_legal_entities FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.identity_migration_conflicts FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.current_session_is_aal2()
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE((SELECT auth.jwt() ->> 'aal'), 'aal1') = 'aal2';
$$;

CREATE OR REPLACE FUNCTION public.is_governance_user(
  allowed_roles public.governance_role_enum[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_session_is_aal2() AND EXISTS (
    SELECT 1 FROM public.governance_users
    WHERE profile_id = (SELECT auth.uid())
      AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
  );
$$;

CREATE OR REPLACE FUNCTION public.require_aal2()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.current_session_is_aal2() THEN
    RAISE EXCEPTION 'aal2_required';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.guard_sensitive_authenticated_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Service jobs have no end-user auth.uid(); authenticated SECURITY DEFINER RPCs retain it.
  IF (SELECT auth.uid()) IS NOT NULL AND NOT public.current_session_is_aal2() THEN
    RAISE EXCEPTION 'aal2_required';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER require_aal2_organization_members
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_members
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_authenticated_mutation();
CREATE TRIGGER require_aal2_organization_invitations
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_invitations
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_authenticated_mutation();
CREATE TRIGGER require_aal2_organization_establishments
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_establishments
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_authenticated_mutation();
CREATE TRIGGER require_aal2_organization_billing_accounts
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_billing_accounts
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_authenticated_mutation();
CREATE TRIGGER require_aal2_organization_subscriptions
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_authenticated_mutation();
CREATE TRIGGER require_aal2_organization_billing_invoices
  BEFORE INSERT OR UPDATE OR DELETE ON public.organization_billing_invoices
  FOR EACH ROW EXECUTE FUNCTION public.guard_sensitive_authenticated_mutation();

CREATE OR REPLACE FUNCTION public.get_my_legal_entity_context()
RETURNS TABLE(
  legal_entity_id uuid,
  entity_type text,
  document_type text,
  masked_document text,
  verification_status text,
  organization_id uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT entity.id, entity.entity_type, entity.document_type,
    CASE entity.document_type
      WHEN 'CPF' THEN '***.***.***-' || entity.document_last4
      ELSE '**.***.***/****-' || entity.document_last4
    END,
    entity.verification_status, organization_link.organization_id
  FROM public.profile_legal_entities profile_link
  JOIN public.legal_entities entity ON entity.id = profile_link.legal_entity_id
  LEFT JOIN public.organization_legal_entities organization_link
    ON organization_link.legal_entity_id = entity.id AND organization_link.status = 'active'
  WHERE profile_link.profile_id = (SELECT auth.uid())
    AND profile_link.status = 'active';
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
    SELECT 1 FROM public.profiles WHERE id = actor_profile_id AND deleted_at IS NULL
  ) THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_document_type NOT IN ('CPF', 'CNPJ')
    OR target_document_fingerprint !~ '^[0-9a-f]{64}$'
    OR target_document_last4 !~ CASE target_document_type
      WHEN 'CPF' THEN '^[0-9]{4}$'
      ELSE '^[A-Z0-9]{4}$'
    END
  THEN RAISE EXCEPTION 'invalid_document'; END IF;
  IF char_length(btrim(requested_name)) NOT BETWEEN 2 AND 120
    OR lower(btrim(requested_slug)) !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
  THEN RAISE EXCEPTION 'invalid_registration'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(target_document_fingerprint, 0));
  IF EXISTS (SELECT 1 FROM public.establishments WHERE lower(slug) = lower(btrim(requested_slug))) THEN
    RAISE EXCEPTION 'slug_unavailable';
  END IF;

  SELECT * INTO entity_record FROM public.legal_entities
  WHERE document_fingerprint = target_document_fingerprint
  FOR UPDATE;

  IF FOUND THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profile_legal_entities
      WHERE legal_entity_id = entity_record.id AND profile_id = actor_profile_id AND status = 'active'
    ) THEN
      conflict_reason := 'document_claimed_by_another_profile';
    ELSE
      SELECT link.organization_id INTO target_organization_id
      FROM public.organization_legal_entities link
      JOIN public.organization_members member ON member.organization_id = link.organization_id
      WHERE link.legal_entity_id = entity_record.id AND link.status = 'active'
        AND member.profile_id = actor_profile_id AND member.role = 'owner' AND member.status = 'active'
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
      encryption_iv_value, encryption_key_version_value, target_document_last4, actor_profile_id
    ) RETURNING * INTO entity_record;

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
    SELECT email INTO actor_email FROM public.profiles WHERE id = actor_profile_id;
    INSERT INTO public.organization_billing_accounts(organization_id, display_name, billing_email)
    VALUES (target_organization_id, btrim(requested_name), actor_email);
  END IF;

  INSERT INTO public.establishments(
    name, slug, address, phone, primary_color, account_status, verification_level
  ) VALUES (
    btrim(requested_name), lower(btrim(requested_slug)), NULLIF(btrim(requested_address), ''),
    NULLIF(btrim(requested_phone), ''), upper(btrim(requested_primary_color)),
    'pending_verification', 1
  ) RETURNING id INTO new_establishment_id;

  INSERT INTO public.memberships(
    profile_id, establishment_id, role, status, commission_rate, created_by
  ) VALUES (
    actor_profile_id, new_establishment_id, 'admin', 'active', 0.50, actor_profile_id
  ) ON CONFLICT (profile_id, establishment_id) DO UPDATE
    SET role = 'admin', status = 'active', revoked_at = NULL, updated_at = now();
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (target_organization_id, new_establishment_id, actor_profile_id);
  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT subscription.id, new_establishment_id, subscription.current_period_end + 1
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE account.organization_id = target_organization_id AND subscription.status <> 'canceled'
  ON CONFLICT (subscription_id, establishment_id, effective_from)
  DO UPDATE SET effective_until = NULL;
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id,
    metadata
  ) VALUES (
    target_organization_id, actor_profile_id,
    CASE WHEN entity_record.created_by = actor_profile_id
      AND entity_record.created_at >= transaction_timestamp() - interval '1 second'
      THEN 'business_registration.created' ELSE 'business_registration.unit_added' END,
    new_establishment_id, jsonb_build_object('document_type', target_document_type)
  );

  RETURN QUERY SELECT
    CASE WHEN (
      SELECT count(*) FROM public.organization_establishments
      WHERE organization_id = target_organization_id AND status = 'active'
    ) = 1 THEN 'created' ELSE 'unit_added' END,
    new_establishment_id, target_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_identity_migration_conflicts()
RETURNS TABLE(
  conflict_id uuid,
  legacy_source text,
  legacy_record_id uuid,
  legal_entity_id uuid,
  organization_id uuid,
  requester_profile_id uuid,
  document_type text,
  masked_document text,
  reason_code text,
  status text,
  created_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT conflict.id, conflict.legacy_source, conflict.legacy_record_id,
    conflict.legal_entity_id, conflict.organization_id, conflict.requester_profile_id,
    conflict.document_type,
    CASE
      WHEN conflict.document_last4 IS NULL THEN NULL
      WHEN conflict.document_type = 'CPF' THEN '***.***.***-' || conflict.document_last4
      ELSE '**.***.***/****-' || conflict.document_last4
    END,
    conflict.reason_code, conflict.status, conflict.created_at
  FROM public.identity_migration_conflicts conflict
  ORDER BY conflict.created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_identity_migration_conflict(
  actor_profile_id uuid,
  target_conflict_id uuid,
  target_action text,
  target_reason text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE conflict public.identity_migration_conflicts%ROWTYPE;
  resolved_organization_id uuid;
BEGIN
  IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin') THEN
    RAISE EXCEPTION 'service_role_required';
  END IF;
  IF target_action NOT IN ('link', 'reject', 'request_evidence')
    OR char_length(btrim(target_reason)) NOT BETWEEN 10 AND 500
  THEN RAISE EXCEPTION 'invalid_resolution'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.governance_users
    WHERE profile_id = actor_profile_id AND role IN ('SaaS_Editor', 'SaaS_Owner')
  ) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT * INTO conflict FROM public.identity_migration_conflicts
  WHERE id = target_conflict_id FOR UPDATE;
  IF NOT FOUND OR conflict.status <> 'pending' THEN RAISE EXCEPTION 'conflict_not_pending'; END IF;

  IF target_action = 'link' THEN
    IF conflict.legal_entity_id IS NULL OR conflict.requester_profile_id IS NULL THEN
      RAISE EXCEPTION 'secure_backfill_required';
    END IF;
    SELECT organization_id INTO resolved_organization_id
    FROM public.organization_legal_entities
    WHERE legal_entity_id = conflict.legal_entity_id AND status = 'active'
    LIMIT 1;
    IF resolved_organization_id IS NULL THEN RAISE EXCEPTION 'legal_entity_without_organization'; END IF;
    INSERT INTO public.profile_legal_entities(
      profile_id, legal_entity_id, relationship, created_by
    ) VALUES (
      conflict.requester_profile_id, conflict.legal_entity_id, 'owner', actor_profile_id
    ) ON CONFLICT (profile_id, legal_entity_id) DO UPDATE
      SET relationship = 'owner', status = 'active', revoked_at = NULL;
    INSERT INTO public.organization_members(
      organization_id, profile_id, role, created_by
    ) VALUES (
      resolved_organization_id, conflict.requester_profile_id, 'owner', actor_profile_id
    ) ON CONFLICT (organization_id, profile_id) DO UPDATE
      SET role = 'owner', status = 'active', revoked_at = NULL, updated_at = now();
  END IF;

  UPDATE public.identity_migration_conflicts SET
    status = CASE target_action
      WHEN 'link' THEN 'linked'
      WHEN 'reject' THEN 'rejected'
      ELSE 'evidence_requested'
    END,
    resolution_reason = btrim(target_reason),
    resolved_by = actor_profile_id,
    resolved_at = now()
  WHERE id = target_conflict_id;
  INSERT INTO public.security_audit_logs(action, actor_id, target_type, target_id, changes)
  VALUES (
    'identity_conflict.' || target_action, actor_profile_id, 'identity_conflict',
    target_conflict_id, jsonb_build_object('reason_provided', true)
  );
  RETURN target_action;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_governance_establishments(
  search_term text DEFAULT NULL,
  status_filter text DEFAULT NULL,
  page_size integer DEFAULT 25,
  page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, name text, slug text, document_number text, document_type text,
  verification_level integer, account_status text, address text,
  kyc_status text, email_verified boolean, whatsapp_verified boolean,
  recent_status_changed_at timestamptz, total_count bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT establishment.id, establishment.name, establishment.slug,
    COALESCE(
      CASE entity.document_type
        WHEN 'CPF' THEN '***.***.***-' || entity.document_last4
        WHEN 'CNPJ' THEN '**.***.***/****-' || entity.document_last4
      END,
      CASE establishment.document_type
        WHEN 'CPF' THEN '***.***.***-' || right(regexp_replace(establishment.document_number, '[^0-9]', '', 'g'), 4)
        WHEN 'CNPJ' THEN '**.***.***/****-' || right(upper(regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g')), 4)
      END
    ),
    COALESCE(entity.document_type, establishment.document_type),
    establishment.verification_level, establishment.account_status, establishment.address,
    establishment.kyc_status, establishment.email_verified, establishment.whatsapp_verified,
    max(audit.created_at) FILTER (WHERE audit.action = 'establishment.status_changed'),
    count(*) OVER ()
  FROM public.establishments establishment
  LEFT JOIN public.organization_establishments organization_establishment
    ON organization_establishment.establishment_id = establishment.id
    AND organization_establishment.status = 'active'
  LEFT JOIN public.organization_legal_entities organization_entity
    ON organization_entity.organization_id = organization_establishment.organization_id
    AND organization_entity.status = 'active'
  LEFT JOIN public.legal_entities entity ON entity.id = organization_entity.legal_entity_id
  LEFT JOIN public.security_audit_logs audit
    ON audit.target_id = establishment.id AND audit.target_type = 'establishment'
  WHERE (
    nullif(btrim(search_term), '') IS NULL
    OR establishment.name ILIKE '%' || btrim(search_term) || '%'
    OR establishment.slug ILIKE '%' || btrim(search_term) || '%'
  )
    AND (status_filter IS NULL OR establishment.account_status = status_filter)
  GROUP BY establishment.id, entity.id
  ORDER BY establishment.created_at DESC
  LIMIT least(greatest(coalesce(page_size, 25), 1), 100)
  OFFSET greatest(coalesce(page_offset, 0), 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_governance_establishment_detail(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'establishment', jsonb_build_object(
      'id', establishment.id, 'name', establishment.name, 'slug', establishment.slug,
      'address', establishment.address,
      'document_number', COALESCE(
        CASE entity.document_type WHEN 'CPF' THEN '***.***.***-' || entity.document_last4
          WHEN 'CNPJ' THEN '**.***.***/****-' || entity.document_last4 END,
        CASE establishment.document_type WHEN 'CPF' THEN '***.***.***-' || right(regexp_replace(establishment.document_number, '[^0-9]', '', 'g'), 4)
          WHEN 'CNPJ' THEN '**.***.***/****-' || right(upper(regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g')), 4) END
      ),
      'document_type', COALESCE(entity.document_type, establishment.document_type),
      'verification_status', entity.verification_status,
      'verification_level', establishment.verification_level,
      'account_status', establishment.account_status, 'kyc_status', establishment.kyc_status,
      'email_verified', establishment.email_verified,
      'whatsapp_verified', false, 'created_at', establishment.created_at,
      'updated_at', establishment.updated_at
    ),
    'status_history', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', audit.id, 'action', audit.action, 'changes', audit.changes,
        'created_at', audit.created_at, 'actor_name', COALESCE(profile.name, 'Sistema')
      ) ORDER BY audit.created_at DESC)
      FROM public.security_audit_logs audit
      LEFT JOIN public.profiles profile ON profile.id = audit.actor_id
      WHERE audit.target_id = establishment.id AND audit.target_type = 'establishment'
        AND audit.action = 'establishment.status_changed'
    ), '[]'::jsonb),
    'recent_events', COALESCE((
      SELECT jsonb_agg(event) FROM (
        SELECT jsonb_build_object(
          'id', audit.id, 'action', audit.action, 'changes', audit.changes,
          'created_at', audit.created_at, 'actor_name', COALESCE(profile.name, 'Sistema')
        ) AS event
        FROM public.security_audit_logs audit
        LEFT JOIN public.profiles profile ON profile.id = audit.actor_id
        WHERE audit.target_id = establishment.id AND audit.target_type = 'establishment'
        ORDER BY audit.created_at DESC LIMIT 20
      ) recent
    ), '[]'::jsonb),
    'upcoming_appointments', COALESCE((
      SELECT jsonb_agg(appointment_payload ORDER BY appointment_payload->>'date_time') FROM (
        SELECT jsonb_build_object(
          'id', appointment.id, 'date_time', appointment.date_time, 'ends_at', appointment.ends_at,
          'status', appointment.status, 'client_name', appointment.client_name
        ) appointment_payload
        FROM public.appointments appointment
        WHERE appointment.establishment_id = establishment.id
          AND appointment.date_time >= now() AND appointment.deleted_at IS NULL
          AND appointment.status NOT IN ('cancelled', 'canceled')
        ORDER BY appointment.date_time LIMIT 5
      ) upcoming
    ), '[]'::jsonb)
  ) INTO result
  FROM public.establishments establishment
  LEFT JOIN public.organization_establishments organization_establishment
    ON organization_establishment.establishment_id = establishment.id
    AND organization_establishment.status = 'active'
  LEFT JOIN public.organization_legal_entities organization_entity
    ON organization_entity.organization_id = organization_establishment.organization_id
    AND organization_entity.status = 'active'
  LEFT JOIN public.legal_entities entity ON entity.id = organization_entity.legal_entity_id
  WHERE establishment.id = target_establishment_id;
  IF result IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_governance_establishment_requests(
  search_term text DEFAULT NULL, status_filter text DEFAULT NULL,
  page_size integer DEFAULT 50, page_offset integer DEFAULT 0
)
RETURNS TABLE (
  id uuid, requester_id uuid, requester_name text, requester_email text, name text,
  slug text, address text, phone text, document_number text, status text, rejection_reason text,
  establishment_id uuid, created_at timestamptz, reviewed_at timestamptz, total_count bigint
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY SELECT request.id, request.requester_id, request.requester_name,
    request.requester_email, request.name, request.slug, request.address, request.phone,
    CASE request.document_type
      WHEN 'CPF' THEN '***.***.***-' || right(regexp_replace(request.document_number, '[^0-9]', '', 'g'), 4)
      WHEN 'CNPJ' THEN '**.***.***/****-' || right(upper(regexp_replace(request.document_number, '[^A-Za-z0-9]', '', 'g')), 4)
    END,
    request.status, request.rejection_reason, request.establishment_id,
    request.created_at, request.reviewed_at, count(*) OVER ()
  FROM public.establishment_requests request
  WHERE (
    nullif(btrim(search_term), '') IS NULL
    OR request.name ILIKE '%' || btrim(search_term) || '%'
    OR request.slug ILIKE '%' || btrim(search_term) || '%'
    OR request.requester_name ILIKE '%' || btrim(search_term) || '%'
    OR request.requester_email ILIKE '%' || btrim(search_term) || '%'
  )
    AND (status_filter IS NULL OR request.status = status_filter)
  ORDER BY request.created_at DESC
  LIMIT least(greatest(coalesce(page_size, 50), 1), 100)
  OFFSET greatest(coalesce(page_offset, 0), 0);
END;
$$;

-- Inventory legacy records without copying raw documents into the new domain.
INSERT INTO public.identity_migration_conflicts(
  legacy_source, legacy_record_id, document_type, document_last4, reason_code
)
SELECT 'establishment', establishment.id, establishment.document_type,
  CASE WHEN char_length(
      CASE establishment.document_type
        WHEN 'CNPJ' THEN regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g')
        ELSE regexp_replace(establishment.document_number, '[^0-9]', '', 'g')
      END
    ) >= 4
    THEN right(upper(
      CASE establishment.document_type
        WHEN 'CNPJ' THEN regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g')
        ELSE regexp_replace(establishment.document_number, '[^0-9]', '', 'g')
      END
    ), 4)
    ELSE NULL END,
  CASE
    WHEN (establishment.document_type = 'CPF' AND
      char_length(regexp_replace(establishment.document_number, '[^0-9]', '', 'g')) <> 11)
      OR (establishment.document_type = 'CNPJ' AND
      upper(regexp_replace(establishment.document_number, '[^A-Za-z0-9]', '', 'g'))
        !~ '^[A-Z0-9]{12}[0-9]{2}$')
    THEN 'invalid_legacy_document'
    ELSE 'secure_backfill_required'
  END
FROM public.establishments establishment
WHERE establishment.document_number IS NOT NULL
  AND establishment.document_type IN ('CPF', 'CNPJ')
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.guard_legacy_establishment_document()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND (NEW.document_number IS NOT NULL OR NEW.document_type IS NOT NULL))
    OR (TG_OP = 'UPDATE' AND (
      NEW.document_number IS DISTINCT FROM OLD.document_number
      OR NEW.document_type IS DISTINCT FROM OLD.document_type
    ))
  THEN RAISE EXCEPTION 'legacy_document_read_only'; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER legacy_establishment_document_read_only
  BEFORE INSERT OR UPDATE OF document_number, document_type ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_establishment_document();
CREATE TRIGGER legacy_establishment_request_document_read_only
  BEFORE INSERT OR UPDATE OF document_number, document_type ON public.establishment_requests
  FOR EACH ROW EXECUTE FUNCTION public.guard_legacy_establishment_document();

-- Remove document keys accidentally written by legacy onboarding without
-- altering the event identity, actor, action or timestamp.
UPDATE public.security_audit_logs
SET changes = changes - 'cpf' - 'cnpj' - 'document_number'
WHERE changes ?| ARRAY['cpf', 'cnpj', 'document_number'];

REVOKE ALL ON FUNCTION public.register_business_identity_atomic(
  uuid, text, text, text, text, text, text, text, text, text, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_identity_migration_conflict(
  uuid, uuid, text, text
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_my_legal_entity_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_identity_migration_conflicts() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_legal_entity_context() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_identity_migration_conflicts() TO authenticated;

COMMIT;
