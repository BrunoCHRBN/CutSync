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

-- Atualização da RPC push_changes para corrigir a tipagem dos deleted loops
CREATE OR REPLACE FUNCTION public.push_changes(changes jsonb)
RETURNS void AS $$
DECLARE
    user_id uuid;
    user_role text;
    user_barbershop_id uuid;
    
    -- Chaves das tabelas nas alterações
    item RECORD;
    deleted_id text;
BEGIN
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    SELECT role, barbershop_id INTO user_role, user_barbershop_id 
    FROM public.profiles 
    WHERE id = user_id;

    -- ----------------------------------------------------
    -- PROCESSAR TABELA: SERVICES
    -- ----------------------------------------------------
    -- Insert / Update
    IF changes->'services' IS NOT NULL THEN
        -- Criados
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'created') AS x(id text, barbershop_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, created_at bigint, updated_at bigint) LOOP
            -- Validar multi-tenant (apenas admins/barbeiros criam serviços para sua própria barbearia)
            IF user_role NOT IN ('admin', 'barber') OR user_barbershop_id != item.barbershop_id THEN
                RAISE EXCEPTION 'Sem permissão para criar serviço nesta barbearia';
            END IF;
            
            INSERT INTO public.services (id, barbershop_id, name, price, duration_minutes, is_active, created_at, updated_at)
            VALUES (item.id, item.barbershop_id, item.name, item.price, item.duration_minutes, COALESCE(item.is_active, true), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        -- Atualizados
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'updated') AS x(id text, barbershop_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, updated_at bigint) LOOP
            IF user_role NOT IN ('admin', 'barber') OR user_barbershop_id != item.barbershop_id THEN
                RAISE EXCEPTION 'Sem permissão para atualizar serviço nesta barbearia';
            END IF;

            UPDATE public.services 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        -- Deletados (Soft Delete)
        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'services'->'deleted') AS id LOOP
            UPDATE public.services 
            SET deleted_at = now(), updated_at = now()
            WHERE id = deleted_id 
            AND (user_role IN ('admin', 'barber') AND barbershop_id = user_barbershop_id);
        END LOOP;
    END IF;

    -- ----------------------------------------------------
    -- PROCESSAR TABELA: APPOINTMENTS
    -- ----------------------------------------------------
    IF changes->'appointments' IS NOT NULL THEN
        -- Criados
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'created') AS x(id text, barbershop_id uuid, client_id uuid, client_name text, barber_id uuid, service_id text, date_time bigint, status text, created_at bigint, updated_at bigint) LOOP
            -- Validação de tenant
            IF (user_role = 'client' AND user_id != item.client_id) OR (user_role IN ('admin', 'barber') AND user_barbershop_id != item.barbershop_id) THEN
                RAISE EXCEPTION 'Sem permissão para criar este agendamento';
            END IF;

            INSERT INTO public.appointments (id, barbershop_id, client_id, client_name, barber_id, service_id, date_time, status, created_at, updated_at)
            VALUES (item.id, item.barbershop_id, item.client_id, item.client_name, item.barber_id, item.service_id, to_timestamp(item.date_time/1000.0), COALESCE(item.status, 'pending'), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET status = item.status, client_name = item.client_name, date_time = to_timestamp(item.date_time/1000.0), updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        -- Atualizados
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'updated') AS x(id text, barbershop_id uuid, client_id uuid, client_name text, barber_id uuid, service_id text, date_time bigint, status text, updated_at bigint) LOOP
            -- Validação
            IF (user_role = 'client' AND user_id != item.client_id) OR (user_role IN ('admin', 'barber') AND user_barbershop_id != item.barbershop_id) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este agendamento';
            END IF;

            UPDATE public.appointments 
            SET status = item.status, client_name = item.client_name, date_time = to_timestamp(item.date_time/1000.0), updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        -- Deletados (Soft Delete)
        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'appointments'->'deleted') AS id LOOP
            UPDATE public.appointments 
            SET deleted_at = now(), updated_at = now()
            WHERE id = deleted_id 
            AND (client_id = user_id OR (user_role IN ('admin', 'barber') AND barbershop_id = user_barbershop_id));
        END LOOP;
    END IF;

    -- ----------------------------------------------------
    -- PROCESSAR TABELA: PROFILES
    -- ----------------------------------------------------
    IF changes->'profiles' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'profiles'->'updated') AS x(id uuid, barbershop_id uuid, name text, phone text, avatar_url text, commission_rate numeric, updated_at bigint) LOOP
            -- Permissão: O próprio usuário pode atualizar seu perfil OU o admin da mesma barbearia
            IF user_id != item.id AND NOT (user_role = 'admin' AND user_barbershop_id = (SELECT barbershop_id FROM public.profiles WHERE id = item.id)) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este perfil';
            END IF;

            UPDATE public.profiles 
            SET name = COALESCE(item.name, name), 
                phone = COALESCE(item.phone, phone), 
                avatar_url = COALESCE(item.avatar_url, avatar_url),
                barbershop_id = item.barbershop_id,
                commission_rate = COALESCE(item.commission_rate, commission_rate),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Adição de colunas de informações na tabela barbershops
ALTER TABLE public.barbershops 
ADD COLUMN IF NOT EXISTS description TEXT,
ADD COLUMN IF NOT EXISTS address TEXT,
ADD COLUMN IF NOT EXISTS phone TEXT,
ADD COLUMN IF NOT EXISTS opening_hours TEXT,
ADD COLUMN IF NOT EXISTS share_agendas BOOLEAN DEFAULT TRUE;

-- Criar a tabela de junção barber_services
CREATE TABLE IF NOT EXISTS public.barber_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE NOT NULL,
    barber_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (barber_id, service_id)
);

ALTER TABLE public.barber_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Barbeiros e Admins leem e gerenciam barber_services" ON public.barber_services
    FOR ALL TO authenticated
    USING (barbershop_id = (SELECT barbershop_id FROM public.profiles WHERE id = auth.uid()));

