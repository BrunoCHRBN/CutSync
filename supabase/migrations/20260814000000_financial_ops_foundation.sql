BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- P0 Etapa 1 — fundação transversal do ciclo financeiro-operacional.
-- Adiciona financial_ops_enabled por establishment, amplia capabilities
-- granulares no resolver canônico e expõe a flag no contexto Business.
-- Não cria tabelas de comanda, pagamento, caixa, comissão ou provedor.

-- ---------------------------------------------------------------------------
-- Feature flag
-- ---------------------------------------------------------------------------

ALTER TABLE public.establishments
  ADD COLUMN IF NOT EXISTS financial_ops_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.establishments.financial_ops_enabled IS
  'When false (default), establishment keeps current agenda-only flows. '
  'When true, future financial-ops routes may be used. '
  'Not writable by Business/Client apps; Control/internal admin RPC only.';

-- No secondary index on the boolean alone: no hot filter query yet justifies it.

-- Block authenticated non-superadmin writes to the flag. service_role (auth.uid
-- null) and Control superadmins may change it. Dedicated Control RPC is the
-- intended future mutation surface — never Business or Client.
CREATE OR REPLACE FUNCTION public.enforce_financial_ops_flag_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'UPDATE'
    AND NEW.financial_ops_enabled IS DISTINCT FROM OLD.financial_ops_enabled
  THEN
    IF (SELECT auth.uid()) IS NOT NULL AND NOT public.is_superadmin() THEN
      RAISE EXCEPTION 'financial_ops_flag_immutable'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_financial_ops_flag_write ON public.establishments;
CREATE TRIGGER enforce_financial_ops_flag_write
BEFORE UPDATE OF financial_ops_enabled ON public.establishments
FOR EACH ROW
EXECUTE FUNCTION public.enforce_financial_ops_flag_write();

REVOKE ALL ON FUNCTION public.enforce_financial_ops_flag_write()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Capabilities resolver
-- ---------------------------------------------------------------------------
-- Decision: capabilities = potential authority of the actor; financial_ops_enabled
-- = product availability on the unit. Flag OFF does not strip capabilities from
-- the context. Future UI/RPCs require both capability AND flag.

CREATE OR REPLACE FUNCTION public.resolve_business_operational_capabilities(
  target_establishment_id uuid,
  target_profile_id uuid,
  target_access_mode text
)
RETURNS text[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  identity_record record;
  team_agendas_shared boolean := false;
  capabilities text[] := ARRAY[]::text[];
BEGIN
  IF target_access_mode NOT IN ('full', 'read_only') THEN
    RETURN capabilities;
  END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id,
    target_profile_id
  )
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN capabilities;
  END IF;

  SELECT COALESCE(establishment.share_agendas, false)
  INTO team_agendas_shared
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  -- Base operational views
  capabilities := ARRAY[
    'view_own_agenda',
    'view_services',
    'view_own_commission'
  ];

  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'view_team_agenda',
      'view_unit_reports'
    ];
  ELSIF team_agendas_shared THEN
    capabilities := capabilities || ARRAY['view_team_agenda'];
  END IF;

  -- Financial-ops views (authority potential; gated by flag in future UI/RPCs)
  IF identity_record.operational_role = 'professional' THEN
    capabilities := capabilities || ARRAY[
      'view_orders',
      'view_payments'
    ];
  ELSIF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'view_orders',
      'view_payments',
      'view_cash',
      'view_team_commission',
      'view_reconciliation'
    ];
  END IF;

  IF target_access_mode = 'read_only' THEN
    RETURN capabilities;
  END IF;

  -- Existing full mutations
  capabilities := capabilities || ARRAY[
    'create_self_walk_in',
    'manage_own_blocks'
  ];

  IF identity_record.operational_role IN ('owner', 'admin') THEN
    capabilities := capabilities || ARRAY[
      'create_team_walk_in',
      'manage_team_blocks',
      'manage_services',
      'manage_team',
      'manage_operational_settings',
      'view_clients',
      'manage_clients',
      'export_clients',
      'manage_data_imports'
    ];
  END IF;

  IF identity_record.operational_role = 'owner' THEN
    capabilities := capabilities || ARRAY['manage_admins'];
  END IF;

  -- Financial-ops mutations
  IF identity_record.operational_role = 'professional' THEN
    capabilities := capabilities || ARRAY['manage_own_orders'];
  ELSIF identity_record.operational_role = 'admin' THEN
    capabilities := capabilities || ARRAY[
      'manage_own_orders',
      'manage_team_orders',
      'apply_order_discounts',
      'void_orders',
      'take_payments',
      'void_payments',
      'issue_refunds',
      'operate_cash',
      'close_cash',
      'manage_commission_policies',
      'close_commission_period',
      'record_commission_payout',
      'manage_reconciliation'
    ];
  ELSIF identity_record.operational_role = 'owner' THEN
    capabilities := capabilities || ARRAY[
      'manage_own_orders',
      'manage_team_orders',
      'apply_order_discounts',
      'void_orders',
      'take_payments',
      'void_payments',
      'issue_refunds',
      'operate_cash',
      'close_cash',
      'reopen_cash',
      'manage_commission_policies',
      'close_commission_period',
      'record_commission_payout',
      'manage_reconciliation'
    ];
  END IF;

  RETURN capabilities;
