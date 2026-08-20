BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Cash operations are independent from billing_* (CutSync SaaS billing).
-- Amounts use integer cents. Movements/events are append-only; commission,
-- provider reconciliation and fiscal flows remain outside this phase.

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
        'paidCents', 'balanceCents', 'cashSessionId', 'cashMovementId',
        'expectedCountCents', 'declaredCountCents', 'varianceCents'
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
      SELECT 1 FROM unnest(ARRAY[
        'serviceOrderId', 'serviceOrderItemId', 'paymentMethodId', 'paymentEntryId',
        'cashSessionId', 'cashMovementId'
      ]::text[]) AS uuid_key
      WHERE value ? uuid_key AND (
        jsonb_typeof(value->uuid_key) <> 'string'
        OR (value->>uuid_key) !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    )
    AND NOT EXISTS (
      SELECT 1 FROM unnest(ARRAY[
        'paidCents', 'balanceCents', 'expectedCountCents', 'declaredCountCents'
      ]::text[]) AS cents_key
      WHERE value ? cents_key AND (
        jsonb_typeof(value->cents_key) <> 'number'
        OR (value->>cents_key) !~ '^[0-9]+$'
        OR (value->>cents_key)::numeric > 9007199254740991
      )
    )
    AND (
      NOT (value ? 'varianceCents') OR (
        jsonb_typeof(value->'varianceCents') = 'number'
        AND (value->>'varianceCents') ~ '^-?[0-9]+$'
        AND abs((value->>'varianceCents')::numeric) <= 9007199254740991
      )
    )
    AND (
      NOT (value ? 'paymentStatus') OR (
        jsonb_typeof(value->'paymentStatus') = 'string'
        AND value->>'paymentStatus' IN ('unpaid', 'partially_paid', 'paid', 'partially_refunded', 'refunded')
      )
    );
$$;

CREATE TABLE public.cash_registers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL UNIQUE REFERENCES public.establishments(id) ON DELETE RESTRICT,
  name text NOT NULL DEFAULT 'Caixa principal' CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  active boolean NOT NULL DEFAULT true,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  created_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (id, establishment_id)
);

CREATE TABLE public.cash_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_register_id uuid NOT NULL,
  establishment_id uuid NOT NULL,
  status text NOT NULL CHECK (status IN ('open', 'closed')),
  opening_float_cents bigint NOT NULL CHECK (opening_float_cents BETWEEN 0 AND 9007199254740991),
  expected_count_cents bigint CHECK (expected_count_cents IS NULL OR expected_count_cents BETWEEN 0 AND 9007199254740991),
  declared_count_cents bigint CHECK (declared_count_cents IS NULL OR declared_count_cents BETWEEN 0 AND 9007199254740991),
  variance_cents bigint,
  opened_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  closed_by uuid REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reopened_from_session_id uuid REFERENCES public.cash_sessions(id) ON DELETE RESTRICT,
  open_request_id uuid NOT NULL UNIQUE,
  close_request_id uuid UNIQUE,
  version bigint NOT NULL DEFAULT 1 CHECK (version >= 1),
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cash_register_id, establishment_id)
    REFERENCES public.cash_registers(id, establishment_id) ON DELETE RESTRICT,
  UNIQUE (id, cash_register_id, establishment_id),
  CHECK (
    (status = 'open' AND expected_count_cents IS NULL AND declared_count_cents IS NULL
      AND variance_cents IS NULL AND closed_by IS NULL AND close_request_id IS NULL AND closed_at IS NULL)
    OR
    (status = 'closed' AND expected_count_cents IS NOT NULL AND declared_count_cents IS NOT NULL
      AND variance_cents IS NOT NULL AND closed_by IS NOT NULL AND close_request_id IS NOT NULL AND closed_at IS NOT NULL)
  )
);

CREATE UNIQUE INDEX cash_sessions_one_open_per_register_idx
  ON public.cash_sessions(cash_register_id) WHERE status = 'open';
