BEGIN;

-- Runtime administration is an authenticated AAL2 human operation. Keep the
-- SECURITY DEFINER owner explicit and remove every direct service-role path.
ALTER TABLE public.corporate_case_runtime_settings OWNER TO postgres;
ALTER TABLE public.corporate_case_runtime_changes OWNER TO postgres;

ALTER FUNCTION public.get_corporate_case_runtime_administration_context(integer)
  OWNER TO postgres;
ALTER FUNCTION public.set_corporate_case_runtime_settings(
  boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
) OWNER TO postgres;
ALTER FUNCTION public.corporate_case_runtime_changes_are_immutable()
  OWNER TO postgres;

-- Audit rows must not be rewritten by an ON DELETE SET NULL action. CutSync
-- offboards privileged identities by revoking access and anonymizing retained
-- profiles; physical deletion remains intentionally restricted.
ALTER TABLE public.corporate_case_runtime_settings
  DROP CONSTRAINT IF EXISTS corporate_case_runtime_settings_updated_by_fkey;

ALTER TABLE public.corporate_case_runtime_settings
  ADD CONSTRAINT corporate_case_runtime_settings_updated_by_fkey
  FOREIGN KEY (updated_by)
  REFERENCES public.profiles(id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.corporate_case_runtime_changes
  DROP CONSTRAINT IF EXISTS corporate_case_runtime_changes_actor_profile_id_fkey;

ALTER TABLE public.corporate_case_runtime_changes
  ADD CONSTRAINT corporate_case_runtime_changes_actor_profile_id_fkey
  FOREIGN KEY (actor_profile_id)
  REFERENCES public.profiles(id)
  ON UPDATE RESTRICT
  ON DELETE RESTRICT
  NOT VALID;

ALTER TABLE public.corporate_case_runtime_settings
  VALIDATE CONSTRAINT corporate_case_runtime_settings_updated_by_fkey;

ALTER TABLE public.corporate_case_runtime_changes
  VALIDATE CONSTRAINT corporate_case_runtime_changes_actor_profile_id_fkey;

CREATE OR REPLACE FUNCTION public.enforce_corporate_case_runtime_write_boundary()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog
AS $$
DECLARE
  trusted_writer name;
  caller_id uuid;
  caller_aal text;
  captured_previous_settings jsonb;
  captured_expected_version integer;
BEGIN
  IF TG_OP = 'TRUNCATE' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'corporate_case_runtime_truncate_forbidden';
  END IF;

  SELECT pg_catalog.pg_get_userbyid(procedure.proowner)
  INTO STRICT trusted_writer
  FROM pg_catalog.pg_proc AS procedure
  WHERE procedure.oid =
    'public.set_corporate_case_runtime_settings(boolean,boolean,boolean,boolean,boolean,boolean,integer,text,uuid)'::regprocedure;

  caller_id := auth.uid();
  caller_aal := coalesce(auth.jwt()->>'aal', 'aal1');

  -- This also fails closed if a direct ACL is accidentally restored later.
  IF trusted_writer <> 'postgres'::name
     OR current_user <> trusted_writer
     OR caller_id IS NULL
     OR caller_aal <> 'aal2'
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'corporate_case_runtime_write_forbidden';
  END IF;

  IF TG_TABLE_SCHEMA = 'public'
     AND TG_TABLE_NAME = 'corporate_case_runtime_settings'
  THEN
    IF TG_OP <> 'UPDATE' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'corporate_case_runtime_settings_operation_forbidden';
    END IF;

    IF NEW.updated_by IS DISTINCT FROM caller_id
       OR NEW.version IS DISTINCT FROM OLD.version + 1
       OR NEW.singleton IS DISTINCT FROM OLD.singleton
       OR NEW.created_at IS DISTINCT FROM OLD.created_at
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'corporate_case_runtime_settings_write_shape_invalid';
    END IF;

    PERFORM pg_catalog.set_config(
      'cutsync.corporate_case_runtime_previous_settings',
      jsonb_build_object(
        'enabled', OLD.enabled,
        'creation_enabled', OLD.creation_enabled,
        'workflow_enabled', OLD.workflow_enabled,
        'automation_enabled', OLD.automation_enabled,
        'email_enabled', OLD.email_enabled,
        'legacy_redirects_enabled', OLD.legacy_redirects_enabled
      )::text,
      true
    );
    PERFORM pg_catalog.set_config(
      'cutsync.corporate_case_runtime_expected_version',
      OLD.version::text,
      true
    );

    RETURN NEW;
  END IF;

  IF TG_TABLE_SCHEMA = 'public'
     AND TG_TABLE_NAME = 'corporate_case_runtime_changes'
  THEN
    IF TG_OP <> 'INSERT' THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'corporate_case_runtime_change_operation_forbidden';
    END IF;

    captured_previous_settings := nullif(
      pg_catalog.current_setting(
        'cutsync.corporate_case_runtime_previous_settings',
        true
      ),
      ''
    )::jsonb;
    captured_expected_version := nullif(
      pg_catalog.current_setting(
        'cutsync.corporate_case_runtime_expected_version',
        true
      ),
      ''
    )::integer;

    IF NEW.actor_profile_id IS DISTINCT FROM caller_id
       OR NEW.resulting_version IS DISTINCT FROM NEW.expected_version + 1
       OR captured_previous_settings IS NULL
       OR NEW.previous_settings IS DISTINCT FROM captured_previous_settings
       OR NEW.expected_version IS DISTINCT FROM captured_expected_version
    THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'corporate_case_runtime_change_write_shape_invalid';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.corporate_case_runtime_settings AS settings
      WHERE settings.singleton
        AND settings.version = NEW.resulting_version
        AND jsonb_build_object(
          'enabled', settings.enabled,
          'creation_enabled', settings.creation_enabled,
          'workflow_enabled', settings.workflow_enabled,
          'automation_enabled', settings.automation_enabled,
          'email_enabled', settings.email_enabled,
          'legacy_redirects_enabled', settings.legacy_redirects_enabled
        ) = NEW.new_settings
    ) THEN
      RAISE EXCEPTION USING
        ERRCODE = '23514',
        MESSAGE = 'corporate_case_runtime_change_state_mismatch';
    END IF;

    NEW.actor_name := pg_catalog.left(
      coalesce(nullif(pg_catalog.btrim(NEW.actor_name), ''), 'SaaS Owner'),
      160
    );
    NEW.reason := pg_catalog.btrim(NEW.reason);

    RETURN NEW;
  END IF;

  RAISE EXCEPTION USING
    ERRCODE = '42501',
    MESSAGE = 'corporate_case_runtime_trigger_scope_invalid';
