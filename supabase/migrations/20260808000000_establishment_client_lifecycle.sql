BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Establishment client lifecycle. Turns the columns added by
-- 20260807000000 into a usable contract: archiving and restoring, resolution of
-- a local client from an authenticated profile, audited export, and a merge that
-- carries activity and consent instead of dropping them.

-- ---------------------------------------------------------------------------
-- Capabilities
-- ---------------------------------------------------------------------------

-- Adds export_clients and manage_data_imports for owner and admin only.
-- read_only and blocked gain nothing: exporting a carteira is a full-access act.
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
  IF target_access_mode NOT IN ('full', 'read_only') THEN RETURN capabilities; END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, target_profile_id
  ) LIMIT 1;
  IF NOT FOUND THEN RETURN capabilities; END IF;

  SELECT COALESCE(establishment.share_agendas, false)
  INTO team_agendas_shared
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  capabilities := ARRAY[
    'view_own_agenda', 'view_services', 'view_own_commission'
  ];
  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY['view_team_agenda', 'view_unit_reports'];
  ELSIF team_agendas_shared THEN
    capabilities := capabilities || ARRAY['view_team_agenda'];
  END IF;
  IF target_access_mode = 'read_only' THEN RETURN capabilities; END IF;

  capabilities := capabilities || ARRAY['create_self_walk_in', 'manage_own_blocks'];
  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'create_team_walk_in', 'manage_team_blocks', 'manage_services',
      'manage_team', 'manage_operational_settings', 'view_clients',
      'manage_clients', 'export_clients', 'manage_data_imports'
    ];
  END IF;
  IF identity_record.operational_role = 'owner' THEN
    capabilities := capabilities || ARRAY['manage_admins'];
  END IF;
  RETURN capabilities;
END;
$$;

-- ---------------------------------------------------------------------------
-- Consent precedence
-- ---------------------------------------------------------------------------

-- Mirrors resolveMergedConsentStatus in
-- packages/domain/src/establishment-client.ts. Merging keeps the most
-- restrictive answer: a proof of consent collected on one row does not extend
-- to the contacts that arrived through the other one.
CREATE OR REPLACE FUNCTION public.resolve_merged_marketing_consent(
  left_status text,
  right_status text
)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN 'revoked' IN (left_status, right_status) THEN 'revoked'
    WHEN 'unknown' IN (left_status, right_status) THEN 'unknown'
    ELSE 'granted'
  END;
$$;