END;
$$;

-- ---------------------------------------------------------------------------
-- Operational context
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS public.get_my_business_operational_contexts();

CREATE OR REPLACE FUNCTION public.get_my_business_operational_contexts()
RETURNS TABLE (
  membership_id uuid,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  timezone text,
  membership_role text,
  membership_status text,
  operational_role text,
  access_mode text,
  capabilities text[],
  billing_owner boolean,
  billing_status text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  current_period_ends_at timestamptz,
  billing_scope text,
  billing_account_id uuid,
  subscription_id uuid,
  organization_id uuid,
  covered_establishment_ids uuid[],
  payer_role text,
  pending_change_at timestamptz,
  financial_ops_enabled boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  RETURN QUERY
  SELECT
    membership.id,
    establishment.id,
    establishment.name,
    establishment.slug,
    establishment.timezone,
    membership.role,
    membership.status,
    identity.operational_role,
    COALESCE(billing.access_mode, 'blocked'),
    public.resolve_business_operational_capabilities(
      establishment.id,
      actor_id,
      COALESCE(billing.access_mode, 'blocked')
    ),
    COALESCE(billing.billing_owner_profile_id = actor_id, false),
    COALESCE(billing.billing_status, 'unconfigured'),
    billing.trial_ends_at,
    billing.grace_ends_at,
    billing.current_period_ends_at,
    billing.billing_scope,
    billing.billing_account_id,
    billing.subscription_id,
    COALESCE(identity.organization_id, billing.organization_id),
    COALESCE(billing.covered_establishment_ids, ARRAY[]::uuid[]),
    CASE
      WHEN billing.billing_scope = 'organization' THEN (
        SELECT CASE
          WHEN organization_member.role IN ('owner', 'finance')
            THEN organization_member.role
          ELSE NULL
        END
        FROM public.organization_members AS organization_member
        WHERE organization_member.organization_id = billing.organization_id
          AND organization_member.profile_id = actor_id
          AND organization_member.status = 'active'
          AND organization_member.revoked_at IS NULL
        LIMIT 1
      )
      WHEN billing.billing_owner_profile_id = actor_id THEN 'billing_owner'
      ELSE NULL
    END,
    billing.pending_change_at,
    establishment.financial_ops_enabled
  FROM public.memberships AS membership
  JOIN public.establishments AS establishment
    ON establishment.id = membership.establishment_id
  JOIN LATERAL public.resolve_business_operational_identity(
    establishment.id,
    actor_id
  ) AS identity ON true
  LEFT JOIN LATERAL (
    SELECT resolved.*
    FROM public.resolve_business_billing_context(establishment.id) AS resolved
    LIMIT 1
  ) AS billing ON true
  WHERE membership.profile_id = actor_id
    AND membership.status = 'active'
    AND membership.revoked_at IS NULL
  ORDER BY establishment.name, establishment.id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_business_operational_contexts()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_business_operational_contexts()
  TO authenticated, service_role;

COMMIT;
