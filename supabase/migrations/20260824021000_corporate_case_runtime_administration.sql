-- Created manually after `supabase migration new --help`: the CLI only generates
-- the current timestamp, which would sort before the existing 20260824 chain.
BEGIN;

INSERT INTO public.control_permission_catalog(permission, label, area, risk_level)
VALUES (
  'control.cases.configure',
  'Administrar ativação dos chamados corporativos',
  'cases',
  'critical'
)
ON CONFLICT (permission) DO UPDATE
SET label = EXCLUDED.label,
    area = EXCLUDED.area,
    risk_level = EXCLUDED.risk_level,
    active = true,
    updated_at = now();

DELETE FROM public.control_access_profile_permissions AS profile_permission
USING public.control_access_profiles AS access_profile
WHERE access_profile.id = profile_permission.access_profile_id
  AND profile_permission.permission = 'control.cases.configure'
  AND access_profile.profile_key <> 'saas_owner';

INSERT INTO public.control_access_profile_permissions(access_profile_id, permission)
SELECT access_profile.id, 'control.cases.configure'
FROM public.control_access_profiles AS access_profile
WHERE access_profile.profile_key = 'saas_owner'
ON CONFLICT (access_profile_id, permission) DO NOTHING;

ALTER TABLE public.corporate_case_runtime_settings
  ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0);