CREATE INDEX cash_sessions_register_opened_idx
  ON public.cash_sessions(cash_register_id, opened_at DESC, id DESC);

CREATE TABLE public.cash_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cash_session_id uuid NOT NULL,
  cash_register_id uuid NOT NULL,
  establishment_id uuid NOT NULL,
  movement_type text NOT NULL CHECK (movement_type IN ('cash_in', 'cash_out', 'sale_cash', 'refund_cash')),
  amount_cents bigint NOT NULL CHECK (amount_cents > 0 AND amount_cents <= 9007199254740991),
  reason text CHECK (reason IS NULL OR char_length(btrim(reason)) BETWEEN 3 AND 500),
  source_payment_entry_id uuid REFERENCES public.order_payment_entries(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  recorded_by uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cash_session_id, cash_register_id, establishment_id)
    REFERENCES public.cash_sessions(id, cash_register_id, establishment_id) ON DELETE RESTRICT,
  CHECK (
    (movement_type IN ('cash_in', 'cash_out') AND source_payment_entry_id IS NULL AND reason IS NOT NULL)
    OR (movement_type = 'sale_cash' AND source_payment_entry_id IS NOT NULL AND reason IS NULL)
    OR (movement_type = 'refund_cash' AND source_payment_entry_id IS NOT NULL AND reason IS NOT NULL)
  )
);

CREATE UNIQUE INDEX cash_movements_payment_entry_idx
  ON public.cash_movements(source_payment_entry_id) WHERE source_payment_entry_id IS NOT NULL;
CREATE INDEX cash_movements_session_created_idx
  ON public.cash_movements(cash_session_id, created_at, id);

CREATE TABLE public.cash_session_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  cash_session_id uuid NOT NULL,
  cash_register_id uuid NOT NULL,
  establishment_id uuid NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('opened', 'closed', 'reopened')),
  actor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  request_id uuid NOT NULL UNIQUE,
  correlation_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (cash_session_id, cash_register_id, establishment_id)
    REFERENCES public.cash_sessions(id, cash_register_id, establishment_id) ON DELETE RESTRICT
);

CREATE INDEX cash_session_events_session_created_idx
  ON public.cash_session_events(cash_session_id, created_at, id);

COMMENT ON TABLE public.cash_registers IS 'One operational cash register per establishment, separate from billing_*.';
COMMENT ON TABLE public.cash_sessions IS 'Versioned open/close lifecycle with declared, expected and variance amounts in integer cents.';
COMMENT ON TABLE public.cash_movements IS 'Append-only cash ledger with compensating movements for cash payment voids.';

CREATE OR REPLACE FUNCTION public.prevent_cash_ledger_change()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RAISE EXCEPTION 'cash_ledger_append_only' USING ERRCODE = '55000';
END;
$$;

CREATE TRIGGER prevent_cash_movement_change BEFORE UPDATE OR DELETE ON public.cash_movements
FOR EACH ROW EXECUTE FUNCTION public.prevent_cash_ledger_change();
CREATE TRIGGER prevent_cash_session_event_change BEFORE UPDATE OR DELETE ON public.cash_session_events
FOR EACH ROW EXECUTE FUNCTION public.prevent_cash_ledger_change();

