BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Phase 4, slice 1: reconstructable manual POS ledger.
-- Payment methods are establishment-scoped declarations. Payment entries are
-- append-only economic facts; voids are compensating entries. No cash drawer,
-- commission, provider, refund, fiscal or SaaS billing data is introduced here.

CREATE TABLE public.establishment_payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL
    REFERENCES public.establishments(id) ON DELETE RESTRICT,
  method_type text NOT NULL CHECK (
    method_type IN ('cash', 'external_pix', 'external_card')
  ),
  display_name text NOT NULL CHECK (
    char_length(btrim(display_name)) BETWEEN 1 AND 80
  ),
  active boolean NOT NULL DEFAULT true,
  requires_reference boolean NOT NULL DEFAULT false,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, establishment_id),
  UNIQUE (establishment_id, method_type)
);

COMMENT ON TABLE public.establishment_payment_methods IS
  'Establishment-scoped manual POS methods. Independent from billing_* and '
  'payment provider configuration.';

CREATE TABLE public.order_payment_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  payment_method_id uuid NOT NULL,
  entry_type text NOT NULL CHECK (entry_type IN ('payment', 'void')),
  status text NOT NULL CHECK (
    status IN ('pending', 'processing', 'succeeded', 'failed', 'voided', 'disputed')
  ),
  amount_cents bigint NOT NULL CHECK (
    amount_cents > 0 AND amount_cents <= 9007199254740991
  ),
  currency text NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL'),
  original_payment_entry_id uuid,
  method_type_snapshot text NOT NULL CHECK (
    method_type_snapshot IN ('cash', 'external_pix', 'external_card')
  ),
  method_name_snapshot text NOT NULL CHECK (
    char_length(btrim(method_name_snapshot)) BETWEEN 1 AND 80
  ),
  external_reference text CHECK (
    external_reference IS NULL
    OR char_length(btrim(external_reference)) BETWEEN 1 AND 120
  ),
  reason text CHECK (
    reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500
  ),
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_payment_entries_order_tenant_fk
    FOREIGN KEY (service_order_id, establishment_id)
    REFERENCES public.service_orders(id, establishment_id) ON DELETE RESTRICT,
  CONSTRAINT order_payment_entries_method_tenant_fk
    FOREIGN KEY (payment_method_id, establishment_id)
    REFERENCES public.establishment_payment_methods(id, establishment_id)
    ON DELETE RESTRICT,
  CONSTRAINT order_payment_entries_identity_tenant_uidx
    UNIQUE (id, establishment_id, service_order_id),
  CONSTRAINT order_payment_entries_original_tenant_fk
    FOREIGN KEY (original_payment_entry_id, establishment_id, service_order_id)
    REFERENCES public.order_payment_entries(id, establishment_id, service_order_id)
    ON DELETE RESTRICT,
  CONSTRAINT order_payment_entries_kind_check CHECK (
    (entry_type = 'payment' AND original_payment_entry_id IS NULL AND reason IS NULL)
    OR
    (entry_type = 'void' AND original_payment_entry_id IS NOT NULL AND reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX order_payment_entries_one_void_idx
  ON public.order_payment_entries(original_payment_entry_id)
  WHERE entry_type = 'void' AND status = 'succeeded';
CREATE INDEX order_payment_entries_order_created_idx
  ON public.order_payment_entries(service_order_id, created_at, id);
CREATE INDEX order_payment_entries_establishment_created_idx
  ON public.order_payment_entries(establishment_id, created_at DESC, id DESC);

COMMENT ON TABLE public.order_payment_entries IS
  'Append-only manual POS ledger in integer cents. Voids are compensating rows; '
  'the original payment row is never deleted or rewritten.';
COMMENT ON COLUMN public.order_payment_entries.external_reference IS
  'Optional operator reference. Must not contain PAN, CVV, provider tokens or secrets.';

CREATE TABLE public.order_payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  establishment_id uuid NOT NULL,
  service_order_id uuid NOT NULL,
  payment_entry_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('payment_recorded', 'payment_voided')),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT order_payment_events_order_tenant_fk
    FOREIGN KEY (service_order_id, establishment_id)
    REFERENCES public.service_orders(id, establishment_id) ON DELETE RESTRICT,
  CONSTRAINT order_payment_events_entry_tenant_fk
    FOREIGN KEY (payment_entry_id, establishment_id, service_order_id)
    REFERENCES public.order_payment_entries(id, establishment_id, service_order_id)
    ON DELETE RESTRICT
);

