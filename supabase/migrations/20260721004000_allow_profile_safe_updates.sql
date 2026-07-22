-- Migration: Ensure profile onboarding columns exist and grant UPDATE permissions on safe profile columns
BEGIN;

-- 1. Ensure all onboarding and profile columns exist on public.profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS work_hours text,
  ADD COLUMN IF NOT EXISTS specialties text,
  ADD COLUMN IF NOT EXISTS instagram text,
  ADD COLUMN IF NOT EXISTS titulo_profissional text,
  ADD COLUMN IF NOT EXISTS notification_channels text[] DEFAULT ARRAY['push', 'whatsapp'],
  ADD COLUMN IF NOT EXISTS pix_key text,
  ADD COLUMN IF NOT EXISTS lgpd_terms_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_marketing_accepted boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at timestamptz;

-- 2. Dynamically grant UPDATE on all safe profile columns (excluding protected system fields)
DO $$
DECLARE
  cols text;
BEGIN
  SELECT string_agg(quote_ident(column_name), ', ')
  INTO cols
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'profiles'
    AND column_name NOT IN ('id', 'role', 'establishment_id', 'commission_rate', 'deleted_at', 'created_at');

  IF cols IS NOT NULL AND cols <> '' THEN
    EXECUTE format('GRANT UPDATE (%s) ON public.profiles TO authenticated', cols);
  END IF;
END $$;

COMMIT;
