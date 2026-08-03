BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- P0 Etapa 2 — fundação de schema de comanda (service_orders).
-- Cria service_orders / service_order_items / service_order_events.
-- Não cria RPCs de ciclo operacional, pagamentos, caixa, comissão, provedor
-- nem coluna payment_status (estado financeiro permanece calculado).

-- ---------------------------------------------------------------------------
-- Constants (documented for CHECK reuse)
-- Safe integer upper bound aligned with TypeScript Number.MAX_SAFE_INTEGER.
-- ---------------------------------------------------------------------------
-- 9007199254740991

-- ---------------------------------------------------------------------------
-- service_orders
-- ---------------------------------------------------------------------------

CREATE TABLE public.service_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL
    REFERENCES public.establishments(id) ON DELETE RESTRICT,
  appointment_id text
    REFERENCES public.appointments(id) ON DELETE RESTRICT,
  establishment_client_id uuid
    REFERENCES public.establishment_clients(id) ON DELETE SET NULL,
  professional_id uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN (
      'open', 'in_service', 'awaiting_payment', 'closed', 'voided'
    )),
  currency text NOT NULL DEFAULT 'BRL'
    CHECK (currency = 'BRL'),
  subtotal_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  internal_notes text
    CHECK (
      internal_notes IS NULL
      OR char_length(internal_notes) <= 2000
    ),
  opened_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  closed_at timestamptz,
  voided_at timestamptz,
  void_reason text,
  created_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  started_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  finished_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  closed_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  voided_by uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  version bigint NOT NULL DEFAULT 1
    CHECK (version >= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_orders_id_establishment_uidx
    UNIQUE (id, establishment_id),
  CONSTRAINT service_orders_money_chk CHECK (
    subtotal_cents >= 0
    AND subtotal_cents <= 9007199254740991
    AND discount_cents >= 0
    AND discount_cents <= 9007199254740991
    AND total_cents >= 0
    AND total_cents <= 9007199254740991
    AND discount_cents <= subtotal_cents
    AND total_cents = (subtotal_cents - discount_cents)
  ),
  CONSTRAINT service_orders_status_timeline_chk CHECK (
    (
      status = 'open'
      AND started_at IS NULL
      AND finished_at IS NULL
      AND closed_at IS NULL
      AND voided_at IS NULL
      AND voided_by IS NULL
      AND (void_reason IS NULL OR btrim(void_reason) = '')
    )
    OR (
      status = 'in_service'
      AND started_at IS NOT NULL
      AND finished_at IS NULL
      AND closed_at IS NULL
      AND voided_at IS NULL
      AND voided_by IS NULL
      AND (void_reason IS NULL OR btrim(void_reason) = '')
    )
    OR (
      status = 'awaiting_payment'
      AND started_at IS NOT NULL
      AND finished_at IS NOT NULL
      AND closed_at IS NULL
      AND voided_at IS NULL
      AND voided_by IS NULL
      AND (void_reason IS NULL OR btrim(void_reason) = '')
    )
    OR (
      status = 'closed'
      AND started_at IS NOT NULL
      AND finished_at IS NOT NULL
      AND closed_at IS NOT NULL
      AND voided_at IS NULL
      AND voided_by IS NULL
      AND (void_reason IS NULL OR btrim(void_reason) = '')
    )
    OR (
      status = 'voided'
      AND voided_at IS NOT NULL
      AND voided_by IS NOT NULL
      AND void_reason IS NOT NULL
      AND char_length(btrim(void_reason)) BETWEEN 1 AND 500
      AND closed_at IS NULL
    )
  )
);

COMMENT ON TABLE public.service_orders IS
  'Commercial service order (comanda). Persists operational status only. '
  'Financial payment_status is calculated later from payments/refunds — '
  'never stored on this table.';

COMMENT ON COLUMN public.service_orders.subtotal_cents IS
  'Server-derived sum of item subtotals in integer cents. Never trust frontend.';
COMMENT ON COLUMN public.service_orders.discount_cents IS
  'Server-derived sum of item discounts in integer cents. Never trust frontend.';
COMMENT ON COLUMN public.service_orders.total_cents IS
  'Server-derived sum of item totals (= subtotal - discount). Never trust frontend.';
COMMENT ON COLUMN public.service_orders.status IS
  'Operational status only: open | in_service | awaiting_payment | closed | voided. '
  'Not payment/settlement state.';
COMMENT ON COLUMN public.service_orders.currency IS
  'P0 persisted currency. Operational support is BRL only.';

