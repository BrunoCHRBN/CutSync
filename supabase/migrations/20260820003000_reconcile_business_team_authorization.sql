-- Reconcile the operational-access guard introduced in 20260801000000 with
-- the teammate-data masking introduced in the duplicated 20260811000000
-- migration. The latter replaced the whole function and accidentally removed
-- billing/governance access-mode enforcement.
CREATE OR REPLACE FUNCTION public.get_establishment_team(
  target_establishment_id uuid,
  include_administrators boolean DEFAULT true
)
RETURNS TABLE (
  id uuid,
  establishment_id uuid,
  name text,
  role text,
  email text,
  phone text,
  avatar_url text,
  commission_rate numeric,
  work_hours text,
  specialties text,
  instagram text,
  titulo_profissional text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_is_administrator boolean :=
    public.is_superadmin()
    OR public.is_business_administrator(target_establishment_id, false);
BEGIN
  IF NOT actor_is_administrator
    AND NOT public.has_business_capability(
      target_establishment_id,
      'view_own_agenda'
    )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    membership.establishment_id,
    profile.name,
    membership.role,
    CASE
      WHEN actor_is_administrator OR profile.id = (SELECT auth.uid())
        THEN profile.email
      ELSE NULL
    END,
    CASE
      WHEN actor_is_administrator OR profile.id = (SELECT auth.uid())
        THEN profile.phone
      ELSE NULL
    END,
    profile.avatar_url,
    CASE
      WHEN actor_is_administrator OR profile.id = (SELECT auth.uid())
        THEN membership.commission_rate
      ELSE NULL::numeric
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
  TO authenticated, service_role;
