-- PS1-E1B.2: Service Order Scope & Sensitive Action Capability Authority
-- Completes migration of service orders / comandas authorization to pure capability authority.
-- Introduces view_team_orders capability for team-wide order reading scope.
-- Eliminates residual operational_role checks in assert_service_order_read_access,
-- list_service_orders_for_day, void_service_order, and reopen_voided_service_order.

BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- 1. Capability Catalog Update: Add view_team_orders
INSERT INTO public.business_capability_catalog (
  capability,
  sensitive_override,
  read_only_allowed,
  active
) VALUES (
  'view_team_orders',
  false,
  true,
  true
) ON CONFLICT (capability) DO UPDATE SET
  read_only_allowed = EXCLUDED.read_only_allowed,
  sensitive_override = EXCLUDED.sensitive_override,
  active = EXCLUDED.active;

-- 2. Role Template Mappings for view_team_orders
-- Reception: team order visibility
INSERT INTO public.business_role_template_capabilities (role_template, capability)
VALUES ('reception', 'view_team_orders')
ON CONFLICT DO NOTHING;

-- Cashier: team order visibility
INSERT INTO public.business_role_template_capabilities (role_template, capability)
VALUES ('cashier', 'view_team_orders')
ON CONFLICT DO NOTHING;

-- Manager: team order visibility
INSERT INTO public.business_role_template_capabilities (role_template, capability)
VALUES ('manager', 'view_team_orders')
ON CONFLICT DO NOTHING;

-- Admin: team order visibility
INSERT INTO public.business_role_template_capabilities (role_template, capability)
VALUES ('admin', 'view_team_orders')
ON CONFLICT DO NOTHING;

