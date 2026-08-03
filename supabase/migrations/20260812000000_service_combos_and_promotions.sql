BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- ---------------------------------------------------------------------------
-- Combos: services.kind + composition table
-- ---------------------------------------------------------------------------

ALTER TABLE public.services
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'single';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'services_kind_check'
      AND conrelid = 'public.services'::regclass
  ) THEN
    ALTER TABLE public.services
      ADD CONSTRAINT services_kind_check
      CHECK (kind IN ('single', 'combo'));
  END IF;
END $$;

COMMENT ON COLUMN public.services.kind IS
  'single = atomic service; combo = packaged offer with service_combo_items members.';

CREATE TABLE IF NOT EXISTS public.service_combo_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  combo_id text NOT NULL REFERENCES public.services(id) ON DELETE CASCADE,
  service_id text NOT NULL REFERENCES public.services(id) ON DELETE RESTRICT,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_combo_items_unique_member UNIQUE (combo_id, service_id),
  CONSTRAINT service_combo_items_no_self CHECK (combo_id <> service_id)
);

CREATE INDEX IF NOT EXISTS service_combo_items_combo_idx
  ON public.service_combo_items (combo_id, sort_order);

CREATE INDEX IF NOT EXISTS service_combo_items_member_idx
  ON public.service_combo_items (service_id);

COMMENT ON TABLE public.service_combo_items IS
  'Members of a combo service. Combo price/duration live on services; members drive savings UI and pause warnings.';

-- ---------------------------------------------------------------------------
-- Weekly promotions
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.service_promotions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  establishment_id uuid NOT NULL REFERENCES public.establishments(id) ON DELETE CASCADE,
  service_id text NULL REFERENCES public.services(id) ON DELETE CASCADE,
  days_of_week integer[] NOT NULL,
  discount_type text NOT NULL,
  value numeric(12, 2) NOT NULL,
  starts_at date NOT NULL DEFAULT (CURRENT_DATE),
  ends_at date NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT service_promotions_discount_type_check
    CHECK (discount_type IN ('percent', 'fixed_price')),
  CONSTRAINT service_promotions_value_check CHECK (value >= 0),
  CONSTRAINT service_promotions_percent_check
    CHECK (discount_type <> 'percent' OR (value > 0 AND value <= 100)),
  CONSTRAINT service_promotions_days_check
    CHECK (
      cardinality(days_of_week) > 0
      AND days_of_week <@ ARRAY[0, 1, 2, 3, 4, 5, 6]
    ),
  CONSTRAINT service_promotions_range_check
    CHECK (ends_at IS NULL OR ends_at >= starts_at)
);

CREATE INDEX IF NOT EXISTS service_promotions_establishment_idx
  ON public.service_promotions (establishment_id, is_active)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS service_promotions_service_idx
  ON public.service_promotions (service_id)
  WHERE service_id IS NOT NULL;

COMMENT ON TABLE public.service_promotions IS
  'Weekday promotions. service_id NULL applies to all services in the establishment.';
COMMENT ON COLUMN public.service_promotions.days_of_week IS
  'Postgres DOW: 0=Sunday … 6=Saturday.';

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

ALTER TABLE public.service_combo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.service_promotions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public read combo items of active services" ON public.service_combo_items;
CREATE POLICY "Public read combo items of active services"
ON public.service_combo_items
FOR SELECT
TO anon, authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.services AS combo
    WHERE combo.id = service_combo_items.combo_id
      AND combo.deleted_at IS NULL
      AND combo.is_active = true
  )
);

DROP POLICY IF EXISTS "Business manage combo items" ON public.service_combo_items;
CREATE POLICY "Business manage combo items"
ON public.service_combo_items
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.services AS combo
    WHERE combo.id = service_combo_items.combo_id
      AND (
        public.is_superadmin()
        OR public.has_business_capability(combo.establishment_id, 'manage_services')
        OR public.has_active_membership(combo.establishment_id, ARRAY['admin'])
      )
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.services AS combo
    WHERE combo.id = service_combo_items.combo_id
      AND (
        public.is_superadmin()
        OR public.has_business_capability(combo.establishment_id, 'manage_services')
        OR public.has_active_membership(combo.establishment_id, ARRAY['admin'])
      )
  )
);

DROP POLICY IF EXISTS "Public read active promotions" ON public.service_promotions;
CREATE POLICY "Public read active promotions"
ON public.service_promotions
FOR SELECT
TO anon, authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Business manage promotions" ON public.service_promotions;
CREATE POLICY "Business manage promotions"
ON public.service_promotions
FOR ALL
TO authenticated
USING (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'manage_services')
  OR public.has_active_membership(establishment_id, ARRAY['admin'])
)
WITH CHECK (
  public.is_superadmin()
  OR public.has_business_capability(establishment_id, 'manage_services')
  OR public.has_active_membership(establishment_id, ARRAY['admin'])
);

