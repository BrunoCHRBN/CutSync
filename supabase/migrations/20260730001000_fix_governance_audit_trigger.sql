BEGIN;

-- A trigger function shared by establishments and governance_users must branch
-- on the table before reading fields that only exist in one of the records.
CREATE OR REPLACE FUNCTION public.audit_governance_actions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  status_reason text := nullif(
    btrim(current_setting('cutsync.governance_status_reason', true)),
    ''
  );
BEGIN
  IF TG_TABLE_NAME = 'establishments' THEN
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      INSERT INTO public.security_audit_logs (
        actor_id,
        action,
        target_id,
        target_type,
        changes
      )
      VALUES (
        (SELECT auth.uid()),
        'establishment.status_changed',
        NEW.id,
        'establishment',
        jsonb_build_object(
          'old_status', OLD.account_status,
          'new_status', NEW.account_status,
          'name', NEW.name,
          'reason', coalesce(status_reason, 'Não informado')
        )
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'governance_users' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.security_audit_logs (
        actor_id,
        action,
        target_id,
        target_type,
        changes
      )
      VALUES (
        (SELECT auth.uid()),
        'governance.user_created',
        NEW.profile_id,
        'governance_user',
        jsonb_build_object('role', NEW.role)
      );
    ELSIF TG_OP = 'UPDATE' AND NEW.role IS DISTINCT FROM OLD.role THEN
      INSERT INTO public.security_audit_logs (
        actor_id,
        action,
        target_id,
        target_type,
        changes
      )
      VALUES (
        (SELECT auth.uid()),
        'governance.user_role_changed',
        NEW.profile_id,
        'governance_user',
        jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role)
      );
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.security_audit_logs (
        actor_id,
        action,
        target_id,
        target_type,
        changes
      )
      VALUES (
        (SELECT auth.uid()),
        'governance.user_removed',
        OLD.profile_id,
        'governance_user',
        jsonb_build_object('role', OLD.role)
      );
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.audit_governance_actions() FROM PUBLIC, anon, authenticated;

COMMIT;
