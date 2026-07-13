-- Funções de Sincronização RPC do Supabase para WatermelonDB
-- Execute este script no SQL Editor do Supabase após rodar o setup.sql.

-- =========================================================================
-- 1. PULL CHANGES (Busca mudanças do servidor para o dispositivo local)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.pull_changes(last_pulled_at bigint)
RETURNS jsonb AS $$
DECLARE
    last_pulled_timestamp timestamp with time zone;
    current_server_timestamp bigint;
    user_id uuid;
    user_role text;
    user_barbershop_id uuid;
    
    -- Variáveis para armazenar as mudanças
    barbershops_created jsonb := '[]'::jsonb;
    barbershops_updated jsonb := '[]'::jsonb;
    barbershops_deleted jsonb := '[]'::jsonb;

    profiles_created jsonb := '[]'::jsonb;
    profiles_updated jsonb := '[]'::jsonb;
    profiles_deleted jsonb := '[]'::jsonb;

    services_created jsonb := '[]'::jsonb;
    services_updated jsonb := '[]'::jsonb;
    services_deleted jsonb := '[]'::jsonb;

    appointments_created jsonb := '[]'::jsonb;
    appointments_updated jsonb := '[]'::jsonb;
    appointments_deleted jsonb := '[]'::jsonb;
BEGIN
    -- Obter o ID do usuário autenticado no Supabase
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    -- Obter dados do perfil do usuário logado
    SELECT role, barbershop_id INTO user_role, user_barbershop_id 
    FROM public.profiles 
    WHERE id = user_id;

    -- Converter last_pulled_at (timestamp Unix em milissegundos) para timestamptz
    -- Se for 0 ou nulo, considera uma data muito antiga para trazer tudo
    IF last_pulled_at IS NULL OR last_pulled_at = 0 THEN
        last_pulled_timestamp := to_timestamp(0);
    ELSE
        last_pulled_timestamp := to_timestamp(last_pulled_at / 1000.0);
    END IF;

    -- Capturar o timestamp atual do servidor em milissegundos (para retornar ao cliente usar no próximo sync)
    current_server_timestamp := extract(epoch from now()) * 1000;

    -- ----------------------------------------------------
    -- A. TABELA: BARBERSHOPS
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'barber') AND user_barbershop_id IS NOT NULL THEN
        -- Para barbeiros/admins, traz apenas a sua própria barbearia
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO barbershops_created FROM (
            SELECT id, name, slug, logo_url, primary_color, 
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.barbershops 
            WHERE id = user_barbershop_id AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO barbershops_updated FROM (
            SELECT id, name, slug, logo_url, primary_color, 
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.barbershops 
            WHERE id = user_barbershop_id AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    ELSE
        -- Para clientes, traz as barbearias disponíveis no sistema
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO barbershops_created FROM (
            SELECT id, name, slug, logo_url, primary_color, 
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.barbershops 
            WHERE created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO barbershops_updated FROM (
            SELECT id, name, slug, logo_url, primary_color, 
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.barbershops 
            WHERE created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- B. TABELA: PROFILES
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'barber') AND user_barbershop_id IS NOT NULL THEN
        -- Traz todos os perfis da barbearia
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_created FROM (
            SELECT id, barbershop_id, name, role, email, phone, avatar_url,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE barbershop_id = user_barbershop_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_updated FROM (
            SELECT id, barbershop_id, name, role, email, phone, avatar_url,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE barbershop_id = user_barbershop_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO profiles_deleted FROM (
            SELECT id FROM public.profiles 
            WHERE barbershop_id = user_barbershop_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        -- Clientes trazem apenas seu próprio perfil e perfis dos barbeiros
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_created FROM (
            SELECT id, barbershop_id, name, role, email, phone, avatar_url,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE (id = user_id OR role = 'barber') AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_updated FROM (
            SELECT id, barbershop_id, name, role, email, phone, avatar_url,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE (id = user_id OR role = 'barber') AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- C. TABELA: SERVICES
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'barber') AND user_barbershop_id IS NOT NULL THEN
        -- Traz apenas serviços da barbearia do barbeiro/admin
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_created FROM (
            SELECT id, barbershop_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE barbershop_id = user_barbershop_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_updated FROM (
            SELECT id, barbershop_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE barbershop_id = user_barbershop_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO services_deleted FROM (
            SELECT id FROM public.services 
            WHERE barbershop_id = user_barbershop_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        -- Clientes trazem todos os serviços ativos de todas as barbearias
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_created FROM (
            SELECT id, barbershop_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE is_active = true AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_updated FROM (
            SELECT id, barbershop_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE is_active = true AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- D. TABELA: APPOINTMENTS
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'barber') AND user_barbershop_id IS NOT NULL THEN
        -- Traz agendamentos da barbearia inteira
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_created FROM (
            SELECT id, barbershop_id, client_id, barber_id, service_id, status,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE barbershop_id = user_barbershop_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_updated FROM (
            SELECT id, barbershop_id, client_id, barber_id, service_id, status,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE barbershop_id = user_barbershop_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO appointments_deleted FROM (
            SELECT id FROM public.appointments 
            WHERE barbershop_id = user_barbershop_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        -- Clientes trazem apenas os SEUS agendamentos
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_created FROM (
            SELECT id, barbershop_id, client_id, barber_id, service_id, status,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE client_id = user_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_updated FROM (
            SELECT id, barbershop_id, client_id, barber_id, service_id, status,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE client_id = user_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO appointments_deleted FROM (
            SELECT id FROM public.appointments 
            WHERE client_id = user_id AND deleted_at > last_pulled_timestamp
        ) x;
    END IF;

    -- Retornar as mudanças formatadas para o WatermelonDB
    RETURN jsonb_build_object(
        'changes', jsonb_build_object(
            'barbershops', jsonb_build_object('created', barbershops_created, 'updated', barbershops_updated, 'deleted', barbershops_deleted),
            'profiles', jsonb_build_object('created', profiles_created, 'updated', profiles_updated, 'deleted', profiles_deleted),
            'services', jsonb_build_object('created', services_created, 'updated', services_updated, 'deleted', services_deleted),
            'appointments', jsonb_build_object('created', appointments_created, 'updated', appointments_updated, 'deleted', appointments_deleted)
        ),
        'timestamp', current_server_timestamp
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- =========================================================================
-- 2. PUSH CHANGES (Envia mudanças locais do dispositivo para o servidor)
-- =========================================================================

CREATE OR REPLACE FUNCTION public.push_changes(changes jsonb)
RETURNS void AS $$
DECLARE
    user_id uuid;
    user_role text;
    user_barbershop_id uuid;
    
    -- Chaves das tabelas nas alterações
    item jsonb;
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
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'created') AS x(id uuid, barbershop_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, created_at bigint, updated_at bigint) LOOP
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
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'updated') AS x(id uuid, barbershop_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, updated_at bigint) LOOP
            IF user_role NOT IN ('admin', 'barber') OR user_barbershop_id != item.barbershop_id THEN
                RAISE EXCEPTION 'Sem permissão para atualizar serviço nesta barbearia';
            END IF;

            UPDATE public.services 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        -- Deletados (Soft Delete)
        FOR item IN SELECT * FROM jsonb_array_elements_text(changes->'services'->'deleted') AS id LOOP
            UPDATE public.services 
            SET deleted_at = now(), updated_at = now()
            WHERE id = item::uuid 
            AND (user_role IN ('admin', 'barber') AND barbershop_id = user_barbershop_id);
        END LOOP;
    END IF;

    -- ----------------------------------------------------
    -- PROCESSAR TABELA: APPOINTMENTS
    -- ----------------------------------------------------
    IF changes->'appointments' IS NOT NULL THEN
        -- Criados
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'created') AS x(id uuid, barbershop_id uuid, client_id uuid, barber_id uuid, service_id uuid, date_time bigint, status text, created_at bigint, updated_at bigint) LOOP
            -- Validação de tenant
            -- Clientes só podem agendar para si mesmos. Barbeiros/Admins podem agendar para qualquer cliente na barbearia dele.
            IF (user_role = 'client' AND user_id != item.client_id) OR (user_role IN ('admin', 'barber') AND user_barbershop_id != item.barbershop_id) THEN
                RAISE EXCEPTION 'Sem permissão para criar este agendamento';
            END IF;

            INSERT INTO public.appointments (id, barbershop_id, client_id, barber_id, service_id, date_time, status, created_at, updated_at)
            VALUES (item.id, item.barbershop_id, item.client_id, item.barber_id, item.service_id, to_timestamp(item.date_time/1000.0), COALESCE(item.status, 'pending'), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET status = item.status, date_time = to_timestamp(item.date_time/1000.0), updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        -- Atualizados
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'updated') AS x(id uuid, barbershop_id uuid, client_id uuid, barber_id uuid, service_id uuid, date_time bigint, status text, updated_at bigint) LOOP
            -- Validação
            IF (user_role = 'client' AND user_id != item.client_id) OR (user_role IN ('admin', 'barber') AND user_barbershop_id != item.barbershop_id) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este agendamento';
            END IF;

            UPDATE public.appointments 
            SET status = item.status, date_time = to_timestamp(item.date_time/1000.0), updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        -- Deletados (Soft Delete)
        FOR item IN SELECT * FROM jsonb_array_elements_text(changes->'appointments'->'deleted') AS id LOOP
            UPDATE public.appointments 
            SET deleted_at = now(), updated_at = now()
            WHERE id = item::uuid 
            AND (client_id = user_id OR (user_role IN ('admin', 'barber') AND barbershop_id = user_barbershop_id));
        END LOOP;
    END IF;

    -- ----------------------------------------------------
    -- PROCESSAR TABELA: PROFILES
    -- ----------------------------------------------------
    -- Apenas updates (criação é feita automática pelo trigger do Auth)
    IF changes->'profiles' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'profiles'->'updated') AS x(id uuid, name text, phone text, avatar_url text, updated_at bigint) LOOP
            -- Um usuário só atualiza seu próprio perfil
            IF user_id != item.id THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este perfil';
            END IF;

            UPDATE public.profiles 
            SET name = item.name, phone = item.phone, avatar_url = item.avatar_url, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
