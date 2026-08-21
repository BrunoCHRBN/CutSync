-- Control access profiles, delegated assignments and approval workflow.
-- Created manually because Supabase CLI 2.115.0 on Windows/OneDrive fails
-- migration new with LegacyMigrationNewWriteError when migrations/ exists.

BEGIN;

CREATE TABLE public.control_permission_catalog (
  permission text PRIMARY KEY
    CHECK (permission ~ '^control\.[a-z][a-z0-9_]*\.[a-z][a-z0-9_]*$'),
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  area text NOT NULL CHECK (area IN (
    'central', 'operation', 'support', 'governance', 'knowledge',
    'finance', 'commercial', 'access', 'audit', 'auth_recovery'
  )),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.control_job_titles (
  job_title_key text PRIMARY KEY
    CHECK (job_title_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text NOT NULL UNIQUE CHECK (char_length(btrim(label)) BETWEEN 3 AND 80),
  rank_order smallint NOT NULL CHECK (rank_order BETWEEN 1 AND 1000),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.control_access_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_key text NOT NULL UNIQUE
    CHECK (profile_key ~ '^[a-z][a-z0-9_]{2,79}$'),
  label text NOT NULL UNIQUE CHECK (char_length(btrim(label)) BETWEEN 3 AND 120),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 10 AND 500),
  assignment_mode text NOT NULL CHECK (assignment_mode IN ('role_compat', 'delegated')),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  required_approvals smallint NOT NULL DEFAULT 1 CHECK (required_approvals IN (1, 2)),
  requires_owner_approval boolean NOT NULL DEFAULT false,
  requires_expiry boolean NOT NULL DEFAULT false,
  review_interval_days smallint NOT NULL CHECK (review_interval_days BETWEEN 1 AND 365),
  is_system boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT control_access_profiles_critical_policy CHECK (
    assignment_mode <> 'delegated'
    OR risk_level <> 'critical'
    OR (required_approvals = 2 AND requires_owner_approval AND requires_expiry)
  ),
  CONSTRAINT control_access_profiles_role_compat_policy CHECK (
    assignment_mode <> 'role_compat'
    OR (is_system AND NOT requires_expiry)
  )
);

CREATE TABLE public.control_access_profile_permissions (
  access_profile_id uuid NOT NULL
    REFERENCES public.control_access_profiles(id) ON DELETE CASCADE,
  permission text NOT NULL
    REFERENCES public.control_permission_catalog(permission) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (access_profile_id, permission)
);

CREATE TABLE public.control_access_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_number bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
  client_request_id uuid NOT NULL UNIQUE,
  requested_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  target_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  source_access_profile_id uuid
    REFERENCES public.control_access_profiles(id) ON DELETE RESTRICT,
  requested_access_profile_id uuid NOT NULL
    REFERENCES public.control_access_profiles(id) ON DELETE RESTRICT,
  requested_action text NOT NULL CHECK (requested_action IN ('grant', 'revoke')),
  requested_valid_until timestamptz,
  justification text NOT NULL CHECK (char_length(btrim(justification)) BETWEEN 10 AND 500),
  ticket_reference text NOT NULL CHECK (char_length(btrim(ticket_reference)) BETWEEN 3 AND 100),
  risk_level text NOT NULL CHECK (risk_level IN ('low', 'moderate', 'high', 'critical')),
  required_approvals smallint NOT NULL CHECK (required_approvals IN (1, 2)),
  requires_owner_approval boolean NOT NULL,
  status text NOT NULL DEFAULT 'awaiting_approval' CHECK (status IN (
    'awaiting_approval', 'approved', 'rejected', 'applied',
    'expired', 'cancelled', 'failed'
  )),
  version integer NOT NULL DEFAULT 1 CHECK (version > 0),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  approved_at timestamptz,
  rejected_at timestamptz,
  applied_at timestamptz,
  applied_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  apply_request_id uuid UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT control_access_requests_expiry_check CHECK (expires_at > created_at),
  CONSTRAINT control_access_requests_target_expiry_check CHECK (
    requested_valid_until IS NULL OR requested_valid_until > created_at
  )
);

CREATE TABLE public.control_access_request_approvals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.control_access_requests(id) ON DELETE RESTRICT,
  approver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approve', 'reject')),
  reason text NOT NULL CHECK (char_length(btrim(reason)) BETWEEN 10 AND 500),
  approver_was_owner boolean NOT NULL,
  client_request_id uuid NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (request_id, approver_id)
);

CREATE TABLE public.control_user_access_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  access_profile_id uuid NOT NULL
    REFERENCES public.control_access_profiles(id) ON DELETE RESTRICT,
  source_type text NOT NULL CHECK (source_type IN ('role_compat', 'approved_request', 'migration')),
  source_request_id uuid REFERENCES public.control_access_requests(id) ON DELETE RESTRICT,
  source_key text NOT NULL CHECK (char_length(btrim(source_key)) BETWEEN 3 AND 120),
  scope_type text NOT NULL DEFAULT 'global' CHECK (scope_type IN ('global', 'module', 'organization', 'establishment')),
  scope_id uuid,
  valid_from timestamptz NOT NULL DEFAULT now(),
  valid_until timestamptz,
  granted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  active boolean NOT NULL DEFAULT true,
  revoked_at timestamptz,
  revoked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_profile_id, source_key),
  CONSTRAINT control_assignments_scope_check CHECK (
    (scope_type = 'global' AND scope_id IS NULL)
    OR (scope_type <> 'global' AND scope_id IS NOT NULL)
  ),
  CONSTRAINT control_assignments_expiry_check CHECK (
    valid_until IS NULL OR valid_until > valid_from
  ),
  CONSTRAINT control_assignments_revocation_check CHECK (
    (active AND revoked_at IS NULL)
    OR (NOT active AND revoked_at IS NOT NULL)
  ),
  CONSTRAINT control_assignments_request_source_check CHECK (
    (source_type = 'approved_request' AND source_request_id IS NOT NULL)
    OR (source_type <> 'approved_request' AND source_request_id IS NULL)
  )
);