-- 3. Redefine assert_service_order_read_access
-- Capability-driven read check: requires view_orders, permits own order (professional_id = actor_id)
-- or team orders if actor holds view_team_orders.
CREATE OR REPLACE FUNCTION public.assert_service_order_read_access(
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

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.has_business_capability(
    target_establishment_id, 'view_orders'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  -- Own order visibility: actor is the assigned professional
  IF target_professional_id IS NOT NULL
     AND target_professional_id = actor_id
  THEN
    RETURN;
  END IF;

  -- Team order visibility: actor holds view_team_orders
  IF public.has_business_capability(
    target_establishment_id, 'view_team_orders'
  ) THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'forbidden';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_service_order_read_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_service_order_read_access(uuid, uuid)
  TO service_role;

-- 4. Redefine assert_service_order_mutation_access
CREATE OR REPLACE FUNCTION public.assert_service_order_mutation_access(
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

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF public.has_business_capability(
    target_establishment_id, 'manage_team_orders'
  ) THEN
    RETURN;
  END IF;

  IF public.has_business_capability(
       target_establishment_id, 'manage_own_orders'
     )
     AND target_professional_id IS NOT NULL
     AND target_professional_id = actor_id
  THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'forbidden';
END;
$$;

REVOKE ALL ON FUNCTION public.assert_service_order_mutation_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assert_service_order_mutation_access(uuid, uuid)
  TO service_role;

-- 5. Redefine list_service_orders_for_day
-- Scope 'own' requires view_orders and filters strictly by professional_id = actor_id.
-- Scope 'team' requires view_orders + view_team_orders capability.
CREATE OR REPLACE FUNCTION public.list_service_orders_for_day(
  target_establishment_id uuid,
  target_local_date date,
  target_scope text DEFAULT 'own'
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
  day_start timestamptz;
  day_end timestamptz;
  scope_value text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  IF target_local_date IS NULL THEN
    RAISE EXCEPTION 'local_date_required';
  END IF;

  scope_value := COALESCE(NULLIF(btrim(target_scope), ''), 'own');
  IF scope_value NOT IN ('own', 'team') THEN
    RAISE EXCEPTION 'invalid_scope';
  END IF;

  IF NOT public.has_business_capability(
    target_establishment_id, 'view_orders'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF scope_value = 'team'
     AND NOT public.has_business_capability(
       target_establishment_id, 'view_team_orders'
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT establishment.timezone
  INTO target_timezone
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  IF target_timezone IS NULL THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;

  day_start := target_local_date::timestamp AT TIME ZONE target_timezone;
  day_end := (target_local_date + 1)::timestamp AT TIME ZONE target_timezone;

  SELECT jsonb_build_object(
    'items', COALESCE(jsonb_agg(summary.payload ORDER BY summary.opened_at, summary.id), '[]'::jsonb)
  )
  INTO result
  FROM (
    SELECT
      service_order.id,
      service_order.opened_at,
      jsonb_strip_nulls(jsonb_build_object(
        'serviceOrderId', service_order.id,
        'appointmentId', service_order.appointment_id,
        'establishmentClientId', service_order.establishment_client_id,
        'professionalId', service_order.professional_id,
        'status', service_order.status,
        'currency', service_order.currency,
        'subtotalCents', service_order.subtotal_cents,
        'discountCents', service_order.discount_cents,
        'totalCents', service_order.total_cents,
        'openedAt', service_order.opened_at,
        'version', service_order.version
      )) AS payload
    FROM public.service_orders AS service_order
    WHERE service_order.establishment_id = target_establishment_id
      AND service_order.opened_at >= day_start
      AND service_order.opened_at < day_end
      AND (
        scope_value = 'team'
        OR service_order.professional_id = actor_id
      )
    ORDER BY service_order.opened_at, service_order.id
  ) AS summary;

  RETURN COALESCE(result, jsonb_build_object('items', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.list_service_orders_for_day(uuid, date, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_service_orders_for_day(uuid, date, text)
  TO authenticated, service_role;

-- 6. Redefine void_service_order
-- Capability-driven: requires void_orders capability, eliminating residual role check.
CREATE OR REPLACE FUNCTION public.void_service_order(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_expected_version bigint,
  target_reason text,
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
  previous_status text;
  normalized_reason text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  normalized_reason := NULLIF(btrim(COALESCE(target_reason, '')), '');
  IF normalized_reason IS NULL
     OR char_length(normalized_reason) < 1
     OR char_length(normalized_reason) > 500
  THEN
    RAISE EXCEPTION 'service_order_void_reason_required';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.voided',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version,
      'reason', normalized_reason
    )
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  IF NOT public.has_business_capability(
    target_establishment_id, 'void_orders'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  IF order_record.status NOT IN ('open', 'in_service', 'awaiting_payment') THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  previous_status := order_record.status;

  UPDATE public.service_orders
  SET
    status = 'voided',
    voided_at = now(),
    voided_by = actor_id,
    void_reason = normalized_reason,
    updated_by = actor_id,
    version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'voided',
    previous_status,
    'voided',
    jsonb_build_object('reason', normalized_reason)
  );

  result := public.build_service_order_mutation_response(
    order_record.id,
    order_record.status,
    order_record.version,
    NULL
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.void_service_order(
  uuid, uuid, bigint, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.void_service_order(
  uuid, uuid, bigint, text, uuid
) TO authenticated, service_role;

-- 7. Redefine reopen_voided_service_order
-- Capability-driven: requires void_orders + manage_team_orders + approve_sensitive_actions.
CREATE OR REPLACE FUNCTION public.reopen_voided_service_order(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_expected_version bigint,
  target_reason text,
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
  restored_status text;
  previous_void_reason text;
  normalized_reason text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  normalized_reason := NULLIF(btrim(COALESCE(target_reason, '')), '');
  IF normalized_reason IS NULL
     OR char_length(normalized_reason) < 1
     OR char_length(normalized_reason) > 500
  THEN
    RAISE EXCEPTION 'service_order_void_reason_required';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.reopened',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version,
      'reason', normalized_reason
    )
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  IF NOT public.has_business_capability(
       target_establishment_id, 'void_orders'
     )
     OR NOT public.has_business_capability(
       target_establishment_id, 'manage_team_orders'
     )
     OR NOT public.has_business_capability(
       target_establishment_id, 'approve_sensitive_actions'
     )
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  IF order_record.status IS DISTINCT FROM 'voided' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  previous_void_reason := order_record.void_reason;

  IF order_record.finished_at IS NOT NULL THEN
    restored_status := 'awaiting_payment';
  ELSIF order_record.started_at IS NOT NULL THEN
    restored_status := 'in_service';
  ELSE
    restored_status := 'open';
  END IF;

  UPDATE public.service_orders
  SET
    status = restored_status,
    voided_at = NULL,
    voided_by = NULL,
    void_reason = NULL,
    updated_by = actor_id,
    version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'reopened',
    'voided',
    restored_status,
    jsonb_build_object(
      'previousVoidReason', previous_void_reason,
      'reopenReason', normalized_reason,
      'restoredStatus', restored_status
    )
  );

  result := public.build_service_order_mutation_response(
    order_record.id,
    order_record.status,
    order_record.version,
    NULL
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_voided_service_order(
  uuid, uuid, bigint, text, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reopen_voided_service_order(
  uuid, uuid, bigint, text, uuid
) TO authenticated, service_role;

COMMIT;
