-- Replace platform-wide table grants with the column-level contract already
-- assumed by the profile RLS and protection triggers.
REVOKE ALL ON TABLE public.profiles FROM anon, authenticated;

GRANT SELECT (
  id,
  name,
  avatar_url,
  work_hours,
  specialties,
  instagram,
  titulo_profissional,
  notification_channels,
  pix_key
) ON TABLE public.profiles TO authenticated;

GRANT UPDATE (
  name,
  phone,
  avatar_url,
  push_token,
  work_hours,
  specialties,
  instagram,
  titulo_profissional,
  notification_channels,
  pix_key,
  lgpd_marketing_accepted,
  updated_at
) ON TABLE public.profiles TO authenticated;

GRANT ALL ON TABLE public.profiles TO service_role;
