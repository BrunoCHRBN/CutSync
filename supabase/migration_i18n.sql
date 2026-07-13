-- Migration para adicionar internacionalização (Timezone e Moedas)
-- Execute este script no SQL Editor do Supabase se você já tiver executado o setup.sql inicial.

ALTER TABLE public.barbershops 
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/Sao_Paulo' NOT NULL;

ALTER TABLE public.barbershops 
ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'BRL' NOT NULL;
