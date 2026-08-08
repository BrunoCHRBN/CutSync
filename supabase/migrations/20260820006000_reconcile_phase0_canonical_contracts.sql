BEGIN;

-- The linked project inherited broad/default table ACLs that were not encoded
-- in the historical migrations. Define the public catalog and administrator
-- settings surface explicitly while keeping governance, KYC and rollout flags
-- outside direct app writes.
REVOKE ALL ON TABLE public.establishments FROM anon, authenticated;

GRANT SELECT (
  id,
  name,
  slug,
  logo_url,
  banner_url,
  slogan,
  instagram,
  primary_color,
  timezone,
  currency,
  description,
  address,
  phone,
  opening_hours,
  share_agendas,
  gallery_urls,
  account_status,
  discovery_status,
  published_at,
  average_rating,
  review_count,
  average_price,
  price_level,
  instant_booking_enabled,
  min_cancellation_hours,
  no_show_fee_percent,
  latitude,
  longitude,
  professional_pix_allowed
) ON TABLE public.establishments TO anon, authenticated;

GRANT UPDATE (
  name,
  slug,
  logo_url,
  banner_url,
  slogan,
  instagram,
  primary_color,
  timezone,
  currency,
  description,
  address,
  phone,
  opening_hours,
  share_agendas,
  gallery_urls,
  instant_booking_enabled,
  min_cancellation_hours,
  no_show_fee_percent,
  latitude,
  longitude,
  professional_pix_allowed,
  updated_at
) ON TABLE public.establishments TO authenticated;

GRANT ALL ON TABLE public.establishments TO service_role;

-- 20260819000000 accidentally put nullable activity keys back after
-- jsonb_strip_nulls. Restore the read-model contract consumed by Business.
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

REVOKE ALL ON FUNCTION public.search_establishment_clients(uuid, text, integer, integer, boolean)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.search_establishment_clients(uuid, text, integer, integer, boolean)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
COMMIT;