CREATE OR REPLACE FUNCTION public.ensure_main_cash_register(target_establishment_id uuid, target_actor_id uuid DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE register_id uuid;
BEGIN
  INSERT INTO public.cash_registers(establishment_id, name, created_by, updated_by)
  VALUES (target_establishment_id, 'Caixa principal', target_actor_id, target_actor_id)
  ON CONFLICT (establishment_id) DO NOTHING;
  SELECT register.id INTO register_id FROM public.cash_registers AS register
  WHERE register.establishment_id = target_establishment_id;
  RETURN register_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.initialize_establishment_cash_register()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
BEGIN
  PERFORM public.ensure_main_cash_register(NEW.id, NULL);
  RETURN NEW;
END;
$$;

CREATE TRIGGER initialize_establishment_cash_register_trigger AFTER INSERT ON public.establishments
FOR EACH ROW EXECUTE FUNCTION public.initialize_establishment_cash_register();

INSERT INTO public.cash_registers(establishment_id, name)
SELECT establishment.id, 'Caixa principal' FROM public.establishments AS establishment
ON CONFLICT (establishment_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.calculate_cash_session_expected_count(target_cash_session_id uuid)
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
  SELECT session.opening_float_cents + COALESCE(sum(CASE movement.movement_type
    WHEN 'cash_in' THEN movement.amount_cents WHEN 'sale_cash' THEN movement.amount_cents
    WHEN 'cash_out' THEN -movement.amount_cents WHEN 'refund_cash' THEN -movement.amount_cents END), 0)::bigint
  FROM public.cash_sessions AS session
  LEFT JOIN public.cash_movements AS movement ON movement.cash_session_id = session.id
  WHERE session.id = target_cash_session_id
  GROUP BY session.id, session.opening_float_cents;
$$;

CREATE OR REPLACE FUNCTION public.get_cash_register_snapshot(target_establishment_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  register_record public.cash_registers%ROWTYPE;
  session_record public.cash_sessions%ROWTYPE;
  expected_cents bigint;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'view_cash', 'full')
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO register_record FROM public.cash_registers AS register
  WHERE register.establishment_id = target_establishment_id;
  IF register_record.id IS NULL THEN RAISE EXCEPTION 'cash_register_unavailable'; END IF;
  SELECT * INTO session_record FROM public.cash_sessions AS session
  WHERE session.cash_register_id = register_record.id
  ORDER BY (session.status = 'open') DESC, session.opened_at DESC, session.id DESC LIMIT 1;
  IF session_record.id IS NOT NULL THEN
    expected_cents := CASE WHEN session_record.status = 'closed' THEN session_record.expected_count_cents
      ELSE public.calculate_cash_session_expected_count(session_record.id) END;
  END IF;
  RETURN jsonb_build_object(
    'establishmentId', target_establishment_id, 'cashRegisterId', register_record.id,
    'cashRegisterName', register_record.name, 'dataCutoffAt', statement_timestamp(),
    'correlationId', gen_random_uuid(),
    'session', CASE WHEN session_record.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', session_record.id, 'status', session_record.status,
      'openingFloatCents', session_record.opening_float_cents,
      'expectedCountCents', expected_cents, 'declaredCountCents', session_record.declared_count_cents,
      'varianceCents', session_record.variance_cents, 'openedBy', session_record.opened_by,
      'closedBy', session_record.closed_by, 'reopenedFromSessionId', session_record.reopened_from_session_id,
      'version', session_record.version, 'openedAt', session_record.opened_at, 'closedAt', session_record.closed_at) END,
    'movements', CASE WHEN session_record.id IS NULL THEN '[]'::jsonb ELSE COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', movement.id, 'movementType', movement.movement_type, 'amountCents', movement.amount_cents,
        'reason', movement.reason, 'sourcePaymentEntryId', movement.source_payment_entry_id,
        'correlationId', movement.correlation_id, 'recordedBy', movement.recorded_by,
        'createdAt', movement.created_at) ORDER BY movement.created_at DESC, movement.id DESC)
      FROM public.cash_movements AS movement WHERE movement.cash_session_id = session_record.id
    ), '[]'::jsonb) END);
END;
$$;

