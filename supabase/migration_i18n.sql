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