-- ---------------------------------------------------------------------------
-- Archiving and restoring
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.archive_establishment_client(
  target_establishment_id uuid,
  target_establishment_client_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  client_record public.establishment_clients%ROWTYPE;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.archived',
    jsonb_build_object('establishmentClientId', target_establishment_client_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO client_record
  FROM public.establishment_clients
  WHERE id = target_establishment_client_id
    AND establishment_id = target_establishment_id
  FOR UPDATE;
  IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  IF client_record.status = 'merged' THEN RAISE EXCEPTION 'establishment_client_merged'; END IF;

  IF client_record.status = 'archived' THEN
    RETURN public.complete_mobile_command(target_request_id, jsonb_build_object(
      'establishmentClientId', client_record.id,
      'establishmentId', target_establishment_id,
      'status', 'archived'
    ));
  END IF;

  -- Archiving a client whose chair is already booked would hide the person the
  -- establishment is about to serve.
  IF EXISTS (
    SELECT 1 FROM public.appointments AS appointment
    WHERE appointment.establishment_client_id = client_record.id
      AND appointment.deleted_at IS NULL
      AND appointment.status IN ('pending', 'confirmed')
      AND appointment.date_time >= now()
  ) THEN RAISE EXCEPTION 'establishment_client_has_future_appointments'; END IF;

  UPDATE public.establishment_clients
  SET status = 'archived',
      archived_at = now(),
      updated_by = (SELECT auth.uid())
  WHERE id = client_record.id;

  -- A pending identity request on an archived row would ask the person to
  -- confirm a relationship the establishment just shelved.
  DELETE FROM public.establishment_client_links
  WHERE establishment_client_id = client_record.id
    AND status = 'pending';

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.archived', target_establishment_id,
    jsonb_build_object('establishment_client_id', client_record.id)
  );
  result := jsonb_build_object(
    'establishmentClientId', client_record.id,
    'establishmentId', target_establishment_id,
    'status', 'archived'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_establishment_client(
  target_establishment_id uuid,
  target_establishment_client_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  client_record public.establishment_clients%ROWTYPE;
  result jsonb;
BEGIN
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.restored',
    jsonb_build_object('establishmentClientId', target_establishment_client_id)
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO client_record
  FROM public.establishment_clients
  WHERE id = target_establishment_client_id
    AND establishment_id = target_establishment_id
  FOR UPDATE;
  IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  IF client_record.status = 'merged' THEN RAISE EXCEPTION 'establishment_client_merged'; END IF;

  IF client_record.status = 'archived' THEN
    UPDATE public.establishment_clients
    SET status = 'active',
        archived_at = NULL,
        updated_by = (SELECT auth.uid())
    WHERE id = client_record.id;

    PERFORM public.queue_establishment_client_match(client_record.id, (SELECT auth.uid()));
    INSERT INTO public.authorization_audit_log (
      actor_id, action, establishment_id, metadata
    ) VALUES (
      (SELECT auth.uid()), 'business.client.restored', target_establishment_id,
      jsonb_build_object('establishment_client_id', client_record.id)
    );
  END IF;

  result := jsonb_build_object(
    'establishmentClientId', client_record.id,
    'establishmentId', target_establishment_id,
    'status', 'active'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Resolving a local client from an authenticated profile
-- ---------------------------------------------------------------------------

-- Internal helper, not a public RPC: it writes to the carteira without asking
-- for a capability, because the caller is the person being registered. Stage 3
-- calls it from inside the appointment transaction. Returns NULL instead of
-- raising, so a booking is never lost to a CRM problem.
CREATE OR REPLACE FUNCTION public.ensure_establishment_client_for_profile(
  target_establishment_id uuid,
  target_profile_id uuid,
  target_source text DEFAULT 'client_booking'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, auth
AS $$
DECLARE
  existing_link public.establishment_client_links%ROWTYPE;
  profile_record record;
  resolved_name text;
  resolved_phone text;
  resolved_email text;
  created_client_id uuid;
BEGIN
  IF target_establishment_id IS NULL OR target_profile_id IS NULL THEN RETURN NULL; END IF;
  IF target_source NOT IN ('manual', 'walk_in', 'client_booking') THEN
    RAISE EXCEPTION 'invalid_client_source';
  END IF;

  SELECT * INTO existing_link
  FROM public.establishment_client_links
  WHERE establishment_id = target_establishment_id
    AND profile_id = target_profile_id
  FOR UPDATE;

  IF existing_link.id IS NOT NULL THEN
    -- A rejected request is the person saying they are not that row. Creating a
    -- second one would route around the refusal, and the one-profile-per-unit
    -- index would block the link anyway.
    IF existing_link.status = 'rejected' THEN RETURN NULL; END IF;
    RETURN existing_link.establishment_client_id;
  END IF;

  SELECT profile.name AS name,
    auth_user.email AS auth_email,
    auth_user.email_confirmed_at,
    auth_user.phone AS auth_phone,
    auth_user.phone_confirmed_at
  INTO profile_record
  FROM public.profiles AS profile
  JOIN auth.users AS auth_user ON auth_user.id = profile.id
  WHERE profile.id = target_profile_id
    AND profile.deleted_at IS NULL;
  IF NOT FOUND THEN RETURN NULL; END IF;

  -- The carteira requires a name between 2 and 120 characters. A profile that
  -- does not satisfy it must not cost the person their appointment.
  resolved_name := left(btrim(COALESCE(profile_record.name, '')), 120);
  IF char_length(resolved_name) < 2 THEN resolved_name := 'Cliente CutSync'; END IF;

  -- Only verified contacts are copied. An unverified address in the carteira
  -- would later be treated as proof of identity by the matching routine.
  resolved_email := CASE
    WHEN profile_record.email_confirmed_at IS NOT NULL
    THEN NULLIF(lower(btrim(COALESCE(profile_record.auth_email, ''))), '')
  END;
  resolved_phone := CASE
    WHEN profile_record.phone_confirmed_at IS NOT NULL
    THEN NULLIF(btrim(COALESCE(profile_record.auth_phone, '')), '')
  END;
  IF resolved_phone IS NOT NULL
    AND char_length(resolved_phone) NOT BETWEEN 8 AND 32
  THEN resolved_phone := NULL; END IF;
  IF resolved_email IS NOT NULL AND (
    char_length(resolved_email) NOT BETWEEN 3 AND 254
    OR resolved_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ) THEN resolved_email := NULL; END IF;

  INSERT INTO public.establishment_clients (
    establishment_id, display_name, phone, email, source,
    created_by, updated_by
  ) VALUES (
    target_establishment_id, resolved_name, resolved_phone, resolved_email,
    target_source, target_profile_id, target_profile_id
  ) RETURNING id INTO created_client_id;

  -- The person is booking for themselves, so the identity is first party and
  -- the link is born confirmed. match_kind stays 'manual' because no verified
  -- contact was compared to reach it.
  INSERT INTO public.establishment_client_links (
    establishment_client_id, establishment_id, profile_id, match_kind,
    status, requested_by, responded_at, confirmed_at
  ) VALUES (
    created_client_id, target_establishment_id, target_profile_id, 'manual',
    'confirmed', target_profile_id, now(), now()
  )
  ON CONFLICT DO NOTHING;

  RETURN created_client_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- Directory reads
-- ---------------------------------------------------------------------------

-- Dropped rather than replaced: adding a defaulted argument would leave the old
-- signature in place and make the PostgREST call ambiguous.
DROP FUNCTION IF EXISTS public.search_establishment_clients(uuid, text, integer, integer);

CREATE OR REPLACE FUNCTION public.search_establishment_clients(
  target_establishment_id uuid,
  target_query text DEFAULT NULL,
  target_limit integer DEFAULT 50,
  target_offset integer DEFAULT 0,
  target_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  normalized_query text := NULLIF(btrim(target_query), '');
  query_digits text := NULLIF(regexp_replace(COALESCE(target_query, ''), '[^0-9]', '', 'g'), '');
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'view_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_limit NOT BETWEEN 1 AND 100 OR target_offset < 0 OR target_offset > 10000 THEN
    RAISE EXCEPTION 'invalid_pagination';
  END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(result.payload ORDER BY result.display_name, result.client_id)
    FROM (
      SELECT client.id AS client_id,
        client.display_name,
        jsonb_strip_nulls(jsonb_build_object(
          'id', client.id,
          'establishmentId', client.establishment_id,
          'displayName', client.display_name,
          'phone', client.phone,
          'email', client.email,
          'tags', client.tags,
          'source', client.source,
          'sourceProvider', client.source_provider,
          'marketingConsentStatus', client.marketing_consent_status,
          'firstAppointmentAt', client.first_appointment_at,
          'lastAppointmentAt', client.last_appointment_at,
          'archivedAt', client.archived_at,
          'linkStatus', link.status,
          'linkedProfileId', CASE WHEN link.status = 'confirmed' THEN link.profile_id END,
          'createdAt', client.created_at,
          'updatedAt', client.updated_at
        )) || jsonb_build_object('status', client.status) AS payload
      FROM public.establishment_clients AS client
      LEFT JOIN LATERAL (
        SELECT candidate.status, candidate.profile_id
        FROM public.establishment_client_links AS candidate
        WHERE candidate.establishment_client_id = client.id
        ORDER BY CASE candidate.status
          WHEN 'confirmed' THEN 1 WHEN 'pending' THEN 2 ELSE 3 END,
          candidate.created_at DESC
        LIMIT 1
      ) AS link ON true
      WHERE client.establishment_id = target_establishment_id
        AND (
          client.status = 'active'
          OR (COALESCE(target_include_archived, false) AND client.status = 'archived')
        )
        AND (
          normalized_query IS NULL
          OR client.display_name ILIKE '%' || normalized_query || '%'
          OR client.phone ILIKE '%' || normalized_query || '%'
          OR client.email ILIKE '%' || normalized_query || '%'
          -- Formatting must not hide a client: (11) 99999-9999 and 11999999999
          -- are the same person typed two ways.
          OR (
            query_digits IS NOT NULL
            AND client.phone IS NOT NULL
            AND regexp_replace(client.phone, '[^0-9]', '', 'g') LIKE '%' || query_digits || '%'
          )
          OR EXISTS (
            SELECT 1 FROM unnest(client.tags) AS tag
            WHERE tag ILIKE '%' || normalized_query || '%'
          )
        )
      ORDER BY client.display_name, client.id
      LIMIT target_limit OFFSET target_offset
    ) AS result
  ), '[]'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_establishment_client(
  target_establishment_id uuid,
  target_establishment_client_id uuid
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
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'view_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_strip_nulls(jsonb_build_object(
    'id', client.id,
    'establishmentId', client.establishment_id,
    'displayName', client.display_name,
    'phone', client.phone,
    'email', client.email,
    'tags', client.tags,
    'notes', client.notes,
    'source', client.source,
    'sourceProvider', client.source_provider,
    'externalId', client.external_id,
    'marketingConsentStatus', client.marketing_consent_status,
    'marketingConsentAt', client.marketing_consent_at,
    'firstAppointmentAt', client.first_appointment_at,
    'lastAppointmentAt', client.last_appointment_at,
    'archivedAt', client.archived_at,
    'mergedIntoId', client.merged_into_id,
    'createdAt', client.created_at,
    'updatedAt', client.updated_at,
    'links', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', link.id,
        'profileId', link.profile_id,
        'matchKind', link.match_kind,
        'status', link.status,
        'createdAt', link.created_at,
        'respondedAt', link.responded_at
      ) ORDER BY link.created_at DESC)
      FROM public.establishment_client_links AS link
      WHERE link.establishment_client_id = client.id
    ), '[]'::jsonb),
    'appointments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'appointmentId', appointment.id,
        'status', appointment.status,
        'startsAt', appointment.date_time,
        'endsAt', appointment.ends_at,
        'service', jsonb_build_object('id', service.id, 'name', service.name),
        'professional', jsonb_build_object('id', professional.id, 'name', professional.name)
      ) ORDER BY appointment.date_time DESC)
      FROM public.appointments AS appointment
      JOIN public.services AS service ON service.id = appointment.service_id
      JOIN public.profiles AS professional ON professional.id = appointment.professional_id
      WHERE appointment.establishment_client_id = client.id
        AND appointment.deleted_at IS NULL
    ), '[]'::jsonb)
  )) || jsonb_build_object('status', client.status) INTO result
  FROM public.establishment_clients AS client
  WHERE client.id = target_establishment_client_id
    AND client.establishment_id = target_establishment_id;

  IF result IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  RETURN result;