CREATE UNIQUE INDEX control_assignments_one_active_profile_idx
  ON public.control_user_access_assignments(target_profile_id, access_profile_id)
  WHERE active AND revoked_at IS NULL;

CREATE INDEX control_assignments_effective_idx
  ON public.control_user_access_assignments(target_profile_id, active, valid_until);

CREATE INDEX control_access_requests_queue_idx
  ON public.control_access_requests(status, risk_level, created_at DESC);

CREATE INDEX control_access_requests_target_idx
  ON public.control_access_requests(target_profile_id, created_at DESC);

CREATE INDEX control_access_approvals_request_idx
  ON public.control_access_request_approvals(request_id, decision, created_at);

ALTER TABLE public.governance_users
  ADD COLUMN IF NOT EXISTS job_title_key text
    REFERENCES public.control_job_titles(job_title_key) ON DELETE SET NULL;

ALTER TABLE public.control_permission_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_job_titles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_access_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_access_profile_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_access_request_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.control_user_access_assignments ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE
  public.control_permission_catalog,
  public.control_job_titles,
  public.control_access_profiles,
  public.control_access_profile_permissions,
  public.control_access_requests,
  public.control_access_request_approvals,
  public.control_user_access_assignments
FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE
  public.control_permission_catalog,
  public.control_job_titles,
  public.control_access_profiles,
  public.control_access_profile_permissions,
  public.control_access_requests,
  public.control_access_request_approvals,
  public.control_user_access_assignments
TO service_role;

REVOKE ALL ON SEQUENCE public.control_access_requests_request_number_seq
FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.control_access_requests_request_number_seq
TO service_role;

INSERT INTO public.control_permission_catalog(permission, label, area, risk_level)
VALUES
  ('control.dashboard.read', 'Consultar a Central', 'central', 'low'),
  ('control.live.read', 'Consultar operação em tempo real', 'operation', 'moderate'),
  ('control.support.read', 'Consultar suporte', 'support', 'low'),
  ('control.support.manage', 'Gerenciar suporte', 'support', 'high'),
  ('control.governance.read', 'Consultar governança', 'governance', 'moderate'),
  ('control.governance.manage', 'Gerenciar governança', 'governance', 'high'),
  ('control.knowledge.read', 'Consultar conhecimento', 'knowledge', 'low'),
  ('control.knowledge.manage', 'Gerenciar conhecimento', 'knowledge', 'moderate'),
  ('control.billing.read', 'Consultar financeiro SaaS', 'finance', 'moderate'),
  ('control.billing.manage', 'Gerenciar financeiro SaaS', 'finance', 'high'),
  ('control.commercial.read', 'Consultar comercial', 'commercial', 'low'),
  ('control.commercial.manage', 'Gerenciar comercial', 'commercial', 'high'),
  ('control.access.manage', 'Gerenciar diretório de acessos', 'access', 'critical'),
  ('control.access.request', 'Solicitar acesso', 'access', 'low'),
  ('control.access.approve', 'Aprovar acesso', 'access', 'critical'),
  ('control.access.apply', 'Aplicar acesso aprovado', 'access', 'critical'),
  ('control.audit.read', 'Consultar auditoria', 'audit', 'high'),
  ('control.audit.export', 'Exportar auditoria', 'audit', 'critical'),
  ('control.auth_recovery.manage', 'Iniciar recuperação de autenticação', 'auth_recovery', 'high'),
  ('control.auth_recovery.approve', 'Aprovar recuperação de autenticação', 'auth_recovery', 'critical')
ON CONFLICT (permission) DO UPDATE
SET label = EXCLUDED.label,
    area = EXCLUDED.area,
    risk_level = EXCLUDED.risk_level,
    active = true,
    updated_at = now();

INSERT INTO public.control_job_titles(job_title_key, label, rank_order)
VALUES
  ('assistant', 'Assistente', 100),
  ('analyst', 'Analista', 200),
  ('supervisor', 'Supervisor', 300),
  ('manager', 'Gestor', 400),
  ('saas_owner', 'Owner SaaS', 500)
ON CONFLICT (job_title_key) DO UPDATE
SET label = EXCLUDED.label,
    rank_order = EXCLUDED.rank_order,
    active = true,
    updated_at = now();

