-- Migration: Add pix_key to get_my_profile RPC function return signature and grant permissions
BEGIN;

-- 1. Drop existing function first to allow changing return table signature
DROP FUNCTION IF EXISTS public.get_my_profile();

-- 2. Create updated get_my_profile RPC function returning pix_key
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, push_token text, work_hours text,
  specialties text, instagram text, titulo_profissional text, pix_key text, deleted_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT p.id, active_membership.establishment_id, p.name,
    COALESCE(active_membership.role, 'client'), p.email, p.phone, p.avatar_url,
    COALESCE(active_membership.commission_rate, p.commission_rate), p.push_token,
    p.work_hours, p.specialties, p.instagram, p.titulo_profissional, p.pix_key, p.deleted_at
  FROM public.profiles p
  LEFT JOIN LATERAL (
    SELECT m.establishment_id, m.role, m.commission_rate
    FROM public.memberships m
    WHERE m.profile_id = p.id AND m.status = 'active'
    ORDER BY (m.establishment_id = p.establishment_id) DESC, m.created_at
    LIMIT 1
  ) active_membership ON true
  WHERE p.id = (SELECT auth.uid());
$$;

REVOKE ALL ON FUNCTION public.get_my_profile() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated, service_role;

-- 3. Grant permissions on work_shifts table for authenticated professionals
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.work_shifts TO authenticated, service_role;

-- 4. Grant updated_at UPDATE permission on profiles
GRANT UPDATE (updated_at) ON public.profiles TO authenticated;

COMMIT;