CREATE INDEX order_payment_events_order_created_idx
  ON public.order_payment_events(service_order_id, created_at, id);

CREATE OR REPLACE FUNCTION public.prevent_order_payment_ledger_delete()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  RAISE EXCEPTION 'order_payment_ledger_append_only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_order_payment_entry_delete
BEFORE DELETE ON public.order_payment_entries
FOR EACH ROW EXECUTE FUNCTION public.prevent_order_payment_ledger_delete();

CREATE TRIGGER prevent_order_payment_event_change
BEFORE UPDATE OR DELETE ON public.order_payment_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_order_payment_ledger_delete();

REVOKE ALL ON FUNCTION public.prevent_order_payment_ledger_delete()
  FROM PUBLIC, anon, authenticated;

ALTER TABLE public.establishment_payment_methods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payment_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.order_payment_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.establishment_payment_methods,
  public.order_payment_entries,
  public.order_payment_events
FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON public.establishment_payment_methods TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.order_payment_entries TO service_role;
GRANT SELECT, INSERT ON public.order_payment_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.order_payment_events_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.calculate_service_order_payment_summary(
  target_establishment_id uuid,
  target_service_order_id uuid
)
RETURNS TABLE (
  total_cents bigint,
  paid_cents bigint,
  balance_cents bigint,
  payment_status text,
  currency text,
  last_entry_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  WITH target_order AS (
    SELECT service_order.total_cents, service_order.currency
    FROM public.service_orders AS service_order
    WHERE service_order.id = target_service_order_id
      AND service_order.establishment_id = target_establishment_id
  ),
  ledger AS (
    SELECT
      COALESCE(sum(
        CASE
          WHEN entry.status = 'succeeded' AND entry.entry_type = 'payment'
            THEN entry.amount_cents
          WHEN entry.status = 'succeeded' AND entry.entry_type = 'void'
            THEN -entry.amount_cents
          ELSE 0
        END
      ), 0)::bigint AS paid_cents,
      max(entry.created_at) AS last_entry_at
    FROM public.order_payment_entries AS entry
    WHERE entry.service_order_id = target_service_order_id
      AND entry.establishment_id = target_establishment_id
  )
  SELECT
    target_order.total_cents,
    ledger.paid_cents,
    greatest(target_order.total_cents - ledger.paid_cents, 0)::bigint,
    CASE
      WHEN ledger.paid_cents <= 0 AND target_order.total_cents > 0 THEN 'unpaid'
      WHEN ledger.paid_cents < target_order.total_cents THEN 'partially_paid'
      ELSE 'paid'
    END,
    target_order.currency,
    ledger.last_entry_at
  FROM target_order CROSS JOIN ledger;
$$;

REVOKE ALL ON FUNCTION public.calculate_service_order_payment_summary(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

-- Keep command receipts free of arbitrary JSON while admitting Phase 4 IDs,
-- calculated cents and financial status.
CREATE OR REPLACE FUNCTION public.is_safe_mobile_command_response(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_object_keys(value) AS key_name
      WHERE key_name <> ALL (ARRAY[
        'appointmentId', 'status', 'startsAt', 'endsAt',
        'establishmentClientId', 'establishmentId', 'linkId',
        'scheduleBlockId', 'serviceId', 'membershipId',
        'invitationId', 'expiresAt', 'survivorClientId',
        'duplicateClientId', 'professionalId', 'errorCode',
        'serviceOrderId', 'serviceOrderItemId', 'version',
        'paymentMethodId', 'paymentEntryId', 'paymentStatus',
        'paidCents', 'balanceCents'
      ]::text[])
    )
    AND (
      NOT (value ? 'errorCode') OR (
        jsonb_typeof(value->'errorCode') = 'string'
        AND value->>'errorCode' IN ('appointment_conflict', 'schedule_block_conflict')
      )
    )
    AND (
      NOT (value ? 'version') OR (
        jsonb_typeof(value->'version') = 'number'
        AND (value->>'version') ~ '^[0-9]+$'
        AND (value->>'version')::bigint BETWEEN 1 AND 9007199254740991
      )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM unnest(ARRAY[
        'serviceOrderId', 'serviceOrderItemId', 'paymentMethodId', 'paymentEntryId'
      ]::text[]) AS uuid_key
      WHERE value ? uuid_key
        AND (
          jsonb_typeof(value->uuid_key) <> 'string'
          OR (value->>uuid_key) !~
            '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
    )
    AND NOT EXISTS (
      SELECT 1 FROM unnest(ARRAY['paidCents', 'balanceCents']::text[]) AS cents_key
      WHERE value ? cents_key
        AND (
          jsonb_typeof(value->cents_key) <> 'number'
          OR (value->>cents_key) !~ '^[0-9]+$'
          OR (value->>cents_key)::numeric > 9007199254740991
        )
    )
    AND (
      NOT (value ? 'paymentStatus') OR (
        jsonb_typeof(value->'paymentStatus') = 'string'
        AND value->>'paymentStatus' IN (
          'unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded'
        )
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.list_establishment_payment_methods(
  target_establishment_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'view_payments', 'full'
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  RETURN jsonb_build_object(
    'establishmentId', target_establishment_id,
    'dataCutoffAt', statement_timestamp(),
    'correlationId', gen_random_uuid(),
    'methods', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', method.id,
        'methodType', method.method_type,
        'displayName', method.display_name,
        'active', method.active,
        'requiresReference', method.requires_reference,
        'version', method.version
      ) ORDER BY method.active DESC, method.method_type)
      FROM public.establishment_payment_methods AS method
      WHERE method.establishment_id = target_establishment_id
    ), '[]'::jsonb)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.configure_establishment_payment_method(
  target_establishment_id uuid,
  target_method_type text,
  target_display_name text,
  target_active boolean,
  target_requires_reference boolean,
  target_expected_version bigint,
  target_request_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  replay jsonb;
  method_record public.establishment_payment_methods%ROWTYPE;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_method_type NOT IN ('cash', 'external_pix', 'external_card') THEN
    RAISE EXCEPTION 'invalid_payment_method_type';
  END IF;
  IF char_length(btrim(COALESCE(target_display_name, ''))) NOT BETWEEN 1 AND 80 THEN
    RAISE EXCEPTION 'invalid_payment_method_name';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'payment_method.configured',
    jsonb_build_object(
      'methodType', target_method_type,
      'displayName', btrim(target_display_name),
      'active', target_active,
      'requiresReference', target_requires_reference,
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'manage_operational_settings', 'full'
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  SELECT * INTO method_record
  FROM public.establishment_payment_methods AS method
  WHERE method.establishment_id = target_establishment_id
    AND method.method_type = target_method_type
  FOR UPDATE;

  IF method_record.id IS NULL THEN
    IF target_expected_version IS NOT NULL THEN
      RAISE EXCEPTION 'payment_method_version_conflict';
    END IF;
    INSERT INTO public.establishment_payment_methods(
      establishment_id, method_type, display_name, active, requires_reference,
      created_by, updated_by
    ) VALUES (
      target_establishment_id, target_method_type, btrim(target_display_name),
      COALESCE(target_active, true), COALESCE(target_requires_reference, false),
      actor_id, actor_id
    ) RETURNING * INTO method_record;
  ELSE
    IF target_expected_version IS NULL
      OR method_record.version IS DISTINCT FROM target_expected_version
    THEN RAISE EXCEPTION 'payment_method_version_conflict'; END IF;
    UPDATE public.establishment_payment_methods
    SET display_name = btrim(target_display_name),
        active = COALESCE(target_active, active),
        requires_reference = COALESCE(target_requires_reference, requires_reference),
        updated_by = actor_id,
        updated_at = now(),
        version = version + 1
    WHERE id = method_record.id
    RETURNING * INTO method_record;
  END IF;

  result := jsonb_build_object(
    'paymentMethodId', method_record.id,
    'version', method_record.version
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

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
  PERFORM public.assert_service_order_read_access(
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

CREATE OR REPLACE FUNCTION public.record_order_payment(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_payment_method_id uuid,
  target_amount_cents bigint,
  target_external_reference text,
  target_expected_version bigint,
  target_request_id uuid
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
  method_record public.establishment_payment_methods%ROWTYPE;
  summary_record record;
  payment_entry public.order_payment_entries%ROWTYPE;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_amount_cents IS NULL OR target_amount_cents <= 0
    OR target_amount_cents > 9007199254740991
  THEN RAISE EXCEPTION 'invalid_payment_amount'; END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'order_payment.recorded',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'paymentMethodId', target_payment_method_id,
      'amountCents', target_amount_cents,
      'externalReference', NULLIF(btrim(target_external_reference), ''),
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'take_payments', 'full'
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id, target_service_order_id, target_expected_version
  );
  IF order_record.status IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  SELECT * INTO method_record
  FROM public.establishment_payment_methods AS method
  WHERE method.id = target_payment_method_id
    AND method.establishment_id = target_establishment_id
    AND method.active;
  IF method_record.id IS NULL THEN RAISE EXCEPTION 'payment_method_unavailable'; END IF;
  IF method_record.requires_reference
    AND NULLIF(btrim(target_external_reference), '') IS NULL
  THEN RAISE EXCEPTION 'payment_reference_required'; END IF;
  IF target_external_reference IS NOT NULL
    AND char_length(btrim(target_external_reference)) > 120
  THEN RAISE EXCEPTION 'invalid_payment_reference'; END IF;

  SELECT * INTO summary_record
  FROM public.calculate_service_order_payment_summary(
    target_establishment_id, target_service_order_id
  );
  IF target_amount_cents > summary_record.balance_cents THEN
    RAISE EXCEPTION 'payment_exceeds_order_balance';
  END IF;

  INSERT INTO public.order_payment_entries(
    establishment_id, service_order_id, payment_method_id, entry_type, status,
    amount_cents, currency, method_type_snapshot, method_name_snapshot,
    external_reference, request_id, correlation_id, recorded_by
  ) VALUES (
    target_establishment_id, target_service_order_id, target_payment_method_id,
    'payment', 'succeeded', target_amount_cents, order_record.currency,
    method_record.method_type, method_record.display_name,
    NULLIF(btrim(target_external_reference), ''), target_request_id,
    target_request_id, actor_id
  ) RETURNING * INTO payment_entry;

  INSERT INTO public.order_payment_events(
    establishment_id, service_order_id, payment_entry_id, event_type,
    actor_id, request_id, correlation_id
  ) VALUES (
    target_establishment_id, target_service_order_id, payment_entry.id,
    'payment_recorded', actor_id, target_request_id, target_request_id
  );

  UPDATE public.service_orders
  SET updated_by = actor_id, updated_at = now(), version = version + 1
  WHERE id = target_service_order_id
  RETURNING * INTO order_record;

  SELECT * INTO summary_record
  FROM public.calculate_service_order_payment_summary(
    target_establishment_id, target_service_order_id
  );
  result := jsonb_build_object(
    'serviceOrderId', order_record.id,
    'paymentEntryId', payment_entry.id,
    'status', order_record.status,
    'version', order_record.version,
    'paymentStatus', summary_record.payment_status,
    'paidCents', summary_record.paid_cents,
    'balanceCents', summary_record.balance_cents
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.void_order_payment(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_payment_entry_id uuid,
  target_reason text,
  target_expected_version bigint,
  target_request_id uuid
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
  original_entry public.order_payment_entries%ROWTYPE;
  void_entry public.order_payment_entries%ROWTYPE;
  summary_record record;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 3 AND 500 THEN
    RAISE EXCEPTION 'invalid_void_reason';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'order_payment.voided',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'paymentEntryId', target_payment_entry_id,
      'reason', btrim(target_reason),
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(
    target_establishment_id, actor_id, 'void_payments', 'full'
  ) THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT public.current_session_is_aal2() THEN
    RAISE EXCEPTION 'aal2_required' USING ERRCODE = '42501';
  END IF;

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id, target_service_order_id, target_expected_version
  );
  IF order_record.status IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  SELECT * INTO original_entry
  FROM public.order_payment_entries AS entry
  WHERE entry.id = target_payment_entry_id
    AND entry.service_order_id = target_service_order_id
    AND entry.establishment_id = target_establishment_id
  FOR UPDATE;
  IF original_entry.id IS NULL OR original_entry.entry_type <> 'payment'
    OR original_entry.status <> 'succeeded'
  THEN RAISE EXCEPTION 'payment_entry_not_voidable'; END IF;
  IF EXISTS (
    SELECT 1 FROM public.order_payment_entries AS compensation
    WHERE compensation.original_payment_entry_id = original_entry.id
      AND compensation.entry_type = 'void'
      AND compensation.status = 'succeeded'
  ) THEN RAISE EXCEPTION 'payment_entry_already_voided'; END IF;

  INSERT INTO public.order_payment_entries(
    establishment_id, service_order_id, payment_method_id, entry_type, status,
    amount_cents, currency, original_payment_entry_id, method_type_snapshot,
    method_name_snapshot, reason, request_id, correlation_id, recorded_by
  ) VALUES (
    target_establishment_id, target_service_order_id,
    original_entry.payment_method_id, 'void', 'succeeded',
    original_entry.amount_cents, original_entry.currency, original_entry.id,
    original_entry.method_type_snapshot, original_entry.method_name_snapshot,
    btrim(target_reason), target_request_id, target_request_id, actor_id
  ) RETURNING * INTO void_entry;

  INSERT INTO public.order_payment_events(
    establishment_id, service_order_id, payment_entry_id, event_type,
    actor_id, request_id, correlation_id,
    metadata
  ) VALUES (
    target_establishment_id, target_service_order_id, void_entry.id,
    'payment_voided', actor_id, target_request_id, target_request_id,
    jsonb_build_object('originalPaymentEntryId', original_entry.id)
  );

  UPDATE public.service_orders
  SET updated_by = actor_id, updated_at = now(), version = version + 1
  WHERE id = target_service_order_id
  RETURNING * INTO order_record;

  SELECT * INTO summary_record
  FROM public.calculate_service_order_payment_summary(
    target_establishment_id, target_service_order_id
  );
  result := jsonb_build_object(
    'serviceOrderId', order_record.id,
    'paymentEntryId', void_entry.id,
    'status', order_record.status,
    'version', order_record.version,
    'paymentStatus', summary_record.payment_status,
    'paidCents', summary_record.paid_cents,
    'balanceCents', summary_record.balance_cents
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

-- Phase 4 supersedes the P0 zero-total-only close rule. The operational status
-- still closes independently; the gate is the reconstructable ledger balance.
CREATE OR REPLACE FUNCTION public.close_service_order(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_expected_version bigint,
  target_request_id uuid
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
  summary_record record;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  replay := public.claim_mobile_command(
    target_request_id, target_establishment_id, 'service_order.closed',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN RETURN replay; END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  order_record := public.lock_service_order_for_mutation(
    target_establishment_id, target_service_order_id, target_expected_version
  );
  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id, order_record.professional_id
  );
  IF order_record.status IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;
  SELECT * INTO summary_record
  FROM public.calculate_service_order_payment_summary(
    target_establishment_id, target_service_order_id
  );
  IF summary_record.balance_cents IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'service_order_balance_unresolved';
  END IF;

  UPDATE public.service_orders
  SET status = 'closed', closed_at = now(), closed_by = actor_id,
      updated_by = actor_id, updated_at = now(), version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;
  PERFORM public.insert_service_order_event(
    order_record.id, target_establishment_id, actor_id, 'closed',
    'awaiting_payment', 'closed',
    jsonb_build_object('paymentStatus', summary_record.payment_status)
  );
  result := public.build_service_order_mutation_response(
    order_record.id, order_record.status, order_record.version, NULL
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.list_establishment_payment_methods(uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.configure_establishment_payment_method(
  uuid, text, text, boolean, boolean, bigint, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_service_order_payment_summary(uuid, uuid)
  FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_order_payment(
  uuid, uuid, uuid, bigint, text, bigint, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.void_order_payment(
  uuid, uuid, uuid, text, bigint, uuid
) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_service_order(uuid, uuid, bigint, uuid)
  FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.list_establishment_payment_methods(uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.configure_establishment_payment_method(
  uuid, text, text, boolean, boolean, bigint, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_service_order_payment_summary(uuid, uuid)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_order_payment(
  uuid, uuid, uuid, bigint, text, bigint, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.void_order_payment(
  uuid, uuid, uuid, text, bigint, uuid
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_service_order(uuid, uuid, bigint, uuid)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.record_order_payment(
  uuid, uuid, uuid, bigint, text, bigint, uuid
) IS 'Records a declared manual POS payment in BRL integer cents. RPC only.';
COMMENT ON FUNCTION public.void_order_payment(
  uuid, uuid, uuid, text, bigint, uuid
) IS 'Appends a full compensating void entry; never rewrites the original payment.';

COMMIT;
