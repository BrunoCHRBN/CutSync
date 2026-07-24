BEGIN;

-- Group billing is deliberately namespaced from the existing per-establishment
-- Stripe billing tables introduced by 20260725010000. This MVP keeps the manual
-- consolidated invoice ledger independent while the provider-backed migration
-- path is validated in homologation.

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 2 AND 120),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('owner', 'manager', 'finance')),
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz,
  UNIQUE (organization_id, profile_id)
);

CREATE TABLE public.organization_establishments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'removed')),
  effective_from date NOT NULL DEFAULT CURRENT_DATE,
  effective_until date,
  linked_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until >= effective_from)
);

CREATE UNIQUE INDEX organization_establishments_one_active_group_idx
  ON public.organization_establishments(establishment_id)
  WHERE status = 'active' AND effective_until IS NULL;
CREATE INDEX organization_members_profile_idx
  ON public.organization_members(profile_id, status);
CREATE INDEX organization_establishments_org_idx
  ON public.organization_establishments(organization_id, status);

CREATE TABLE public.organization_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  invited_email text NOT NULL,
  role text NOT NULL CHECK (role IN ('manager', 'finance')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz NOT NULL,
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  accepted_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX organization_invitations_pending_email_idx
  ON public.organization_invitations(organization_id, lower(invited_email))
  WHERE status = 'pending';

CREATE TABLE public.organization_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  action text NOT NULL,
  establishment_id uuid REFERENCES public.establishments(id) ON DELETE SET NULL,
  target_profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_audit_org_created_idx
  ON public.organization_audit_log(organization_id, created_at DESC);

CREATE TABLE public.organization_billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL UNIQUE REFERENCES public.organizations(id) ON DELETE RESTRICT,
  display_name text NOT NULL CHECK (char_length(btrim(display_name)) BETWEEN 2 AND 120),
  billing_email text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'closed')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE CHECK (code ~ '^[a-z0-9_]+$'),
  name text NOT NULL,
  base_price_cents integer CHECK (base_price_cents IS NULL OR base_price_cents >= 0),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency ~ '^[A-Z]{3}$'),
  is_network boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.plan_unit_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.organization_billing_plans(id) ON DELETE CASCADE,
  unit_from integer NOT NULL CHECK (unit_from > 0),
  unit_to integer CHECK (unit_to IS NULL OR unit_to >= unit_from),
  percentage_basis_points integer NOT NULL CHECK (percentage_basis_points BETWEEN 0 AND 10000),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_id, unit_from)
);

CREATE TABLE public.organization_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL UNIQUE REFERENCES public.organization_billing_accounts(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.organization_billing_plans(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'trialing'
    CHECK (status IN ('trialing', 'active', 'past_due', 'suspended', 'canceled')),
  enforcement_enabled boolean NOT NULL DEFAULT false,
  current_period_start date NOT NULL DEFAULT CURRENT_DATE,
  current_period_end date NOT NULL DEFAULT (CURRENT_DATE + 30),
  grace_ends_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (current_period_end >= current_period_start)
);

CREATE TABLE public.subscription_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.organization_subscriptions(id) ON DELETE CASCADE,
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE RESTRICT,
  effective_from date NOT NULL,
  effective_until date,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (effective_until IS NULL OR effective_until >= effective_from),
  UNIQUE (subscription_id, establishment_id, effective_from)
);

CREATE TABLE public.organization_billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.organization_subscriptions(id) ON DELETE RESTRICT,
  period_start date NOT NULL,
  period_end date NOT NULL,
  due_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('draft', 'open', 'paid', 'void', 'overdue')),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer NOT NULL CHECK (subtotal_cents >= 0),
  discount_cents integer NOT NULL CHECK (discount_cents >= 0),
  total_cents integer NOT NULL CHECK (total_cents >= 0),
  unit_snapshot jsonb NOT NULL,
  plan_snapshot jsonb NOT NULL,
  issued_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subscription_id, period_start, period_end)
);

CREATE TABLE public.organization_billing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  billing_account_id uuid NOT NULL REFERENCES public.organization_billing_accounts(id) ON DELETE RESTRICT,
  subscription_id uuid REFERENCES public.organization_subscriptions(id) ON DELETE SET NULL,
  invoice_id uuid REFERENCES public.organization_billing_invoices(id) ON DELETE SET NULL,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX organization_billing_events_account_created_idx
  ON public.organization_billing_events(billing_account_id, created_at DESC);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_establishments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plan_unit_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_billing_events ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_organization_role(
  target_organization_id uuid,
  allowed_roles text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_members member
    WHERE member.organization_id = target_organization_id
      AND member.profile_id = (SELECT auth.uid())
      AND member.status = 'active'
      AND member.revoked_at IS NULL
      AND (allowed_roles IS NULL OR member.role = ANY(allowed_roles))
  );
