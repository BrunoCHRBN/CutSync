-- Forward-only convergence for functions overwritten by later historical
-- migrations. Homolog already has the underlying tables and data.

BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE OR REPLACE FUNCTION public.fold_establishment_client_search_text(target_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT NULLIF(
    btrim(
      regexp_replace(
        lower(
          translate(
            coalesce(target_value, ''),
            'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
            'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
          )
        ),
        '\s+',
        ' ',
        'g'
      )
    ),
    ''
  );
$$;

REVOKE ALL ON FUNCTION public.fold_establishment_client_search_text(text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fold_establishment_client_search_text(text)
  TO service_role;

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
  folded_query text := public.fold_establishment_client_search_text(normalized_query);
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
        )) || jsonb_build_object(
          'status', client.status,
          'firstAppointmentAt', client.first_appointment_at,
          'lastAppointmentAt', client.last_appointment_at
        ) AS payload
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
          OR (
            folded_query IS NOT NULL
            AND public.fold_establishment_client_search_text(client.display_name)
              LIKE '%' || folded_query || '%'
          )
          OR (
            folded_query IS NOT NULL
            AND public.fold_establishment_client_search_text(client.email)
              LIKE '%' || folded_query || '%'
          )
          OR (
            query_digits IS NOT NULL
            AND client.phone IS NOT NULL
            AND regexp_replace(client.phone, '[^0-9]', '', 'g') LIKE '%' || query_digits || '%'
          )
          OR EXISTS (
            SELECT 1 FROM unnest(client.tags) AS tag
            WHERE tag ILIKE '%' || normalized_query || '%'
              OR (
                folded_query IS NOT NULL
                AND public.fold_establishment_client_search_text(tag) LIKE '%' || folded_query || '%'
              )
          )
        )
      ORDER BY client.display_name, client.id
      LIMIT target_limit OFFSET target_offset
    ) AS result
  ), '[]'::jsonb);
END;
$$;

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
  INTO STRICT status_state
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

REVOKE ALL ON FUNCTION public.enforce_establishment_discovery_eligibility()
  FROM PUBLIC, anon, authenticated;

-- The access-audit migration is intentionally replayed here because its
-- historical timestamp precedes the operational access helpers it now uses.
CREATE OR REPLACE FUNCTION public.get_establishment_team(
  target_establishment_id uuid,
  include_administrators boolean DEFAULT true
)
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, work_hours text, specialties text,
  instagram text, titulo_profissional text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  caller_is_manager boolean;
BEGIN
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(target_establishment_id, 'view_own_agenda')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  caller_is_manager := public.is_superadmin()
    OR public.is_business_administrator(target_establishment_id, false);

  RETURN QUERY
  SELECT
    profile.id,
    membership.establishment_id,
    profile.name,
    membership.role,
    CASE
      WHEN caller_is_manager OR profile.id = (SELECT auth.uid()) THEN profile.email
    END,
    CASE
      WHEN caller_is_manager OR profile.id = (SELECT auth.uid()) THEN profile.phone
    END,
    profile.avatar_url,
    CASE
      WHEN caller_is_manager OR profile.id = (SELECT auth.uid())
        THEN membership.commission_rate
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

REVOKE ALL ON FUNCTION public.get_establishment_team(uuid, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_establishment_team(uuid, boolean)
  TO authenticated;

-- service_role owns the queue transport surface and needs to evaluate the
-- payload CHECK constraint during explicit maintenance updates.
GRANT EXECUTE ON FUNCTION public.is_safe_business_push_payload(jsonb)
  TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