-- ---------------------------------------------------------------------------
-- Effective price engine
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_effective_price(
  target_service_id text,
  target_local_date date,
  target_professional_id uuid DEFAULT NULL
)
RETURNS TABLE (
  service_id text,
  establishment_id uuid,
  kind text,
  list_price numeric,
  effective_price numeric,
  duration_minutes integer,
  discount_type text,
  discount_value numeric,
  promotion_id uuid,
  savings numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  service_row public.services%ROWTYPE;
  professional_price numeric(12, 2);
  professional_duration integer;
  resolved_list numeric(12, 2);
  resolved_duration integer;
  promo public.service_promotions%ROWTYPE;
  day_of_week integer;
  candidate_price numeric(12, 2);
BEGIN
  SELECT * INTO service_row
  FROM public.services AS service
  WHERE service.id = target_service_id
    AND service.deleted_at IS NULL;

  IF service_row.id IS NULL THEN
    RAISE EXCEPTION 'service_unavailable';
  END IF;

  IF target_professional_id IS NOT NULL THEN
    SELECT professional_service.price, professional_service.duration_minutes
    INTO professional_price, professional_duration
    FROM public.professional_services AS professional_service
    WHERE professional_service.professional_id = target_professional_id
      AND professional_service.service_id = target_service_id
      AND professional_service.establishment_id = service_row.establishment_id
      AND professional_service.is_active = true
    LIMIT 1;
  END IF;

  resolved_list := COALESCE(professional_price, service_row.price);
  resolved_duration := COALESCE(professional_duration, service_row.duration_minutes);
  day_of_week := EXTRACT(DOW FROM target_local_date)::integer;

  -- Prefer service-specific promo; otherwise establishment-wide. Highest absolute discount wins.
  SELECT promotion.* INTO promo
  FROM public.service_promotions AS promotion
  WHERE promotion.establishment_id = service_row.establishment_id
    AND promotion.is_active = true
    AND (promotion.service_id IS NULL OR promotion.service_id = target_service_id)
    AND target_local_date >= promotion.starts_at
    AND (promotion.ends_at IS NULL OR target_local_date <= promotion.ends_at)
    AND day_of_week = ANY (promotion.days_of_week)
  ORDER BY
    CASE WHEN promotion.service_id IS NOT NULL THEN 0 ELSE 1 END,
    CASE
      WHEN promotion.discount_type = 'fixed_price'
        THEN GREATEST(resolved_list - promotion.value, 0)
      ELSE resolved_list * (promotion.value / 100.0)
    END DESC,
    promotion.created_at DESC
  LIMIT 1;

  IF promo.id IS NULL THEN
    service_id := service_row.id;
    establishment_id := service_row.establishment_id;
    kind := service_row.kind;
    list_price := resolved_list;
    effective_price := resolved_list;
    duration_minutes := resolved_duration;
    discount_type := NULL;
    discount_value := NULL;
    promotion_id := NULL;
    savings := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  IF promo.discount_type = 'fixed_price' THEN
    candidate_price := LEAST(resolved_list, promo.value);
  ELSE
    candidate_price := ROUND(resolved_list * (1 - (promo.value / 100.0)), 2);
  END IF;
  candidate_price := GREATEST(candidate_price, 0);

  service_id := service_row.id;
  establishment_id := service_row.establishment_id;
  kind := service_row.kind;
  list_price := resolved_list;
  effective_price := candidate_price;
  duration_minutes := resolved_duration;
  discount_type := promo.discount_type;
  discount_value := promo.value;
  promotion_id := promo.id;
  savings := GREATEST(resolved_list - candidate_price, 0);
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_establishment_service_prices(
  target_establishment_id uuid,
  target_local_date date DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  service_id text,
  kind text,
  name text,
  list_price numeric,
  effective_price numeric,
  duration_minutes integer,
  discount_type text,
  discount_value numeric,
  promotion_id uuid,
  savings numeric,
  members_total numeric,
  is_active boolean,
  sort_order integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    service.id,
    service.kind,
    service.name,
    pricing.list_price,
    pricing.effective_price,
    pricing.duration_minutes,
    pricing.discount_type,
    pricing.discount_value,
    pricing.promotion_id,
    pricing.savings,
    CASE
      WHEN service.kind = 'combo' THEN COALESCE((
        SELECT sum(member.price)
        FROM public.service_combo_items AS item
        JOIN public.services AS member ON member.id = item.service_id
        WHERE item.combo_id = service.id
          AND member.deleted_at IS NULL
      ), 0)
      ELSE NULL
    END AS members_total,
    service.is_active,
    service.sort_order
  FROM public.services AS service
  CROSS JOIN LATERAL public.get_effective_price(service.id, target_local_date, NULL) AS pricing
  WHERE service.establishment_id = target_establishment_id
    AND service.deleted_at IS NULL
  ORDER BY service.sort_order, service.name;
END;
$$;

-- Snapshot trigger uses effective price for the appointment's local day.
CREATE OR REPLACE FUNCTION public.set_appointment_duration_snapshot()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  resolved_duration integer;
  resolved_price numeric(12, 2);
  target_timezone text;
  local_date date;
  pricing record;
BEGIN
  IF TG_OP = 'INSERT'
    OR NEW.service_id IS DISTINCT FROM OLD.service_id
    OR NEW.professional_id IS DISTINCT FROM OLD.professional_id
    OR NEW.date_time IS DISTINCT FROM OLD.date_time
    OR NEW.duration_minutes IS NULL
    OR NEW.price_charged IS NULL
  THEN
    SELECT establishment.timezone INTO target_timezone
    FROM public.establishments AS establishment
    WHERE establishment.id = NEW.establishment_id;
    IF target_timezone IS NULL THEN
      RAISE EXCEPTION 'establishment_not_found';
    END IF;

    local_date := (NEW.date_time AT TIME ZONE target_timezone)::date;

    SELECT *
    INTO pricing
    FROM public.get_effective_price(NEW.service_id, local_date, NEW.professional_id);

    IF pricing.service_id IS NULL THEN
      RAISE EXCEPTION 'service_unavailable';
    END IF;

    -- New bookings / service switches require an active catalog row. Pure
    -- reschedules of an existing appointment may keep a later-paused service.
    IF TG_OP = 'INSERT'
      OR NEW.service_id IS DISTINCT FROM OLD.service_id
    THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.services AS service
        WHERE service.id = NEW.service_id
          AND service.establishment_id = NEW.establishment_id
          AND service.deleted_at IS NULL
          AND service.is_active = true
      ) THEN
        RAISE EXCEPTION 'service_unavailable';
      END IF;
    END IF;

    resolved_duration := pricing.duration_minutes;
    resolved_price := pricing.effective_price;
    NEW.duration_minutes := resolved_duration;
    NEW.price_charged := resolved_price;
  END IF;

  NEW.ends_at := NEW.date_time + make_interval(mins => NEW.duration_minutes);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_appointment_duration_snapshot ON public.appointments;
CREATE TRIGGER set_appointment_duration_snapshot
  BEFORE INSERT OR UPDATE OF service_id, professional_id, establishment_id, date_time, duration_minutes, price_charged
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.set_appointment_duration_snapshot();

-- Combo helpers for admin UI
CREATE OR REPLACE FUNCTION public.replace_service_combo_items(
  target_combo_id text,
  target_member_service_ids text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  combo_row public.services%ROWTYPE;
  member_id text;
  member_kind text;
  idx integer := 0;
BEGIN
  SELECT * INTO combo_row FROM public.services WHERE id = target_combo_id AND deleted_at IS NULL;
  IF combo_row.id IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
  IF combo_row.kind <> 'combo' THEN RAISE EXCEPTION 'not_a_combo'; END IF;
  IF NOT public.is_superadmin()
    AND NOT public.has_business_capability(combo_row.establishment_id, 'manage_services')
    AND NOT public.has_active_membership(combo_row.establishment_id, ARRAY['admin'])
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_member_service_ids IS NULL OR cardinality(target_member_service_ids) < 2 THEN
    RAISE EXCEPTION 'combo_requires_two_members';
  END IF;

  FOREACH member_id IN ARRAY target_member_service_ids LOOP
    IF member_id = target_combo_id THEN RAISE EXCEPTION 'combo_cannot_include_self'; END IF;
    SELECT service.kind INTO member_kind
    FROM public.services AS service
    WHERE service.id = member_id
      AND service.establishment_id = combo_row.establishment_id
      AND service.deleted_at IS NULL;
    IF member_kind IS NULL THEN RAISE EXCEPTION 'service_unavailable'; END IF;
    IF member_kind <> 'single' THEN RAISE EXCEPTION 'combo_members_must_be_single'; END IF;
  END LOOP;

  DELETE FROM public.service_combo_items WHERE combo_id = target_combo_id;
  FOREACH member_id IN ARRAY target_member_service_ids LOOP
    idx := idx + 1;
    INSERT INTO public.service_combo_items (combo_id, service_id, sort_order)
    VALUES (target_combo_id, member_id, idx * 10);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.get_effective_price(text, date, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_effective_price(text, date, uuid) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.list_establishment_service_prices(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_establishment_service_prices(uuid, date) TO anon, authenticated, service_role;

REVOKE ALL ON FUNCTION public.replace_service_combo_items(text, text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.replace_service_combo_items(text, text[]) TO authenticated, service_role;

COMMIT;