$$;

CREATE POLICY "Organization members view organizations" ON public.organizations
  FOR SELECT TO authenticated
  USING (public.has_organization_role(id) OR public.is_governance_user());
CREATE POLICY "Members view organization members" ON public.organization_members
  FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id) OR public.is_governance_user());
CREATE POLICY "Members view organization establishments" ON public.organization_establishments
  FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id) OR public.is_governance_user());
CREATE POLICY "Owners view organization invitations" ON public.organization_invitations
  FOR SELECT TO authenticated
  USING (
    public.has_organization_role(organization_id, ARRAY['owner'])
    OR lower(invited_email) = lower(COALESCE((SELECT email FROM public.profiles WHERE id = (SELECT auth.uid())), ''))
    OR public.is_governance_user()
  );
CREATE POLICY "Members view organization audit" ON public.organization_audit_log
  FOR SELECT TO authenticated
  USING (public.has_organization_role(organization_id) OR public.is_governance_user());
CREATE POLICY "Corporate finance views organization billing accounts" ON public.organization_billing_accounts
  FOR SELECT TO authenticated
  USING (
    public.has_organization_role(organization_id, ARRAY['owner', 'finance'])
    OR public.is_governance_user()
  );
CREATE POLICY "Active organization plans are readable" ON public.organization_billing_plans
  FOR SELECT TO authenticated USING (active OR public.is_governance_user());
CREATE POLICY "Active plan tiers are readable" ON public.plan_unit_tiers
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.organization_billing_plans plan WHERE plan.id = plan_id AND plan.active)
    OR public.is_governance_user()
  );
CREATE POLICY "Corporate finance views organization subscriptions" ON public.organization_subscriptions
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_billing_accounts account
      WHERE account.id = billing_account_id
        AND public.has_organization_role(account.organization_id, ARRAY['owner', 'finance'])
    )
    OR public.is_governance_user()
  );
CREATE POLICY "Corporate finance views subscription units" ON public.subscription_units
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_subscriptions subscription
      JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
      WHERE subscription.id = subscription_id
        AND public.has_organization_role(account.organization_id, ARRAY['owner', 'finance'])
    )
    OR public.is_governance_user()
  );
CREATE POLICY "Corporate finance views organization invoices" ON public.organization_billing_invoices
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.organization_subscriptions subscription
      JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
      WHERE subscription.id = subscription_id
        AND public.has_organization_role(account.organization_id, ARRAY['owner', 'finance'])
    )
    OR public.is_governance_user()
  );
CREATE POLICY "Governance views organization billing events" ON public.organization_billing_events
  FOR SELECT TO authenticated USING (public.is_governance_user());

REVOKE INSERT, UPDATE, DELETE ON
  public.organizations,
  public.organization_members,
  public.organization_establishments,
  public.organization_invitations,
  public.organization_audit_log,
  public.organization_billing_accounts,
  public.organization_billing_plans,
  public.plan_unit_tiers,
  public.organization_subscriptions,
  public.subscription_units,
  public.organization_billing_invoices,
  public.organization_billing_events
FROM authenticated;

