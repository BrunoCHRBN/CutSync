BEGIN;

CREATE OR REPLACE FUNCTION public.is_governance_user(
  allowed_roles public.governance_role_enum[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_session_is_aal2()
    AND EXISTS (
      SELECT 1
      FROM public.governance_users
      WHERE profile_id = (SELECT auth.uid())
        AND is_active
        AND revoked_at IS NULL
        AND (expires_at IS NULL OR expires_at > now())
        AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
    );
$$;

REVOKE ALL ON FUNCTION public.is_governance_user(
  public.governance_role_enum[]
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_governance_user(
  public.governance_role_enum[]
) TO authenticated, service_role;

COMMIT;