END;
$$;

DROP TRIGGER IF EXISTS corporate_case_runtime_settings_write_boundary
  ON public.corporate_case_runtime_settings;
CREATE TRIGGER corporate_case_runtime_settings_write_boundary
BEFORE INSERT OR UPDATE OR DELETE
ON public.corporate_case_runtime_settings
FOR EACH ROW
EXECUTE FUNCTION public.enforce_corporate_case_runtime_write_boundary();

DROP TRIGGER IF EXISTS corporate_case_runtime_settings_truncate_boundary
  ON public.corporate_case_runtime_settings;
CREATE TRIGGER corporate_case_runtime_settings_truncate_boundary
BEFORE TRUNCATE
ON public.corporate_case_runtime_settings
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_corporate_case_runtime_write_boundary();

DROP TRIGGER IF EXISTS corporate_case_runtime_changes_insert_boundary
  ON public.corporate_case_runtime_changes;
CREATE TRIGGER corporate_case_runtime_changes_insert_boundary
BEFORE INSERT
ON public.corporate_case_runtime_changes
FOR EACH ROW
EXECUTE FUNCTION public.enforce_corporate_case_runtime_write_boundary();

DROP TRIGGER IF EXISTS corporate_case_runtime_changes_truncate_boundary
  ON public.corporate_case_runtime_changes;
CREATE TRIGGER corporate_case_runtime_changes_truncate_boundary
BEFORE TRUNCATE
ON public.corporate_case_runtime_changes
FOR EACH STATEMENT
EXECUTE FUNCTION public.enforce_corporate_case_runtime_write_boundary();

ALTER FUNCTION public.enforce_corporate_case_runtime_write_boundary()
  OWNER TO postgres;

ALTER TABLE public.corporate_case_runtime_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.corporate_case_runtime_changes ENABLE ROW LEVEL SECURITY;

-- service_role bypasses RLS, so ACL denial and the trigger boundary are both
-- required. Existing readers use SECURITY DEFINER RPCs.
REVOKE ALL PRIVILEGES ON TABLE
  public.corporate_case_runtime_settings,
  public.corporate_case_runtime_changes
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.enforce_corporate_case_runtime_write_boundary(),
  public.corporate_case_runtime_changes_are_immutable()
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.get_corporate_case_runtime_administration_context(integer)
FROM PUBLIC, anon, authenticated, service_role;

REVOKE ALL ON FUNCTION
  public.set_corporate_case_runtime_settings(
    boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
  )
FROM PUBLIC, anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION
  public.get_corporate_case_runtime_administration_context(integer)
TO authenticated;

GRANT EXECUTE ON FUNCTION
  public.set_corporate_case_runtime_settings(
    boolean, boolean, boolean, boolean, boolean, boolean, integer, text, uuid
  )
TO authenticated;

COMMENT ON FUNCTION public.enforce_corporate_case_runtime_write_boundary() IS
  'Defense-in-depth boundary: runtime state is writable only by the AAL2 authenticated SECURITY DEFINER administration path; direct service_role writes and all truncation are rejected.';

COMMIT;