INSERT INTO public.control_access_profiles(
  profile_key, label, description, assignment_mode, risk_level,
  required_approvals, requires_owner_approval, requires_expiry,
  review_interval_days, is_system
)
VALUES
  ('saas_viewer', 'SaaS Viewer', 'Compatibilidade de leitura para o papel global SaaS_Viewer.', 'role_compat', 'low', 1, false, false, 180, true),
  ('saas_editor', 'SaaS Editor', 'Compatibilidade operacional para o papel global SaaS_Editor.', 'role_compat', 'high', 1, false, false, 90, true),
  ('saas_owner', 'SaaS Owner', 'Compatibilidade administrativa para o papel global SaaS_Owner.', 'role_compat', 'critical', 2, true, false, 30, true),
  ('support_assistant', 'Assistente de Suporte', 'Consulta filas e chamados de suporte sem executar operações assistidas.', 'delegated', 'low', 1, false, false, 180, true),
  ('support_analyst', 'Analista de Suporte', 'Opera suporte e atendimentos dentro do escopo autorizado.', 'delegated', 'moderate', 1, false, false, 90, true),
  ('support_supervisor', 'Supervisor de Suporte', 'Supervisiona suporte e solicita recuperações de autenticação.', 'delegated', 'high', 1, false, true, 90, true),
  ('finance_analyst', 'Analista Financeiro', 'Consulta cobranças, assinaturas e conciliação do SaaS.', 'delegated', 'low', 1, false, false, 180, true),
  ('finance_manager', 'Gestor Financeiro', 'Gerencia operações financeiras e conciliação do SaaS.', 'delegated', 'high', 1, false, true, 90, true),
  ('commercial_analyst', 'Analista Comercial', 'Consulta os recursos comerciais quando o módulo estiver habilitado.', 'delegated', 'low', 1, false, false, 180, true),
  ('commercial_manager', 'Gestor Comercial', 'Gerencia os recursos comerciais quando o módulo estiver habilitado.', 'delegated', 'high', 1, false, true, 90, true),
  ('governance_analyst', 'Analista de Governança', 'Consulta governança, conhecimento e trilhas autorizadas.', 'delegated', 'moderate', 1, false, false, 90, true),
  ('governance_manager', 'Gestor de Governança', 'Gerencia governança, conhecimento e exportações auditadas.', 'delegated', 'high', 1, false, true, 90, true),
  ('knowledge_editor', 'Editor de Conhecimento', 'Consulta e mantém a base privada de conhecimento.', 'delegated', 'moderate', 1, false, false, 90, true),
  ('security_reviewer', 'Revisor de Segurança', 'Consulta governança e revisa trilhas de auditoria sensíveis.', 'delegated', 'high', 1, false, true, 90, true),
  ('access_administrator', 'Administrador de Acessos', 'Administra solicitações, aprovações e aplicação de acessos.', 'delegated', 'critical', 2, true, true, 30, true)
ON CONFLICT (profile_key) DO UPDATE
SET label = EXCLUDED.label,
    description = EXCLUDED.description,
    assignment_mode = EXCLUDED.assignment_mode,
    risk_level = EXCLUDED.risk_level,
    required_approvals = EXCLUDED.required_approvals,
    requires_owner_approval = EXCLUDED.requires_owner_approval,
    requires_expiry = EXCLUDED.requires_expiry,
    review_interval_days = EXCLUDED.review_interval_days,
    is_system = EXCLUDED.is_system,
    active = true,
    updated_at = now();

INSERT INTO public.control_access_profile_permissions(access_profile_id, permission)
SELECT access_profile.id, seed.permission
FROM (VALUES
  ('saas_viewer', 'control.dashboard.read'),
  ('saas_viewer', 'control.live.read'),
  ('saas_viewer', 'control.support.read'),
  ('saas_viewer', 'control.governance.read'),
  ('saas_viewer', 'control.knowledge.read'),
  ('saas_viewer', 'control.billing.read'),
  ('saas_viewer', 'control.access.request'),
  ('saas_editor', 'control.dashboard.read'),
  ('saas_editor', 'control.live.read'),
  ('saas_editor', 'control.support.read'),
  ('saas_editor', 'control.support.manage'),
  ('saas_editor', 'control.governance.read'),
  ('saas_editor', 'control.governance.manage'),
  ('saas_editor', 'control.knowledge.read'),
  ('saas_editor', 'control.knowledge.manage'),
  ('saas_editor', 'control.billing.read'),
  ('saas_editor', 'control.billing.manage'),
  ('saas_editor', 'control.access.request'),
  ('saas_owner', 'control.dashboard.read'),
  ('saas_owner', 'control.live.read'),
  ('saas_owner', 'control.support.read'),
  ('saas_owner', 'control.support.manage'),
  ('saas_owner', 'control.governance.read'),
  ('saas_owner', 'control.governance.manage'),
  ('saas_owner', 'control.knowledge.read'),
  ('saas_owner', 'control.knowledge.manage'),
  ('saas_owner', 'control.billing.read'),
  ('saas_owner', 'control.billing.manage'),
  ('saas_owner', 'control.access.manage'),
  ('saas_owner', 'control.access.request'),
  ('saas_owner', 'control.access.approve'),
  ('saas_owner', 'control.access.apply'),
  ('saas_owner', 'control.audit.read'),
  ('saas_owner', 'control.audit.export'),
  ('saas_owner', 'control.auth_recovery.manage'),
  ('saas_owner', 'control.auth_recovery.approve'),
  ('support_assistant', 'control.support.read'),
  ('support_assistant', 'control.access.request'),
  ('support_analyst', 'control.support.read'),
  ('support_analyst', 'control.support.manage'),
  ('support_analyst', 'control.access.request'),
  ('support_supervisor', 'control.support.read'),
  ('support_supervisor', 'control.support.manage'),
  ('support_supervisor', 'control.auth_recovery.manage'),
  ('support_supervisor', 'control.access.request'),
  ('finance_analyst', 'control.billing.read'),
  ('finance_analyst', 'control.access.request'),
  ('finance_manager', 'control.billing.read'),
  ('finance_manager', 'control.billing.manage'),
  ('finance_manager', 'control.access.request'),
  ('commercial_analyst', 'control.commercial.read'),
  ('commercial_analyst', 'control.access.request'),
  ('commercial_manager', 'control.commercial.read'),
  ('commercial_manager', 'control.commercial.manage'),
  ('commercial_manager', 'control.access.request'),
  ('governance_analyst', 'control.governance.read'),
  ('governance_analyst', 'control.knowledge.read'),
  ('governance_analyst', 'control.audit.read'),
  ('governance_analyst', 'control.access.request'),
  ('governance_manager', 'control.governance.read'),
  ('governance_manager', 'control.governance.manage'),
  ('governance_manager', 'control.knowledge.read'),
  ('governance_manager', 'control.knowledge.manage'),
  ('governance_manager', 'control.audit.read'),
  ('governance_manager', 'control.audit.export'),
  ('governance_manager', 'control.access.request'),
  ('knowledge_editor', 'control.knowledge.read'),
  ('knowledge_editor', 'control.knowledge.manage'),
  ('knowledge_editor', 'control.access.request'),
  ('security_reviewer', 'control.governance.read'),
  ('security_reviewer', 'control.audit.read'),
  ('security_reviewer', 'control.audit.export'),
  ('security_reviewer', 'control.auth_recovery.approve'),
  ('security_reviewer', 'control.access.request'),
  ('access_administrator', 'control.access.manage'),
  ('access_administrator', 'control.access.request'),
  ('access_administrator', 'control.access.approve'),
  ('access_administrator', 'control.access.apply'),
  ('access_administrator', 'control.audit.read')
) AS seed(profile_key, permission)
JOIN public.control_access_profiles AS access_profile
  ON access_profile.profile_key = seed.profile_key