CREATE OR REPLACE FUNCTION public.create_organization(
  initial_establishment_id uuid,
  organization_name text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  new_organization_id uuid;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(btrim(organization_name)) NOT BETWEEN 2 AND 120 THEN
    RAISE EXCEPTION 'invalid_organization_name';
  END IF;
  IF NOT public.has_active_membership(initial_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'admin_membership_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_establishments
    WHERE establishment_id = initial_establishment_id
      AND status = 'active' AND effective_until IS NULL
  ) THEN RAISE EXCEPTION 'establishment_already_grouped'; END IF;

  INSERT INTO public.organizations(name, created_by)
  VALUES (btrim(organization_name), actor_id)
  RETURNING id INTO new_organization_id;

  INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
  VALUES (new_organization_id, actor_id, 'owner', actor_id);
  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (new_organization_id, initial_establishment_id, actor_id);
  INSERT INTO public.organization_billing_accounts(organization_id, display_name, billing_email)
  SELECT new_organization_id, btrim(organization_name), profile.email
  FROM public.profiles profile WHERE profile.id = actor_id;
  INSERT INTO public.organization_audit_log(organization_id, actor_id, action, establishment_id)
  VALUES (new_organization_id, actor_id, 'organization.created', initial_establishment_id);

  RETURN new_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_organization_establishment(
  target_organization_id uuid,
  target_establishment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF NOT public.has_active_membership(target_establishment_id, ARRAY['admin']) THEN
    RAISE EXCEPTION 'admin_membership_required';
  END IF;

  INSERT INTO public.organization_establishments(
    organization_id, establishment_id, linked_by
  ) VALUES (target_organization_id, target_establishment_id, actor_id);
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id
  ) VALUES (target_organization_id, actor_id, 'organization.establishment_added', target_establishment_id);

  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT subscription.id, target_establishment_id, subscription.current_period_end + 1
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE account.organization_id = target_organization_id
    AND subscription.status <> 'canceled'
  ON CONFLICT (subscription_id, establishment_id, effective_from)
  DO UPDATE SET effective_until = NULL;
EXCEPTION
  WHEN unique_violation THEN RAISE EXCEPTION 'establishment_already_grouped';
END;
$$;

CREATE OR REPLACE FUNCTION public.remove_organization_establishment(
  target_organization_id uuid,
  target_establishment_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF (
    SELECT count(*) FROM public.organization_establishments
    WHERE organization_id = target_organization_id
      AND status = 'active' AND effective_until IS NULL
  ) <= 1 THEN RAISE EXCEPTION 'organization_requires_one_establishment'; END IF;

  UPDATE public.organization_establishments
  SET status = 'removed', effective_until = CURRENT_DATE, updated_at = now()
  WHERE organization_id = target_organization_id
    AND establishment_id = target_establishment_id
    AND status = 'active' AND effective_until IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_establishment_not_found'; END IF;

  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, establishment_id
  ) VALUES (target_organization_id, actor_id, 'organization.establishment_removed', target_establishment_id);

  UPDATE public.subscription_units unit
  SET effective_until = subscription.current_period_end
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_accounts account ON account.id = subscription.billing_account_id
  WHERE unit.subscription_id = subscription.id
    AND unit.establishment_id = target_establishment_id
    AND unit.effective_until IS NULL
    AND account.organization_id = target_organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.invite_organization_member(
  target_organization_id uuid,
  invited_email text,
  target_role text
)
RETURNS TABLE(invitation_id uuid, invitation_token text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  normalized_email text := lower(btrim(invited_email));
  raw_token text := encode(extensions.gen_random_bytes(32), 'hex');
  created_invitation public.organization_invitations%ROWTYPE;
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF normalized_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN RAISE EXCEPTION 'invalid_email'; END IF;
  IF target_role NOT IN ('manager', 'finance') THEN RAISE EXCEPTION 'invalid_organization_role'; END IF;

  UPDATE public.organization_invitations
  SET status = 'revoked'
  WHERE organization_id = target_organization_id
    AND lower(organization_invitations.invited_email) = normalized_email
    AND status = 'pending';

  INSERT INTO public.organization_invitations(
    organization_id, invited_email, role, token_hash, expires_at, created_by
  ) VALUES (
    target_organization_id, normalized_email, target_role,
    encode(extensions.digest(raw_token, 'sha256'), 'hex'),
    now() + interval '7 days', actor_id
  ) RETURNING * INTO created_invitation;

  INSERT INTO public.organization_audit_log(organization_id, actor_id, action, metadata)
  VALUES (target_organization_id, actor_id, 'organization.member_invited',
    jsonb_build_object('invitation_id', created_invitation.id, 'role', target_role));

  RETURN QUERY SELECT created_invitation.id, raw_token, created_invitation.expires_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_organization_invitation(invitation_token text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, extensions
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  actor_email text;
  invitation public.organization_invitations%ROWTYPE;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  SELECT lower(email) INTO actor_email FROM auth.users
  WHERE id = actor_id AND email_confirmed_at IS NOT NULL;
  IF actor_email IS NULL THEN RAISE EXCEPTION 'verified_email_required'; END IF;

  SELECT * INTO invitation FROM public.organization_invitations
  WHERE token_hash = encode(extensions.digest(invitation_token, 'sha256'), 'hex')
  FOR UPDATE;
  IF NOT FOUND OR invitation.status <> 'pending' THEN RAISE EXCEPTION 'invalid_or_used_invitation'; END IF;
  IF invitation.expires_at <= now() THEN
    UPDATE public.organization_invitations SET status = 'expired' WHERE id = invitation.id;
    RAISE EXCEPTION 'expired_invitation';
  END IF;
  IF lower(invitation.invited_email) <> actor_email THEN RAISE EXCEPTION 'invitation_email_mismatch'; END IF;

  INSERT INTO public.organization_members(organization_id, profile_id, role, created_by)
  VALUES (invitation.organization_id, actor_id, invitation.role, invitation.created_by)
  ON CONFLICT (organization_id, profile_id) DO UPDATE
  SET role = EXCLUDED.role, status = 'active', revoked_at = NULL, updated_at = now();
  UPDATE public.organization_invitations
  SET status = 'accepted', accepted_by = actor_id, accepted_at = now()
  WHERE id = invitation.id;
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, target_profile_id, metadata
  ) VALUES (
    invitation.organization_id, actor_id, 'organization.invitation_accepted',
    actor_id, jsonb_build_object('invitation_id', invitation.id)
  );
  RETURN invitation.organization_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_organization_member_role(
  target_organization_id uuid,
  target_profile_id uuid,
  target_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF target_role NOT IN ('manager', 'finance') THEN RAISE EXCEPTION 'invalid_organization_role'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id AND role = 'owner' AND status = 'active'
  ) THEN RAISE EXCEPTION 'owner_role_requires_transfer'; END IF;

  UPDATE public.organization_members
  SET role = target_role, updated_at = now()
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_member_not_found'; END IF;

  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, target_profile_id, metadata
  ) VALUES (
    target_organization_id, actor_id, 'organization.member_role_updated',
    target_profile_id, jsonb_build_object('role', target_role)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_organization_ownership(
  target_organization_id uuid,
  target_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF target_profile_id = actor_id THEN RETURN; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id AND status = 'active'
  ) THEN RAISE EXCEPTION 'organization_member_not_found'; END IF;

  UPDATE public.organization_members SET role = 'manager', updated_at = now()
  WHERE organization_id = target_organization_id AND profile_id = actor_id;
  UPDATE public.organization_members SET role = 'owner', updated_at = now()
  WHERE organization_id = target_organization_id AND profile_id = target_profile_id;
  INSERT INTO public.organization_audit_log(
    organization_id, actor_id, action, target_profile_id
  ) VALUES (target_organization_id, actor_id, 'organization.ownership_transferred', target_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.revoke_organization_member(
  target_organization_id uuid,
  target_profile_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE actor_id uuid := (SELECT auth.uid());
BEGIN
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner']) THEN
    RAISE EXCEPTION 'organization_owner_required';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = target_organization_id
      AND profile_id = target_profile_id AND role = 'owner' AND status = 'active'
  ) THEN RAISE EXCEPTION 'owner_cannot_be_revoked'; END IF;
  UPDATE public.organization_members
  SET status = 'revoked', revoked_at = now(), updated_at = now()
  WHERE organization_id = target_organization_id
    AND profile_id = target_profile_id AND status = 'active';
  IF NOT FOUND THEN RAISE EXCEPTION 'organization_member_not_found'; END IF;
  INSERT INTO public.organization_audit_log(organization_id, actor_id, action, target_profile_id)
  VALUES (target_organization_id, actor_id, 'organization.member_revoked', target_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_organizations()
RETURNS TABLE(
  organization_id uuid,
  organization_name text,
  organization_status text,
  member_role text,
  establishment_count bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT organization.id, organization.name, organization.status, member.role,
    count(link.id) FILTER (WHERE link.status = 'active' AND link.effective_until IS NULL)
  FROM public.organization_members member
  JOIN public.organizations organization ON organization.id = member.organization_id
  LEFT JOIN public.organization_establishments link ON link.organization_id = organization.id
  WHERE member.profile_id = (SELECT auth.uid())
    AND member.status = 'active' AND member.revoked_at IS NULL
  GROUP BY organization.id, organization.name, organization.status, member.role
  ORDER BY organization.name;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_context(target_organization_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.has_organization_role(target_organization_id) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT jsonb_build_object(
    'organization', jsonb_build_object('id', organization.id, 'name', organization.name, 'status', organization.status),
    'role', member.role,
    'establishments', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', establishment.id, 'name', establishment.name, 'slug', establishment.slug,
        'timezone', establishment.timezone, 'currency', establishment.currency,
        'account_status', establishment.account_status
      ) ORDER BY establishment.name)
      FROM public.organization_establishments link
      JOIN public.establishments establishment ON establishment.id = link.establishment_id
      WHERE link.organization_id = organization.id
        AND link.status = 'active' AND link.effective_until IS NULL
    ), '[]'::jsonb),
    'members', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'profile_id', profile.id, 'name', profile.name, 'role', organization_member.role,
        'status', organization_member.status
      ) ORDER BY profile.name)
      FROM public.organization_members organization_member
      JOIN public.profiles profile ON profile.id = organization_member.profile_id
      WHERE organization_member.organization_id = organization.id
        AND organization_member.status = 'active'
    ), '[]'::jsonb)
  ) INTO result
  FROM public.organizations organization
  JOIN public.organization_members member
    ON member.organization_id = organization.id
   AND member.profile_id = (SELECT auth.uid())
   AND member.status = 'active'
  WHERE organization.id = target_organization_id;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_organization_report(
  target_organization_id uuid,
  range_start date,
  range_end date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE result jsonb;
BEGIN
  IF range_end < range_start OR range_end - range_start > 366 THEN RAISE EXCEPTION 'invalid_report_range'; END IF;
  IF NOT public.has_organization_role(target_organization_id, ARRAY['owner', 'manager', 'finance']) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  WITH units AS (
    SELECT establishment.id, establishment.name, establishment.timezone, establishment.currency
    FROM public.organization_establishments link
    JOIN public.establishments establishment ON establishment.id = link.establishment_id
    WHERE link.organization_id = target_organization_id
      AND link.status = 'active' AND link.effective_until IS NULL
  ), unit_metrics AS (
    SELECT unit.id, unit.name, unit.timezone, unit.currency,
      count(appointment.id) AS appointment_count,
      count(*) FILTER (WHERE appointment.status = 'completed') AS completed_count,
      count(*) FILTER (WHERE appointment.status = 'cancelled') AS cancelled_count,
      count(*) FILTER (WHERE appointment.status IN ('pending', 'confirmed')) AS scheduled_count,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status = 'completed'), 0) AS production_realized,
      COALESCE(sum(service.price) FILTER (WHERE appointment.status IN ('pending', 'confirmed')), 0) AS scheduled_value,
      COALESCE(sum(appointment.duration_minutes) FILTER (WHERE appointment.status IN ('pending', 'confirmed', 'completed')), 0) AS occupied_minutes,
      public.admin_report_available_minutes(unit.id, range_start, range_end, NULL) AS available_minutes,
      count(DISTINCT appointment.client_id) FILTER (WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed') AS identified_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND NOT EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS new_clients,
      count(DISTINCT appointment.client_id) FILTER (
        WHERE appointment.client_id IS NOT NULL AND appointment.status = 'completed'
          AND EXISTS (
            SELECT 1 FROM public.appointments previous
            WHERE previous.establishment_id = unit.id
              AND previous.client_id = appointment.client_id
              AND previous.status = 'completed' AND previous.deleted_at IS NULL
              AND previous.date_time < (range_start::timestamp AT TIME ZONE unit.timezone)
          )
      ) AS returning_clients
    FROM units unit
    LEFT JOIN public.appointments appointment
      ON appointment.establishment_id = unit.id
     AND appointment.deleted_at IS NULL
     AND (appointment.date_time AT TIME ZONE unit.timezone)::date BETWEEN range_start AND range_end
    LEFT JOIN public.services service ON service.id = appointment.service_id
    GROUP BY unit.id, unit.name, unit.timezone, unit.currency
  )
  SELECT jsonb_build_object(
    'organization_id', target_organization_id,
    'range_start', range_start,
    'range_end', range_end,
    'appointment_count', COALESCE(sum(appointment_count), 0),
    'completed_count', COALESCE(sum(completed_count), 0),
    'cancelled_count', COALESCE(sum(cancelled_count), 0),
    'scheduled_count', COALESCE(sum(scheduled_count), 0),
    'production_realized', COALESCE(sum(production_realized), 0),
    'scheduled_value', COALESCE(sum(scheduled_value), 0),
    'average_ticket', CASE WHEN sum(completed_count) > 0
      THEN round(sum(production_realized) / sum(completed_count), 2) ELSE 0 END,
    'occupied_minutes', COALESCE(sum(occupied_minutes), 0),
    'available_minutes', COALESCE(sum(available_minutes), 0),
    'occupancy_rate', CASE WHEN sum(available_minutes) > 0
      THEN round(LEAST(sum(occupied_minutes) * 100.0 / sum(available_minutes), 100), 1) ELSE 0 END,
    'identified_clients', COALESCE(sum(identified_clients), 0),
    'new_clients', COALESCE(sum(new_clients), 0),
    'returning_clients', COALESCE(sum(returning_clients), 0),
    'units', COALESCE(jsonb_agg(to_jsonb(unit_metrics) ORDER BY name), '[]'::jsonb)
  ) INTO result
  FROM unit_metrics;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_control_billing_accounts()
