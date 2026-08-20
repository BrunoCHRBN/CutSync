BEGIN;

-- Homolog retained the legacy admin/professional operational projection even
-- though the role-template migration version was already recorded. Restore the
-- canonical projection without rewriting applied migration history.
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
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
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
    CASE
      WHEN identity.operational_role = 'owner' THEN 'owner'
      ELSE membership.role_template
    END,
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

COMMENT ON FUNCTION public.get_my_business_operational_contexts() IS
  'Returns backend capabilities and the complete operational role template. membership_role remains the temporary admin/professional projection.';

NOTIFY pgrst, 'reload schema';

COMMIT;