ON CONFLICT (access_profile_id, permission) DO NOTHING;

CREATE OR REPLACE FUNCTION public.sync_control_role_compat_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  compat_profile_id uuid;
  compat_profile_key text;
  effective boolean;
BEGIN
  compat_profile_key := CASE NEW.role::text
    WHEN 'SaaS_Viewer' THEN 'saas_viewer'
    WHEN 'SaaS_Editor' THEN 'saas_editor'
    WHEN 'SaaS_Owner' THEN 'saas_owner'
  END;

  SELECT access_profile.id
  INTO compat_profile_id
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.profile_key = compat_profile_key
    AND access_profile.assignment_mode = 'role_compat'
    AND access_profile.active;

  IF compat_profile_id IS NULL THEN
    RAISE EXCEPTION 'control_role_profile_missing';
  END IF;

  effective := NEW.is_active
    AND NEW.revoked_at IS NULL
    AND (NEW.expires_at IS NULL OR NEW.expires_at > now());

  INSERT INTO public.control_user_access_assignments(
    target_profile_id, access_profile_id, source_type, source_key,
    valid_from, valid_until, granted_by, active, revoked_at, revoked_by
  )
  VALUES (
    NEW.profile_id, compat_profile_id, 'role_compat', 'role_compat',
    NEW.granted_at, NEW.expires_at, coalesce(NEW.granted_by, NEW.profile_id),
    effective, CASE WHEN effective THEN NULL ELSE coalesce(NEW.revoked_at, now()) END,
    CASE WHEN effective THEN NULL ELSE NEW.revoked_by END
  )
  ON CONFLICT (target_profile_id, source_key) DO UPDATE
  SET access_profile_id = EXCLUDED.access_profile_id,
      valid_from = EXCLUDED.valid_from,
      valid_until = EXCLUDED.valid_until,
      granted_by = EXCLUDED.granted_by,
      active = EXCLUDED.active,
      revoked_at = EXCLUDED.revoked_at,
      revoked_by = EXCLUDED.revoked_by,
      updated_at = now();

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.sync_control_role_compat_assignment()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS governance_users_sync_control_role_profile
ON public.governance_users;

CREATE TRIGGER governance_users_sync_control_role_profile
AFTER INSERT OR UPDATE OF role, is_active, expires_at, revoked_at, revoked_by
ON public.governance_users
FOR EACH ROW EXECUTE FUNCTION public.sync_control_role_compat_assignment();

INSERT INTO public.control_user_access_assignments(
  target_profile_id, access_profile_id, source_type, source_key,
  valid_from, valid_until, granted_by, active, revoked_at, revoked_by
)
SELECT
  governance.profile_id,
  access_profile.id,
  'role_compat',
  'role_compat',
  governance.granted_at,
  governance.expires_at,
  coalesce(governance.granted_by, governance.profile_id),
  governance.is_active
    AND governance.revoked_at IS NULL
    AND (governance.expires_at IS NULL OR governance.expires_at > now()),
  CASE
    WHEN governance.is_active
      AND governance.revoked_at IS NULL
      AND (governance.expires_at IS NULL OR governance.expires_at > now())
    THEN NULL
    ELSE coalesce(governance.revoked_at, now())
  END,
  governance.revoked_by
FROM public.governance_users AS governance
JOIN public.control_access_profiles AS access_profile
  ON access_profile.profile_key = CASE governance.role::text
    WHEN 'SaaS_Viewer' THEN 'saas_viewer'
    WHEN 'SaaS_Editor' THEN 'saas_editor'
    WHEN 'SaaS_Owner' THEN 'saas_owner'
  END
ON CONFLICT (target_profile_id, source_key) DO UPDATE
SET access_profile_id = EXCLUDED.access_profile_id,
    valid_from = EXCLUDED.valid_from,
    valid_until = EXCLUDED.valid_until,
    granted_by = EXCLUDED.granted_by,
    active = EXCLUDED.active,
    revoked_at = EXCLUDED.revoked_at,
    revoked_by = EXCLUDED.revoked_by,
    updated_at = now();