-- One historical service order per appointment (walk-ins with NULL allowed many).
-- Filter is appointment_id IS NOT NULL only — never status-based.
CREATE UNIQUE INDEX service_orders_one_per_appointment_idx
  ON public.service_orders (appointment_id)
  WHERE appointment_id IS NOT NULL;

CREATE INDEX service_orders_establishment_status_created_idx
  ON public.service_orders (establishment_id, status, created_at DESC, id);

CREATE INDEX service_orders_establishment_professional_created_idx
  ON public.service_orders (establishment_id, professional_id, created_at DESC);

CREATE INDEX service_orders_establishment_client_created_idx
  ON public.service_orders (establishment_id, establishment_client_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- service_order_items
-- ---------------------------------------------------------------------------

CREATE TABLE public.service_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  service_order_id uuid NOT NULL,
  establishment_id uuid NOT NULL,
  service_id text
    REFERENCES public.services(id) ON DELETE SET NULL,
  professional_id uuid
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  description_snapshot text NOT NULL
    CHECK (char_length(btrim(description_snapshot)) BETWEEN 1 AND 240),
  quantity integer NOT NULL DEFAULT 1
    CHECK (quantity BETWEEN 1 AND 999),
  unit_price_cents bigint NOT NULL
    CHECK (
      unit_price_cents >= 0
      AND unit_price_cents <= 9007199254740991
    ),
  discount_cents bigint NOT NULL DEFAULT 0
    CHECK (
      discount_cents >= 0
      AND discount_cents <= 9007199254740991
    ),
  subtotal_cents bigint GENERATED ALWAYS AS (
    (quantity::bigint * unit_price_cents)
  ) STORED,
  total_cents bigint GENERATED ALWAYS AS (
    (quantity::bigint * unit_price_cents) - discount_cents
  ) STORED,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  updated_by uuid NOT NULL
    REFERENCES public.profiles(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_order_items_order_tenant_fk
    FOREIGN KEY (service_order_id, establishment_id)
    REFERENCES public.service_orders(id, establishment_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_order_items_money_chk CHECK (
    (quantity::bigint * unit_price_cents) <= 9007199254740991
    AND discount_cents <= (quantity::bigint * unit_price_cents)
    AND ((quantity::bigint * unit_price_cents) - discount_cents) >= 0
  )
);

COMMENT ON TABLE public.service_order_items IS
  'Line items of a service order. subtotal_cents/total_cents are GENERATED '
  'server-side; clients must not supply them. description_snapshot is the '
  'historical label — never re-read live service name for history.';

COMMENT ON COLUMN public.service_order_items.metadata IS
  'Non-sensitive structured metadata object. Must not store PAN, CVV, '
  'card tokens, provider secrets, or SaaS billing payloads.';

CREATE INDEX service_order_items_order_sort_idx
  ON public.service_order_items (service_order_id, sort_order, id);

CREATE INDEX service_order_items_establishment_service_idx
  ON public.service_order_items (establishment_id, service_id);

CREATE INDEX service_order_items_establishment_professional_idx
  ON public.service_order_items (establishment_id, professional_id);

-- ---------------------------------------------------------------------------
-- service_order_events (append-only)
-- ---------------------------------------------------------------------------

CREATE TABLE public.service_order_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  service_order_id uuid NOT NULL,
  establishment_id uuid NOT NULL,
  actor_id uuid
    REFERENCES public.profiles(id) ON DELETE SET NULL,
  event_type text NOT NULL
    CHECK (event_type IN (
      'opened',
      'started',
      'item_upserted',
      'item_removed',
      'finished',
      'closed',
      'voided',
      'reopened'
    )),
  previous_status text
    CHECK (
      previous_status IS NULL
      OR previous_status IN (
        'open', 'in_service', 'awaiting_payment', 'closed', 'voided'
      )
    ),
  resulting_status text NOT NULL
    CHECK (resulting_status IN (
      'open', 'in_service', 'awaiting_payment', 'closed', 'voided'
    )),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_order_events_order_tenant_fk
    FOREIGN KEY (service_order_id, establishment_id)
    REFERENCES public.service_orders(id, establishment_id)
    ON DELETE RESTRICT,
  CONSTRAINT service_order_events_coherence_chk CHECK (
    (
      event_type = 'opened'
      AND previous_status IS NULL
      AND resulting_status = 'open'
    )
    OR (
      event_type = 'started'
      AND previous_status = 'open'
      AND resulting_status = 'in_service'
    )
    OR (
      event_type = 'item_upserted'
      AND previous_status IS NOT NULL
      AND previous_status = resulting_status
      AND previous_status IN ('open', 'in_service')
    )
    OR (
      event_type = 'item_removed'
      AND previous_status IS NOT NULL
      AND previous_status = resulting_status
      AND previous_status IN ('open', 'in_service')
    )
    OR (
      event_type = 'finished'
      AND previous_status = 'in_service'
      AND resulting_status = 'awaiting_payment'
    )
    OR (
      event_type = 'closed'
      AND previous_status = 'awaiting_payment'
      AND resulting_status = 'closed'
    )
    OR (
      event_type = 'voided'
      AND previous_status IN ('open', 'in_service', 'awaiting_payment')
      AND resulting_status = 'voided'
    )
    OR (
      event_type = 'reopened'
      AND previous_status = 'voided'
      AND resulting_status IN ('open', 'in_service', 'awaiting_payment')
    )
  )
);

COMMENT ON TABLE public.service_order_events IS
  'Immutable append-only audit log for service order lifecycle. '
  'Written by future SECURITY DEFINER RPCs (Etapa 3+); no app direct writes.';

COMMENT ON COLUMN public.service_order_events.metadata IS
  'Non-sensitive structured metadata object. Must not store PAN, CVV, '
  'card tokens, provider secrets, or SaaS billing payloads.';

CREATE INDEX service_order_events_order_created_idx
  ON public.service_order_events (service_order_id, created_at DESC, id DESC);

CREATE INDEX service_order_events_establishment_created_idx
  ON public.service_order_events (establishment_id, created_at DESC);

CREATE INDEX service_order_events_actor_created_idx
  ON public.service_order_events (actor_id, created_at DESC)
  WHERE actor_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- Tenant integrity (service_orders)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_service_order_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.appointment_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.appointments AS appointment
      WHERE appointment.id = NEW.appointment_id
        AND appointment.establishment_id = NEW.establishment_id
    ) THEN
      RAISE EXCEPTION 'service_order_appointment_tenant_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.establishment_client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.establishment_clients AS client
      WHERE client.id = NEW.establishment_client_id
        AND client.establishment_id = NEW.establishment_id
    ) THEN
      RAISE EXCEPTION 'service_order_client_tenant_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.professional_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.memberships AS membership
      WHERE membership.profile_id = NEW.professional_id
        AND membership.establishment_id = NEW.establishment_id
        AND membership.status = 'active'
    ) THEN
      RAISE EXCEPTION 'service_order_professional_tenant_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_service_order_tenant_integrity
  ON public.service_orders;
