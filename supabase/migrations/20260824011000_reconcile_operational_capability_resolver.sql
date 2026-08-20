BEGIN;

-- Homolog carried the migration version for the capability-template rollout,
-- but still exposed the legacy hard-coded resolver body. Reapply the canonical
-- catalog/template/override implementation additively instead of rewriting
-- migration history.
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
  target_membership_id uuid;
  target_role_template text;
  base_capabilities text[] := ARRAY[]::text[];
BEGIN
  IF target_access_mode NOT IN ('full', 'read_only') THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id,
    target_profile_id
  )
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN ARRAY[]::text[];
  END IF;

  SELECT membership.id, membership.role_template
  INTO target_membership_id, target_role_template
  FROM public.memberships AS membership
  WHERE membership.profile_id = target_profile_id
    AND membership.establishment_id = target_establishment_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
  LIMIT 1;

  IF identity_record.operational_role = 'owner' THEN
    SELECT COALESCE(
      array_agg(catalog.capability ORDER BY catalog.capability),
      ARRAY[]::text[]
    )
    INTO base_capabilities
    FROM public.business_capability_catalog AS catalog
    WHERE catalog.active;
  ELSE
    SELECT COALESCE(
      array_agg(template.capability ORDER BY template.capability),
      ARRAY[]::text[]
    )
    INTO base_capabilities
    FROM public.business_role_template_capabilities AS template
    JOIN public.business_capability_catalog AS catalog
      ON catalog.capability = template.capability
     AND catalog.active
    WHERE template.role_template = target_role_template;

    IF target_role_template = 'professional'
      AND COALESCE((
        SELECT establishment.share_agendas
        FROM public.establishments AS establishment
        WHERE establishment.id = target_establishment_id
      ), false)
      AND NOT ('view_team_agenda' = ANY(base_capabilities))
    THEN
      base_capabilities := base_capabilities || ARRAY['view_team_agenda'];
    END IF;
  END IF;

  RETURN ARRAY(
    SELECT catalog.capability
    FROM public.business_capability_catalog AS catalog
    WHERE catalog.active
      AND (target_access_mode = 'full' OR catalog.read_only_allowed)
      AND NOT EXISTS (
        SELECT 1
        FROM public.membership_capability_overrides AS override
        WHERE override.membership_id = target_membership_id
          AND override.establishment_id = target_establishment_id
          AND override.capability = catalog.capability
          AND override.effect = 'deny'
          AND override.revoked_at IS NULL
          AND override.valid_from <= now()
          AND (override.valid_until IS NULL OR override.valid_until > now())
      )
      AND (
        catalog.capability = ANY(base_capabilities)
        OR EXISTS (
          SELECT 1
          FROM public.membership_capability_overrides AS override
          WHERE override.membership_id = target_membership_id
            AND override.establishment_id = target_establishment_id
            AND override.capability = catalog.capability
            AND override.effect = 'grant'
            AND override.revoked_at IS NULL
            AND override.valid_from <= now()
            AND (override.valid_until IS NULL OR override.valid_until > now())
        )
      )
    ORDER BY catalog.capability
  );
END;
$$;

NOTIFY pgrst, 'reload schema';

COMMIT;