END;
$$;

-- ---------------------------------------------------------------------------
-- Audited export
-- ---------------------------------------------------------------------------

-- Separate from search on purpose: this returns notes and consent in bulk, so it
-- demands its own capability and leaves a trail with the size of what left.
CREATE OR REPLACE FUNCTION public.export_establishment_clients(
  target_establishment_id uuid,
  target_limit integer DEFAULT 500,
  target_offset integer DEFAULT 0,
  target_include_archived boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  rows_returned integer;
  payload jsonb;
BEGIN
  IF (SELECT auth.uid()) IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'export_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF target_limit NOT BETWEEN 1 AND 1000 OR target_offset < 0 OR target_offset > 1000000 THEN
    RAISE EXCEPTION 'invalid_pagination';
  END IF;

  SELECT COALESCE(jsonb_agg(page.payload ORDER BY page.sort_name, page.client_id), '[]'::jsonb),
    count(*)::integer
  INTO payload, rows_returned
  FROM (
    SELECT client.id AS client_id,
      client.display_name AS sort_name,
      jsonb_strip_nulls(jsonb_build_object(
        'id', client.id,
        'displayName', client.display_name,
        'phone', client.phone,
        'normalizedPhone', client.normalized_phone,
        'email', client.email,
        'normalizedEmail', client.normalized_email,
        'tags', client.tags,
        'notes', client.notes,
        'source', client.source,
        'sourceProvider', client.source_provider,
        'externalId', client.external_id,
        'marketingConsentStatus', client.marketing_consent_status,
        'marketingConsentAt', client.marketing_consent_at,
        'firstAppointmentAt', client.first_appointment_at,
        'lastAppointmentAt', client.last_appointment_at,
        'archivedAt', client.archived_at,
        'createdAt', client.created_at,
        'updatedAt', client.updated_at
      )) || jsonb_build_object('status', client.status) AS payload
    FROM public.establishment_clients AS client
    WHERE client.establishment_id = target_establishment_id
      AND (
        client.status = 'active'
        OR (COALESCE(target_include_archived, false) AND client.status = 'archived')
      )
    ORDER BY client.display_name, client.id
    LIMIT target_limit OFFSET target_offset
  ) AS page;

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.exported', target_establishment_id,
    jsonb_build_object(
      'rows_returned', rows_returned,
      'offset', target_offset,
      'include_archived', COALESCE(target_include_archived, false)
    )
  );

  RETURN jsonb_build_object(
    'establishmentId', target_establishment_id,
    'offset', target_offset,
    'count', rows_returned,
    'clients', payload
  );