CREATE TRIGGER enforce_service_order_tenant_integrity
BEFORE INSERT OR UPDATE OF
  establishment_id,
  appointment_id,
  establishment_client_id,
  professional_id
ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.enforce_service_order_tenant_integrity();

REVOKE ALL ON FUNCTION public.enforce_service_order_tenant_integrity()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Tenant integrity (service_order_items)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_service_order_item_tenant_integrity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF NEW.service_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.services AS service
      WHERE service.id = NEW.service_id
        AND service.establishment_id = NEW.establishment_id
    ) THEN
      RAISE EXCEPTION 'service_order_item_service_tenant_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  IF NEW.professional_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.memberships AS membership
      WHERE membership.profile_id = NEW.professional_id
        AND membership.establishment_id = NEW.establishment_id
        AND membership.status = 'active'
    ) THEN
      RAISE EXCEPTION 'service_order_item_professional_tenant_mismatch'
        USING ERRCODE = '23514';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_service_order_item_tenant_integrity
  ON public.service_order_items;
CREATE TRIGGER enforce_service_order_item_tenant_integrity
BEFORE INSERT OR UPDATE OF
  establishment_id,
  service_order_id,
  service_id,
  professional_id
ON public.service_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_service_order_item_tenant_integrity();

REVOKE ALL ON FUNCTION public.enforce_service_order_item_tenant_integrity()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Item freeze when order is awaiting_payment / closed / voided
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_service_order_items_mutable()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  order_status text;
  target_order_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_order_id := OLD.service_order_id;
  ELSE
    target_order_id := NEW.service_order_id;
  END IF;

  SELECT service_order.status
  INTO order_status
  FROM public.service_orders AS service_order
  WHERE service_order.id = target_order_id
  FOR SHARE;

  IF order_status IS NULL THEN
    RAISE EXCEPTION 'service_order_items_frozen'
      USING ERRCODE = '23514';
  END IF;

  IF order_status NOT IN ('open', 'in_service') THEN
    RAISE EXCEPTION 'service_order_items_frozen'
      USING ERRCODE = '23514';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_service_order_items_mutable
  ON public.service_order_items;
