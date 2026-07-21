-- Migration: Allow both admin and professional roles to retrieve their establishment's team details
BEGIN;

CREATE OR REPLACE FUNCTION public.get_establishment_team(target_establishment_id uuid, include_administrators boolean DEFAULT true)
RETURNS TABLE (
  id uuid, establishment_id uuid, name text, role text, email text, phone text,
  avatar_url text, commission_rate numeric, work_hours text, specialties text,
  instagram text, titulo_profissional text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_superadmin() AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin', 'professional']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT p.id, m.establishment_id, p.name, m.role, p.email, p.phone, p.avatar_url,
    m.commission_rate, p.work_hours, p.specialties, p.instagram, p.titulo_profissional
  FROM public.memberships m JOIN public.profiles p ON p.id = m.profile_id
  WHERE m.establishment_id = target_establishment_id AND m.status = 'active'
    AND (include_administrators OR m.role = 'professional') AND p.deleted_at IS NULL
  ORDER BY p.name;
END;
$$;

COMMIT;
