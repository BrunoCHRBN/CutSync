-- Publicação necessária para os hooks postgres_changes do aplicativo.
-- Seguro para executar mais de uma vez no SQL Editor do Supabase.
DO $$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'appointments',
    'establishments',
    'profiles',
    'services',
    'professional_services',
    'profile_establishments'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime'
        AND schemaname = 'public'
        AND tablename = table_name
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', table_name);
    END IF;
  END LOOP;
END $$;

-- Garante payload completo em updates/deletes filtrados pelo cliente Realtime.
ALTER TABLE public.appointments REPLICA IDENTITY FULL;
ALTER TABLE public.establishments REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;
ALTER TABLE public.services REPLICA IDENTITY FULL;
ALTER TABLE public.professional_services REPLICA IDENTITY FULL;
ALTER TABLE public.profile_establishments REPLICA IDENTITY FULL;