BEGIN;

-- 1. Enum e Tabela de Usuários de Governança (RBAC)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'governance_role_enum') THEN
    CREATE TYPE public.governance_role_enum AS ENUM ('SaaS_Viewer', 'SaaS_Editor', 'SaaS_Owner');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.governance_users (
  profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  role public.governance_role_enum NOT NULL,
  granted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS em governance_users
ALTER TABLE public.governance_users ENABLE ROW LEVEL SECURITY;

-- Helper para verificar privilégios de governança
CREATE OR REPLACE FUNCTION public.is_governance_user(allowed_roles public.governance_role_enum[] DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.governance_users
    WHERE profile_id = (SELECT auth.uid())
      AND (allowed_roles IS NULL OR role = ANY(allowed_roles))
  );
$$;

-- Políticas de RLS para governance_users (Apenas SaaS_Owner gerencia a governança)
CREATE POLICY "SaaS_Owner manages governance users" ON public.governance_users
  FOR ALL TO authenticated
  USING (public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]))
  WITH CHECK (public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]));

CREATE POLICY "Governance users view themselves" ON public.governance_users
  FOR SELECT TO authenticated
  USING (profile_id = (SELECT auth.uid()) OR public.is_governance_user());

-- 2. Colunas de Status e Fricção na Tabela establishments
ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS document_number TEXT,
  ADD COLUMN IF NOT EXISTS document_type TEXT CHECK (document_type IN ('CPF', 'CNPJ')),
  ADD COLUMN IF NOT EXISTS verification_level INT DEFAULT 1 CHECK (verification_level BETWEEN 1 AND 3),
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'pending_verification' CHECK (account_status IN ('pending_verification', 'active', 'delinquent', 'blocked')),
  ADD COLUMN IF NOT EXISTS whatsapp_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS kyc_status TEXT DEFAULT 'unsubmitted' CHECK (kyc_status IN ('unsubmitted', 'pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS kyc_document_url TEXT;

-- 3. Colunas de Consentimento LGPD na Tabela profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS lgpd_terms_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_marketing_accepted BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS lgpd_accepted_at TIMESTAMPTZ;

-- 4. Tabela de Logs de Auditoria de Segurança Imutável (security_audit_logs)
CREATE TABLE IF NOT EXISTS public.security_audit_logs (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  target_id UUID NOT NULL,
  target_type TEXT NOT NULL,
  changes JSONB NOT NULL DEFAULT '{}'::jsonb,
  client_ip TEXT NOT NULL DEFAULT coalesce(current_setting('request.headers', true)::jsonb->>'x-forwarded-for', 'unknown'),
  created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS em security_audit_logs
ALTER TABLE public.security_audit_logs ENABLE ROW LEVEL SECURITY;

-- Triggers de Imutabilidade para security_audit_logs
CREATE OR REPLACE FUNCTION public.prevent_security_audit_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'security_audit_logs is read-only';
END;
$$;

DROP TRIGGER IF EXISTS security_audit_log_immutable ON public.security_audit_logs;
CREATE TRIGGER security_audit_log_immutable
  BEFORE UPDATE OR DELETE ON public.security_audit_logs
  FOR EACH ROW EXECUTE FUNCTION public.prevent_security_audit_mutation();

-- RLS para ler trilha de auditoria (Apenas membros da Governança lêem tudo)
CREATE POLICY "Governance users view audit log" ON public.security_audit_logs
  FOR SELECT TO authenticated
  USING (public.is_governance_user());

-- 5. Circuit Breaker de Inadimplência
CREATE OR REPLACE FUNCTION public.is_establishment_active(target_establishment_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.establishments
    WHERE id = target_establishment_id
      AND account_status IN ('active', 'pending_verification')
  );
$$;

-- Atualizar Políticas RLS de appointments para o Circuit Breaker
DROP POLICY IF EXISTS "Clientes gerenciam seus agendamentos" ON public.appointments;
CREATE POLICY "Clientes gerenciam seus agendamentos" ON public.appointments
  FOR ALL TO authenticated
  USING (client_id = auth.uid())
  WITH CHECK (
    client_id = auth.uid() 
    AND (SELECT account_status FROM public.establishments WHERE id = establishment_id) = 'active'
  );

DROP POLICY IF EXISTS "Members manage establishment appointments" ON public.appointments;
CREATE POLICY "Members manage establishment appointments" ON public.appointments
  FOR ALL TO authenticated
  USING (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin', 'professional']))
  WITH CHECK (
    (public.is_superadmin() OR public.has_active_membership(establishment_id, ARRAY['admin', 'professional']))
    AND public.is_establishment_active(establishment_id)
  );

-- 6. RPC para Anonimização LGPD (Direito de Exclusão)
CREATE OR REPLACE FUNCTION public.anonymize_user_profile(target_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  user_email TEXT;
BEGIN
  -- Apenas o próprio proprietário da conta ou um SaaS_Editor/SaaS_Owner pode solicitar
  IF (SELECT auth.uid()) <> target_user_id 
     AND NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[])
  THEN
     RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT email INTO user_email FROM public.profiles WHERE id = target_user_id;
  IF NOT FOUND THEN
     RAISE EXCEPTION 'user_not_found';
  END IF;

  -- Anonimizar tabela public.profiles
  UPDATE public.profiles
  SET name = 'Usuário Anonimizado',
      email = encode(extensions.digest(user_email || now()::text, 'sha256'), 'hex') || '@anon.cutsync.com.br',
      phone = NULL,
      avatar_url = NULL,
      instagram = NULL,
      titulo_profissional = NULL,
      deleted_at = now(),
      updated_at = now()
  WHERE id = target_user_id;

  -- Revogar memberships associados ao usuário
  UPDATE public.memberships
  SET status = 'revoked',
      revoked_at = now(),
      revocation_reason = 'Solicitação de Anonimização (LGPD)'
  WHERE profile_id = target_user_id AND status = 'active';

  -- Registrar o log de auditoria
  INSERT INTO public.security_audit_logs (actor_id, action, target_id, target_type, changes)
  VALUES (
    (SELECT auth.uid()),
    'profile.anonymized',
    target_user_id,
    'profile',
    jsonb_build_object('profile_id', target_user_id)
  );
END;
$$;

-- Conceder permissões para os novos recursos
GRANT SELECT ON public.governance_users, public.security_audit_logs TO authenticated;
GRANT ALL ON FUNCTION public.is_governance_user(public.governance_role_enum[]) TO authenticated;
GRANT ALL ON FUNCTION public.is_establishment_active(uuid) TO authenticated;
GRANT ALL ON FUNCTION public.anonymize_user_profile(uuid) TO authenticated;

COMMIT;
