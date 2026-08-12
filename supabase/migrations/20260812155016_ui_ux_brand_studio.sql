BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

CREATE TABLE public.organization_brand_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  save_request_id uuid UNIQUE,
  publish_request_id uuid UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  restored_from_version_id uuid REFERENCES public.organization_brand_versions(id) ON DELETE SET NULL,
  UNIQUE (organization_id, version_number)
);

CREATE UNIQUE INDEX organization_brand_one_draft_idx
  ON public.organization_brand_versions(organization_id) WHERE status = 'draft';
CREATE UNIQUE INDEX organization_brand_one_published_idx
  ON public.organization_brand_versions(organization_id) WHERE status = 'published';

CREATE TABLE public.establishment_brand_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  base_organization_version_id uuid REFERENCES public.organization_brand_versions(id) ON DELETE SET NULL,
  version_number integer NOT NULL CHECK (version_number > 0),
  status text NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  configuration jsonb NOT NULL CHECK (jsonb_typeof(configuration) = 'object'),
  override_fields text[] NOT NULL DEFAULT ARRAY[]::text[],
  save_request_id uuid UNIQUE,
  publish_request_id uuid UNIQUE,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  published_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at timestamptz,
  restored_from_version_id uuid REFERENCES public.establishment_brand_versions(id) ON DELETE SET NULL,
  UNIQUE (establishment_id, version_number),
  CHECK (override_fields <@ ARRAY[
    'preset', 'primaryColor', 'logo', 'banner', 'gallery',
    'description', 'slogan', 'composition'
  ]::text[])
);

CREATE UNIQUE INDEX establishment_brand_one_draft_idx
  ON public.establishment_brand_versions(establishment_id) WHERE status = 'draft';
CREATE UNIQUE INDEX establishment_brand_one_published_idx
  ON public.establishment_brand_versions(establishment_id) WHERE status = 'published';

CREATE TABLE public.brand_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL CHECK (action IN (
    'brand.draft_saved', 'brand.published', 'brand.restored',
    'brand.inheritance_changed', 'brand.suspended'
  )),
  version_id uuid NOT NULL,
  request_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (organization_id IS NOT NULL OR establishment_id IS NOT NULL),
  UNIQUE (actor_id, action, request_id)
);

ALTER TABLE public.organization_brand_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.establishment_brand_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brand_audit_log ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.organization_brand_versions,
  public.establishment_brand_versions,
  public.brand_audit_log
FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.brand_configuration_is_valid(configuration jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT
    jsonb_typeof(configuration) = 'object'
    AND COALESCE(configuration->>'preset', '') IN ('classic', 'editorial', 'minimal')
    AND COALESCE(configuration->>'primaryColor', '') ~ '^#[0-9A-Fa-f]{6}$'
    AND char_length(COALESCE(configuration->>'description', '')) <= 600
    AND char_length(COALESCE(configuration->>'slogan', '')) <= 140
    AND (
      configuration->'logo' IS NULL
      OR configuration->'logo' = 'null'::jsonb
      OR (
        jsonb_typeof(configuration->'logo') = 'object'
        AND COALESCE(configuration#>>'{logo,url}', '') ~ '^https://'
        AND char_length(COALESCE(configuration#>>'{logo,altText}', '')) BETWEEN 3 AND 160
        AND COALESCE((configuration#>>'{logo,consentConfirmed}')::boolean, false)
      )
    )
    AND (
      configuration->'banner' IS NULL
      OR configuration->'banner' = 'null'::jsonb
      OR (
        jsonb_typeof(configuration->'banner') = 'object'
        AND COALESCE(configuration#>>'{banner,url}', '') ~ '^https://'
        AND char_length(COALESCE(configuration#>>'{banner,altText}', '')) BETWEEN 3 AND 160
        AND COALESCE((configuration#>>'{banner,consentConfirmed}')::boolean, false)
      )
    )
    AND COALESCE(jsonb_typeof(configuration->'gallery'), 'array') = 'array'
    AND jsonb_array_length(CASE WHEN jsonb_typeof(configuration->'gallery') = 'array' THEN configuration->'gallery' ELSE '[]'::jsonb END) <= 12
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(configuration->'gallery') = 'array' THEN configuration->'gallery' ELSE '[]'::jsonb END) AS media
      WHERE jsonb_typeof(media) <> 'object'
        OR COALESCE(media->>'url', '') !~ '^https://'
        OR char_length(COALESCE(media->>'altText', '')) NOT BETWEEN 3 AND 160
        OR NOT COALESCE((media->>'consentConfirmed')::boolean, false)
    );
$$;

CREATE OR REPLACE FUNCTION public.resolve_brand_configuration(
  organization_configuration jsonb,
  establishment_configuration jsonb,
  override_fields text[]
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog, public
AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'preset', CASE WHEN 'preset' = ANY(override_fields) THEN establishment_configuration->'preset' ELSE organization_configuration->'preset' END,
    'primaryColor', CASE WHEN 'primaryColor' = ANY(override_fields) THEN establishment_configuration->'primaryColor' ELSE organization_configuration->'primaryColor' END,
    'logo', CASE WHEN 'logo' = ANY(override_fields) THEN establishment_configuration->'logo' ELSE organization_configuration->'logo' END,
    'banner', CASE WHEN 'banner' = ANY(override_fields) THEN establishment_configuration->'banner' ELSE organization_configuration->'banner' END,
    'gallery', CASE WHEN 'gallery' = ANY(override_fields) THEN establishment_configuration->'gallery' ELSE organization_configuration->'gallery' END,
    'description', CASE WHEN 'description' = ANY(override_fields) THEN establishment_configuration->'description' ELSE organization_configuration->'description' END,
    'slogan', CASE WHEN 'slogan' = ANY(override_fields) THEN establishment_configuration->'slogan' ELSE organization_configuration->'slogan' END,
    'composition', CASE WHEN 'composition' = ANY(override_fields) THEN establishment_configuration->'composition' ELSE organization_configuration->'composition' END
  ));
$$;

CREATE OR REPLACE FUNCTION public.get_brand_authority(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_organization_id uuid;
  organization_role text;
  unit_admin boolean := false;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.establishments WHERE id = target_establishment_id) THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  SELECT link.organization_id INTO target_organization_id
  FROM public.organization_establishments AS link
  WHERE link.establishment_id = target_establishment_id
    AND link.status = 'active'
    AND link.effective_until IS NULL
  LIMIT 1;

  IF target_organization_id IS NOT NULL THEN
    SELECT member.role INTO organization_role
    FROM public.organization_members AS member
    WHERE member.organization_id = target_organization_id
      AND member.profile_id = actor_id
      AND member.status = 'active'
      AND member.revoked_at IS NULL;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.memberships AS membership
    WHERE membership.establishment_id = target_establishment_id
      AND membership.profile_id = actor_id
      AND membership.role = 'admin'
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
  ) INTO unit_admin;

  RETURN jsonb_build_object(
    'organizationId', target_organization_id,
    'organizationRole', organization_role,
    'unitAdmin', unit_admin,
    'manageBrand', COALESCE(organization_role IN ('owner', 'manager'), false) OR unit_admin,
    'publishBrand', COALESCE(organization_role = 'owner', false) OR unit_admin,
    'manageOrganizationBrand', COALESCE(organization_role IN ('owner', 'manager'), false),
    'publishOrganizationBrand', COALESCE(organization_role = 'owner', false)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_brand_editor_context(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  authority jsonb;
  organization_published public.organization_brand_versions%ROWTYPE;
  organization_draft public.organization_brand_versions%ROWTYPE;
  establishment_published public.establishment_brand_versions%ROWTYPE;
  establishment_draft public.establishment_brand_versions%ROWTYPE;
  resolved jsonb;
  sources jsonb := '{}'::jsonb;
  field_name text;
BEGIN
  authority := public.get_brand_authority(target_establishment_id);
  IF NOT COALESCE((authority->>'manageBrand')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO organization_published FROM public.organization_brand_versions
  WHERE organization_id = (authority->>'organizationId')::uuid AND status = 'published';
  SELECT * INTO organization_draft FROM public.organization_brand_versions
  WHERE organization_id = (authority->>'organizationId')::uuid AND status = 'draft';
  SELECT * INTO establishment_published FROM public.establishment_brand_versions
  WHERE establishment_id = target_establishment_id AND status = 'published';
  SELECT * INTO establishment_draft FROM public.establishment_brand_versions
  WHERE establishment_id = target_establishment_id AND status = 'draft';

  resolved := public.resolve_brand_configuration(
    COALESCE(organization_published.configuration, '{}'::jsonb),
    COALESCE(establishment_published.configuration, '{}'::jsonb),
    COALESCE(establishment_published.override_fields, ARRAY[
      'preset', 'primaryColor', 'logo', 'banner', 'gallery',
      'description', 'slogan', 'composition'
    ]::text[])
  );
  FOREACH field_name IN ARRAY ARRAY[
    'preset', 'primaryColor', 'logo', 'banner', 'gallery',
    'description', 'slogan', 'composition'
  ]::text[] LOOP
    sources := sources || jsonb_build_object(
      field_name,
      CASE WHEN field_name = ANY(COALESCE(establishment_published.override_fields, ARRAY[]::text[]))
        OR organization_published.id IS NULL THEN 'establishment' ELSE 'organization' END
    );
  END LOOP;

  RETURN jsonb_build_object(
    'establishmentId', target_establishment_id,
    'capabilities', authority,
    'resolved', resolved,
    'sources', sources,
    'organizationPublished', CASE WHEN organization_published.id IS NULL THEN NULL ELSE to_jsonb(organization_published) END,
    'organizationDraft', CASE WHEN organization_draft.id IS NULL THEN NULL ELSE to_jsonb(organization_draft) END,
    'establishmentPublished', CASE WHEN establishment_published.id IS NULL THEN NULL ELSE to_jsonb(establishment_published) END,
    'establishmentDraft', CASE WHEN establishment_draft.id IS NULL THEN NULL ELSE to_jsonb(establishment_draft) END,
    'organizationHistory', COALESCE((
      SELECT jsonb_agg(history.payload ORDER BY history.version_number DESC)
      FROM (
        SELECT version.version_number, jsonb_build_object(
          'id', version.id,
          'version_number', version.version_number,
          'status', version.status,
          'configuration', version.configuration,
          'override_fields', ARRAY[]::text[],
          'published_at', version.published_at,
          'created_at', version.created_at,
          'restored_from_version_id', version.restored_from_version_id
        ) AS payload
        FROM public.organization_brand_versions AS version
        WHERE version.organization_id = (authority->>'organizationId')::uuid
          AND version.status IN ('published', 'archived')
        ORDER BY version.version_number DESC LIMIT 10
      ) AS history
    ), '[]'::jsonb),
    'establishmentHistory', COALESCE((
      SELECT jsonb_agg(history.payload ORDER BY history.version_number DESC)
      FROM (
        SELECT version.version_number, jsonb_build_object(
          'id', version.id,
          'version_number', version.version_number,
          'status', version.status,
          'configuration', version.configuration,
          'override_fields', version.override_fields,
          'published_at', version.published_at,
          'created_at', version.created_at,
          'restored_from_version_id', version.restored_from_version_id
        ) AS payload
        FROM public.establishment_brand_versions AS version
        WHERE version.establishment_id = target_establishment_id
          AND version.status IN ('published', 'archived')
        ORDER BY version.version_number DESC LIMIT 10
      ) AS history
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.save_brand_draft(
  target_establishment_id uuid,
  target_scope text,
  target_configuration jsonb,
  target_override_fields text[],
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  authority jsonb;
  target_organization_id uuid;
  saved_id uuid;
  saved_version integer;
  saved_configuration jsonb;
  saved_target_id uuid;
  saved_overrides text[];
BEGIN
  IF target_request_id IS NULL OR target_scope NOT IN ('organization', 'establishment')
    OR NOT public.brand_configuration_is_valid(target_configuration) THEN
    RAISE EXCEPTION 'invalid_brand_draft' USING ERRCODE = '22023';
  END IF;
  authority := public.get_brand_authority(target_establishment_id);
  target_organization_id := (authority->>'organizationId')::uuid;
  IF target_scope = 'organization'
    AND (target_organization_id IS NULL OR NOT COALESCE((authority->>'manageOrganizationBrand')::boolean, false)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  ELSIF target_scope = 'establishment'
    AND NOT COALESCE((authority->>'manageBrand')::boolean, false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF target_scope = 'organization' THEN
    SELECT id, version_number, configuration, organization_id INTO saved_id, saved_version, saved_configuration, saved_target_id
    FROM public.organization_brand_versions WHERE save_request_id = target_request_id;
    IF saved_id IS NOT NULL AND (saved_target_id <> target_organization_id OR saved_configuration IS DISTINCT FROM target_configuration) THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    IF saved_id IS NULL THEN
      DELETE FROM public.organization_brand_versions
      WHERE organization_id = target_organization_id AND status = 'draft';
      SELECT COALESCE(max(version_number), 0) + 1 INTO saved_version
      FROM public.organization_brand_versions WHERE organization_id = target_organization_id;
      INSERT INTO public.organization_brand_versions(
        organization_id, version_number, status, configuration, save_request_id, created_by
      ) VALUES (
        target_organization_id, saved_version, 'draft', target_configuration, target_request_id, actor_id
      ) RETURNING id INTO saved_id;
    END IF;
    INSERT INTO public.brand_audit_log(organization_id, actor_id, action, version_id, request_id)
    VALUES (target_organization_id, actor_id, 'brand.draft_saved', saved_id, target_request_id)
    ON CONFLICT DO NOTHING;
  ELSE
    IF NOT COALESCE(target_override_fields, ARRAY[]::text[]) <@ ARRAY[
      'preset', 'primaryColor', 'logo', 'banner', 'gallery',
      'description', 'slogan', 'composition'
    ]::text[] THEN RAISE EXCEPTION 'invalid_override_fields' USING ERRCODE = '22023'; END IF;
    SELECT id, version_number, configuration, establishment_id, override_fields
    INTO saved_id, saved_version, saved_configuration, saved_target_id, saved_overrides
    FROM public.establishment_brand_versions WHERE save_request_id = target_request_id;
    IF saved_id IS NOT NULL AND (
      saved_target_id <> target_establishment_id
      OR saved_configuration IS DISTINCT FROM target_configuration
      OR saved_overrides IS DISTINCT FROM COALESCE(target_override_fields, ARRAY[]::text[])
    ) THEN RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023'; END IF;
    IF saved_id IS NULL THEN
      DELETE FROM public.establishment_brand_versions
      WHERE establishment_id = target_establishment_id AND status = 'draft';
      SELECT COALESCE(max(version_number), 0) + 1 INTO saved_version
      FROM public.establishment_brand_versions WHERE establishment_id = target_establishment_id;
      INSERT INTO public.establishment_brand_versions(
        establishment_id, base_organization_version_id, version_number, status,
        configuration, override_fields, save_request_id, created_by
      ) VALUES (
        target_establishment_id,
        (SELECT id FROM public.organization_brand_versions WHERE organization_id = target_organization_id AND status = 'published'),
        saved_version, 'draft', target_configuration, COALESCE(target_override_fields, ARRAY[]::text[]),
        target_request_id, actor_id
      ) RETURNING id INTO saved_id;
    END IF;
    INSERT INTO public.brand_audit_log(establishment_id, organization_id, actor_id, action, version_id, request_id)
    VALUES (target_establishment_id, target_organization_id, actor_id, 'brand.draft_saved', saved_id, target_request_id)
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('versionId', saved_id, 'version', saved_version, 'status', 'draft');
END;
$$;

CREATE OR REPLACE FUNCTION public.project_published_brand(target_establishment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  organization_config jsonb := '{}'::jsonb;
  unit_config jsonb := '{}'::jsonb;
  unit_overrides text[] := ARRAY[]::text[];
  resolved jsonb;
BEGIN
  SELECT organization_version.configuration INTO organization_config
  FROM public.organization_establishments AS link
  JOIN public.organization_brand_versions AS organization_version
    ON organization_version.organization_id = link.organization_id AND organization_version.status = 'published'
  WHERE link.establishment_id = target_establishment_id AND link.status = 'active' AND link.effective_until IS NULL;
  SELECT configuration, override_fields INTO unit_config, unit_overrides
  FROM public.establishment_brand_versions
  WHERE establishment_id = target_establishment_id AND status = 'published';
  resolved := public.resolve_brand_configuration(
    COALESCE(organization_config, '{}'::jsonb), COALESCE(unit_config, '{}'::jsonb),
    CASE WHEN organization_config IS NULL THEN ARRAY[
      'preset', 'primaryColor', 'logo', 'banner', 'gallery', 'description', 'slogan', 'composition'
    ]::text[] ELSE COALESCE(unit_overrides, ARRAY[]::text[]) END
  );
  UPDATE public.establishments SET
    primary_color = COALESCE(resolved->>'primaryColor', primary_color),
    logo_url = NULLIF(resolved#>>'{logo,url}', ''),
    banner_url = NULLIF(resolved#>>'{banner,url}', ''),
    gallery_urls = COALESCE((SELECT jsonb_agg(item->>'url') FROM jsonb_array_elements(COALESCE(resolved->'gallery', '[]'::jsonb)) AS item), '[]'::jsonb)::text,
    description = NULLIF(resolved->>'description', ''),
    slogan = NULLIF(resolved->>'slogan', ''),
    updated_at = now()
  WHERE id = target_establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_brand_version(
  target_establishment_id uuid,
  target_scope text,
  target_version_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  authority jsonb;
  target_organization_id uuid;
  version_configuration jsonb;
  unit_id uuid;
BEGIN
  IF target_request_id IS NULL OR target_scope NOT IN ('organization', 'establishment') THEN
    RAISE EXCEPTION 'invalid_publish_request' USING ERRCODE = '22023';
  END IF;
  authority := public.get_brand_authority(target_establishment_id);
  target_organization_id := (authority->>'organizationId')::uuid;
  IF target_scope = 'organization' THEN
    IF NOT COALESCE((authority->>'publishOrganizationBrand')::boolean, false) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_brand_versions WHERE publish_request_id = target_request_id AND id = target_version_id AND organization_id = target_organization_id) THEN
      RETURN jsonb_build_object('versionId', target_version_id, 'status', 'published', 'replayed', true);
    END IF;
    IF EXISTS (SELECT 1 FROM public.organization_brand_versions WHERE publish_request_id = target_request_id) THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT configuration INTO version_configuration FROM public.organization_brand_versions
    WHERE id = target_version_id AND organization_id = target_organization_id FOR UPDATE;
    IF NOT FOUND OR NOT public.brand_configuration_is_valid(version_configuration) THEN
      RAISE EXCEPTION 'invalid_brand_version' USING ERRCODE = '22023';
    END IF;
    UPDATE public.organization_brand_versions SET status = 'archived'
    WHERE organization_id = target_organization_id AND status = 'published';
    UPDATE public.organization_brand_versions SET status = 'published', publish_request_id = target_request_id,
      published_by = actor_id, published_at = now() WHERE id = target_version_id;
    FOR unit_id IN SELECT establishment_id FROM public.organization_establishments
      WHERE organization_id = target_organization_id AND status = 'active' AND effective_until IS NULL
    LOOP PERFORM public.project_published_brand(unit_id); END LOOP;
    INSERT INTO public.brand_audit_log(organization_id, actor_id, action, version_id, request_id)
    VALUES (target_organization_id, actor_id, 'brand.published', target_version_id, target_request_id)
    ON CONFLICT DO NOTHING;
  ELSE
    IF NOT COALESCE((authority->>'publishBrand')::boolean, false) THEN
      RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.establishment_brand_versions WHERE publish_request_id = target_request_id AND id = target_version_id AND establishment_id = target_establishment_id) THEN
      RETURN jsonb_build_object('versionId', target_version_id, 'status', 'published', 'replayed', true);
    END IF;
    IF EXISTS (SELECT 1 FROM public.establishment_brand_versions WHERE publish_request_id = target_request_id) THEN
      RAISE EXCEPTION 'idempotency_key_reused' USING ERRCODE = '22023';
    END IF;
    SELECT configuration INTO version_configuration FROM public.establishment_brand_versions
    WHERE id = target_version_id AND establishment_id = target_establishment_id FOR UPDATE;
    IF NOT FOUND OR NOT public.brand_configuration_is_valid(version_configuration) THEN
      RAISE EXCEPTION 'invalid_brand_version' USING ERRCODE = '22023';
    END IF;
    UPDATE public.establishment_brand_versions SET status = 'archived'
    WHERE establishment_id = target_establishment_id AND status = 'published';
    UPDATE public.establishment_brand_versions SET status = 'published', publish_request_id = target_request_id,
      published_by = actor_id, published_at = now() WHERE id = target_version_id;
    PERFORM public.project_published_brand(target_establishment_id);
    INSERT INTO public.brand_audit_log(establishment_id, organization_id, actor_id, action, version_id, request_id)
    VALUES (target_establishment_id, target_organization_id, actor_id, 'brand.published', target_version_id, target_request_id)
    ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('versionId', target_version_id, 'status', 'published', 'replayed', false);
END;
$$;

CREATE OR REPLACE FUNCTION public.restore_brand_version(
  target_establishment_id uuid,
  target_scope text,
  target_version_id uuid,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  current_actor_id uuid := (SELECT auth.uid());
  authority jsonb;
  target_organization_id uuid;
  restored_id uuid;
  next_version integer;
  restored_configuration jsonb;
  restored_overrides text[];
BEGIN
  authority := public.get_brand_authority(target_establishment_id);
  target_organization_id := (authority->>'organizationId')::uuid;
  IF target_request_id IS NULL THEN RAISE EXCEPTION 'invalid_restore_request' USING ERRCODE = '22023'; END IF;
  SELECT audit.version_id INTO restored_id FROM public.brand_audit_log AS audit
  WHERE audit.actor_id = current_actor_id AND audit.action = 'brand.restored' AND audit.request_id = target_request_id;
  IF restored_id IS NOT NULL THEN RETURN jsonb_build_object('versionId', restored_id, 'status', 'published', 'replayed', true); END IF;

  IF target_scope = 'organization' THEN
    IF NOT COALESCE((authority->>'publishOrganizationBrand')::boolean, false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    SELECT configuration INTO restored_configuration FROM public.organization_brand_versions
    WHERE id = target_version_id AND organization_id = target_organization_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'brand_version_not_found' USING ERRCODE = 'P0002'; END IF;
    SELECT COALESCE(max(version_number), 0) + 1 INTO next_version FROM public.organization_brand_versions WHERE organization_id = target_organization_id;
    UPDATE public.organization_brand_versions SET status = 'archived' WHERE organization_id = target_organization_id AND status IN ('draft', 'published');
    INSERT INTO public.organization_brand_versions(organization_id, version_number, status, configuration, publish_request_id, created_by, published_by, published_at, restored_from_version_id)
    VALUES (target_organization_id, next_version, 'published', restored_configuration, target_request_id, current_actor_id, current_actor_id, now(), target_version_id)
    RETURNING id INTO restored_id;
    PERFORM public.project_published_brand(link.establishment_id) FROM public.organization_establishments AS link
    WHERE link.organization_id = target_organization_id AND link.status = 'active' AND link.effective_until IS NULL;
    INSERT INTO public.brand_audit_log(organization_id, actor_id, action, version_id, request_id, metadata)
    VALUES (target_organization_id, current_actor_id, 'brand.restored', restored_id, target_request_id, jsonb_build_object('restoredFrom', target_version_id));
  ELSIF target_scope = 'establishment' THEN
    IF NOT COALESCE((authority->>'publishBrand')::boolean, false) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
    SELECT configuration, override_fields INTO restored_configuration, restored_overrides FROM public.establishment_brand_versions
    WHERE id = target_version_id AND establishment_id = target_establishment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'brand_version_not_found' USING ERRCODE = 'P0002'; END IF;
    SELECT COALESCE(max(version_number), 0) + 1 INTO next_version FROM public.establishment_brand_versions WHERE establishment_id = target_establishment_id;
    UPDATE public.establishment_brand_versions SET status = 'archived' WHERE establishment_id = target_establishment_id AND status IN ('draft', 'published');
    INSERT INTO public.establishment_brand_versions(establishment_id, base_organization_version_id, version_number, status, configuration, override_fields, publish_request_id, created_by, published_by, published_at, restored_from_version_id)
    VALUES (target_establishment_id, (SELECT id FROM public.organization_brand_versions WHERE organization_id = target_organization_id AND status = 'published'), next_version, 'published', restored_configuration, restored_overrides, target_request_id, current_actor_id, current_actor_id, now(), target_version_id)
    RETURNING id INTO restored_id;
    PERFORM public.project_published_brand(target_establishment_id);
    INSERT INTO public.brand_audit_log(establishment_id, organization_id, actor_id, action, version_id, request_id, metadata)
    VALUES (target_establishment_id, target_organization_id, current_actor_id, 'brand.restored', restored_id, target_request_id, jsonb_build_object('restoredFrom', target_version_id));
  ELSE RAISE EXCEPTION 'invalid_brand_scope' USING ERRCODE = '22023';
  END IF;
  RETURN jsonb_build_object('versionId', restored_id, 'status', 'published', 'replayed', false);
END;
$$;

-- Compatibility bootstrap. Legacy media remains visible, but must receive alt text
-- and consent before a later version can be republished through the studio.
INSERT INTO public.organization_brand_versions(organization_id, version_number, status, configuration, published_at)
SELECT organization.id, 1, 'published', jsonb_build_object(
  'preset', 'classic', 'primaryColor', '#0F766E', 'gallery', '[]'::jsonb,
  'description', '', 'slogan', '', 'composition', 'balanced'
), now() FROM public.organizations AS organization;

INSERT INTO public.establishment_brand_versions(establishment_id, base_organization_version_id, version_number, status, configuration, override_fields, published_at)
SELECT establishment.id, organization_version.id, 1, 'published', jsonb_strip_nulls(jsonb_build_object(
  'preset', 'classic',
  'primaryColor', COALESCE(establishment.primary_color, '#0F766E'),
  'logo', CASE WHEN establishment.logo_url IS NULL THEN NULL ELSE jsonb_build_object('url', establishment.logo_url, 'altText', establishment.name, 'consentConfirmed', false, 'legacyImported', true) END,
  'banner', CASE WHEN establishment.banner_url IS NULL THEN NULL ELSE jsonb_build_object('url', establishment.banner_url, 'altText', 'Capa de ' || establishment.name, 'consentConfirmed', false, 'legacyImported', true) END,
  'gallery', COALESCE((SELECT jsonb_agg(jsonb_build_object('url', value, 'altText', 'Imagem de ' || establishment.name, 'consentConfirmed', false, 'legacyImported', true)) FROM jsonb_array_elements_text(CASE WHEN COALESCE(establishment.gallery_urls, '') ~ '^\s*\[' THEN establishment.gallery_urls::jsonb ELSE '[]'::jsonb END) AS value), '[]'::jsonb),
  'description', COALESCE(establishment.description, ''),
  'slogan', COALESCE(establishment.slogan, ''),
  'composition', 'balanced'
)), ARRAY['preset', 'primaryColor', 'logo', 'banner', 'gallery', 'description', 'slogan', 'composition']::text[], now()
FROM public.establishments AS establishment
LEFT JOIN public.organization_establishments AS link
  ON link.establishment_id = establishment.id AND link.status = 'active' AND link.effective_until IS NULL
LEFT JOIN public.organization_brand_versions AS organization_version
  ON organization_version.organization_id = link.organization_id AND organization_version.status = 'published';

REVOKE ALL ON FUNCTION public.brand_configuration_is_valid(jsonb) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.resolve_brand_configuration(jsonb, jsonb, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_brand_authority(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_brand_editor_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.save_brand_draft(uuid, text, jsonb, text[], uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.project_published_brand(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.publish_brand_version(uuid, text, uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restore_brand_version(uuid, text, uuid, uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_brand_editor_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_brand_draft(uuid, text, jsonb, text[], uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.publish_brand_version(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restore_brand_version(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.brand_configuration_is_valid(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_brand_configuration(jsonb, jsonb, text[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_brand_authority(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_published_brand(uuid) TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
