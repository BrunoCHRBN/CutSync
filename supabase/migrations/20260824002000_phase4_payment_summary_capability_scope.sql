-- Keep payment summary authorization capability-driven. Team financial roles
-- may read the unit ledger; professionals remain scoped to their own orders.

CREATE OR REPLACE FUNCTION public.assert_service_order_payment_read_access(
  target_establishment_id uuid,
  target_professional_id uuid
)
RETURNS void
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

  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'view_payments', 'full'
  ) OR NOT public.has_business_capability(
    target_establishment_id, actor_id, 'view_orders', 'full'
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF public.has_business_capability(
    target_establishment_id, actor_id, 'manage_team_orders', 'full'
  ) OR public.has_business_capability(
    target_establishment_id, actor_id, 'view_financial_reports', 'full'
  ) THEN
    RETURN;
  END IF;

  IF public.has_business_capability(
    target_establishment_id, actor_id, 'manage_own_orders', 'full'
  ) AND target_professional_id IS NOT NULL
    AND target_professional_id = actor_id
  THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_service_order_payment_read_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

COMMENT ON FUNCTION public.assert_service_order_payment_read_access(uuid, uuid) IS
  'Requires payment/order read capabilities plus team financial scope or own-order scope.';
