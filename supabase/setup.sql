-- Setup do Banco de Dados para o CutSync (Gestão de Barbearia SaaS)
-- Execute este script apenas para criar o schema base e, em seguida, aplique todas as migrations.
-- A migration 20260716050000_secure_memberships_and_invites.sql é obrigatória antes de liberar acesso.

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE SCHEMA IF NOT EXISTS extensions;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;
ALTER EXTENSION btree_gist SET SCHEMA extensions;
SET search_path = public, extensions;

-- ==========================================
-- 1. TABELAS PRINCIPAIS
-- ==========================================

-- Tabela de Barbearias (Tenants)
CREATE TABLE public.establishments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL UNIQUE,
    logo_url TEXT,
    banner_url TEXT,
    slogan TEXT,
    instagram TEXT,
    primary_color TEXT DEFAULT '#D4AF37',
    timezone TEXT DEFAULT 'America/Sao_Paulo' NOT NULL,
    currency TEXT DEFAULT 'BRL' NOT NULL,
    description TEXT,
    address TEXT,
    phone TEXT,
    opening_hours TEXT,
    share_agendas BOOLEAN DEFAULT true NOT NULL,
    gallery_urls TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Perfis de Usuários (Clientes, Barbeiros, Admins)
-- Nota: Habilita link com auth.users do Supabase
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    establishment_id UUID REFERENCES public.establishments(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'professional', 'admin')),
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    commission_rate NUMERIC DEFAULT 0.50 NOT NULL,
    push_token TEXT,
    work_hours TEXT,
    specialties TEXT,
    instagram TEXT,
    titulo_profissional TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de Vínculos N-N entre Perfis e Barbearias (Tenant Switcher)
CREATE TABLE public.profile_establishments (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('client', 'professional', 'admin')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (profile_id, establishment_id)
);

-- Tabela de Serviços
CREATE TABLE public.services (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
    name TEXT NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de Agendamentos
CREATE TABLE public.appointments (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    client_name TEXT,
    professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
    date_time TIMESTAMP WITH TIME ZONE NOT NULL,
    duration_minutes INTEGER DEFAULT 30 NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
    ends_at TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')) DEFAULT 'pending',
    cancellation_reason TEXT,
    cancelled_by_role TEXT CHECK (cancelled_by_role IN ('client', 'professional', 'admin')),
    reschedule_count INTEGER DEFAULT 0 NOT NULL,
    original_date_time TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT appointments_valid_time_range_check CHECK (ends_at > date_time),
    CONSTRAINT appointments_no_professional_overlap
        EXCLUDE USING gist (
            professional_id WITH =,
            tstzrange(date_time, ends_at, '[)') WITH &&
        )
        WHERE (status IN ('pending', 'confirmed') AND deleted_at IS NULL)
        DEFERRABLE INITIALLY IMMEDIATE
);

-- Tabela de Configurações de Serviços por Barbeiro (Preços e Tempos customizados)
CREATE TABLE public.professional_services (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    establishment_id UUID REFERENCES public.establishments(id) ON DELETE CASCADE NOT NULL,
    professional_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    duration_minutes INTEGER NOT NULL,
    is_active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE (professional_id, service_id)
);

-- ==========================================
-- 2. TRIGGER DE ATUALIZAÇÃO AUTOMÁTICA DO timestamp updated_at
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_establishments_updated_at BEFORE UPDATE ON public.establishments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_profile_establishments_updated_at BEFORE UPDATE ON public.profile_establishments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_professional_services_updated_at BEFORE UPDATE ON public.professional_services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- 3. CRIAÇÃO AUTOMÁTICA DE PERFIL NA CRIAÇÃO DE USUÁRIO AUTH
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, name, email, role, establishment_id, avatar_url, phone)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', 'Usuário'),
        new.email,
        'client',
        NULL,
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'phone'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 4. CONFIGURAÇÃO DE SEGURANÇA RLS (Row Level Security)
-- ==========================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.professional_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA: establishments
-- Qualquer pessoa (autenticada ou não) pode ler as barbearias (catálogo público)
CREATE POLICY "Leitura pública de barbearias" ON public.establishments
    FOR SELECT USING (true);

