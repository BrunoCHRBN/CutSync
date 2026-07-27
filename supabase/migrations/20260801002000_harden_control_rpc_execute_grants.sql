-- A schema-only restore can recreate functions with PostgreSQL's default
-- PUBLIC EXECUTE privilege. Keep every RPC consumed by the private Control app
-- unavailable to anonymous sessions.

REVOKE ALL ON FUNCTION public.get_control_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_control_dashboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_users() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_user_access(
  uuid,
  public.governance_role_enum,
  timestamptz,
  text
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_control_user_access(uuid, text) FROM PUBLIC, anon;

REVOKE ALL ON FUNCTION public.list_control_billing_accounts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_identity_migration_conflicts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_billing_cutovers() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_subscription_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configure_control_plan(text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_control_subscription(uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_manual_billing_invoice(uuid, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_subscription_enforcement(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.finalize_organization_billing_cutover(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_control_context() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_control_dashboard() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_control_users() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_control_user_access(
  uuid,
  public.governance_role_enum,
  timestamptz,
  text
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.revoke_control_user_access(uuid, text) TO authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.list_control_billing_accounts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_identity_migration_conflicts() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_control_billing_cutovers() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_control_subscription_status(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_control_plan(text, integer, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.activate_control_subscription(uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.issue_manual_billing_invoice(uuid, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.set_control_subscription_enforcement(uuid, boolean, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.finalize_organization_billing_cutover(uuid) TO authenticated, service_role;
