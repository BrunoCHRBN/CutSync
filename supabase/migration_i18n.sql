-- Migration para adicionar internacionalização (Timezone e Moedas) e correções de segurança
-- Execute este script no SQL Editor do Supabase se você já tiver executado o setup.sql inicial.

ALTER TABLE public.barbershops 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo' NOT NULL;

ALTER TABLE public.barbershops 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL' NOT NULL;

-- Permitir inserção de novas barbearias (necessário para o fluxo de cadastro do inquilino)
DROP POLICY IF EXISTS "Inserção pública de barbearias" ON public.barbershops;
CREATE POLICY "Inserção pública de barbearias" ON public.barbershops
    FOR INSERT WITH CHECK (true);

-- Correção de compatibilidade com IDs de texto do WatermelonDB (UUID -> TEXT)
ALTER TABLE public.appointments DROP CONSTRAINT IF EXISTS appointments_service_id_fkey;

ALTER TABLE public.services ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE public.services ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.services ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.appointments ALTER COLUMN id TYPE TEXT USING id::text;
ALTER TABLE public.appointments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.appointments ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

ALTER TABLE public.appointments ALTER COLUMN service_id TYPE TEXT USING service_id::text;

ALTER TABLE public.appointments 
ADD CONSTRAINT appointments_service_id_fkey 
FOREIGN KEY (service_id) REFERENCES public.services(id) ON DELETE CASCADE;