CREATE OR REPLACE FUNCTION public.get_control_context()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_role public.governance_role_enum;
  actor_name text;
  actor_email text;
  actor_permissions text[];
  actor_assignments jsonb;
  actor_permission_sources jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF coalesce((SELECT auth.jwt()->>'aal'), 'aal1') <> 'aal2' THEN
    RAISE EXCEPTION 'control_aal2_required';
  END IF;

  SELECT
    governance.role,
    coalesce(profile.name, 'Membro da Governança'),
    coalesce(profile.email, '')
  INTO actor_role, actor_name, actor_email
  FROM public.governance_users AS governance
  JOIN public.profiles AS profile ON profile.id = governance.profile_id
  WHERE governance.profile_id = actor_id
    AND governance.is_active
    AND governance.revoked_at IS NULL
    AND (governance.expires_at IS NULL OR governance.expires_at > now());

  IF actor_role IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT
    coalesce(array_agg(DISTINCT profile_permission.permission ORDER BY profile_permission.permission), ARRAY[]::text[])
  INTO actor_permissions
  FROM public.control_user_access_assignments AS assignment
  JOIN public.control_access_profiles AS access_profile
    ON access_profile.id = assignment.access_profile_id
   AND access_profile.active
  JOIN public.control_access_profile_permissions AS profile_permission
    ON profile_permission.access_profile_id = access_profile.id
  JOIN public.control_permission_catalog AS permission_catalog
    ON permission_catalog.permission = profile_permission.permission
   AND permission_catalog.active
  WHERE assignment.target_profile_id = actor_id
    AND assignment.active
    AND assignment.revoked_at IS NULL
    AND assignment.valid_from <= now()
    AND (assignment.valid_until IS NULL OR assignment.valid_until > now());

  IF cardinality(actor_permissions) = 0 THEN
    actor_permissions := ARRAY[
      'control.dashboard.read', 'control.live.read', 'control.support.read',
      'control.governance.read', 'control.knowledge.read', 'control.billing.read'
    ];
    IF actor_role IN ('SaaS_Editor', 'SaaS_Owner') THEN
      actor_permissions := actor_permissions || ARRAY[
        'control.support.manage', 'control.governance.manage',
        'control.knowledge.manage', 'control.billing.manage'
      ];
    END IF;
    IF actor_role = 'SaaS_Owner' THEN
      actor_permissions := actor_permissions || ARRAY['control.access.manage'];
    END IF;
  END IF;

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'assignment_id', assignment.id,
      'profile_key', access_profile.profile_key,
      'profile_label', access_profile.label,
      'source_type', assignment.source_type,
      'scope_type', assignment.scope_type,
      'scope_id', assignment.scope_id,
      'valid_until', assignment.valid_until
    ) ORDER BY access_profile.profile_key, assignment.id
  ), '[]'::jsonb)
  INTO actor_assignments
  FROM public.control_user_access_assignments AS assignment
  JOIN public.control_access_profiles AS access_profile
    ON access_profile.id = assignment.access_profile_id
   AND access_profile.active
  WHERE assignment.target_profile_id = actor_id
    AND assignment.active
    AND assignment.revoked_at IS NULL
    AND assignment.valid_from <= now()
    AND (assignment.valid_until IS NULL OR assignment.valid_until > now());

  SELECT coalesce(jsonb_agg(source_row.source ORDER BY source_row.permission, source_row.profile_key), '[]'::jsonb)
  INTO actor_permission_sources
  FROM (
    SELECT DISTINCT
      profile_permission.permission,
      access_profile.profile_key,
      jsonb_build_object(
        'permission', profile_permission.permission,
        'profile_key', access_profile.profile_key,
        'assignment_id', assignment.id
      ) AS source
    FROM public.control_user_access_assignments AS assignment
    JOIN public.control_access_profiles AS access_profile
      ON access_profile.id = assignment.access_profile_id
     AND access_profile.active
    JOIN public.control_access_profile_permissions AS profile_permission
      ON profile_permission.access_profile_id = access_profile.id
    JOIN public.control_permission_catalog AS permission_catalog
      ON permission_catalog.permission = profile_permission.permission
     AND permission_catalog.active
    WHERE assignment.target_profile_id = actor_id
      AND assignment.active
      AND assignment.revoked_at IS NULL
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
  ) AS source_row;

  RETURN jsonb_build_object(
    'profile_id', actor_id,
    'name', actor_name,
    'email', actor_email,
    'role', actor_role,
    'permissions', to_jsonb(actor_permissions),
    'assignments', actor_assignments,
    'permission_sources', actor_permission_sources,
    'context_version', 2,
    'assurance_level', 'aal2'
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.current_control_has_permission(target_permission text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  context_payload jsonb;
BEGIN
  IF target_permission IS NULL THEN
    RETURN false;
  END IF;
  context_payload := public.get_control_context();
  RETURN coalesce(context_payload->'permissions' ? target_permission, false);
END;
$$;

CREATE OR REPLACE FUNCTION public.list_control_access_profiles()
RETURNS TABLE (
  profile_id uuid,
  profile_key text,
  label text,
  description text,
  risk_level text,
  required_approvals smallint,
  requires_owner_approval boolean,
  requires_expiry boolean,
  review_interval_days smallint,
  permissions text[]
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.current_control_has_permission('control.access.request')
     AND NOT public.current_control_has_permission('control.access.manage')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    access_profile.id,
    access_profile.profile_key,
    access_profile.label,
    access_profile.description,
    access_profile.risk_level,
    access_profile.required_approvals,
    access_profile.requires_owner_approval,
    access_profile.requires_expiry,
    access_profile.review_interval_days,
    coalesce(array_agg(profile_permission.permission ORDER BY profile_permission.permission)
      FILTER (WHERE profile_permission.permission IS NOT NULL), ARRAY[]::text[])
  FROM public.control_access_profiles AS access_profile
  LEFT JOIN public.control_access_profile_permissions AS profile_permission
    ON profile_permission.access_profile_id = access_profile.id
  WHERE access_profile.assignment_mode = 'delegated'
    AND access_profile.active
  GROUP BY access_profile.id
  ORDER BY access_profile.risk_level, access_profile.label;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_control_access_request(
  target_profile_id uuid,
  target_requested_profile_key text,
  target_action text,
  target_source_profile_key text,
  target_valid_until timestamptz,
  target_justification text,
  target_ticket_reference text,
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  requested_target_id uuid := target_profile_id;
  requested_profile public.control_access_profiles%ROWTYPE;
  source_profile_id uuid;
  existing_request public.control_access_requests%ROWTYPE;
  created_request public.control_access_requests%ROWTYPE;
BEGIN
  IF NOT public.current_control_has_permission('control.access.request') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF actor_id IS NULL OR requested_target_id IS NULL OR target_client_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_access_request';
  END IF;
  IF target_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'invalid_access_action';
  END IF;
  IF char_length(btrim(coalesce(target_justification, ''))) NOT BETWEEN 10 AND 500 THEN
    RAISE EXCEPTION 'access_reason_required';
  END IF;
  IF char_length(btrim(coalesce(target_ticket_reference, ''))) NOT BETWEEN 3 AND 100 THEN
    RAISE EXCEPTION 'access_ticket_required';
  END IF;
  IF target_valid_until IS NOT NULL AND target_valid_until <= now() THEN
    RAISE EXCEPTION 'access_expiry_invalid';
  END IF;

  SELECT request.*
  INTO existing_request
  FROM public.control_access_requests AS request
  WHERE request.client_request_id = target_client_request_id;

  IF FOUND THEN
    IF existing_request.requested_by <> actor_id
       OR existing_request.target_profile_id <> requested_target_id
       OR existing_request.requested_action <> target_action
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', existing_request.id,
      'request_number', existing_request.request_number,
      'status', existing_request.status,
      'version', existing_request.version,
      'required_approvals', existing_request.required_approvals
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles AS profile
    WHERE profile.id = requested_target_id AND profile.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'profile_not_found';
  END IF;

  SELECT access_profile.*
  INTO requested_profile
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.profile_key = btrim(target_requested_profile_key)
    AND access_profile.assignment_mode = 'delegated'
    AND access_profile.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_profile_not_found';
  END IF;
  IF target_action = 'grant'
     AND requested_profile.requires_expiry
     AND target_valid_until IS NULL
  THEN
    RAISE EXCEPTION 'access_expiry_required';
  END IF;

  IF nullif(btrim(coalesce(target_source_profile_key, '')), '') IS NOT NULL THEN
    SELECT access_profile.id
    INTO source_profile_id
    FROM public.control_access_profiles AS access_profile
    WHERE access_profile.profile_key = btrim(target_source_profile_key)
      AND access_profile.active;

    IF source_profile_id IS NULL OR NOT EXISTS (
      SELECT 1
      FROM public.control_user_access_assignments AS assignment
      WHERE assignment.target_profile_id = requested_target_id
        AND assignment.access_profile_id = source_profile_id
        AND assignment.active
        AND assignment.revoked_at IS NULL
        AND assignment.valid_from <= now()
        AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
    ) THEN
      RAISE EXCEPTION 'source_access_profile_not_active';
    END IF;
  END IF;

  IF target_action = 'grant' AND EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    WHERE assignment.target_profile_id = requested_target_id
      AND assignment.access_profile_id = requested_profile.id
      AND assignment.active
      AND assignment.revoked_at IS NULL
      AND assignment.valid_from <= now()
      AND (assignment.valid_until IS NULL OR assignment.valid_until > now())
  ) THEN
    RAISE EXCEPTION 'control_assignment_already_active';
  END IF;

  IF target_action = 'revoke' AND NOT EXISTS (
    SELECT 1
    FROM public.control_user_access_assignments AS assignment
    WHERE assignment.target_profile_id = requested_target_id
      AND assignment.access_profile_id = requested_profile.id
      AND assignment.active
      AND assignment.revoked_at IS NULL
  ) THEN
    RAISE EXCEPTION 'control_assignment_not_active';
  END IF;

  INSERT INTO public.control_access_requests(
    client_request_id, requested_by, target_profile_id,
    source_access_profile_id, requested_access_profile_id,
    requested_action, requested_valid_until, justification, ticket_reference,
    risk_level, required_approvals, requires_owner_approval
  )
  VALUES (
    target_client_request_id, actor_id, requested_target_id,
    source_profile_id, requested_profile.id,
    target_action, target_valid_until, btrim(target_justification),
    btrim(target_ticket_reference), requested_profile.risk_level,
    requested_profile.required_approvals, requested_profile.requires_owner_approval
  )
  RETURNING * INTO created_request;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.requested',
    created_request.id,
    'control_access_request',
    jsonb_build_object(
      'target_profile_id', requested_target_id,
      'requested_profile_key', requested_profile.profile_key,
      'requested_action', target_action,
      'risk_level', requested_profile.risk_level,
      'ticket_reference', btrim(target_ticket_reference),
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'request_id', created_request.id,
    'request_number', created_request.request_number,
    'status', created_request.status,
    'version', created_request.version,
    'required_approvals', created_request.required_approvals
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.find_control_access_target_by_email(target_email text)
RETURNS TABLE (
  profile_id uuid,
  name text,
  email text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.current_control_has_permission('control.access.request')
     AND NOT public.current_control_has_permission('control.access.manage')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF nullif(btrim(coalesce(target_email, '')), '') IS NULL THEN
    RAISE EXCEPTION 'profile_email_required';
  END IF;

  RETURN QUERY
  SELECT
    profile.id,
    coalesce(profile.name, 'Usuário'),
    profile.email
  FROM public.profiles AS profile
  WHERE lower(profile.email) = lower(btrim(target_email))
    AND profile.deleted_at IS NULL
  ORDER BY profile.id
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.decide_control_access_request(
  target_request_id uuid,
  target_expected_version integer,
  target_decision text,
  target_reason text,
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  request_row public.control_access_requests%ROWTYPE;
  existing_decision public.control_access_request_approvals%ROWTYPE;
  actor_is_owner boolean;
  approval_count integer;
  owner_approval_count integer;
  next_status text;
BEGIN
  IF NOT public.current_control_has_permission('control.access.approve') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_decision NOT IN ('approve', 'reject')
     OR target_client_request_id IS NULL
     OR char_length(btrim(coalesce(target_reason, ''))) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'invalid_access_decision';
  END IF;

  SELECT request.*
  INTO request_row
  FROM public.control_access_requests AS request
  WHERE request.id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_request_not_found';
  END IF;

  SELECT approval.*
  INTO existing_decision
  FROM public.control_access_request_approvals AS approval
  WHERE approval.client_request_id = target_client_request_id;

  IF FOUND THEN
    IF existing_decision.request_id <> target_request_id
       OR existing_decision.approver_id <> actor_id
       OR existing_decision.decision <> target_decision
    THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', request_row.status,
      'version', request_row.version
    );
  END IF;

  IF request_row.requested_by = actor_id
     OR request_row.target_profile_id = actor_id
  THEN
    RAISE EXCEPTION 'approval_separation_required';
  END IF;
  IF request_row.status <> 'awaiting_approval' THEN
    RAISE EXCEPTION 'access_request_not_pending';
  END IF;
  IF request_row.version <> target_expected_version THEN
    RAISE EXCEPTION 'approval_version_conflict';
  END IF;
  IF request_row.expires_at <= now() THEN
    UPDATE public.control_access_requests
    SET status = 'expired', version = version + 1, updated_at = now()
    WHERE id = request_row.id;
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', 'expired',
      'version', request_row.version + 1
    );
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM public.governance_users AS governance
    WHERE governance.profile_id = actor_id
      AND governance.role = 'SaaS_Owner'
      AND governance.is_active
      AND governance.revoked_at IS NULL
      AND (governance.expires_at IS NULL OR governance.expires_at > now())
  ) INTO actor_is_owner;

  INSERT INTO public.control_access_request_approvals(
    request_id, approver_id, decision, reason,
    approver_was_owner, client_request_id
  )
  VALUES (
    request_row.id, actor_id, target_decision, btrim(target_reason),
    actor_is_owner, target_client_request_id
  );

  IF target_decision = 'reject' THEN
    next_status := 'rejected';
    UPDATE public.control_access_requests
    SET status = next_status,
        rejected_at = now(),
        version = version + 1,
        updated_at = now()
    WHERE id = request_row.id
    RETURNING * INTO request_row;
  ELSE
    SELECT
      count(*) FILTER (WHERE approval.decision = 'approve'),
      count(*) FILTER (WHERE approval.decision = 'approve' AND approval.approver_was_owner)
    INTO approval_count, owner_approval_count
    FROM public.control_access_request_approvals AS approval
    WHERE approval.request_id = request_row.id;

    next_status := CASE
      WHEN approval_count >= request_row.required_approvals
       AND (NOT request_row.requires_owner_approval OR owner_approval_count >= 1)
      THEN 'approved'
      ELSE 'awaiting_approval'
    END;

    UPDATE public.control_access_requests
    SET status = next_status,
        approved_at = CASE WHEN next_status = 'approved' THEN now() ELSE approved_at END,
        version = version + 1,
        updated_at = now()
    WHERE id = request_row.id
    RETURNING * INTO request_row;
  END IF;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.approval_' || target_decision,
    request_row.id,
    'control_access_request',
    jsonb_build_object(
      'status', request_row.status,
      'version', request_row.version,
      'approver_was_owner', actor_is_owner,
      'reason_provided', true
    )
  );

  RETURN jsonb_build_object(
    'request_id', request_row.id,
    'status', request_row.status,
    'version', request_row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.apply_control_access_request(
  target_request_id uuid,
  target_expected_version integer,
  target_client_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  request_row public.control_access_requests%ROWTYPE;
  requested_profile public.control_access_profiles%ROWTYPE;
  assignment_id uuid;
BEGIN
  IF NOT public.current_control_has_permission('control.access.apply') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_client_request_id IS NULL THEN
    RAISE EXCEPTION 'invalid_apply_request';
  END IF;

  SELECT request.*
  INTO request_row
  FROM public.control_access_requests AS request
  WHERE request.id = target_request_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_request_not_found';
  END IF;

  IF request_row.apply_request_id IS NOT NULL THEN
    IF request_row.apply_request_id <> target_client_request_id THEN
      RAISE EXCEPTION 'idempotency_conflict';
    END IF;
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', request_row.status,
      'version', request_row.version
    );
  END IF;

  IF request_row.status <> 'approved' THEN
    RAISE EXCEPTION 'access_request_not_approved';
  END IF;
  IF request_row.version <> target_expected_version THEN
    RAISE EXCEPTION 'approval_version_conflict';
  END IF;
  IF request_row.expires_at <= now() THEN
    UPDATE public.control_access_requests
    SET status = 'expired', version = version + 1, updated_at = now()
    WHERE id = request_row.id;
    RETURN jsonb_build_object(
      'request_id', request_row.id,
      'status', 'expired',
      'version', request_row.version + 1
    );
  END IF;

  SELECT access_profile.*
  INTO requested_profile
  FROM public.control_access_profiles AS access_profile
  WHERE access_profile.id = request_row.requested_access_profile_id
    AND access_profile.assignment_mode = 'delegated'
    AND access_profile.active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'access_profile_not_found';
  END IF;
  IF requested_profile.requires_expiry
     AND (request_row.requested_valid_until IS NULL
       OR request_row.requested_valid_until <= now())
  THEN
    RAISE EXCEPTION 'access_expiry_required';
  END IF;

  IF request_row.requested_action = 'grant' THEN
    IF EXISTS (
      SELECT 1
      FROM public.control_user_access_assignments AS assignment
      WHERE assignment.target_profile_id = request_row.target_profile_id
        AND assignment.access_profile_id = request_row.requested_access_profile_id
        AND assignment.active
        AND assignment.revoked_at IS NULL
    ) THEN
      RAISE EXCEPTION 'control_assignment_already_active';
    END IF;

    INSERT INTO public.control_user_access_assignments(
      target_profile_id, access_profile_id, source_type, source_request_id,
      source_key, valid_until, granted_by
    )
    VALUES (
      request_row.target_profile_id, request_row.requested_access_profile_id,
      'approved_request', request_row.id, 'request:' || request_row.id::text,
      request_row.requested_valid_until, actor_id
    )
    RETURNING id INTO assignment_id;
  ELSE
    UPDATE public.control_user_access_assignments
    SET active = false,
        revoked_at = now(),
        revoked_by = actor_id,
        updated_at = now()
    WHERE target_profile_id = request_row.target_profile_id
      AND access_profile_id = request_row.requested_access_profile_id
      AND source_type <> 'role_compat'
      AND active
      AND revoked_at IS NULL
    RETURNING id INTO assignment_id;

    IF assignment_id IS NULL THEN
      RAISE EXCEPTION 'control_assignment_not_active';
    END IF;
  END IF;

  UPDATE public.control_access_requests
  SET status = 'applied',
      applied_at = now(),
      applied_by = actor_id,
      apply_request_id = target_client_request_id,
      version = version + 1,
      updated_at = now()
  WHERE id = request_row.id
  RETURNING * INTO request_row;

  INSERT INTO public.security_audit_logs(actor_id, action, target_id, target_type, changes)
  VALUES (
    actor_id,
    'control.access.applied',
    request_row.id,
    'control_access_request',
    jsonb_build_object(
      'assignment_id', assignment_id,
      'target_profile_id', request_row.target_profile_id,
      'requested_profile_key', requested_profile.profile_key,
      'requested_action', request_row.requested_action,
      'version', request_row.version
    )
  );

  RETURN jsonb_build_object(
    'request_id', request_row.id,
    'assignment_id', assignment_id,
    'status', request_row.status,
    'version', request_row.version
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.list_control_access_requests(target_status text DEFAULT NULL)
RETURNS TABLE (
  request_id uuid,
  request_number bigint,
  target_profile_id uuid,
  target_name text,
  target_email text,
  requested_profile_key text,
  requested_profile_label text,
  requested_action text,
  risk_level text,
  status text,
  version integer,
  required_approvals smallint,
  requires_owner_approval boolean,
  approval_count bigint,
  requested_valid_until timestamptz,
  ticket_reference text,
  justification text,
  requested_by uuid,
  requested_by_name text,
  created_at timestamptz,
  expires_at timestamptz,
  approved_at timestamptz,
  applied_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  can_review boolean;
BEGIN
  IF target_status IS NOT NULL AND target_status NOT IN (
    'awaiting_approval', 'approved', 'rejected', 'applied',
    'expired', 'cancelled', 'failed'
  ) THEN
    RAISE EXCEPTION 'invalid_access_request_status';
  END IF;

  IF NOT public.current_control_has_permission('control.access.request')
     AND NOT public.current_control_has_permission('control.access.approve')
     AND NOT public.current_control_has_permission('control.access.apply')
     AND NOT public.current_control_has_permission('control.access.manage')
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  can_review := public.current_control_has_permission('control.access.approve')
    OR public.current_control_has_permission('control.access.apply')
    OR public.current_control_has_permission('control.access.manage');

  RETURN QUERY
  SELECT
    request.id,
    request.request_number,
    request.target_profile_id,
    coalesce(target.name, 'Usuário'),
    coalesce(target.email, ''),
    access_profile.profile_key,
    access_profile.label,
    request.requested_action,
    request.risk_level,
    request.status,
    request.version,
    request.required_approvals,
    request.requires_owner_approval,
    (SELECT count(*)
      FROM public.control_access_request_approvals AS approval
      WHERE approval.request_id = request.id AND approval.decision = 'approve'),
    request.requested_valid_until,
    request.ticket_reference,
    request.justification,
    request.requested_by,
    coalesce(requester.name, 'Usuário'),
    request.created_at,
    request.expires_at,
    request.approved_at,
    request.applied_at
  FROM public.control_access_requests AS request
  JOIN public.profiles AS target ON target.id = request.target_profile_id
  JOIN public.profiles AS requester ON requester.id = request.requested_by
  JOIN public.control_access_profiles AS access_profile
    ON access_profile.id = request.requested_access_profile_id
  WHERE (target_status IS NULL OR request.status = target_status)
    AND (can_review OR request.requested_by = actor_id OR request.target_profile_id = actor_id)
  ORDER BY request.created_at DESC, request.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_control_context() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.current_control_has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_access_profiles() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_control_access_request(
  uuid, text, text, text, timestamptz, text, text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.find_control_access_target_by_email(text)
FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.decide_control_access_request(
  uuid, integer, text, text, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.apply_control_access_request(
  uuid, integer, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_access_requests(text) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_control_context()
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.current_control_has_permission(text)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_control_access_profiles()
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_control_access_request(
  uuid, text, text, text, timestamptz, text, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.find_control_access_target_by_email(text)
TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.decide_control_access_request(
  uuid, integer, text, text, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.apply_control_access_request(
  uuid, integer, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.list_control_access_requests(text)
TO authenticated, service_role;

COMMENT ON TABLE public.control_job_titles IS
  'Organizational labels only. Job titles never grant authorization.';
COMMENT ON TABLE public.control_access_profiles IS
  'Reusable Control permission packages, separate from organizational job titles.';
COMMENT ON TABLE public.control_user_access_assignments IS
  'Effective profile assignments. Control admission still requires active governance_users and AAL2.';
COMMENT ON TABLE public.control_access_requests IS
  'Versioned internal access requests with separation of duties and idempotent application.';

COMMIT;