CREATE TABLE public.corporate_case_runtime_changes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE,
  actor_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  actor_name text NOT NULL CHECK (char_length(btrim(actor_name)) BETWEEN 1 AND 160),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 20 AND 1000),
  expected_version integer NOT NULL CHECK (expected_version > 0),
  resulting_version integer NOT NULL CHECK (resulting_version > expected_version),
  previous_settings jsonb NOT NULL CHECK (jsonb_typeof(previous_settings) = 'object'),
  new_settings jsonb NOT NULL CHECK (jsonb_typeof(new_settings) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX corporate_case_runtime_changes_created_at_idx
  ON public.corporate_case_runtime_changes(created_at DESC, id DESC);

CREATE OR REPLACE FUNCTION public.corporate_case_runtime_changes_are_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'corporate_case_runtime_changes_are_immutable';
END;
$$;

CREATE TRIGGER corporate_case_runtime_changes_immutable
BEFORE UPDATE OR DELETE ON public.corporate_case_runtime_changes
FOR EACH ROW EXECUTE FUNCTION public.corporate_case_runtime_changes_are_immutable();

ALTER TABLE public.corporate_case_runtime_changes ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.corporate_case_runtime_changes
FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.corporate_case_runtime_changes TO service_role;

REVOKE ALL ON FUNCTION public.corporate_case_runtime_changes_are_immutable()
FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_corporate_case_runtime_administration_context(
  target_history_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_context jsonb;
  runtime_settings public.corporate_case_runtime_settings%ROWTYPE;
  recent_changes jsonb;
BEGIN
  actor_context := public.get_control_context();

  IF actor_context->>'role' <> 'SaaS_Owner'
     OR NOT coalesce(
       actor_context->'permissions' ? 'control.cases.configure',
       false
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_history_limit IS NULL OR target_history_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'invalid_corporate_case_runtime_history_limit';
  END IF;

  SELECT settings.*
  INTO STRICT runtime_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton;

  SELECT coalesce(jsonb_agg(change_row.payload ORDER BY change_row.created_at DESC, change_row.id DESC), '[]'::jsonb)
  INTO recent_changes
  FROM (
    SELECT
      change.id,
      change.created_at,
      jsonb_build_object(
        'change_id', change.id,
        'request_id', change.request_id,
        'actor_profile_id', change.actor_profile_id,
        'actor_name', change.actor_name,
        'reason', change.reason,
        'expected_version', change.expected_version,
        'resulting_version', change.resulting_version,
        'previous_settings', change.previous_settings,
        'new_settings', change.new_settings,
        'created_at', change.created_at
      ) AS payload
    FROM public.corporate_case_runtime_changes AS change
    ORDER BY change.created_at DESC, change.id DESC
    LIMIT target_history_limit
  ) AS change_row;

  RETURN jsonb_build_object(
    'settings', jsonb_build_object(
      'enabled', runtime_settings.enabled,
      'creation_enabled', runtime_settings.creation_enabled,
      'workflow_enabled', runtime_settings.workflow_enabled,
      'automation_enabled', runtime_settings.automation_enabled,
      'email_enabled', runtime_settings.email_enabled,
      'legacy_redirects_enabled', runtime_settings.legacy_redirects_enabled,
      'version', runtime_settings.version,
      'updated_by', runtime_settings.updated_by,
      'updated_at', runtime_settings.updated_at
    ),
    'recent_changes', recent_changes
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.set_corporate_case_runtime_settings(
  target_enabled boolean,
  target_creation_enabled boolean,
  target_workflow_enabled boolean,
  target_automation_enabled boolean,
  target_email_enabled boolean,
  target_legacy_redirects_enabled boolean,
  target_expected_version integer,
  target_reason text,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  actor_context jsonb;
  actor_id uuid;
  actor_name text;
  normalized_reason text := btrim(coalesce(target_reason, ''));
  current_settings public.corporate_case_runtime_settings%ROWTYPE;
  updated_settings public.corporate_case_runtime_settings%ROWTYPE;
  existing_change public.corporate_case_runtime_changes%ROWTYPE;
  created_change public.corporate_case_runtime_changes%ROWTYPE;
  previous_payload jsonb;
  requested_payload jsonb;
BEGIN
  actor_context := public.get_control_context();
  actor_id := (actor_context->>'profile_id')::uuid;
  actor_name := coalesce(nullif(btrim(actor_context->>'name'), ''), 'SaaS Owner');

  IF actor_context->>'role' <> 'SaaS_Owner'
     OR NOT coalesce(
       actor_context->'permissions' ? 'control.cases.configure',
       false
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_request_id IS NULL THEN
    RAISE EXCEPTION 'corporate_case_runtime_request_id_required';
  END IF;
  IF target_expected_version IS NULL OR target_expected_version < 1 THEN
    RAISE EXCEPTION 'corporate_case_runtime_version_invalid';
  END IF;
  IF char_length(normalized_reason) NOT BETWEEN 20 AND 1000 THEN
    RAISE EXCEPTION 'corporate_case_runtime_reason_invalid';
  END IF;
  IF target_enabled IS NULL
     OR target_creation_enabled IS NULL
     OR target_workflow_enabled IS NULL
     OR target_automation_enabled IS NULL
     OR target_email_enabled IS NULL
     OR target_legacy_redirects_enabled IS NULL
  THEN
    RAISE EXCEPTION 'corporate_case_runtime_flags_required';
  END IF;

  IF (target_creation_enabled AND NOT target_enabled)
     OR (target_workflow_enabled AND NOT target_enabled)
     OR (target_automation_enabled AND NOT target_enabled)
     OR (target_email_enabled AND NOT target_automation_enabled)
     OR (target_legacy_redirects_enabled AND NOT target_enabled)
  THEN
    RAISE EXCEPTION 'corporate_case_runtime_dependency_invalid';
  END IF;

  requested_payload := jsonb_build_object(
    'enabled', target_enabled,
    'creation_enabled', target_creation_enabled,
    'workflow_enabled', target_workflow_enabled,
    'automation_enabled', target_automation_enabled,
    'email_enabled', target_email_enabled,
    'legacy_redirects_enabled', target_legacy_redirects_enabled
  );

  SELECT settings.*
  INTO STRICT current_settings
  FROM public.corporate_case_runtime_settings AS settings
  WHERE settings.singleton
  FOR UPDATE;

  SELECT change.*
  INTO existing_change
  FROM public.corporate_case_runtime_changes AS change
  WHERE change.request_id = target_request_id;

  IF FOUND THEN
    IF existing_change.actor_profile_id IS DISTINCT FROM actor_id
       OR existing_change.expected_version IS DISTINCT FROM target_expected_version
       OR existing_change.reason IS DISTINCT FROM normalized_reason
       OR existing_change.new_settings IS DISTINCT FROM requested_payload
    THEN
      RAISE EXCEPTION 'corporate_case_runtime_idempotency_conflict';
    END IF;

    RETURN jsonb_build_object(
      'change_id', existing_change.id,
      'request_id', existing_change.request_id,
      'resulting_version', existing_change.resulting_version,
      'settings', existing_change.new_settings,
      'idempotent', true
    );
  END IF;

  IF current_settings.version <> target_expected_version THEN
    RAISE EXCEPTION 'corporate_case_runtime_version_conflict';
  END IF;

  previous_payload := jsonb_build_object(
    'enabled', current_settings.enabled,
    'creation_enabled', current_settings.creation_enabled,
    'workflow_enabled', current_settings.workflow_enabled,
    'automation_enabled', current_settings.automation_enabled,
    'email_enabled', current_settings.email_enabled,
    'legacy_redirects_enabled', current_settings.legacy_redirects_enabled
  );

  IF previous_payload = requested_payload THEN
    RAISE EXCEPTION 'corporate_case_runtime_settings_unchanged';
  END IF;

  UPDATE public.corporate_case_runtime_settings
  SET enabled = target_enabled,
      creation_enabled = target_creation_enabled,
      workflow_enabled = target_workflow_enabled,
      automation_enabled = target_automation_enabled,
      email_enabled = target_email_enabled,
      legacy_redirects_enabled = target_legacy_redirects_enabled,
      updated_by = actor_id,
      version = current_settings.version + 1
  WHERE singleton
  RETURNING * INTO updated_settings;

  INSERT INTO public.corporate_case_runtime_changes(
    request_id,
    actor_profile_id,
    actor_name,
    reason,
    expected_version,
    resulting_version,
    previous_settings,
    new_settings
  )
  VALUES (
    target_request_id,
    actor_id,
    actor_name,
    normalized_reason,
    current_settings.version,
    updated_settings.version,
    previous_payload,
    requested_payload
  )
  RETURNING * INTO created_change;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'corporate_case.runtime_settings.changed',
    '00000000-0000-4000-8000-00000000ca5e'::uuid,
    'corporate_case_runtime_settings',
    jsonb_build_object(
      'request_id', target_request_id,
      'change_id', created_change.id,
      'previous_version', current_settings.version,
      'resulting_version', updated_settings.version,
      'previous_settings', previous_payload,
      'new_settings', requested_payload,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'change_id', created_change.id,
    'request_id', created_change.request_id,
    'resulting_version', updated_settings.version,
    'settings', requested_payload,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_corporate_case_runtime_administration_context(integer)
FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.set_corporate_case_runtime_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
) FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.get_corporate_case_runtime_administration_context(integer)
TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_corporate_case_runtime_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
) TO authenticated;

COMMENT ON FUNCTION public.get_corporate_case_runtime_administration_context(integer) IS
  'Returns all corporate case runtime flags and recent immutable changes to an AAL2 SaaS Owner with the dedicated critical capability.';
COMMENT ON FUNCTION public.set_corporate_case_runtime_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
) IS
  'Atomically changes corporate case runtime flags using AAL2, SaaS Owner role, a dedicated capability, optimistic locking, idempotency and immutable auditing.';

COMMIT;