CREATE TRIGGER enforce_service_order_items_mutable
BEFORE INSERT OR UPDATE OR DELETE ON public.service_order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_service_order_items_mutable();

REVOKE ALL ON FUNCTION public.enforce_service_order_items_mutable()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Server-side totals recalculation
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recalculate_service_order_totals(
  target_service_order_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  locked_id uuid;
  next_subtotal bigint;
  next_discount bigint;
  next_total bigint;
  max_safe constant bigint := 9007199254740991;
BEGIN
  IF target_service_order_id IS NULL THEN
    RAISE EXCEPTION 'service_order_totals_target_required'
      USING ERRCODE = '22023';
  END IF;

  SELECT service_order.id
  INTO locked_id
  FROM public.service_orders AS service_order
  WHERE service_order.id = target_service_order_id
  FOR UPDATE;

  IF locked_id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT
    COALESCE(SUM(item.subtotal_cents), 0),
    COALESCE(SUM(item.discount_cents), 0),
    COALESCE(SUM(item.total_cents), 0)
  INTO next_subtotal, next_discount, next_total
  FROM public.service_order_items AS item
  WHERE item.service_order_id = target_service_order_id;

  IF next_subtotal > max_safe
    OR next_discount > max_safe
    OR next_total > max_safe
    OR next_subtotal < 0
    OR next_discount < 0
    OR next_total < 0
    OR next_discount > next_subtotal
    OR next_total <> (next_subtotal - next_discount)
  THEN
    RAISE EXCEPTION 'service_order_totals_overflow'
      USING ERRCODE = '22003';
  END IF;

  UPDATE public.service_orders
  SET
    subtotal_cents = next_subtotal,
    discount_cents = next_discount,
    total_cents = next_total,
    updated_at = now(),
    version = version + 1
  WHERE id = target_service_order_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalculate_service_order_totals()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.recalculate_service_order_totals(OLD.service_order_id);
    RETURN OLD;
  END IF;

  PERFORM public.recalculate_service_order_totals(NEW.service_order_id);

  IF TG_OP = 'UPDATE'
    AND OLD.service_order_id IS DISTINCT FROM NEW.service_order_id
  THEN
    PERFORM public.recalculate_service_order_totals(OLD.service_order_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_recalculate_service_order_totals
  ON public.service_order_items;
CREATE TRIGGER trg_recalculate_service_order_totals
AFTER INSERT OR UPDATE OR DELETE ON public.service_order_items
FOR EACH ROW
EXECUTE FUNCTION public.trg_recalculate_service_order_totals();

REVOKE ALL ON FUNCTION public.recalculate_service_order_totals(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.trg_recalculate_service_order_totals()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Immutability: no physical DELETE of service_orders; events append-only
-- Reuses reject_immutable_mobile_record() which raises '<table>_is_immutable'.
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS service_orders_reject_delete ON public.service_orders;
CREATE TRIGGER service_orders_reject_delete
BEFORE DELETE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.reject_immutable_mobile_record();

DROP TRIGGER IF EXISTS service_order_events_immutable
  ON public.service_order_events;
CREATE TRIGGER service_order_events_immutable
BEFORE UPDATE OR DELETE ON public.service_order_events
FOR EACH ROW
EXECUTE FUNCTION public.reject_immutable_mobile_record();

-- ---------------------------------------------------------------------------
-- updated_at helpers (existing handle_updated_at)
-- ---------------------------------------------------------------------------

DROP TRIGGER IF EXISTS service_orders_updated_at ON public.service_orders;
CREATE TRIGGER service_orders_updated_at
BEFORE UPDATE ON public.service_orders
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS service_order_items_updated_at
  ON public.service_order_items;
CREATE TRIGGER service_order_items_updated_at
BEFORE UPDATE ON public.service_order_items
FOR EACH ROW
EXECUTE FUNCTION public.handle_updated_at();

-- ---------------------------------------------------------------------------
-- RLS / grants — no direct anon/authenticated write or read
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_order_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.service_orders FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_order_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.service_order_events FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE ON TABLE public.service_orders TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.service_order_items
  TO service_role;
GRANT SELECT, INSERT ON TABLE public.service_order_events TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.service_order_events_id_seq
  TO service_role;

COMMIT;
