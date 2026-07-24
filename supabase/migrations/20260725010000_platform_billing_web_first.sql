BEGIN;

-- CutSync platform billing is intentionally independent from the establishment's
-- service/appointment finance and from establishments.account_status.

CREATE TABLE public.billing_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  price_cents integer NOT NULL CHECK (price_cents > 0),
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  interval_unit text NOT NULL CHECK (interval_unit IN ('month', 'year')),
  interval_count integer NOT NULL DEFAULT 1 CHECK (interval_count > 0),
  entitlements jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(entitlements) = 'array'),
  is_public boolean NOT NULL DEFAULT false,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.billing_plans (
  code, name, price_cents, currency, interval_unit, entitlements, is_public
) VALUES (
  'owner_monthly_brl', 'CutSync para estabelecimentos', 4990, 'BRL', 'month',
  '["business_web","business_app","appointments","team","services","reports"]'::jsonb, true
);

CREATE TABLE public.billing_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL UNIQUE REFERENCES public.establishments(id) ON DELETE RESTRICT,
  billing_owner_profile_id uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id) ON DELETE RESTRICT,
  owner_resolution_status text NOT NULL DEFAULT 'automatic'
    CHECK (owner_resolution_status IN ('automatic', 'manual_review', 'confirmed')),
  billing_email text,
  taxpayer_name text,
  taxpayer_document text,
  municipal_registration text,
  fiscal_address jsonb NOT NULL DEFAULT '{}'::jsonb,
  trial_started_at timestamptz,
  trial_ends_at timestamptz,
  transition_ends_at timestamptz,
  courtesy_ends_at timestamptz,
  operationally_activated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (trial_ends_at IS NULL OR trial_started_at IS NOT NULL),
  CHECK (trial_ends_at IS NULL OR trial_ends_at >= trial_started_at)
);

CREATE TABLE public.billing_provider_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id uuid NOT NULL REFERENCES public.billing_plans(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play')),
  environment text NOT NULL CHECK (environment IN ('test', 'production')),
  external_product_id text NOT NULL,
  external_price_id text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, environment, external_price_id)
);

CREATE TABLE public.billing_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play', 'internal')),
  external_customer_id text,
  external_subscription_id text,
  status text NOT NULL DEFAULT 'none'
    CHECK (status IN ('none', 'checkout_pending', 'active', 'past_due', 'cancelled', 'expired', 'courtesy')),
  provider_event_created_at timestamptz,
  trial_ends_at timestamptz,
  grace_started_at timestamptz,
  grace_ends_at timestamptz,
  current_period_starts_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_subscription_id)
);

CREATE UNIQUE INDEX billing_subscriptions_account_live_idx
  ON public.billing_subscriptions (billing_account_id)
  WHERE status IN ('checkout_pending', 'active', 'past_due', 'courtesy');

CREATE TABLE public.billing_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_account_id uuid NOT NULL REFERENCES public.billing_accounts(id) ON DELETE RESTRICT,
  billing_subscription_id uuid REFERENCES public.billing_subscriptions(id) ON DELETE SET NULL,
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play', 'internal')),
  external_invoice_id text NOT NULL,
  number text,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  subtotal_cents integer NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  total_cents integer NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  paid_cents integer NOT NULL DEFAULT 0 CHECK (paid_cents >= 0),
  refunded_cents integer NOT NULL DEFAULT 0 CHECK (refunded_cents >= 0),
  status text NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible', 'refunded', 'partially_refunded')),
  due_at timestamptz,
  paid_at timestamptz,
  hosted_invoice_url text,
  invoice_pdf_url text,
  provider_event_created_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_invoice_id)
);

CREATE TABLE public.billing_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL CHECK (provider IN ('stripe', 'google_play', 'internal')),
  external_event_id text NOT NULL,
  event_type text NOT NULL,
  provider_created_at timestamptz NOT NULL,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry', 'dead_letter')),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);

CREATE INDEX billing_events_queue_idx ON public.billing_events(status, available_at, id);

CREATE TABLE public.fiscal_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  billing_invoice_id uuid NOT NULL UNIQUE REFERENCES public.billing_invoices(id) ON DELETE RESTRICT,
  provider text NOT NULL DEFAULT 'focus_nfe' CHECK (provider = 'focus_nfe'),
  external_reference text NOT NULL UNIQUE,
  external_document_id text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'authorized', 'error', 'cancellation_requested', 'cancelled', 'manual_review')),
  number text,
  verification_code text,
  issued_at timestamptz,
  cancelled_at timestamptz,
  manual_review_reason text,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.fiscal_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  provider text NOT NULL DEFAULT 'focus_nfe' CHECK (provider = 'focus_nfe'),
  external_event_id text NOT NULL,
  external_reference text,
  payload jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'processed', 'retry', 'dead_letter')),
  available_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  attempts integer NOT NULL DEFAULT 0,
  processed_at timestamptz,
  last_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_event_id)
);