-- Apenas admins da respectiva barbearia podem atualizá-la
CREATE POLICY "Admins podem atualizar barbearia" ON public.establishments
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.establishment_id = establishments.id 
            AND profiles.role = 'admin'
        )
    );

-- POLÍTICAS PARA: profiles
-- Negação segura antes da migration de memberships: cada usuário lê apenas o próprio perfil.
CREATE POLICY "Usuário lê próprio perfil" ON public.profiles
    FOR SELECT TO authenticated USING (id = auth.uid());

-- Usuários podem atualizar o próprio perfil
CREATE POLICY "Usuário atualiza próprio perfil" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

REVOKE INSERT ON public.establishments FROM anon, authenticated;
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, phone, avatar_url, push_token, work_hours, specialties, instagram, titulo_profissional, notification_channels, pix_key, lgpd_terms_accepted, lgpd_marketing_accepted, lgpd_accepted_at, updated_at) ON public.profiles TO authenticated;

-- POLÍTICAS PARA: profile_establishments
-- Usuários podem ler seus próprios vínculos
CREATE POLICY "Usuários lêem seus próprios vínculos" ON public.profile_establishments
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

-- Apenas admins da barbearia podem gerenciar vínculos dela
CREATE POLICY "Admins gerenciam vínculos da sua barbearia" ON public.profile_establishments
    FOR ALL TO authenticated
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles 
            WHERE role = 'admin' AND establishment_id = profile_establishments.establishment_id
        )
    );

-- POLÍTICAS PARA: services
-- Qualquer pessoa pode ver os serviços cadastrados (catálogo público)
CREATE POLICY "Leitura pública de serviços" ON public.services
    FOR SELECT USING (deleted_at IS NULL);

-- Apenas admins/barbeiros vinculados podem criar/atualizar/deletar serviços
CREATE POLICY "Admins e Barbeiros gerenciam serviços da sua barbearia" ON public.services
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.establishment_id = services.establishment_id 
            AND profiles.role IN ('admin', 'professional')
        )
    );

-- POLÍTICAS PARA: appointments
-- Clientes podem gerenciar seus próprios agendamentos
CREATE POLICY "Clientes gerenciam seus agendamentos" ON public.appointments
    FOR ALL TO authenticated
    USING (client_id = auth.uid())
    WITH CHECK (client_id = auth.uid());

-- Barbeiros e admins podem gerenciar todos os agendamentos da sua barbearia
CREATE POLICY "Barbeiros e Admins gerenciam agendamentos da barbearia" ON public.appointments
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.establishment_id = appointments.establishment_id 
            AND profiles.role IN ('admin', 'professional')
        )
    );

-- POLÍTICAS PARA: professional_services
-- Qualquer autenticado pode ver as configurações de barbeiro
CREATE POLICY "Leitura pública de configurações de barbeiro" ON public.professional_services
    FOR SELECT TO authenticated USING (true);

-- Admins da barbearia podem gerenciar
CREATE POLICY "Admins gerenciam professional_services" ON public.professional_services
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.establishment_id = professional_services.establishment_id 
            AND profiles.role = 'admin'
        )
    );

-- ==========================================
-- 5. CRIAÇÃO DE ÍNDICES PARA PERFORMANCE DE SYNC E BUSCA
-- ==========================================
CREATE INDEX idx_profiles_establishment ON public.profiles(establishment_id);
CREATE INDEX idx_services_establishment ON public.services(establishment_id);
CREATE INDEX idx_appointments_establishment ON public.appointments(establishment_id);
CREATE INDEX idx_appointments_client ON public.appointments(client_id);
CREATE INDEX idx_appointments_professional ON public.appointments(professional_id);
CREATE INDEX idx_appointments_date ON public.appointments(date_time);