END;
$$;

-- ---------------------------------------------------------------------------
-- Editing, now including consent
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.update_establishment_client(
  uuid, uuid, uuid, text, text, text, text[], text
);

CREATE OR REPLACE FUNCTION public.update_establishment_client(
  target_establishment_id uuid,
  target_establishment_client_id uuid,
  target_request_id uuid,
  target_name text DEFAULT NULL,
  target_phone text DEFAULT NULL,
  target_email text DEFAULT NULL,
  target_tags text[] DEFAULT NULL,
  target_notes text DEFAULT NULL,
  target_marketing_consent_status text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  client_record public.establishment_clients%ROWTYPE;
  next_name text;
  next_phone text;
  next_email text;
  next_tags text[];
  next_notes text;
  next_consent text;
  next_consent_at timestamptz;
  result jsonb;
BEGIN
  IF target_marketing_consent_status IS NOT NULL
    AND target_marketing_consent_status NOT IN ('unknown', 'granted', 'revoked')
  THEN RAISE EXCEPTION 'invalid_client_consent_status'; END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.updated',
    jsonb_strip_nulls(jsonb_build_object(
      'establishmentClientId', target_establishment_client_id,
      'name', target_name,
      'phone', target_phone,
      'email', target_email,
      'tags', CASE WHEN target_tags IS NULL THEN NULL ELSE ARRAY(
        SELECT DISTINCT btrim(tag)
        FROM unnest(target_tags) AS tag
        ORDER BY 1
      ) END,
      'notes', target_notes,
      'marketingConsentStatus', target_marketing_consent_status
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT * INTO client_record
  FROM public.establishment_clients
  WHERE id = target_establishment_client_id
    AND establishment_id = target_establishment_id
  FOR UPDATE;
  IF client_record.id IS NULL THEN RAISE EXCEPTION 'establishment_client_not_found'; END IF;
  IF client_record.status = 'merged' THEN RAISE EXCEPTION 'establishment_client_merged'; END IF;
  IF client_record.status = 'archived' THEN RAISE EXCEPTION 'establishment_client_archived'; END IF;

  next_name := COALESCE(NULLIF(btrim(target_name), ''), client_record.display_name);
  next_phone := CASE WHEN target_phone IS NULL THEN client_record.phone
    ELSE NULLIF(btrim(target_phone), '') END;
  next_email := CASE WHEN target_email IS NULL THEN client_record.email
    ELSE NULLIF(lower(btrim(target_email)), '') END;
  next_tags := CASE WHEN target_tags IS NULL THEN client_record.tags
    ELSE ARRAY(SELECT DISTINCT btrim(tag) FROM unnest(target_tags) AS tag ORDER BY 1) END;
  next_notes := CASE WHEN target_notes IS NULL THEN client_record.notes
    ELSE NULLIF(btrim(target_notes), '') END;

  next_consent := COALESCE(target_marketing_consent_status, client_record.marketing_consent_status);
  -- The timestamp is evidence of when the decision was taken, so it is stamped
  -- only when the decision itself changes.
  next_consent_at := CASE
    WHEN next_consent = 'unknown' THEN NULL
    WHEN next_consent IS DISTINCT FROM client_record.marketing_consent_status THEN now()
    ELSE client_record.marketing_consent_at
  END;

  PERFORM public.assert_valid_establishment_client_values(
    next_name, next_phone, next_email, next_tags, next_notes
  );
  UPDATE public.establishment_clients
  SET display_name = next_name,
      phone = next_phone,
      email = next_email,
      tags = next_tags,
      notes = next_notes,
      marketing_consent_status = next_consent,
      marketing_consent_at = next_consent_at,
      updated_by = (SELECT auth.uid())
  WHERE id = client_record.id;

  DELETE FROM public.establishment_client_links AS link
  WHERE link.establishment_client_id = client_record.id
    AND link.status = 'pending'
    AND NOT public.is_confirmed_establishment_client_match(
      client_record.id,
      link.profile_id,
      link.match_kind
    );
  PERFORM public.queue_establishment_client_match(client_record.id, (SELECT auth.uid()));
  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.updated', target_establishment_id,
    jsonb_build_object('establishment_client_id', client_record.id)
  );
  result := jsonb_build_object(
    'establishmentClientId', client_record.id,
    'establishmentId', target_establishment_id,
    'status', 'active'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Merge carrying activity and consent
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.merge_establishment_clients(
  target_establishment_id uuid,
  target_survivor_client_id uuid,
  target_duplicate_client_id uuid,
  target_request_id uuid,
  target_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  replay jsonb;
  survivor public.establishment_clients%ROWTYPE;
  duplicate public.establishment_clients%ROWTYPE;
  duplicate_link public.establishment_client_links%ROWTYPE;
  existing_link public.establishment_client_links%ROWTYPE;
  merged_consent text;
  merged_consent_at timestamptz;
  result jsonb;
BEGIN
  IF target_survivor_client_id = target_duplicate_client_id THEN
    RAISE EXCEPTION 'merge_requires_distinct_clients';
  END IF;
  IF char_length(COALESCE(target_reason, '')) > 500 THEN
    RAISE EXCEPTION 'merge_reason_too_long';
  END IF;
  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'client.merged',
    jsonb_strip_nulls(jsonb_build_object(
      'survivorClientId', target_survivor_client_id,
      'duplicateClientId', target_duplicate_client_id,
      'reason', NULLIF(btrim(target_reason), '')
    ))
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  IF NOT public.has_business_capability(target_establishment_id, 'manage_clients')
    AND NOT public.is_superadmin()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  PERFORM 1
  FROM public.establishment_clients
  WHERE establishment_id = target_establishment_id
    AND id IN (target_survivor_client_id, target_duplicate_client_id)
  ORDER BY id
  FOR UPDATE;
  SELECT * INTO survivor FROM public.establishment_clients
  WHERE id = target_survivor_client_id
    AND establishment_id = target_establishment_id
    AND status = 'active';
  -- An archived duplicate is still a duplicate; refusing it would force the
  -- operator to restore the row just to fold it away again.
  SELECT * INTO duplicate FROM public.establishment_clients
  WHERE id = target_duplicate_client_id
    AND establishment_id = target_establishment_id
    AND status IN ('active', 'archived');
  IF survivor.id IS NULL OR duplicate.id IS NULL THEN
    RAISE EXCEPTION 'establishment_client_not_found';
  END IF;

  IF (
    SELECT count(DISTINCT profile_id)
    FROM public.establishment_client_links
    WHERE establishment_client_id IN (survivor.id, duplicate.id)
      AND status = 'confirmed'
  ) > 1 THEN RAISE EXCEPTION 'merge_link_conflict'; END IF;

  FOR duplicate_link IN
    SELECT * FROM public.establishment_client_links
    WHERE establishment_client_id = duplicate.id
    ORDER BY created_at, id
    FOR UPDATE
  LOOP
    SELECT * INTO existing_link
    FROM public.establishment_client_links
    WHERE establishment_client_id = survivor.id
      AND profile_id = duplicate_link.profile_id
    FOR UPDATE;
    IF existing_link.id IS NULL THEN
      UPDATE public.establishment_client_links
      SET establishment_client_id = survivor.id, updated_at = now()
      WHERE id = duplicate_link.id;
    ELSE
      DELETE FROM public.establishment_client_links WHERE id = duplicate_link.id;
      IF duplicate_link.status = 'confirmed' AND existing_link.status <> 'confirmed' THEN
        UPDATE public.establishment_client_links
        SET status = 'confirmed', responded_at = COALESCE(duplicate_link.responded_at, now()),
            confirmed_at = COALESCE(duplicate_link.confirmed_at, now()), updated_at = now()
        WHERE id = existing_link.id;
      ELSIF duplicate_link.status = 'pending' AND existing_link.status = 'rejected' THEN
        UPDATE public.establishment_client_links
        SET status = 'pending', responded_at = NULL, confirmed_at = NULL, updated_at = now()
        WHERE id = existing_link.id;
      END IF;
    END IF;
  END LOOP;

  merged_consent := public.resolve_merged_marketing_consent(
    survivor.marketing_consent_status, duplicate.marketing_consent_status
  );
  merged_consent_at := CASE merged_consent
    WHEN 'unknown' THEN NULL
    -- The earliest revocation is the one that must be honoured.
    WHEN 'revoked' THEN LEAST(
      CASE WHEN survivor.marketing_consent_status = 'revoked'
        THEN survivor.marketing_consent_at END,
      CASE WHEN duplicate.marketing_consent_status = 'revoked'
        THEN duplicate.marketing_consent_at END
    )
    ELSE GREATEST(survivor.marketing_consent_at, duplicate.marketing_consent_at)
  END;

  UPDATE public.appointments
  SET establishment_client_id = survivor.id
  WHERE establishment_client_id = duplicate.id;

  UPDATE public.establishment_clients
  SET status = 'merged',
      merged_into_id = survivor.id,
      archived_at = NULL,
      updated_by = (SELECT auth.uid())
  WHERE id = duplicate.id;

  -- Re-pointing the appointments already fired the activity trigger, so
  -- client.first_appointment_at here is the recomputed value, not the snapshot
  -- read at the top. Folding the duplicate's own aggregates in closes the case
  -- where it carried a date no surviving appointment reproduces.
  UPDATE public.establishment_clients AS client
  SET marketing_consent_status = merged_consent,
      marketing_consent_at = merged_consent_at,
      first_appointment_at = LEAST(
        client.first_appointment_at, duplicate.first_appointment_at
      ),
      last_appointment_at = GREATEST(
        client.last_appointment_at, duplicate.last_appointment_at
      )
  WHERE client.id = survivor.id;

  INSERT INTO public.establishment_client_merge_events (
    establishment_id, survivor_client_id, duplicate_client_id,
    actor_id, reason_provided
  ) VALUES (
    target_establishment_id, survivor.id, duplicate.id,
    (SELECT auth.uid()), NULLIF(btrim(target_reason), '') IS NOT NULL
  );

  INSERT INTO public.authorization_audit_log (
    actor_id, action, establishment_id, metadata
  ) VALUES (
    (SELECT auth.uid()), 'business.client.merged', target_establishment_id,
    jsonb_build_object(
      'survivor_client_id', survivor.id,
      'duplicate_client_id', duplicate.id,
      'reason_provided', NULLIF(btrim(target_reason), '') IS NOT NULL,
      'marketing_consent_status', merged_consent
    )
  );

  result := jsonb_build_object(
    'survivorClientId', survivor.id,
    'duplicateClientId', duplicate.id,
    'establishmentId', target_establishment_id,
    'status', 'merged'
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- ---------------------------------------------------------------------------
-- Exposure
-- ---------------------------------------------------------------------------

REVOKE ALL ON FUNCTION public.resolve_merged_marketing_consent(text, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_establishment_client_for_profile(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.archive_establishment_client(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_establishment_client(uuid, uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.export_establishment_clients(uuid, integer, integer, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.search_establishment_clients(uuid, text, integer, integer, boolean)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_establishment_client(
  uuid, uuid, uuid, text, text, text, text[], text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.archive_establishment_client(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.restore_establishment_client(uuid, uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.export_establishment_clients(uuid, integer, integer, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.search_establishment_clients(uuid, text, integer, integer, boolean)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.update_establishment_client(
  uuid, uuid, uuid, text, text, text, text[], text, text
) TO authenticated, service_role;

COMMIT;