CREATE TABLE public.platform_fiscal_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  environment text NOT NULL DEFAULT 'homologation'
    CHECK (environment IN ('homologation', 'production')),
  production_enabled boolean NOT NULL DEFAULT false,
  legal_name text,
  document_number text,
  municipal_registration text,
  cnae text,
  service_code text,
  tax_rate numeric(7,4),
  tax_regime text,
  retention_rules jsonb NOT NULL DEFAULT '{}'::jsonb,
  accountant_approved_at timestamptz,
  approved_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.platform_fiscal_settings(id) VALUES (true);

CREATE OR REPLACE FUNCTION public.billing_access_mode(target_establishment_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH context AS (
    SELECT
      establishment.account_status,
      account.trial_ends_at,
      account.transition_ends_at,
      account.courtesy_ends_at,
      subscription.status AS subscription_status,
      subscription.grace_ends_at,
      subscription.current_period_ends_at
    FROM public.establishments AS establishment
    LEFT JOIN public.billing_accounts AS account
      ON account.establishment_id = establishment.id
    LEFT JOIN LATERAL (
      SELECT candidate.*
      FROM public.billing_subscriptions AS candidate
      WHERE candidate.billing_account_id = account.id
      ORDER BY candidate.provider_event_created_at DESC NULLS LAST, candidate.updated_at DESC
      LIMIT 1
    ) AS subscription ON true
    WHERE establishment.id = target_establishment_id
  )
  SELECT CASE
    WHEN context.account_status NOT IN ('active', 'pending_verification') THEN 'blocked'
    WHEN context.account_status = 'pending_verification' THEN 'full'
    WHEN context.transition_ends_at > now()
      OR context.trial_ends_at > now()
      OR context.courtesy_ends_at > now()
      OR context.subscription_status = 'courtesy'
      OR (
        context.subscription_status IN ('active', 'cancelled')
        AND context.current_period_ends_at > now()
      )
      OR (
        context.subscription_status = 'past_due'
        AND context.grace_ends_at > now()
      )
    THEN 'full'
    ELSE 'read_only'
  END
  FROM context;
$$;

CREATE OR REPLACE FUNCTION public.can_use_establishment_feature(
  target_establishment_id uuid,
  target_feature text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT CASE
    WHEN target_feature IN ('read', 'billing', 'fiscal_documents', 'support', 'security', 'exit')
      THEN true
    WHEN target_feature IN ('admin_write', 'new_booking', 'availability')
      THEN COALESCE(public.billing_access_mode(target_establishment_id) = 'full', false)
    ELSE false
  END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_business_access_context(target_establishment_id uuid)
RETURNS TABLE (
  establishment_id uuid,
  membership_role text,
  billing_owner boolean,
  account_status text,
  billing_status text,
  access_mode text,
  trial_ends_at timestamptz,
  grace_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean,
  entitlements jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_active_membership(target_establishment_id, ARRAY['admin', 'professional'])
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  RETURN QUERY
  SELECT
    establishment.id,
    membership.role,
    account.billing_owner_profile_id = actor_id,
    establishment.account_status,
    COALESCE(subscription.status, CASE WHEN account.trial_ends_at > now() THEN 'trialing' ELSE 'none' END),
    COALESCE(public.billing_access_mode(establishment.id), 'blocked'),
    account.trial_ends_at,
    subscription.grace_ends_at,
    subscription.current_period_ends_at,
    COALESCE(subscription.cancel_at_period_end, false),
    CASE
      WHEN public.billing_access_mode(establishment.id) = 'full' THEN plan.entitlements
      ELSE '[]'::jsonb
    END
  FROM public.establishments AS establishment
  JOIN public.billing_accounts AS account ON account.establishment_id = establishment.id
  JOIN public.billing_plans AS plan ON plan.id = account.plan_id
  LEFT JOIN public.memberships AS membership
    ON membership.establishment_id = establishment.id
   AND membership.profile_id = actor_id
   AND membership.status = 'active'
  LEFT JOIN LATERAL (
    SELECT candidate.*
    FROM public.billing_subscriptions AS candidate
    WHERE candidate.billing_account_id = account.id
    ORDER BY candidate.provider_event_created_at DESC NULLS LAST, candidate.updated_at DESC
    LIMIT 1
  ) AS subscription ON true
  WHERE establishment.id = target_establishment_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_billing_overview(target_establishment_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  account_id uuid;
  result jsonb;
BEGIN
  SELECT account.id INTO account_id
  FROM public.billing_accounts AS account
  WHERE account.establishment_id = target_establishment_id
    AND account.billing_owner_profile_id = actor_id;
  IF account_id IS NULL AND NOT public.is_superadmin() THEN RAISE EXCEPTION 'billing_owner_required'; END IF;

  SELECT jsonb_build_object(
    'plan', jsonb_build_object(
      'name', plan.name, 'price_cents', plan.price_cents, 'currency', plan.currency,
      'interval_unit', plan.interval_unit
    ),
    'account', jsonb_build_object(
      'billing_email', account.billing_email,
      'trial_ends_at', account.trial_ends_at,
      'transition_ends_at', account.transition_ends_at
    ),
    'subscription', COALESCE((
      SELECT to_jsonb(subscription) - 'external_customer_id' - 'external_subscription_id'
      FROM public.billing_subscriptions AS subscription
      WHERE subscription.billing_account_id = account.id
      ORDER BY subscription.provider_event_created_at DESC NULLS LAST, subscription.updated_at DESC
      LIMIT 1
    ), '{}'::jsonb),
    'invoices', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id', invoice.id, 'number', invoice.number, 'status', invoice.status,
          'total_cents', invoice.total_cents, 'currency', invoice.currency,
          'paid_at', invoice.paid_at, 'hosted_invoice_url', invoice.hosted_invoice_url,
          'invoice_pdf_url', invoice.invoice_pdf_url, 'fiscal_status', fiscal.status,
          'fiscal_number', fiscal.number
        ) ORDER BY invoice.created_at DESC
      )
      FROM public.billing_invoices AS invoice
      LEFT JOIN public.fiscal_documents AS fiscal ON fiscal.billing_invoice_id = invoice.id
      WHERE invoice.billing_account_id = account.id
    ), '[]'::jsonb)
  ) INTO result
  FROM public.billing_accounts AS account
  JOIN public.billing_plans AS plan ON plan.id = account.plan_id
  WHERE account.id = account_id;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.ensure_billing_account_for_establishment(
  target_establishment_id uuid,
  target_transition_days integer DEFAULT 0
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  selected_owner uuid;
  owner_count integer;
  original_owner_count integer;
  selected_plan uuid;
  result uuid;
  establishment_created_at timestamptz;
BEGIN
  SELECT id INTO selected_plan FROM public.billing_plans WHERE code = 'owner_monthly_brl';
  SELECT created_at INTO establishment_created_at FROM public.establishments WHERE id = target_establishment_id;
  IF establishment_created_at IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;

  SELECT count(*), count(*) FILTER (WHERE created_by = profile_id)
  INTO owner_count, original_owner_count
  FROM public.memberships
  WHERE establishment_id = target_establishment_id AND role = 'admin' AND status = 'active';

  IF owner_count = 1 OR original_owner_count = 1 THEN
    SELECT profile_id INTO selected_owner
    FROM public.memberships
    WHERE establishment_id = target_establishment_id
      AND role = 'admin'
      AND status = 'active'
      AND (owner_count = 1 OR created_by = profile_id)
    ORDER BY created_at
    LIMIT 1;
  END IF;

  INSERT INTO public.billing_accounts (
    establishment_id, billing_owner_profile_id, plan_id, owner_resolution_status,
    trial_started_at, trial_ends_at, transition_ends_at, operationally_activated_at
  ) VALUES (
    target_establishment_id, selected_owner, selected_plan,
    CASE WHEN selected_owner IS NOT NULL THEN 'automatic' ELSE 'manual_review' END,
    CASE WHEN target_transition_days = 0 THEN now() END,
    CASE WHEN target_transition_days = 0 THEN now() + interval '14 days' END,
    CASE WHEN target_transition_days > 0 THEN now() + make_interval(days => target_transition_days) END,
    now()
  )
  ON CONFLICT (establishment_id) DO NOTHING
  RETURNING id INTO result;

  IF result IS NULL THEN
    SELECT id INTO result FROM public.billing_accounts WHERE establishment_id = target_establishment_id;
  END IF;
  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_establishment_billing()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.account_status = 'active'
    AND (TG_OP = 'INSERT' OR OLD.account_status IS DISTINCT FROM 'active')
  THEN
    PERFORM public.ensure_billing_account_for_establishment(NEW.id, 0);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS initialize_establishment_billing_trigger ON public.establishments;
CREATE TRIGGER initialize_establishment_billing_trigger
AFTER INSERT OR UPDATE OF account_status ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.initialize_establishment_billing();

-- Existing operational establishments receive the approved 30-day transition.
SELECT public.ensure_billing_account_for_establishment(establishment.id, 30)
FROM public.establishments AS establishment
WHERE establishment.account_status = 'active';

CREATE OR REPLACE FUNCTION public.enforce_billing_write_access()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row_data jsonb := CASE WHEN TG_OP = 'DELETE' THEN to_jsonb(OLD) ELSE to_jsonb(NEW) END;
  target_establishment_id uuid := COALESCE(
    (row_data->>'establishment_id')::uuid,
    (row_data->>'id')::uuid
  );
  actor_id uuid := (SELECT auth.uid());
  client_cancel boolean := false;
BEGIN
  IF actor_id IS NULL OR public.is_superadmin() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF public.can_use_establishment_feature(target_establishment_id, 'admin_write') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_TABLE_NAME = 'appointments' AND TG_OP = 'UPDATE' THEN
    client_cancel := OLD.client_id = actor_id
      AND OLD.status IN ('pending', 'confirmed')
      AND NEW.status = 'cancelled'
      AND NEW.establishment_id = OLD.establishment_id
      AND NEW.professional_id = OLD.professional_id
      AND NEW.service_id = OLD.service_id
      AND NEW.date_time = OLD.date_time;
  END IF;
  IF client_cancel THEN RETURN NEW; END IF;

  RAISE EXCEPTION 'billing_read_only' USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS enforce_billing_appointments_write ON public.appointments;
CREATE TRIGGER enforce_billing_appointments_write
BEFORE INSERT OR UPDATE OR DELETE ON public.appointments
FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_write_access();

DROP TRIGGER IF EXISTS enforce_billing_services_write ON public.services;
CREATE TRIGGER enforce_billing_services_write
BEFORE INSERT OR UPDATE OR DELETE ON public.services
FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_write_access();

DROP TRIGGER IF EXISTS enforce_billing_memberships_write ON public.memberships;
CREATE TRIGGER enforce_billing_memberships_write
BEFORE INSERT OR UPDATE OR DELETE ON public.memberships
FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_write_access();

DROP TRIGGER IF EXISTS enforce_billing_establishments_write ON public.establishments;
CREATE TRIGGER enforce_billing_establishments_write
BEFORE UPDATE ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_write_access();

DO $$
DECLARE
  protected_table text;
BEGIN
  FOREACH protected_table IN ARRAY ARRAY['professional_services', 'schedule_blocks', 'invitations']
  LOOP
    IF to_regclass('public.' || protected_table) IS NOT NULL THEN
      EXECUTE format('DROP TRIGGER IF EXISTS enforce_billing_%I_write ON public.%I', protected_table, protected_table);
      EXECUTE format(
        'CREATE TRIGGER enforce_billing_%I_write BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.enforce_billing_write_access()',
        protected_table, protected_table
      );
    END IF;
  END LOOP;
END $$;

-- Incorporate billing in the existing operational circuit breaker.
CREATE OR REPLACE FUNCTION public.is_establishment_active(target_establishment_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.establishments
    WHERE id = target_establishment_id
      AND account_status IN ('active', 'pending_verification')
      AND public.can_use_establishment_feature(id, 'admin_write')
  );
$$;

ALTER FUNCTION public.get_available_slots(uuid, uuid, text, date, text)
  RENAME TO get_available_slots_before_billing;

CREATE OR REPLACE FUNCTION public.get_available_slots(
  target_establishment_id uuid,
  target_professional_id uuid,
  target_service_id text,
  target_local_date date,
  target_appointment_id text DEFAULT NULL
)
RETURNS TABLE (
  starts_at timestamptz,
  local_time text,
  duration_minutes integer,
  available boolean,
  unavailable_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT slots.*
  FROM public.get_available_slots_before_billing(
    target_establishment_id,
    target_professional_id,
    target_service_id,
    target_local_date,
    target_appointment_id
  ) AS slots
  WHERE public.can_use_establishment_feature(target_establishment_id, 'availability');
$$;

ALTER FUNCTION public.get_client_appointments()
  RENAME TO get_client_appointments_before_billing;

CREATE OR REPLACE FUNCTION public.get_client_appointments()
RETURNS TABLE (
  appointment_id text,
  appointment_status text,
  starts_at timestamptz,
  ends_at timestamptz,
  duration_minutes integer,
  reschedule_count integer,
  original_starts_at timestamptz,
  cancellation_reason text,
  cancelled_by_role text,
  created_at timestamptz,
  updated_at timestamptz,
  establishment_id uuid,
  establishment_name text,
  establishment_slug text,
  establishment_address text,
  establishment_phone text,
  establishment_timezone text,
  establishment_currency text,
  min_cancellation_hours integer,
  instant_booking_enabled boolean,
  service_id text,
  service_name text,
  professional_id uuid,
  professional_name text,
  professional_avatar_url text,
  cancellation_deadline timestamptz,
  can_cancel boolean,
  can_reschedule boolean,
  cancel_block_reason text,
  reschedule_block_reason text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT
    appointment.appointment_id,
    appointment.appointment_status,
    appointment.starts_at,
    appointment.ends_at,
    appointment.duration_minutes,
    appointment.reschedule_count,
    appointment.original_starts_at,
    appointment.cancellation_reason,
    appointment.cancelled_by_role,
    appointment.created_at,
    appointment.updated_at,
    appointment.establishment_id,
    appointment.establishment_name,
    appointment.establishment_slug,
    appointment.establishment_address,
    appointment.establishment_phone,
    appointment.establishment_timezone,
    appointment.establishment_currency,
    appointment.min_cancellation_hours,
    appointment.instant_booking_enabled,
    appointment.service_id,
    appointment.service_name,
    appointment.professional_id,
    appointment.professional_name,
    appointment.professional_avatar_url,
    appointment.cancellation_deadline,
    appointment.can_cancel,
    appointment.can_reschedule
      AND public.can_use_establishment_feature(appointment.establishment_id, 'new_booking'),
    appointment.cancel_block_reason,
    CASE
      WHEN NOT public.can_use_establishment_feature(appointment.establishment_id, 'new_booking')
        THEN 'billing_read_only'
      ELSE appointment.reschedule_block_reason
    END
  FROM public.get_client_appointments_before_billing() AS appointment;
$$;

ALTER TABLE public.billing_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_provider_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fiscal_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.platform_fiscal_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users read public billing plan"
  ON public.billing_plans FOR SELECT TO authenticated USING (is_public AND active);
CREATE POLICY "Billing owner reads account"
  ON public.billing_accounts FOR SELECT TO authenticated
  USING (billing_owner_profile_id = (SELECT auth.uid()) OR public.is_superadmin());
CREATE POLICY "Billing owner reads subscriptions"
  ON public.billing_subscriptions FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.billing_accounts account
    WHERE account.id = billing_account_id
      AND (account.billing_owner_profile_id = (SELECT auth.uid()) OR public.is_superadmin())
  ));
CREATE POLICY "Billing owner reads invoices"
  ON public.billing_invoices FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.billing_accounts account
    WHERE account.id = billing_account_id
      AND (account.billing_owner_profile_id = (SELECT auth.uid()) OR public.is_superadmin())
  ));
