-- Setup do Banco de Dados para o CutSync (Gestão de Barbearia SaaS)
-- Execute este script no SQL Editor do seu projeto Supabase.

-- Habilitar extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ==========================================
-- 1. TABELAS PRINCIPAIS
-- ==========================================

-- Tabela de Barbearias (Tenants)
CREATE TABLE public.barbershops (
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
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Perfis de Usuários (Clientes, Barbeiros, Admins)
-- Nota: Habilita link com auth.users do Supabase
CREATE TABLE public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('client', 'barber', 'admin')),
    email TEXT NOT NULL UNIQUE,
    phone TEXT,
    avatar_url TEXT,
    commission_rate NUMERIC DEFAULT 0.50 NOT NULL,
    push_token TEXT,
    work_hours TEXT,
    specialties TEXT,
    instagram TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de Vínculos N-N entre Perfis e Barbearias (Tenant Switcher)
CREATE TABLE public.profile_barbershops (
    profile_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE,
    role TEXT CHECK (role IN ('client', 'barber', 'admin')) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    PRIMARY KEY (profile_id, barbershop_id)
);

-- Tabela de Serviços
CREATE TABLE public.services (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE NOT NULL,
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
    barbershop_id UUID REFERENCES public.barbershops(id) ON DELETE CASCADE NOT NULL,
    client_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    client_name TEXT,
    barber_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
    service_id TEXT REFERENCES public.services(id) ON DELETE CASCADE NOT NULL,
    date_time TIMESTAMP WITH TIME ZONE NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'confirmed', 'cancelled', 'completed')) DEFAULT 'pending',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Tabela de Configurações de Serviços por Barbeiro (Preços e Tempos customizados)
CREATE TABLE public.barber_services (
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

CREATE TRIGGER update_barbershops_updated_at BEFORE UPDATE ON public.barbershops FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_profile_barbershops_updated_at BEFORE UPDATE ON public.profile_barbershops FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_services_updated_at BEFORE UPDATE ON public.services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_appointments_updated_at BEFORE UPDATE ON public.appointments FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
CREATE TRIGGER update_barber_services_updated_at BEFORE UPDATE ON public.barber_services FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- ==========================================
-- 3. CRIAÇÃO AUTOMÁTICA DE PERFIL NA CRIAÇÃO DE USUÁRIO AUTH
-- ==========================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    role_val TEXT;
    barbershop_id_val UUID;
BEGIN
    -- Determinar a role do metadata (passada no signUp) ou assume 'client'
    role_val := COALESCE(new.raw_user_meta_data->>'role', 'client');
    barbershop_id_val := (new.raw_user_meta_data->>'barbershop_id')::UUID;

    INSERT INTO public.profiles (id, name, email, role, barbershop_id, avatar_url, phone)
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'name', 'Usuário'),
        new.email,
        role_val,
        barbershop_id_val,
        new.raw_user_meta_data->>'avatar_url',
        new.raw_user_meta_data->>'phone'
    );

    IF barbershop_id_val IS NOT NULL THEN
        INSERT INTO public.profile_barbershops (profile_id, barbershop_id, role)
        VALUES (new.id, barbershop_id_val, role_val)
        ON CONFLICT DO NOTHING;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ==========================================
-- 4. CONFIGURAÇÃO DE SEGURANÇA RLS (Row Level Security)
-- ==========================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.barbershops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profile_barbershops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.barber_services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.services ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS PARA: barbershops
-- Qualquer pessoa (autenticada ou não) pode ler as barbearias (catálogo público)
CREATE POLICY "Leitura pública de barbearias" ON public.barbershops
    FOR SELECT USING (true);

-- Qualquer pessoa pode inserir uma barbearia (necessário para o fluxo de cadastro)
CREATE POLICY "Inserção pública de barbearias" ON public.barbershops
    FOR INSERT WITH CHECK (true);

-- Apenas admins da respectiva barbearia podem atualizá-la
CREATE POLICY "Admins podem atualizar barbearia" ON public.barbershops
    FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.barbershop_id = barbershops.id 
            AND profiles.role = 'admin'
        )
    );

-- POLÍTICAS PARA: profiles
-- Clientes e barbeiros podem ler perfis (para saber quem é quem)
CREATE POLICY "Qualquer autenticado lê perfis" ON public.profiles
    FOR SELECT TO authenticated USING (true);

-- Usuários podem atualizar o próprio perfil
CREATE POLICY "Usuário atualiza próprio perfil" ON public.profiles
    FOR UPDATE TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

-- POLÍTICAS PARA: profile_barbershops
-- Usuários podem ler seus próprios vínculos
CREATE POLICY "Usuários lêem seus próprios vínculos" ON public.profile_barbershops
    FOR SELECT TO authenticated
    USING (profile_id = auth.uid());

-- Apenas admins da barbearia podem gerenciar vínculos dela
CREATE POLICY "Admins gerenciam vínculos da sua barbearia" ON public.profile_barbershops
    FOR ALL TO authenticated
    USING (
        auth.uid() IN (
            SELECT id FROM public.profiles 
            WHERE role = 'admin' AND barbershop_id = profile_barbershops.barbershop_id
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
            AND profiles.barbershop_id = services.barbershop_id 
            AND profiles.role IN ('admin', 'barber')
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
            AND profiles.barbershop_id = appointments.barbershop_id 
            AND profiles.role IN ('admin', 'barber')
        )
    );

-- POLÍTICAS PARA: barber_services
-- Qualquer autenticado pode ver as configurações de barbeiro
CREATE POLICY "Leitura pública de configurações de barbeiro" ON public.barber_services
    FOR SELECT TO authenticated USING (true);

-- Admins da barbearia podem gerenciar
CREATE POLICY "Admins gerenciam barber_services" ON public.barber_services
    FOR ALL TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles 
            WHERE profiles.id = auth.uid() 
            AND profiles.barbershop_id = barber_services.barbershop_id 
            AND profiles.role = 'admin'
        )
    );

-- ==========================================
-- 5. CRIAÇÃO DE ÍNDICES PARA PERFORMANCE DE SYNC E BUSCA
-- ==========================================
CREATE INDEX idx_profiles_barbershop ON public.profiles(barbershop_id);
CREATE INDEX idx_services_barbershop ON public.services(barbershop_id);
CREATE INDEX idx_appointments_barbershop ON public.appointments(barbershop_id);
CREATE INDEX idx_appointments_client ON public.appointments(client_id);
CREATE INDEX idx_appointments_barber ON public.appointments(barber_id);
CREATE INDEX idx_appointments_date ON public.appointments(date_time);
