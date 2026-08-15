BEGIN;

CREATE OR REPLACE FUNCTION public.get_business_daily_metrics(
  target_establishment_id uuid,
  target_local_date date
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  target_timezone text;
  target_currency text;
  day_start timestamptz;
  day_end timestamptz;
  available_minutes bigint := 0;
  occupied_minutes bigint := 0;
  revenue_cents bigint := 0;
  closed_orders bigint := 0;
BEGIN
  IF actor_id IS NULL THEN RAISE EXCEPTION 'authentication_required'; END IF;
  IF target_local_date IS NULL THEN RAISE EXCEPTION 'local_date_required'; END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);
  IF NOT public.has_business_capability(target_establishment_id, 'view_unit_reports') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT establishment.timezone, establishment.currency
  INTO target_timezone, target_currency
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF target_timezone IS NULL THEN RAISE EXCEPTION 'establishment_not_found'; END IF;
  IF target_currency <> 'BRL' THEN RAISE EXCEPTION 'unsupported_currency'; END IF;

  day_start := target_local_date::timestamp AT TIME ZONE target_timezone;
  day_end := (target_local_date + 1)::timestamp AT TIME ZONE target_timezone;
  available_minutes := COALESCE(public.admin_report_available_minutes(
    target_establishment_id,
    target_local_date,
    target_local_date,
    NULL
  ), 0);

  SELECT COALESCE(sum(appointment.duration_minutes), 0)
  INTO occupied_minutes
  FROM public.appointments AS appointment
  WHERE appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL
    AND appointment.date_time >= day_start
    AND appointment.date_time < day_end
    AND appointment.status IN ('pending', 'confirmed', 'completed');

  SELECT
    COALESCE(sum(service_order.total_cents), 0),
    count(*)
  INTO revenue_cents, closed_orders
  FROM public.service_orders AS service_order
  WHERE service_order.establishment_id = target_establishment_id
    AND service_order.status = 'closed'
    AND service_order.closed_at >= day_start
    AND service_order.closed_at < day_end;

  RETURN jsonb_build_object(
    'localDate', target_local_date,
    'currency', target_currency,
    'revenueCents', revenue_cents,
    'closedOrders', closed_orders,
    'averageTicketCents', CASE WHEN closed_orders > 0 THEN round(revenue_cents::numeric / closed_orders)::bigint ELSE 0 END,
    'occupiedMinutes', occupied_minutes,
    'availableMinutes', available_minutes,
    'occupancyRate', CASE WHEN available_minutes > 0 THEN LEAST(round(occupied_minutes * 100.0 / available_minutes, 1), 100) ELSE 0 END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_business_daily_metrics(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_business_daily_metrics(uuid, date) TO authenticated, service_role;

COMMIT;