CREATE OR REPLACE FUNCTION public.open_cash_session(target_establishment_id uuid, target_opening_float_cents bigint, target_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid()); replay jsonb; register_id uuid;
  session_record public.cash_sessions%ROWTYPE; result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_opening_float_cents IS NULL OR target_opening_float_cents < 0 OR target_opening_float_cents > 9007199254740991
  THEN RAISE EXCEPTION 'invalid_cash_amount'; END IF;
  replay := public.claim_mobile_command(target_request_id, target_establishment_id, 'cash_session.opened',
    jsonb_build_object('openingFloatCents', target_opening_float_cents));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'operate_cash', 'full')
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  register_id := public.ensure_main_cash_register(target_establishment_id, actor_id);
  PERFORM 1 FROM public.cash_registers WHERE id = register_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE cash_register_id = register_id AND status = 'open')
  THEN RAISE EXCEPTION 'cash_session_already_open'; END IF;
  INSERT INTO public.cash_sessions(cash_register_id, establishment_id, status, opening_float_cents, opened_by, open_request_id)
  VALUES (register_id, target_establishment_id, 'open', target_opening_float_cents, actor_id, target_request_id)
  RETURNING * INTO session_record;
  INSERT INTO public.cash_session_events(cash_session_id, cash_register_id, establishment_id, event_type, actor_id, request_id, correlation_id, metadata)
  VALUES (session_record.id, register_id, target_establishment_id, 'opened', actor_id, target_request_id, target_request_id,
    jsonb_build_object('openingFloatCents', target_opening_float_cents));
  result := jsonb_build_object('cashSessionId', session_record.id, 'status', 'open', 'version', 1,
    'expectedCountCents', target_opening_float_cents);
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement(
  target_establishment_id uuid, target_cash_session_id uuid, target_movement_type text,
  target_amount_cents bigint, target_reason text, target_expected_version bigint, target_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid()); replay jsonb; session_record public.cash_sessions%ROWTYPE;
  movement_id uuid; expected_cents bigint; result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_movement_type NOT IN ('cash_in', 'cash_out') OR target_amount_cents IS NULL
    OR target_amount_cents <= 0 OR target_amount_cents > 9007199254740991
    OR char_length(btrim(COALESCE(target_reason, ''))) NOT BETWEEN 3 AND 500
  THEN RAISE EXCEPTION 'invalid_cash_movement'; END IF;
  replay := public.claim_mobile_command(target_request_id, target_establishment_id, 'cash_movement.recorded',
    jsonb_build_object('cashSessionId', target_cash_session_id, 'movementType', target_movement_type,
      'amountCents', target_amount_cents, 'reason', btrim(target_reason), 'expectedVersion', target_expected_version));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'operate_cash', 'full')
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO session_record FROM public.cash_sessions AS session
  WHERE session.id = target_cash_session_id AND session.establishment_id = target_establishment_id FOR UPDATE;
  IF session_record.id IS NULL OR session_record.status <> 'open' THEN RAISE EXCEPTION 'cash_session_not_open'; END IF;
  IF session_record.version IS DISTINCT FROM target_expected_version THEN RAISE EXCEPTION 'cash_session_version_conflict'; END IF;
  INSERT INTO public.cash_movements(cash_session_id, cash_register_id, establishment_id, movement_type,
    amount_cents, reason, request_id, correlation_id, recorded_by)
  VALUES (session_record.id, session_record.cash_register_id, target_establishment_id, target_movement_type,
    target_amount_cents, btrim(target_reason), target_request_id, target_request_id, actor_id)
  RETURNING id INTO movement_id;
  UPDATE public.cash_sessions SET version = version + 1, updated_at = now() WHERE id = session_record.id
  RETURNING * INTO session_record;
  expected_cents := public.calculate_cash_session_expected_count(session_record.id);
  IF expected_cents < 0 THEN RAISE EXCEPTION 'cash_balance_negative'; END IF;
  result := jsonb_build_object('cashSessionId', session_record.id, 'cashMovementId', movement_id,
    'status', 'open', 'version', session_record.version, 'expectedCountCents', expected_cents);
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.close_cash_session(
  target_establishment_id uuid, target_cash_session_id uuid, target_declared_count_cents bigint,
  target_expected_version bigint, target_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid()); replay jsonb; session_record public.cash_sessions%ROWTYPE;
  expected_cents bigint; result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_declared_count_cents IS NULL OR target_declared_count_cents < 0 OR target_declared_count_cents > 9007199254740991
  THEN RAISE EXCEPTION 'invalid_cash_amount'; END IF;
  replay := public.claim_mobile_command(target_request_id, target_establishment_id, 'cash_session.closed',
    jsonb_build_object('cashSessionId', target_cash_session_id, 'declaredCountCents', target_declared_count_cents,
      'expectedVersion', target_expected_version));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'close_cash', 'full')
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  SELECT * INTO session_record FROM public.cash_sessions AS session
  WHERE session.id = target_cash_session_id AND session.establishment_id = target_establishment_id FOR UPDATE;
  IF session_record.id IS NULL OR session_record.status <> 'open' THEN RAISE EXCEPTION 'cash_session_not_open'; END IF;
  IF session_record.version IS DISTINCT FROM target_expected_version THEN RAISE EXCEPTION 'cash_session_version_conflict'; END IF;
  expected_cents := public.calculate_cash_session_expected_count(session_record.id);
  IF expected_cents < 0 THEN RAISE EXCEPTION 'cash_balance_negative'; END IF;
  UPDATE public.cash_sessions SET status = 'closed', expected_count_cents = expected_cents,
    declared_count_cents = target_declared_count_cents, variance_cents = target_declared_count_cents - expected_cents,
    closed_by = actor_id, close_request_id = target_request_id, closed_at = now(), updated_at = now(), version = version + 1
  WHERE id = session_record.id RETURNING * INTO session_record;
  INSERT INTO public.cash_session_events(cash_session_id, cash_register_id, establishment_id, event_type,
    actor_id, request_id, correlation_id, metadata)
  VALUES (session_record.id, session_record.cash_register_id, target_establishment_id, 'closed', actor_id,
    target_request_id, target_request_id, jsonb_build_object('expectedCountCents', expected_cents,
      'declaredCountCents', target_declared_count_cents, 'varianceCents', target_declared_count_cents - expected_cents));
  result := jsonb_build_object('cashSessionId', session_record.id, 'status', 'closed', 'version', session_record.version,
    'expectedCountCents', expected_cents, 'declaredCountCents', target_declared_count_cents,
    'varianceCents', target_declared_count_cents - expected_cents);
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.reopen_cash_session(
  target_establishment_id uuid, target_closed_cash_session_id uuid,
  target_expected_version bigint, target_request_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid()); replay jsonb; closed_session public.cash_sessions%ROWTYPE;
  new_session public.cash_sessions%ROWTYPE; result jsonb;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  replay := public.claim_mobile_command(target_request_id, target_establishment_id, 'cash_session.reopened',
    jsonb_build_object('closedCashSessionId', target_closed_cash_session_id, 'expectedVersion', target_expected_version));
  IF replay IS NOT NULL THEN RETURN replay; END IF;
  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, actor_id, 'reopen_cash', 'full')
  THEN RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501'; END IF;
  IF NOT public.current_session_is_aal2() THEN RAISE EXCEPTION 'aal2_required' USING ERRCODE = '42501'; END IF;
  SELECT * INTO closed_session FROM public.cash_sessions AS session
  WHERE session.id = target_closed_cash_session_id AND session.establishment_id = target_establishment_id FOR UPDATE;
  IF closed_session.id IS NULL OR closed_session.status <> 'closed' THEN RAISE EXCEPTION 'cash_session_not_closed'; END IF;
  IF closed_session.version IS DISTINCT FROM target_expected_version THEN RAISE EXCEPTION 'cash_session_version_conflict'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_sessions WHERE cash_register_id = closed_session.cash_register_id AND status = 'open')
  THEN RAISE EXCEPTION 'cash_session_already_open'; END IF;
  IF EXISTS (SELECT 1 FROM public.cash_sessions AS later WHERE later.cash_register_id = closed_session.cash_register_id
    AND (later.opened_at, later.id) > (closed_session.opened_at, closed_session.id))
  THEN RAISE EXCEPTION 'cash_session_not_latest'; END IF;
  INSERT INTO public.cash_sessions(cash_register_id, establishment_id, status, opening_float_cents,
    opened_by, reopened_from_session_id, open_request_id)
  VALUES (closed_session.cash_register_id, target_establishment_id, 'open', closed_session.declared_count_cents,
    actor_id, closed_session.id, target_request_id) RETURNING * INTO new_session;
  INSERT INTO public.cash_session_events(cash_session_id, cash_register_id, establishment_id, event_type,
    actor_id, request_id, correlation_id, metadata)
  VALUES (new_session.id, new_session.cash_register_id, target_establishment_id, 'reopened', actor_id,
    target_request_id, target_request_id, jsonb_build_object('closedCashSessionId', closed_session.id));
  result := jsonb_build_object('cashSessionId', new_session.id, 'status', 'open', 'version', 1,
    'expectedCountCents', new_session.opening_float_cents);
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_cash_movement_for_payment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public AS $$
DECLARE session_record public.cash_sessions%ROWTYPE;
BEGIN
  IF NEW.status <> 'succeeded' OR NEW.method_type_snapshot <> 'cash' THEN RETURN NEW; END IF;
  SELECT * INTO session_record FROM public.cash_sessions AS session
  WHERE session.establishment_id = NEW.establishment_id AND session.status = 'open' FOR UPDATE;
  IF session_record.id IS NULL THEN RAISE EXCEPTION 'cash_session_required'; END IF;
  INSERT INTO public.cash_movements(cash_session_id, cash_register_id, establishment_id, movement_type,
    amount_cents, reason, source_payment_entry_id, request_id, correlation_id, recorded_by)
  VALUES (session_record.id, session_record.cash_register_id, NEW.establishment_id,
    CASE NEW.entry_type WHEN 'payment' THEN 'sale_cash' ELSE 'refund_cash' END, NEW.amount_cents,
    CASE NEW.entry_type WHEN 'void' THEN NEW.reason ELSE NULL END, NEW.id, NEW.request_id, NEW.correlation_id, NEW.recorded_by);
  IF public.calculate_cash_session_expected_count(session_record.id) < 0
  THEN RAISE EXCEPTION 'cash_balance_negative'; END IF;
  UPDATE public.cash_sessions SET version = version + 1, updated_at = now() WHERE id = session_record.id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER record_order_payment_cash_movement AFTER INSERT ON public.order_payment_entries
FOR EACH ROW EXECUTE FUNCTION public.record_cash_movement_for_payment();

ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_session_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cash_registers, public.cash_sessions, public.cash_movements, public.cash_session_events
  FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cash_registers, public.cash_sessions TO service_role;
GRANT SELECT, INSERT ON public.cash_movements, public.cash_session_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.cash_session_events_id_seq TO service_role;

REVOKE ALL ON FUNCTION public.prevent_cash_ledger_change() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ensure_main_cash_register(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.initialize_establishment_cash_register() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.calculate_cash_session_expected_count(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.record_cash_movement_for_payment() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_cash_register_snapshot(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.open_cash_session(uuid, bigint, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_cash_movement(uuid, uuid, text, bigint, text, bigint, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.close_cash_session(uuid, uuid, bigint, bigint, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reopen_cash_session(uuid, uuid, bigint, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_cash_register_snapshot(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_cash_session(uuid, bigint, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_cash_movement(uuid, uuid, text, bigint, text, bigint, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.close_cash_session(uuid, uuid, bigint, bigint, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reopen_cash_session(uuid, uuid, bigint, uuid) TO authenticated, service_role;

COMMIT;
