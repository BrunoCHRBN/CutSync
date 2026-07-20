BEGIN;

-- Função genérica de auditoria automática para governança
CREATE OR REPLACE FUNCTION public.audit_governance_actions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_TABLE_NAME = 'establishments' THEN
    IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN
      INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
      VALUES (
        (SELECT auth.uid()),
        'establishment.status_changed',
        NEW.id,
        'establishment',
        jsonb_build_object('old_status', OLD.account_status, 'new_status', NEW.account_status, 'name', NEW.name)
      );
    END IF;
  ELSIF TG_TABLE_NAME = 'governance_users' THEN
    IF TG_OP = 'INSERT' THEN
      INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
      VALUES (
        (SELECT auth.uid()),
        'governance.user_created',
        NEW.profile_id,
        'governance_user',
        jsonb_build_object('role', NEW.role)
      );
    ELSIF TG_OP = 'UPDATE' THEN
      IF NEW.role IS DISTINCT FROM OLD.role THEN
        INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
        VALUES (
          (SELECT auth.uid()),
          'governance.user_role_changed',
          NEW.profile_id,
          'governance_user',
          jsonb_build_object('old_role', OLD.role, 'new_role', NEW.role)
        );
      END IF;
    ELSIF TG_OP = 'DELETE' THEN
      INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
      VALUES (
        (SELECT auth.uid()),
        'governance.user_removed',
        OLD.profile_id,
        'governance_user',
        jsonb_build_object('role', OLD.role)
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Criar Triggers
DROP TRIGGER IF EXISTS audit_establishments_status ON public.establishments;
CREATE TRIGGER audit_establishments_status
  AFTER UPDATE OF account_status ON public.establishments
  FOR EACH ROW EXECUTE FUNCTION public.audit_governance_actions();

DROP TRIGGER IF EXISTS audit_governance_users ON public.governance_users;
CREATE TRIGGER audit_governance_users
  AFTER INSERT OR UPDATE OR DELETE ON public.governance_users
  FOR EACH ROW EXECUTE FUNCTION public.audit_governance_actions();

COMMIT;
