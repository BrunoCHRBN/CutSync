-- Catálogo público seguro: expõe somente dados necessários para perfil e reserva.
CREATE OR REPLACE FUNCTION public.get_public_team(target_establishment_id uuid)
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
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    profiles.id,
    profiles.establishment_id,
    profiles.name,
    profiles.role,
    ''::text AS email,
    NULL::text AS phone,
    profiles.avatar_url,
    NULL::numeric AS commission_rate,
    profiles.work_hours,
    profiles.specialties,
    profiles.instagram,
    NULL::text AS titulo_profissional
  FROM public.profiles
  WHERE profiles.establishment_id = target_establishment_id
    AND profiles.role IN ('professional', 'admin')
    AND profiles.deleted_at IS NULL
  ORDER BY profiles.name;
$$;

REVOKE ALL ON FUNCTION public.get_public_team(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_team(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Leitura pública de configurações de barbeiro" ON public.professional_services;
CREATE POLICY "Leitura pública de configurações de barbeiro" ON public.professional_services
  FOR SELECT TO anon, authenticated USING (true);