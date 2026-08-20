-- Phase 4 follow-up: payment visibility is governed by view_payments while
-- professionals remain limited to their own service orders.

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
  identity_record record;
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

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, actor_id
  )
  LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF identity_record.operational_role <> 'professional' THEN
    RETURN;
  END IF;

  IF target_professional_id IS NOT NULL
    AND target_professional_id = actor_id
  THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_service_order_payment_read_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_service_order_payment_summary(
  target_establishment_id uuid,
  target_service_order_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  order_record public.service_orders%ROWTYPE;
  summary_record record;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  SELECT * INTO order_record
  FROM public.service_orders AS service_order
  WHERE service_order.id = target_service_order_id
    AND service_order.establishment_id = target_establishment_id;
  IF order_record.id IS NULL THEN RAISE EXCEPTION 'service_order_not_found'; END IF;
  PERFORM public.assert_service_order_payment_read_access(
    target_establishment_id, order_record.professional_id
  );

  SELECT * INTO summary_record
  FROM public.calculate_service_order_payment_summary(
    target_establishment_id, target_service_order_id
  );

  RETURN jsonb_build_object(
    'serviceOrderId', order_record.id,
    'establishmentId', target_establishment_id,
    'orderStatus', order_record.status,
    'paymentStatus', summary_record.payment_status,
    'currency', summary_record.currency,
    'totalCents', summary_record.total_cents,
    'paidCents', summary_record.paid_cents,
    'balanceCents', summary_record.balance_cents,
    'version', order_record.version,
    'lastEntryAt', summary_record.last_entry_at,
    'dataCutoffAt', statement_timestamp(),
    'correlationId', gen_random_uuid(),
    'entries', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'entryType', entry.entry_type,
        'status', entry.status,
        'amountCents', entry.amount_cents,
        'currency', entry.currency,
        'paymentMethodId', entry.payment_method_id,
        'methodType', entry.method_type_snapshot,
        'methodName', entry.method_name_snapshot,
        'originalPaymentEntryId', entry.original_payment_entry_id,
        'externalReference', entry.external_reference,
        'reason', entry.reason,
        'correlationId', entry.correlation_id,
        'createdAt', entry.created_at
      ) ORDER BY entry.created_at, entry.id)
      FROM public.order_payment_entries AS entry
      WHERE entry.establishment_id = target_establishment_id
        AND entry.service_order_id = target_service_order_id
    ), '[]'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_service_order_payment_summary(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_order_payment_summary(uuid, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.assert_service_order_payment_read_access(uuid, uuid) IS
  'Requires view_orders and view_payments in the unit; professionals can only read their own order.';
