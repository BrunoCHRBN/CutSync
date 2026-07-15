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
    user_establishment_id uuid;
    
    -- Variáveis para armazenar as mudanças
    establishments_created jsonb := '[]'::jsonb;
    establishments_updated jsonb := '[]'::jsonb;
    establishments_deleted jsonb := '[]'::jsonb;

    profiles_created jsonb := '[]'::jsonb;
    profiles_updated jsonb := '[]'::jsonb;
    profiles_deleted jsonb := '[]'::jsonb;

    services_created jsonb := '[]'::jsonb;
    services_updated jsonb := '[]'::jsonb;
    services_deleted jsonb := '[]'::jsonb;

    appointments_created jsonb := '[]'::jsonb;
    appointments_updated jsonb := '[]'::jsonb;
    appointments_deleted jsonb := '[]'::jsonb;

    professional_services_created jsonb := '[]'::jsonb;
    professional_services_updated jsonb := '[]'::jsonb;
    professional_services_deleted jsonb := '[]'::jsonb;

    profile_establishments_created jsonb := '[]'::jsonb;
    profile_establishments_updated jsonb := '[]'::jsonb;
    profile_establishments_deleted jsonb := '[]'::jsonb;
BEGIN
    -- Obter o ID do usuário autenticado no Supabase
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    -- Obter dados do perfil do usuário logado
    SELECT role, establishment_id INTO user_role, user_establishment_id 
    FROM public.profiles 
    WHERE id = user_id;

    -- Validar se a barbearia ativa selecionada pertence a este usuário
    IF user_establishment_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM public.profile_establishments 
            WHERE profile_id = user_id AND establishment_id = user_establishment_id
        ) THEN
            user_establishment_id := NULL;
        END IF;
    END IF;

    -- Converter last_pulled_at (timestamp Unix em milissegundos) para timestamptz
    IF last_pulled_at IS NULL OR last_pulled_at = 0 THEN
        last_pulled_timestamp := to_timestamp(0);
    ELSE
        last_pulled_timestamp := to_timestamp(last_pulled_at / 1000.0);
    END IF;

    -- Capturar o timestamp atual do servidor em milissegundos
    current_server_timestamp := extract(epoch from now()) * 1000;

    -- ----------------------------------------------------
    -- A. TABELA: establishments
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_created FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas, gallery_urls,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE id IN (
                SELECT establishment_id FROM public.profile_establishments WHERE profile_id = user_id
            ) AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_updated FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas, gallery_urls,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE id IN (
                SELECT establishment_id FROM public.profile_establishments WHERE profile_id = user_id
            ) AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_created FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas, gallery_urls,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO establishments_updated FROM (
            SELECT id, name, slug, logo_url, banner_url, slogan, instagram, primary_color, timezone, currency, description, address, phone, opening_hours, share_agendas, gallery_urls,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.establishments 
            WHERE created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- B. TABELA: PROFILES
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_created FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram, titulo_profissional,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
             FROM public.profiles 
            WHERE (establishment_id = user_establishment_id OR id IN (SELECT client_id FROM public.appointments WHERE establishment_id = user_establishment_id)) AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_updated FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram, titulo_profissional,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
             FROM public.profiles 
            WHERE (establishment_id = user_establishment_id OR id IN (SELECT client_id FROM public.appointments WHERE establishment_id = user_establishment_id)) AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO profiles_deleted FROM (
            SELECT id FROM public.profiles 
            WHERE (establishment_id = user_establishment_id OR id IN (SELECT client_id FROM public.appointments WHERE establishment_id = user_establishment_id)) AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_created FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram, titulo_profissional,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE (id = user_id OR role = 'professional') AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profiles_updated FROM (
            SELECT id, establishment_id, name, role, email, phone, avatar_url, commission_rate, push_token, work_hours, specialties, instagram, titulo_profissional,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.profiles 
            WHERE (id = user_id OR role = 'professional') AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- C. TABELA: SERVICES
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_created FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_updated FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO services_deleted FROM (
            SELECT id FROM public.services 
            WHERE establishment_id = user_establishment_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_created FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE is_active = true AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO services_updated FROM (
            SELECT id, establishment_id, name, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.services 
            WHERE is_active = true AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- D. TABELA: APPOINTMENTS
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_created FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_updated FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE establishment_id = user_establishment_id AND deleted_at IS NULL AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(id), '[]'::jsonb) INTO appointments_deleted FROM (
            SELECT id FROM public.appointments 
            WHERE establishment_id = user_establishment_id AND deleted_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_created FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.appointments 
            WHERE client_id = user_id AND deleted_at IS NULL AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO appointments_updated FROM (
            SELECT id, establishment_id, client_id, client_name, professional_id, service_id, status,
                   cancellation_reason, cancelled_by_role, reschedule_count,
                   extract(epoch from date_time)*1000 as date_time,
                   extract(epoch from original_date_time)*1000 as original_date_time,
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

    -- ----------------------------------------------------
    -- E. TABELA: professional_services
    -- ----------------------------------------------------
    IF user_role IN ('admin', 'professional') AND user_establishment_id IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_created FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE establishment_id = user_establishment_id AND created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_updated FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE establishment_id = user_establishment_id AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    ELSE
        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_created FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE created_at > last_pulled_timestamp
        ) x;

        SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO professional_services_updated FROM (
            SELECT id, establishment_id, professional_id, service_id, price, duration_minutes, is_active,
                   extract(epoch from created_at)*1000 as created_at, 
                   extract(epoch from updated_at)*1000 as updated_at
            FROM public.professional_services 
            WHERE created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
        ) x;
    END IF;

    -- ----------------------------------------------------
    -- F. TABELA: PROFILE_establishments
    -- ----------------------------------------------------
    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profile_establishments_created FROM (
        SELECT (profile_id::text || '_' || establishment_id::text) as id, profile_id, establishment_id, role,
               extract(epoch from created_at)*1000 as created_at, 
               extract(epoch from updated_at)*1000 as updated_at
        FROM public.profile_establishments 
        WHERE profile_id = user_id AND created_at > last_pulled_timestamp
    ) x;

    SELECT coalesce(jsonb_agg(x), '[]'::jsonb) INTO profile_establishments_updated FROM (
        SELECT (profile_id::text || '_' || establishment_id::text) as id, profile_id, establishment_id, role,
               extract(epoch from created_at)*1000 as created_at, 
               extract(epoch from updated_at)*1000 as updated_at
        FROM public.profile_establishments 
        WHERE profile_id = user_id AND created_at <= last_pulled_timestamp AND updated_at > last_pulled_timestamp
    ) x;

    -- Retornar as mudanças formatadas para o WatermelonDB
    RETURN jsonb_build_object(
        'changes', jsonb_build_object(
            'establishments', jsonb_build_object('created', establishments_created, 'updated', establishments_updated, 'deleted', establishments_deleted),
            'profiles', jsonb_build_object('created', profiles_created, 'updated', profiles_updated, 'deleted', profiles_deleted),
            'services', jsonb_build_object('created', services_created, 'updated', services_updated, 'deleted', services_deleted),
            'appointments', jsonb_build_object('created', appointments_created, 'updated', appointments_updated, 'deleted', appointments_deleted),
            'professional_services', jsonb_build_object('created', professional_services_created, 'updated', professional_services_updated, 'deleted', professional_services_deleted),
            'profile_establishments', jsonb_build_object('created', profile_establishments_created, 'updated', profile_establishments_updated, 'deleted', profile_establishments_deleted)
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
    user_establishment_id uuid;
    
    -- Chaves das tabelas nas alterações
    item RECORD;
    deleted_id text;
BEGIN
    user_id := auth.uid();
    IF user_id IS NULL THEN
        RAISE EXCEPTION 'Não autorizado';
    END IF;

    SELECT role, establishment_id INTO user_role, user_establishment_id 
    FROM public.profiles 
    WHERE id = user_id;

    -- PROCESSAR TABELA: establishments
    IF changes->'establishments' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'establishments'->'updated') AS x(id uuid, name text, slug text, logo_url text, banner_url text, slogan text, instagram text, primary_color text, timezone text, currency text, description text, address text, phone text, opening_hours text, share_agendas boolean, gallery_urls text, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.id AND role = 'admin'
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar dados desta barbearia';
            END IF;

            UPDATE public.establishments 
            SET name = COALESCE(item.name, name),
                slug = COALESCE(item.slug, slug),
                logo_url = COALESCE(item.logo_url, logo_url),
                banner_url = COALESCE(item.banner_url, banner_url),
                slogan = COALESCE(item.slogan, slogan),
                instagram = COALESCE(item.instagram, instagram),
                primary_color = COALESCE(item.primary_color, primary_color),
                timezone = COALESCE(item.timezone, timezone),
                currency = COALESCE(item.currency, currency),
                description = COALESCE(item.description, description),
                address = COALESCE(item.address, address),
                phone = COALESCE(item.phone, phone),
                opening_hours = COALESCE(item.opening_hours, opening_hours),
                share_agendas = COALESCE(item.share_agendas, share_agendas),
                gallery_urls = COALESCE(item.gallery_urls, gallery_urls),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: SERVICES
    IF changes->'services' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'created') AS x(id text, establishment_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, created_at bigint, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role IN ('admin', 'professional')
            ) THEN
                RAISE EXCEPTION 'Sem permissão para criar serviço nesta barbearia';
            END IF;
            
            INSERT INTO public.services (id, establishment_id, name, price, duration_minutes, is_active, created_at, updated_at)
            VALUES (item.id, item.establishment_id, item.name, item.price, item.duration_minutes, COALESCE(item.is_active, true), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'services'->'updated') AS x(id text, establishment_id uuid, name text, price numeric, duration_minutes integer, is_active boolean, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role IN ('admin', 'professional')
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar serviço nesta barbearia';
            END IF;

            UPDATE public.services 
            SET name = item.name, price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'services'->'deleted') AS id LOOP
            UPDATE public.services 
            SET deleted_at = now(), updated_at = now()
            WHERE id = deleted_id 
            AND EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = services.establishment_id AND role = 'admin'
            );
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: APPOINTMENTS
    IF changes->'appointments' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'created') AS x(id text, establishment_id uuid, client_id uuid, client_name text, professional_id uuid, service_id text, date_time bigint, status text, cancellation_reason text, cancelled_by_role text, reschedule_count integer, original_date_time bigint, created_at bigint, updated_at bigint) LOOP
            IF (user_role = 'client' AND user_id != item.client_id) OR (user_role IN ('admin', 'professional') AND NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role IN ('admin', 'professional')
            )) THEN
                RAISE EXCEPTION 'Sem permissão para criar este agendamento';
            END IF;

            INSERT INTO public.appointments (id, establishment_id, client_id, client_name, professional_id, service_id, date_time, status, cancellation_reason, cancelled_by_role, reschedule_count, original_date_time, created_at, updated_at)
            VALUES (item.id, item.establishment_id, item.client_id, item.client_name, item.professional_id, item.service_id, to_timestamp(item.date_time/1000.0), COALESCE(item.status, 'pending'), item.cancellation_reason, item.cancelled_by_role, COALESCE(item.reschedule_count, 0), to_timestamp(item.original_date_time/1000.0), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (id) DO UPDATE 
            SET status = item.status, 
                client_name = item.client_name, 
                date_time = to_timestamp(item.date_time/1000.0), 
                cancellation_reason = item.cancellation_reason, 
                cancelled_by_role = item.cancelled_by_role, 
                reschedule_count = COALESCE(item.reschedule_count, appointments.reschedule_count), 
                original_date_time = to_timestamp(item.original_date_time/1000.0), 
                updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'appointments'->'updated') AS x(id text, establishment_id uuid, client_id uuid, client_name text, professional_id uuid, service_id text, date_time bigint, status text, cancellation_reason text, cancelled_by_role text, reschedule_count integer, original_date_time bigint, updated_at bigint) LOOP
            IF (user_role = 'client' AND user_id != item.client_id) OR 
               (user_role = 'professional' AND (NOT EXISTS (
                   SELECT 1 FROM public.profile_establishments
                   WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'professional'
               ) OR user_id != item.professional_id)) OR
               (user_role = 'admin' AND NOT EXISTS (
                   SELECT 1 FROM public.profile_establishments
                   WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'admin'
               )) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este agendamento';
            END IF;

            UPDATE public.appointments 
            SET status = item.status, 
                client_name = item.client_name, 
                date_time = to_timestamp(item.date_time/1000.0), 
                cancellation_reason = item.cancellation_reason,
                cancelled_by_role = item.cancelled_by_role,
                reschedule_count = COALESCE(item.reschedule_count, reschedule_count),
                original_date_time = to_timestamp(item.original_date_time/1000.0),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'appointments'->'deleted') AS id LOOP
            UPDATE public.appointments 
            SET deleted_at = now(), updated_at = now()
            WHERE id = deleted_id 
            AND (
                client_id = user_id OR 
                (user_role = 'professional' AND professional_id = user_id) OR
                (user_role = 'admin' AND EXISTS (
                    SELECT 1 FROM public.profile_establishments
                    WHERE profile_id = user_id AND establishment_id = appointments.establishment_id AND role = 'admin'
                ))
            );
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: professional_services
    IF changes->'professional_services' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'professional_services'->'created') AS x(id uuid, establishment_id uuid, professional_id uuid, service_id text, price numeric, duration_minutes integer, is_active boolean, created_at bigint, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'admin'
            ) THEN
                RAISE EXCEPTION 'Sem permissão para configurar preços diferenciados nesta barbearia';
            END IF;

            INSERT INTO public.professional_services (id, establishment_id, professional_id, service_id, price, duration_minutes, is_active, created_at, updated_at)
            VALUES (item.id, item.establishment_id, item.professional_id, item.service_id, item.price, item.duration_minutes, COALESCE(item.is_active, true), to_timestamp(item.created_at/1000.0), to_timestamp(item.updated_at/1000.0))
            ON CONFLICT (professional_id, service_id) DO UPDATE 
            SET price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0);
        END LOOP;

        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'professional_services'->'updated') AS x(id uuid, establishment_id uuid, price numeric, duration_minutes integer, is_active boolean, updated_at bigint) LOOP
            IF NOT EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = item.establishment_id AND role = 'admin'
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar preços diferenciados nesta barbearia';
            END IF;

            UPDATE public.professional_services 
            SET price = item.price, duration_minutes = item.duration_minutes, is_active = item.is_active, updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;

        FOR deleted_id IN SELECT * FROM jsonb_array_elements_text(changes->'professional_services'->'deleted') AS id LOOP
            DELETE FROM public.professional_services 
            WHERE id = deleted_id::uuid 
            AND EXISTS (
                SELECT 1 FROM public.profile_establishments
                WHERE profile_id = user_id AND establishment_id = professional_services.establishment_id AND role = 'admin'
            );
        END LOOP;
    END IF;

    -- PROCESSAR TABELA: PROFILES
    IF changes->'profiles' IS NOT NULL THEN
        FOR item IN SELECT * FROM jsonb_to_recordset(changes->'profiles'->'updated') AS x(id uuid, establishment_id uuid, name text, phone text, avatar_url text, commission_rate numeric, push_token text, work_hours text, specialties text, instagram text, titulo_profissional text, updated_at bigint) LOOP
            IF user_id != item.id AND NOT EXISTS (
                SELECT 1 FROM public.profile_establishments admin_link
                WHERE admin_link.profile_id = user_id 
                AND admin_link.role = 'admin'
                AND (
                    admin_link.establishment_id = (SELECT establishment_id FROM public.profiles WHERE id = item.id)
                    OR (SELECT establishment_id FROM public.profiles WHERE id = item.id) IS NULL
                    OR admin_link.establishment_id = item.establishment_id
                )
            ) THEN
                RAISE EXCEPTION 'Sem permissão para atualizar este perfil';
            END IF;

            UPDATE public.profiles 
            SET name = COALESCE(item.name, name), 
                phone = COALESCE(item.phone, phone), 
                avatar_url = COALESCE(item.avatar_url, avatar_url),
                establishment_id = item.establishment_id,
                commission_rate = COALESCE(item.commission_rate, commission_rate),
                push_token = COALESCE(item.push_token, push_token),
                work_hours = COALESCE(item.work_hours, work_hours),
                specialties = COALESCE(item.specialties, specialties),
                instagram = COALESCE(item.instagram, instagram),
                titulo_profissional = COALESCE(item.titulo_profissional, titulo_profissional),
                updated_at = to_timestamp(item.updated_at/1000.0)
            WHERE id = item.id;
        END LOOP;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
