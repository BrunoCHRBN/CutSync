BEGIN;

CREATE TABLE public.service_order_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL,
  establishment_id uuid NOT NULL,
  method text NOT NULL CHECK (method IN ('cash', 'pix', 'credit_card', 'debit_card', 'other')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT service_order_payments_order_tenant_fk
    FOREIGN KEY (service_order_id, establishment_id)
    REFERENCES public.service_orders(id, establishment_id) ON DELETE RESTRICT
);

CREATE INDEX service_order_payments_order_recorded_idx
  ON public.service_order_payments(service_order_id, recorded_at, id);

ALTER TABLE public.service_order_payments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.service_order_payments FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.service_order_payments TO authenticated;
GRANT ALL ON TABLE public.service_order_payments TO service_role;

CREATE POLICY service_order_payments_read
  ON public.service_order_payments FOR SELECT TO authenticated
  USING (public.has_business_capability(establishment_id, 'view_payments'));

CREATE OR REPLACE FUNCTION public.prevent_service_order_payment_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  RAISE EXCEPTION 'service_order_payments_are_append_only';
END;
$$;

CREATE TRIGGER service_order_payments_immutable
  BEFORE UPDATE OR DELETE ON public.service_order_payments
  FOR EACH ROW EXECUTE FUNCTION public.prevent_service_order_payment_mutation();

ALTER TABLE public.service_order_events
  DROP CONSTRAINT IF EXISTS service_order_events_event_type_check;
ALTER TABLE public.service_order_events
  ADD CONSTRAINT service_order_events_event_type_check CHECK (event_type IN (
    'opened', 'started', 'item_upserted', 'item_removed', 'finished',
    'closed', 'voided', 'reopened', 'payment_recorded'
  ));
ALTER TABLE public.service_order_events
  DROP CONSTRAINT IF EXISTS service_order_events_coherence_chk;
ALTER TABLE public.service_order_events
  ADD CONSTRAINT service_order_events_coherence_chk CHECK (
    (event_type = 'opened' AND previous_status IS NULL AND resulting_status = 'open')
    OR (event_type = 'started' AND previous_status = 'open' AND resulting_status = 'in_service')
    OR (event_type = 'item_upserted' AND previous_status = resulting_status AND previous_status IN ('open', 'in_service'))
    OR (event_type = 'item_removed' AND previous_status = resulting_status AND previous_status IN ('open', 'in_service'))
    OR (event_type = 'finished' AND previous_status = 'in_service' AND resulting_status = 'awaiting_payment')
    OR (event_type = 'closed' AND previous_status = 'awaiting_payment' AND resulting_status = 'closed')
    OR (event_type = 'voided' AND previous_status IN ('open', 'in_service', 'awaiting_payment') AND resulting_status = 'voided')
    OR (event_type = 'reopened' AND previous_status = 'voided' AND resulting_status IN ('open', 'in_service', 'awaiting_payment'))
    OR (event_type = 'payment_recorded' AND previous_status = 'awaiting_payment' AND resulting_status IN ('awaiting_payment', 'closed'))
  );

CREATE OR REPLACE FUNCTION public.get_business_service_order_checkout(
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
  paid_cents bigint := 0;
  payments jsonb := '[]'::jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, 'view_payments') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO order_record
  FROM public.service_orders AS service_order
  WHERE service_order.id = target_service_order_id
    AND service_order.establishment_id = target_establishment_id;
  IF order_record.id IS NULL THEN RAISE EXCEPTION 'service_order_not_found'; END IF;
  PERFORM public.assert_service_order_read_access(target_establishment_id, order_record.professional_id);

  SELECT
    COALESCE(sum(payment.amount_cents), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', payment.id,
      'method', payment.method,
      'amountCents', payment.amount_cents,
      'recordedAt', payment.recorded_at
    ) ORDER BY payment.recorded_at, payment.id), '[]'::jsonb)
  INTO paid_cents, payments
  FROM public.service_order_payments AS payment
  WHERE payment.service_order_id = order_record.id;

  RETURN jsonb_build_object(
    'serviceOrderId', order_record.id,
    'status', order_record.status,
    'version', order_record.version,
    'currency', order_record.currency,
    'totalCents', order_record.total_cents,
    'paidCents', paid_cents,
    'balanceCents', GREATEST(order_record.total_cents - paid_cents, 0),
    'paymentStatus', CASE
      WHEN paid_cents >= order_record.total_cents THEN 'paid'
      WHEN paid_cents > 0 THEN 'partial'
      ELSE 'unpaid'
    END,
    'payments', payments
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.record_business_service_order_payment(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_expected_version bigint,
  target_request_id uuid,
  target_method text,
  target_amount_cents bigint
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  replay jsonb;
  order_record public.service_orders%ROWTYPE;
  paid_cents bigint := 0;
  balance_cents bigint := 0;
  payment_id uuid;
  resulting_status text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_method NOT IN ('cash', 'pix', 'credit_card', 'debit_card', 'other') THEN
    RAISE EXCEPTION 'invalid_payment_method';
  END IF;
  IF target_amount_cents IS NULL OR target_amount_cents <= 0 THEN
    RAISE EXCEPTION 'invalid_payment_amount';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.payment_recorded',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version,
      'method', target_method,
      'amountCents', target_amount_cents
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, 'take_payments') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );
  IF order_record.status IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  SELECT COALESCE(sum(payment.amount_cents), 0)
  INTO paid_cents
  FROM public.service_order_payments AS payment
  WHERE payment.service_order_id = order_record.id;
  balance_cents := order_record.total_cents - paid_cents;
  IF target_amount_cents > balance_cents THEN RAISE EXCEPTION 'payment_exceeds_balance'; END IF;

  INSERT INTO public.service_order_payments (
    service_order_id,
    establishment_id,
    method,
    amount_cents,
    recorded_by,
    request_id
  ) VALUES (
    order_record.id,
    target_establishment_id,
    target_method,
    target_amount_cents,
    actor_id,
    target_request_id
  ) RETURNING id INTO payment_id;

  resulting_status := CASE WHEN target_amount_cents = balance_cents THEN 'closed' ELSE 'awaiting_payment' END;
  UPDATE public.service_orders
  SET
    status = resulting_status,
    closed_at = CASE WHEN resulting_status = 'closed' THEN now() ELSE NULL END,
    closed_by = CASE WHEN resulting_status = 'closed' THEN actor_id ELSE NULL END,
    updated_by = actor_id,
    version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'payment_recorded',
    'awaiting_payment',
    resulting_status,
    jsonb_build_object('paymentId', payment_id, 'method', target_method, 'amountCents', target_amount_cents)
  );

  result := jsonb_build_object(
    'serviceOrderId', order_record.id,
    'paymentId', payment_id,
    'status', order_record.status,
    'version', order_record.version
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_service_order_checkout(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_service_order_checkout(uuid, uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.record_business_service_order_payment(uuid, uuid, bigint, uuid, text, bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_business_service_order_payment(uuid, uuid, bigint, uuid, text, bigint) TO authenticated, service_role;

COMMIT;