CREATE POLICY "Billing owner reads fiscal documents"
  ON public.fiscal_documents FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1
    FROM public.billing_invoices invoice
    JOIN public.billing_accounts account ON account.id = invoice.billing_account_id
    WHERE invoice.id = billing_invoice_id
      AND (account.billing_owner_profile_id = (SELECT auth.uid()) OR public.is_superadmin())
  ));

REVOKE ALL ON public.billing_provider_products, public.billing_events, public.fiscal_events,
  public.platform_fiscal_settings FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.billing_accounts, public.billing_plans,
  public.billing_subscriptions, public.billing_invoices, public.fiscal_documents FROM anon, authenticated;
GRANT SELECT ON public.billing_plans, public.billing_accounts, public.billing_subscriptions,
  public.billing_invoices, public.fiscal_documents TO authenticated;

REVOKE ALL ON FUNCTION public.billing_access_mode(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_use_establishment_feature(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_business_access_context(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_billing_overview(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ensure_billing_account_for_establishment(uuid, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_available_slots(uuid, uuid, text, date, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_client_appointments() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_available_slots_before_billing(uuid, uuid, text, date, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_client_appointments_before_billing()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_business_access_context(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_billing_overview(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.billing_access_mode(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.can_use_establishment_feature(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.ensure_billing_account_for_establishment(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_available_slots(uuid, uuid, text, date, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_client_appointments() TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