RETURNS TABLE(
  billing_account_id uuid,
  organization_id uuid,
  organization_name text,
  subscription_id uuid,
  plan_code text,
  subscription_status text,
  enforcement_enabled boolean,
  active_units bigint,
  current_period_end date
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NOT public.is_governance_user() THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  SELECT account.id, organization.id, organization.name, subscription.id, plan.code,
    subscription.status, subscription.enforcement_enabled, count(unit.id) FILTER (
      WHERE unit.effective_from <= subscription.current_period_end
        AND (unit.effective_until IS NULL OR unit.effective_until >= subscription.current_period_start)
    ), subscription.current_period_end
  FROM public.organization_billing_accounts account
  JOIN public.organizations organization ON organization.id = account.organization_id
  LEFT JOIN public.organization_subscriptions subscription ON subscription.billing_account_id = account.id
  LEFT JOIN public.organization_billing_plans plan ON plan.id = subscription.plan_id
  LEFT JOIN public.subscription_units unit ON unit.subscription_id = subscription.id
  GROUP BY account.id, organization.id, organization.name, subscription.id, plan.code,
    subscription.status, subscription.enforcement_enabled, subscription.current_period_end
  ORDER BY organization.name;
END;
$$;

INSERT INTO public.organization_billing_plans(code, name, base_price_cents, currency, is_network)
VALUES
  ('multi_unit_standard', 'Multiunidade', NULL, 'BRL', false),
  ('network', 'Rede', NULL, 'BRL', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.plan_unit_tiers(plan_id, unit_from, unit_to, percentage_basis_points)
SELECT plan.id, tier.unit_from, tier.unit_to, tier.percentage_basis_points
FROM public.organization_billing_plans plan
CROSS JOIN (VALUES
  (1, 1, 10000),
  (2, 2, 7500),
  (3, 4, 6500)
) AS tier(unit_from, unit_to, percentage_basis_points)
WHERE plan.code = 'multi_unit_standard'
ON CONFLICT (plan_id, unit_from) DO UPDATE
SET unit_to = EXCLUDED.unit_to,
    percentage_basis_points = EXCLUDED.percentage_basis_points;

CREATE OR REPLACE FUNCTION public.configure_control_plan(
  target_plan_code text,
  target_base_price_cents integer,
  target_currency text DEFAULT 'BRL'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE plan_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_base_price_cents < 0 OR target_currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'invalid_plan_price';
  END IF;
  UPDATE public.organization_billing_plans
  SET base_price_cents = target_base_price_cents, currency = target_currency, updated_at = now()
  WHERE code = target_plan_code AND active
  RETURNING id INTO plan_id;
  IF plan_id IS NULL THEN RAISE EXCEPTION 'plan_not_found'; END IF;
  RETURN plan_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.activate_control_subscription(
  target_organization_id uuid,
  target_plan_code text,
  target_period_start date DEFAULT CURRENT_DATE
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  account_id uuid;
  plan_id uuid;
  new_subscription_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT id INTO account_id FROM public.organization_billing_accounts WHERE organization_id = target_organization_id;
  SELECT id INTO plan_id FROM public.organization_billing_plans
    WHERE code = target_plan_code AND active AND base_price_cents IS NOT NULL;
  IF account_id IS NULL THEN RAISE EXCEPTION 'billing_account_not_found'; END IF;
  IF plan_id IS NULL THEN RAISE EXCEPTION 'priced_plan_not_found'; END IF;

  INSERT INTO public.organization_subscriptions(
    billing_account_id, plan_id, status, current_period_start, current_period_end
  ) VALUES (
    account_id, plan_id, 'active', target_period_start, target_period_start + 29
  )
  ON CONFLICT (billing_account_id) DO UPDATE SET
    plan_id = EXCLUDED.plan_id,
    status = 'active',
    current_period_start = EXCLUDED.current_period_start,
    current_period_end = EXCLUDED.current_period_end,
    grace_ends_at = NULL,
    updated_at = now()
  RETURNING id INTO new_subscription_id;

  UPDATE public.subscription_units SET effective_until = target_period_start - 1
  WHERE subscription_id = new_subscription_id
    AND effective_until IS NULL;
  INSERT INTO public.subscription_units(subscription_id, establishment_id, effective_from)
  SELECT new_subscription_id, link.establishment_id, target_period_start
  FROM public.organization_establishments link
  WHERE link.organization_id = target_organization_id
    AND link.status = 'active' AND link.effective_until IS NULL
  ON CONFLICT (subscription_id, establishment_id, effective_from)
  DO UPDATE SET effective_until = NULL;

  INSERT INTO public.organization_billing_events(
    billing_account_id, subscription_id, actor_id, event_type, metadata
  ) VALUES (
    account_id, new_subscription_id, actor_id, 'subscription.activated',
    jsonb_build_object('plan_code', target_plan_code)
  );
  RETURN new_subscription_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.set_control_subscription_status(
  target_subscription_id uuid,
  target_status text,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  account_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF target_status NOT IN ('trialing', 'active', 'past_due', 'suspended', 'canceled') THEN
    RAISE EXCEPTION 'invalid_subscription_status';
  END IF;
  IF char_length(btrim(reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'invalid_reason'; END IF;

  UPDATE public.organization_subscriptions SET
    status = target_status,
    grace_ends_at = CASE WHEN target_status = 'past_due' THEN now() + interval '7 days' ELSE NULL END,
    canceled_at = CASE WHEN target_status = 'canceled' THEN now() ELSE canceled_at END,
    updated_at = now()
  WHERE id = target_subscription_id
  RETURNING billing_account_id INTO account_id;
  IF account_id IS NULL THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  INSERT INTO public.organization_billing_events(
    billing_account_id, subscription_id, actor_id, event_type, metadata
  ) VALUES (
    account_id, target_subscription_id, actor_id, 'subscription.status_changed',
    jsonb_build_object('status', target_status, 'reason', btrim(reason))
  );

  UPDATE public.establishments establishment
  SET account_status = CASE
    WHEN target_status = 'suspended' THEN 'blocked'
    WHEN target_status IN ('active', 'trialing') AND establishment.account_status IN ('blocked', 'delinquent') THEN 'active'
    ELSE establishment.account_status
  END,
  updated_at = CASE
    WHEN target_status = 'suspended'
      OR (target_status IN ('active', 'trialing') AND establishment.account_status IN ('blocked', 'delinquent'))
    THEN now() ELSE establishment.updated_at END
  FROM public.subscription_units unit
  JOIN public.organization_subscriptions subscription ON subscription.id = unit.subscription_id
  WHERE subscription.id = target_subscription_id
    AND subscription.enforcement_enabled
    AND establishment.id = unit.establishment_id
    AND unit.effective_until IS NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_subscription_entitlement_for_establishment(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE entitlement jsonb;
BEGIN
  IF NOT public.has_active_membership(target_establishment_id)
     AND NOT EXISTS (
       SELECT 1
       FROM public.organization_establishments link
       WHERE link.establishment_id = target_establishment_id
         AND link.status = 'active' AND link.effective_until IS NULL
         AND public.has_organization_role(link.organization_id, ARRAY['owner', 'finance'])
     )
     AND NOT public.is_governance_user()
  THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT jsonb_build_object(
    'status', subscription.status,
    'grace_ends_at', subscription.grace_ends_at,
    'enforcement_enabled', subscription.enforcement_enabled,
    'can_create_bookings', NOT subscription.enforcement_enabled OR subscription.status IN ('trialing', 'active', 'past_due'),
    'can_mutate_administration', NOT subscription.enforcement_enabled OR subscription.status IN ('trialing', 'active', 'past_due'),
    'can_read_and_export', true,
    'can_manage_existing_appointments', true
  ) INTO entitlement
  FROM public.subscription_units unit
  JOIN public.organization_subscriptions subscription ON subscription.id = unit.subscription_id
  WHERE unit.establishment_id = target_establishment_id
    AND unit.effective_until IS NULL
  ORDER BY unit.effective_from DESC
  LIMIT 1;
  RETURN COALESCE(entitlement, jsonb_build_object(
    'status', 'trialing', 'grace_ends_at', NULL, 'enforcement_enabled', false,
    'can_create_bookings', true, 'can_mutate_administration', true,
    'can_read_and_export', true, 'can_manage_existing_appointments', true
  ));
END;
$$;

CREATE OR REPLACE FUNCTION public.set_control_subscription_enforcement(
  target_subscription_id uuid,
  enabled boolean,
  reason text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE account_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF char_length(btrim(reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'invalid_reason'; END IF;
  UPDATE public.organization_subscriptions
  SET enforcement_enabled = enabled, updated_at = now()
  WHERE id = target_subscription_id
  RETURNING billing_account_id INTO account_id;
  IF account_id IS NULL THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  INSERT INTO public.organization_billing_events(billing_account_id, subscription_id, actor_id, event_type, metadata)
  VALUES (account_id, target_subscription_id, (SELECT auth.uid()), 'subscription.enforcement_changed',
    jsonb_build_object('enabled', enabled, 'reason', btrim(reason)));
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_manual_billing_invoice(
  target_subscription_id uuid,
  target_due_date date
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  subscription_record record;
  unit_count integer;
  subtotal integer := 0;
  total integer := 0;
  unit_snapshot jsonb := '[]'::jsonb;
  invoice_id uuid;
BEGIN
  IF NOT public.is_governance_user(ARRAY['SaaS_Editor', 'SaaS_Owner']::public.governance_role_enum[]) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT subscription.*, plan.code, plan.name, plan.base_price_cents, plan.currency, plan.is_network
  INTO subscription_record
  FROM public.organization_subscriptions subscription
  JOIN public.organization_billing_plans plan ON plan.id = subscription.plan_id
  WHERE subscription.id = target_subscription_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'subscription_not_found'; END IF;
  IF subscription_record.base_price_cents IS NULL THEN RAISE EXCEPTION 'plan_price_required'; END IF;

  SELECT count(*) INTO unit_count
  FROM public.subscription_units unit
  WHERE unit.subscription_id = target_subscription_id
    AND unit.effective_from <= subscription_record.current_period_end
    AND (unit.effective_until IS NULL OR unit.effective_until >= subscription_record.current_period_start);
  IF unit_count >= 5 AND NOT subscription_record.is_network THEN RAISE EXCEPTION 'network_plan_required'; END IF;

  WITH ranked_units AS (
    SELECT unit.establishment_id, establishment.name,
      row_number() OVER (ORDER BY unit.effective_from, establishment.name, unit.establishment_id) AS position
    FROM public.subscription_units unit
    JOIN public.establishments establishment ON establishment.id = unit.establishment_id
    WHERE unit.subscription_id = target_subscription_id
      AND unit.effective_from <= subscription_record.current_period_end
      AND (unit.effective_until IS NULL OR unit.effective_until >= subscription_record.current_period_start)
  ), priced AS (
    SELECT ranked_units.*,
      COALESCE((
        SELECT tier.percentage_basis_points
        FROM public.plan_unit_tiers tier
        WHERE tier.plan_id = subscription_record.plan_id
          AND ranked_units.position >= tier.unit_from
          AND (tier.unit_to IS NULL OR ranked_units.position <= tier.unit_to)
        ORDER BY tier.unit_from DESC LIMIT 1
      ), 10000) AS percentage_basis_points
    FROM ranked_units
  )
  SELECT
    COALESCE(sum(subscription_record.base_price_cents), 0),
    COALESCE(sum(round(subscription_record.base_price_cents * percentage_basis_points / 10000.0)), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'establishment_id', establishment_id, 'establishment_name', name, 'position', position,
      'base_price_cents', subscription_record.base_price_cents,
      'percentage_basis_points', percentage_basis_points,
      'charged_cents', round(subscription_record.base_price_cents * percentage_basis_points / 10000.0)
    ) ORDER BY position), '[]'::jsonb)
  INTO subtotal, total, unit_snapshot
  FROM priced;

  INSERT INTO public.organization_billing_invoices(
    subscription_id, period_start, period_end, due_date, status, currency,
    subtotal_cents, discount_cents, total_cents, unit_snapshot, plan_snapshot, issued_by
  ) VALUES (
    target_subscription_id, subscription_record.current_period_start,
    subscription_record.current_period_end, target_due_date, 'open', subscription_record.currency,
    subtotal, subtotal - total, total, unit_snapshot,
    jsonb_build_object(
      'plan_id', subscription_record.plan_id, 'code', subscription_record.code,
      'name', subscription_record.name, 'base_price_cents', subscription_record.base_price_cents
    ), actor_id
  ) RETURNING id INTO invoice_id;

  INSERT INTO public.organization_billing_events(
    billing_account_id, subscription_id, invoice_id, actor_id, event_type, metadata
  ) VALUES (
    subscription_record.billing_account_id, target_subscription_id, invoice_id, actor_id,
    'invoice.issued', jsonb_build_object('total_cents', total, 'unit_count', unit_count)
  );
  RETURN invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION public.has_organization_role(uuid, text[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_organization(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.add_organization_establishment(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.remove_organization_establishment(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.invite_organization_member(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.accept_organization_invitation(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.update_organization_member_role(uuid, uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.transfer_organization_ownership(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.revoke_organization_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_organizations() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_organization_context(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_organization_report(uuid, date, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.list_control_billing_accounts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configure_control_plan(text, integer, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.activate_control_subscription(uuid, text, date) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_subscription_status(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_subscription_entitlement_for_establishment(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.set_control_subscription_enforcement(uuid, boolean, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.issue_manual_billing_invoice(uuid, date) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.has_organization_role(uuid, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_organization(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_organization_establishment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_organization_establishment(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.invite_organization_member(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_organization_invitation(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_organization_member_role(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_organization_ownership(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_organization_member(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_organizations() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_organization_report(uuid, date, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_control_billing_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.configure_control_plan(text, integer, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.activate_control_subscription(uuid, text, date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_control_subscription_status(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_entitlement_for_establishment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_control_subscription_enforcement(uuid, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.issue_manual_billing_invoice(uuid, date) TO authenticated;

GRANT SELECT ON
  public.organizations,
  public.organization_members,
  public.organization_establishments,
  public.organization_invitations,
  public.organization_audit_log,
  public.organization_billing_accounts,
  public.organization_billing_plans,
  public.plan_unit_tiers,
  public.organization_subscriptions,
  public.subscription_units,
  public.organization_billing_invoices,
  public.organization_billing_events
TO authenticated;

COMMIT;
