BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- P0 Etapa 3 — RPCs de ciclo de vida de service_orders.
-- Não cria pagamentos, caixa, comissão, provedor, refunds nem UI.
-- close_service_order só fecha total_cents = 0 (saldo positivo fica awaiting_payment).

-- ---------------------------------------------------------------------------
-- Safe mobile command response: allow service-order receipt keys
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.is_safe_mobile_command_response(value jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT jsonb_typeof(value) = 'object'
    AND NOT EXISTS (
      SELECT 1
      FROM jsonb_object_keys(value) AS key_name
      WHERE key_name <> ALL (ARRAY[
        'appointmentId', 'status', 'startsAt', 'endsAt',
        'establishmentClientId', 'establishmentId', 'linkId',
        'scheduleBlockId', 'serviceId', 'membershipId',
        'invitationId', 'expiresAt', 'survivorClientId',
        'duplicateClientId', 'professionalId', 'errorCode',
        'serviceOrderId', 'serviceOrderItemId', 'version'
      ]::text[])
    )
    AND (
      NOT (value ? 'errorCode')
      OR (
        jsonb_typeof(value->'errorCode') = 'string'
        AND value->>'errorCode' IN (
          'appointment_conflict', 'schedule_block_conflict'
        )
      )
    )
    AND (
      NOT (value ? 'version')
      OR (
        jsonb_typeof(value->'version') = 'number'
        AND (value->>'version') ~ '^[0-9]+$'
        AND (value->>'version')::bigint >= 1
        AND (value->>'version')::bigint <= 9007199254740991
      )
    )
    AND (
      NOT (value ? 'serviceOrderId')
      OR (
        jsonb_typeof(value->'serviceOrderId') = 'string'
        AND (value->>'serviceOrderId')
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    )
    AND (
      NOT (value ? 'serviceOrderItemId')
      OR (
        jsonb_typeof(value->'serviceOrderItemId') = 'string'
        AND (value->>'serviceOrderItemId')
          ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      )
    );
$$;

-- ---------------------------------------------------------------------------
-- Internal helpers
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.assert_financial_ops_enabled(
  target_establishment_id uuid
)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  flag_value boolean;
BEGIN
  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'establishment_required';
  END IF;

  SELECT establishment.financial_ops_enabled
  INTO flag_value
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found';
  END IF;

  IF flag_value IS NOT TRUE THEN
    RAISE EXCEPTION 'financial_ops_disabled';
  END IF;
END;
$$;

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
  identity_record record;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF NOT public.has_business_capability(
    target_establishment_id, 'view_orders'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, actor_id
  )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF identity_record.operational_role IN ('owner', 'admin') THEN
    RETURN;
  END IF;

  IF target_professional_id IS NOT NULL
     AND target_professional_id = actor_id
  THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'forbidden';
END;
$$;

CREATE OR REPLACE FUNCTION public.lock_service_order_for_mutation(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_expected_version bigint
)
RETURNS public.service_orders
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  order_record public.service_orders%ROWTYPE;
BEGIN
  IF target_service_order_id IS NULL THEN
    RAISE EXCEPTION 'service_order_required';
  END IF;
  IF target_expected_version IS NULL OR target_expected_version < 1 THEN
    RAISE EXCEPTION 'service_order_version_required';
  END IF;

  SELECT * INTO order_record
  FROM public.service_orders AS service_order
  WHERE service_order.id = target_service_order_id
    AND service_order.establishment_id = target_establishment_id
  FOR UPDATE;

  IF order_record.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found';
  END IF;

  IF order_record.version IS DISTINCT FROM target_expected_version THEN
    RAISE EXCEPTION 'service_order_version_conflict';
  END IF;

  RETURN order_record;
END;
$$;

CREATE OR REPLACE FUNCTION public.numeric_money_to_cents(
  target_amount numeric
)
RETURNS bigint
LANGUAGE plpgsql
IMMUTABLE
SET search_path = pg_catalog
AS $$
DECLARE
  cents bigint;
  max_safe constant bigint := 9007199254740991;
BEGIN
  IF target_amount IS NULL THEN
    RAISE EXCEPTION 'invalid_money_amount';
  END IF;
  IF target_amount < 0 THEN
    RAISE EXCEPTION 'invalid_money_amount';
  END IF;

  cents := round(target_amount * 100)::bigint;

  IF cents < 0 OR cents > max_safe THEN
    RAISE EXCEPTION 'invalid_money_amount';
  END IF;

  RETURN cents;
END;
$$;

CREATE OR REPLACE FUNCTION public.build_service_order_mutation_response(
  target_service_order_id uuid,
  target_status text,
  target_version bigint,
  target_item_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = pg_catalog
AS $$
  SELECT CASE
    WHEN target_item_id IS NULL THEN
      jsonb_build_object(
        'serviceOrderId', target_service_order_id,
        'status', target_status,
        'version', target_version
      )
    ELSE
      jsonb_build_object(
        'serviceOrderId', target_service_order_id,
        'serviceOrderItemId', target_item_id,
        'status', target_status,
        'version', target_version
      )
  END;
$$;

REVOKE ALL ON FUNCTION public.assert_financial_ops_enabled(uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_service_order_mutation_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assert_service_order_read_access(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.lock_service_order_for_mutation(uuid, uuid, bigint)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.numeric_money_to_cents(numeric)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.build_service_order_mutation_response(uuid, text, bigint, uuid)
  FROM PUBLIC, anon, authenticated;


-- P0 Etapa 3 — public RPC definitions for service_order lifecycle.
-- Helpers live in the main migration; this fragment has functions only.
-- No BEGIN/COMMIT — intended to be spliced into the lifecycle migration.

-- ---------------------------------------------------------------------------
-- Internal helper: append service_order_events row
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.insert_service_order_event(
  target_service_order_id uuid,
  target_establishment_id uuid,
  target_actor_id uuid,
  target_event_type text,
  target_previous_status text,
  target_resulting_status text,
  target_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  INSERT INTO public.service_order_events (
    service_order_id,
    establishment_id,
    actor_id,
    event_type,
    previous_status,
    resulting_status,
    metadata
  ) VALUES (
    target_service_order_id,
    target_establishment_id,
    target_actor_id,
    target_event_type,
    target_previous_status,
    target_resulting_status,
    COALESCE(target_metadata, '{}'::jsonb)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.insert_service_order_event(
  uuid, uuid, uuid, text, text, text, jsonb
) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. open_service_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.open_service_order(
  target_establishment_id uuid,
  target_request_id uuid,
  target_appointment_id text DEFAULT NULL,
  target_professional_id uuid DEFAULT NULL,
  target_establishment_client_id uuid DEFAULT NULL,
  target_internal_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  replay jsonb;
  normalized_notes text;
  appointment_record public.appointments%ROWTYPE;
  service_record public.services%ROWTYPE;
  resolved_professional_id uuid;
  resolved_client_id uuid;
  order_record public.service_orders%ROWTYPE;
  seeded_item_id uuid;
  unit_price bigint;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  normalized_notes := NULLIF(btrim(COALESCE(target_internal_notes, '')), '');
  IF normalized_notes IS NOT NULL AND char_length(normalized_notes) > 2000 THEN
    RAISE EXCEPTION 'invalid_internal_notes';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.opened',
    jsonb_strip_nulls(jsonb_build_object(
      'appointmentId', target_appointment_id,
      'professionalId', target_professional_id,
      'establishmentClientId', target_establishment_client_id,
      'internalNotes', normalized_notes
    ))
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  IF target_appointment_id IS NOT NULL THEN
    SELECT * INTO appointment_record
    FROM public.appointments AS appointment
    WHERE appointment.id = target_appointment_id
      AND appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
    FOR UPDATE;

    IF appointment_record.id IS NULL THEN
      RAISE EXCEPTION 'appointment_not_found';
    END IF;

    IF appointment_record.status IS DISTINCT FROM 'confirmed' THEN
      RAISE EXCEPTION 'service_order_invalid_appointment_status';
    END IF;

    IF target_professional_id IS NOT NULL
       AND target_professional_id IS DISTINCT FROM appointment_record.professional_id
    THEN
      RAISE EXCEPTION 'service_order_appointment_override_forbidden';
    END IF;

    IF target_establishment_client_id IS NOT NULL
       AND target_establishment_client_id
         IS DISTINCT FROM appointment_record.establishment_client_id
    THEN
      RAISE EXCEPTION 'service_order_appointment_override_forbidden';
    END IF;

    resolved_professional_id := appointment_record.professional_id;
    resolved_client_id := appointment_record.establishment_client_id;

    PERFORM public.assert_service_order_mutation_access(
      target_establishment_id,
      resolved_professional_id
    );

    BEGIN
      INSERT INTO public.service_orders (
        establishment_id,
        appointment_id,
        establishment_client_id,
        professional_id,
        status,
        internal_notes,
        created_by,
        updated_by
      ) VALUES (
        target_establishment_id,
        appointment_record.id,
        resolved_client_id,
        resolved_professional_id,
        'open',
        normalized_notes,
        actor_id,
        actor_id
      )
      RETURNING * INTO order_record;
    EXCEPTION WHEN unique_violation THEN
      IF SQLERRM LIKE '%service_orders_one_per_appointment%' THEN
        RAISE EXCEPTION 'service_order_already_exists';
      END IF;
      RAISE;
    END;

    PERFORM public.insert_service_order_event(
      order_record.id,
      target_establishment_id,
      actor_id,
      'opened',
      NULL,
      'open',
      '{}'::jsonb
    );

    SELECT * INTO service_record
    FROM public.services AS service
    WHERE service.id = appointment_record.service_id
      AND service.establishment_id = target_establishment_id;

    IF service_record.id IS NULL THEN
      RAISE EXCEPTION 'service_not_found';
    END IF;

    unit_price := public.numeric_money_to_cents(
      COALESCE(appointment_record.price_charged, service_record.price)
    );

    INSERT INTO public.service_order_items (
      service_order_id,
      establishment_id,
      service_id,
      professional_id,
      description_snapshot,
      quantity,
      unit_price_cents,
      discount_cents,
      sort_order,
      created_by,
      updated_by
    ) VALUES (
      order_record.id,
      target_establishment_id,
      appointment_record.service_id,
      appointment_record.professional_id,
      service_record.name,
      1,
      unit_price,
      0,
      0,
      actor_id,
      actor_id
    )
    RETURNING id INTO seeded_item_id;

    PERFORM public.insert_service_order_event(
      order_record.id,
      target_establishment_id,
      actor_id,
      'item_upserted',
      'open',
      'open',
      jsonb_build_object(
        'source', 'appointment_seed',
        'itemId', seeded_item_id,
        'serviceId', appointment_record.service_id
      )
    );

    SELECT service_order.version, service_order.status
    INTO order_record.version, order_record.status
    FROM public.service_orders AS service_order
    WHERE service_order.id = order_record.id;

    result := public.build_service_order_mutation_response(
      order_record.id,
      order_record.status,
      order_record.version,
      NULL
    );
    RETURN public.complete_mobile_command(target_request_id, result);
  END IF;

  -- Walk-in path
  IF target_professional_id IS NULL THEN
    RAISE EXCEPTION 'service_order_professional_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.profile_id = target_professional_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'professional_unavailable';
  END IF;

  resolved_professional_id := target_professional_id;
  resolved_client_id := target_establishment_client_id;

  IF resolved_client_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.establishment_clients AS client
      WHERE client.id = resolved_client_id
        AND client.establishment_id = target_establishment_id
    ) THEN
      RAISE EXCEPTION 'establishment_client_not_found';
    END IF;
  END IF;

  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id,
    resolved_professional_id
  );

  INSERT INTO public.service_orders (
    establishment_id,
    appointment_id,
    establishment_client_id,
    professional_id,
    status,
    internal_notes,
    created_by,
    updated_by
  ) VALUES (
    target_establishment_id,
    NULL,
    resolved_client_id,
    resolved_professional_id,
    'open',
    normalized_notes,
    actor_id,
    actor_id
  )
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'opened',
    NULL,
    'open',
    '{}'::jsonb
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

REVOKE ALL ON FUNCTION public.open_service_order(
  uuid, uuid, text, uuid, uuid, text
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.open_service_order(
  uuid, uuid, text, uuid, uuid, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. start_service_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.start_service_order(
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
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.started',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id,
    order_record.professional_id
  );

  IF order_record.status IS DISTINCT FROM 'open' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  UPDATE public.service_orders
  SET
    status = 'in_service',
    started_at = now(),
    started_by = actor_id,
    updated_by = actor_id,
    version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'started',
    'open',
    'in_service',
    '{}'::jsonb
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

REVOKE ALL ON FUNCTION public.start_service_order(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.start_service_order(
  uuid, uuid, bigint, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 3. upsert_service_order_item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.upsert_service_order_item(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_expected_version bigint,
  target_request_id uuid,
  target_item_id uuid DEFAULT NULL,
  target_service_id text DEFAULT NULL,
  target_professional_id uuid DEFAULT NULL,
  target_description_snapshot text DEFAULT NULL,
  target_quantity integer DEFAULT 1,
  target_discount_cents bigint DEFAULT 0,
  target_custom_unit_price_cents bigint DEFAULT NULL
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
  existing_item public.service_order_items%ROWTYPE;
  service_record public.services%ROWTYPE;
  resolved_professional_id uuid;
  resolved_description text;
  resolved_unit_price bigint;
  normalized_quantity integer;
  normalized_discount bigint;
  operation text;
  result_item_id uuid;
  final_version bigint;
  result jsonb;
  can_manage_team boolean;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  normalized_quantity := COALESCE(target_quantity, 1);
  normalized_discount := COALESCE(target_discount_cents, 0);

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.item_upserted',
    jsonb_strip_nulls(jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version,
      'itemId', target_item_id,
      'serviceId', target_service_id,
      'professionalId', target_professional_id,
      'descriptionSnapshot', NULLIF(btrim(COALESCE(target_description_snapshot, '')), ''),
      'quantity', normalized_quantity,
      'discountCents', normalized_discount,
      'customUnitPriceCents', target_custom_unit_price_cents
    ))
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id,
    order_record.professional_id
  );

  IF order_record.status NOT IN ('open', 'in_service') THEN
    RAISE EXCEPTION 'service_order_items_frozen';
  END IF;

  IF normalized_quantity < 1 OR normalized_quantity > 999 THEN
    RAISE EXCEPTION 'invalid_item_quantity';
  END IF;

  IF normalized_discount < 0 THEN
    RAISE EXCEPTION 'invalid_item_discount';
  END IF;

  IF normalized_discount > 0
     AND NOT public.has_business_capability(
       target_establishment_id, 'apply_order_discounts'
     )
  THEN
    RAISE EXCEPTION 'service_order_discount_forbidden';
  END IF;

  can_manage_team := public.has_business_capability(
    target_establishment_id, 'manage_team_orders'
  );

  resolved_professional_id := COALESCE(
    target_professional_id,
    order_record.professional_id
  );

  IF resolved_professional_id IS NULL THEN
    RAISE EXCEPTION 'service_order_professional_required';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.profile_id = resolved_professional_id
      AND membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
  ) THEN
    RAISE EXCEPTION 'professional_unavailable';
  END IF;

  IF resolved_professional_id IS DISTINCT FROM order_record.professional_id
     AND NOT can_manage_team
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF target_item_id IS NOT NULL THEN
    SELECT * INTO existing_item
    FROM public.service_order_items AS item
    WHERE item.id = target_item_id
      AND item.service_order_id = order_record.id
      AND item.establishment_id = target_establishment_id
    FOR UPDATE;

    IF existing_item.id IS NULL THEN
      RAISE EXCEPTION 'service_order_item_not_found';
    END IF;
  END IF;

  IF target_service_id IS NOT NULL THEN
    IF target_custom_unit_price_cents IS NOT NULL THEN
      RAISE EXCEPTION 'service_order_item_price_override_forbidden';
    END IF;

    SELECT * INTO service_record
    FROM public.services AS service
    WHERE service.id = target_service_id
      AND service.establishment_id = target_establishment_id;

    IF service_record.id IS NULL THEN
      RAISE EXCEPTION 'service_not_found';
    END IF;

    IF target_item_id IS NULL
       OR existing_item.service_id IS DISTINCT FROM target_service_id
    THEN
      IF service_record.is_active IS NOT TRUE
         OR service_record.deleted_at IS NOT NULL
      THEN
        RAISE EXCEPTION 'service_not_found';
      END IF;
    END IF;

    -- Historical label comes from catalog name, never client-supplied text.
    resolved_description := service_record.name;
    IF char_length(btrim(resolved_description)) < 1
       OR char_length(btrim(resolved_description)) > 240
    THEN
      RAISE EXCEPTION 'service_order_item_description_required';
    END IF;

    resolved_unit_price := public.numeric_money_to_cents(service_record.price);
  ELSE
    IF NOT can_manage_team THEN
      RAISE EXCEPTION 'service_order_custom_item_forbidden';
    END IF;

    resolved_description := NULLIF(btrim(COALESCE(target_description_snapshot, '')), '');
    IF resolved_description IS NULL
       OR char_length(resolved_description) < 1
       OR char_length(resolved_description) > 240
    THEN
      RAISE EXCEPTION 'service_order_item_description_required';
    END IF;

    IF target_custom_unit_price_cents IS NULL THEN
      RAISE EXCEPTION 'service_order_item_price_required';
    END IF;

    IF target_custom_unit_price_cents < 0
       OR target_custom_unit_price_cents > 9007199254740991
    THEN
      RAISE EXCEPTION 'invalid_money_amount';
    END IF;

    resolved_unit_price := target_custom_unit_price_cents;
  END IF;

  IF normalized_discount > (normalized_quantity::bigint * resolved_unit_price) THEN
    RAISE EXCEPTION 'invalid_item_discount';
  END IF;

  IF target_item_id IS NULL THEN
    operation := 'inserted';
    INSERT INTO public.service_order_items (
      service_order_id,
      establishment_id,
      service_id,
      professional_id,
      description_snapshot,
      quantity,
      unit_price_cents,
      discount_cents,
      created_by,
      updated_by
    ) VALUES (
      order_record.id,
      target_establishment_id,
      target_service_id,
      resolved_professional_id,
      resolved_description,
      normalized_quantity,
      resolved_unit_price,
      normalized_discount,
      actor_id,
      actor_id
    )
    RETURNING id INTO result_item_id;
  ELSE
    operation := 'updated';
    UPDATE public.service_order_items
    SET
      service_id = target_service_id,
      professional_id = resolved_professional_id,
      description_snapshot = resolved_description,
      quantity = normalized_quantity,
      unit_price_cents = resolved_unit_price,
      discount_cents = normalized_discount,
      updated_by = actor_id
    WHERE id = existing_item.id
    RETURNING id INTO result_item_id;
  END IF;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'item_upserted',
    order_record.status,
    order_record.status,
    jsonb_strip_nulls(jsonb_build_object(
      'itemId', result_item_id,
      'operation', operation,
      'serviceId', target_service_id
    ))
  );

  SELECT service_order.version
  INTO final_version
  FROM public.service_orders AS service_order
  WHERE service_order.id = order_record.id;

  result := public.build_service_order_mutation_response(
    order_record.id,
    order_record.status,
    final_version,
    result_item_id
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_service_order_item(
  uuid, uuid, bigint, uuid, uuid, text, uuid, text, integer, bigint, bigint
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.upsert_service_order_item(
  uuid, uuid, bigint, uuid, uuid, text, uuid, text, integer, bigint, bigint
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 4. remove_service_order_item
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.remove_service_order_item(
  target_establishment_id uuid,
  target_service_order_id uuid,
  target_item_id uuid,
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
  existing_item public.service_order_items%ROWTYPE;
  final_version bigint;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.item_removed',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'itemId', target_item_id,
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id,
    order_record.professional_id
  );

  IF order_record.status NOT IN ('open', 'in_service') THEN
    RAISE EXCEPTION 'service_order_items_frozen';
  END IF;

  IF target_item_id IS NULL THEN
    RAISE EXCEPTION 'service_order_item_not_found';
  END IF;

  SELECT * INTO existing_item
  FROM public.service_order_items AS item
  WHERE item.id = target_item_id
    AND item.service_order_id = order_record.id
    AND item.establishment_id = target_establishment_id
  FOR UPDATE;

  IF existing_item.id IS NULL THEN
    RAISE EXCEPTION 'service_order_item_not_found';
  END IF;

  DELETE FROM public.service_order_items
  WHERE id = existing_item.id;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'item_removed',
    order_record.status,
    order_record.status,
    jsonb_build_object('itemId', existing_item.id)
  );

  SELECT service_order.version
  INTO final_version
  FROM public.service_orders AS service_order
  WHERE service_order.id = order_record.id;

  result := public.build_service_order_mutation_response(
    order_record.id,
    order_record.status,
    final_version,
    NULL
  );
  RETURN public.complete_mobile_command(target_request_id, result);
END;
$$;

REVOKE ALL ON FUNCTION public.remove_service_order_item(
  uuid, uuid, uuid, bigint, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_service_order_item(
  uuid, uuid, uuid, bigint, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 5. finish_service_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.finish_service_order(
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
  appointment_record public.appointments%ROWTYPE;
  item_count integer;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.finished',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id,
    order_record.professional_id
  );

  IF order_record.status IS DISTINCT FROM 'in_service' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  SELECT count(*)::integer
  INTO item_count
  FROM public.service_order_items AS item
  WHERE item.service_order_id = order_record.id;

  IF item_count < 1 THEN
    RAISE EXCEPTION 'service_order_items_required';
  END IF;

  IF order_record.appointment_id IS NOT NULL THEN
    SELECT * INTO appointment_record
    FROM public.appointments AS appointment
    WHERE appointment.id = order_record.appointment_id
      AND appointment.establishment_id = target_establishment_id
      AND appointment.deleted_at IS NULL
    FOR UPDATE;

    IF appointment_record.id IS NULL THEN
      RAISE EXCEPTION 'appointment_not_found';
    END IF;

    IF appointment_record.status IS DISTINCT FROM 'confirmed' THEN
      RAISE EXCEPTION 'service_order_invalid_appointment_status';
    END IF;

    -- Status only — capture_appointment_event_trigger records the event.
    UPDATE public.appointments
    SET status = 'completed'
    WHERE id = appointment_record.id;
  END IF;

  UPDATE public.service_orders
  SET
    status = 'awaiting_payment',
    finished_at = now(),
    finished_by = actor_id,
    updated_by = actor_id,
    version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'finished',
    'in_service',
    'awaiting_payment',
    '{}'::jsonb
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

REVOKE ALL ON FUNCTION public.finish_service_order(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finish_service_order(
  uuid, uuid, bigint, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 6. close_service_order
-- ---------------------------------------------------------------------------

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
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  replay := public.claim_mobile_command(
    target_request_id,
    target_establishment_id,
    'service_order.closed',
    jsonb_build_object(
      'serviceOrderId', target_service_order_id,
      'expectedVersion', target_expected_version
    )
  );
  IF replay IS NOT NULL THEN
    RETURN replay;
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  order_record := public.lock_service_order_for_mutation(
    target_establishment_id,
    target_service_order_id,
    target_expected_version
  );

  PERFORM public.assert_service_order_mutation_access(
    target_establishment_id,
    order_record.professional_id
  );

  IF order_record.status IS DISTINCT FROM 'awaiting_payment' THEN
    RAISE EXCEPTION 'service_order_invalid_transition';
  END IF;

  IF order_record.total_cents > 0 THEN
    RAISE EXCEPTION 'service_order_balance_unresolved';
  END IF;

  UPDATE public.service_orders
  SET
    status = 'closed',
    closed_at = now(),
    closed_by = actor_id,
    updated_by = actor_id,
    version = version + 1
  WHERE id = order_record.id
  RETURNING * INTO order_record;

  PERFORM public.insert_service_order_event(
    order_record.id,
    target_establishment_id,
    actor_id,
    'closed',
    'awaiting_payment',
    'closed',
    '{}'::jsonb
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

REVOKE ALL ON FUNCTION public.close_service_order(
  uuid, uuid, bigint, uuid
) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.close_service_order(
  uuid, uuid, bigint, uuid
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 7. void_service_order
-- ---------------------------------------------------------------------------

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
  identity_record record;
  previous_status text;
  normalized_reason text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
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

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, actor_id
  )
  LIMIT 1;

  IF NOT FOUND
     OR identity_record.operational_role NOT IN ('owner', 'admin')
  THEN
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

-- ---------------------------------------------------------------------------
-- 8. reopen_voided_service_order
-- ---------------------------------------------------------------------------

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
  identity_record record;
  restored_status text;
  previous_void_reason text;
  normalized_reason text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
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
  THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, actor_id
  )
  LIMIT 1;

  IF NOT FOUND
     OR identity_record.operational_role NOT IN ('owner', 'admin')
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

-- ---------------------------------------------------------------------------
-- 9. get_service_order
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_service_order(
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
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  IF target_service_order_id IS NULL THEN
    RAISE EXCEPTION 'service_order_required';
  END IF;

  SELECT * INTO order_record
  FROM public.service_orders AS service_order
  WHERE service_order.id = target_service_order_id
    AND service_order.establishment_id = target_establishment_id;

  IF order_record.id IS NULL THEN
    RAISE EXCEPTION 'service_order_not_found';
  END IF;

  PERFORM public.assert_service_order_read_access(
    target_establishment_id,
    order_record.professional_id
  );

  SELECT jsonb_build_object(
    'order', jsonb_strip_nulls(jsonb_build_object(
      'id', order_record.id,
      'establishmentId', order_record.establishment_id,
      'appointmentId', order_record.appointment_id,
      'establishmentClientId', order_record.establishment_client_id,
      'professionalId', order_record.professional_id,
      'status', order_record.status,
      'currency', order_record.currency,
      'subtotalCents', order_record.subtotal_cents,
      'discountCents', order_record.discount_cents,
      'totalCents', order_record.total_cents,
      'internalNotes', order_record.internal_notes,
      'openedAt', order_record.opened_at,
      'startedAt', order_record.started_at,
      'finishedAt', order_record.finished_at,
      'closedAt', order_record.closed_at,
      'voidedAt', order_record.voided_at,
      'voidReason', order_record.void_reason,
      'createdBy', order_record.created_by,
      'updatedBy', order_record.updated_by,
      'startedBy', order_record.started_by,
      'finishedBy', order_record.finished_by,
      'closedBy', order_record.closed_by,
      'voidedBy', order_record.voided_by,
      'version', order_record.version,
      'createdAt', order_record.created_at,
      'updatedAt', order_record.updated_at
    )),
    'items', COALESCE((
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', item.id,
          'serviceOrderId', item.service_order_id,
          'establishmentId', item.establishment_id,
          'serviceId', item.service_id,
          'professionalId', item.professional_id,
          'descriptionSnapshot', item.description_snapshot,
          'quantity', item.quantity,
          'unitPriceCents', item.unit_price_cents,
          'discountCents', item.discount_cents,
          'subtotalCents', item.subtotal_cents,
          'totalCents', item.total_cents,
          'sortOrder', item.sort_order,
          'metadata', item.metadata,
          'createdBy', item.created_by,
          'updatedBy', item.updated_by,
          'createdAt', item.created_at,
          'updatedAt', item.updated_at
        ))
        ORDER BY item.sort_order, item.id
      )
      FROM public.service_order_items AS item
      WHERE item.service_order_id = order_record.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', event.id,
          'serviceOrderId', event.service_order_id,
          'establishmentId', event.establishment_id,
          'actorId', event.actor_id,
          'eventType', event.event_type,
          'previousStatus', event.previous_status,
          'resultingStatus', event.resulting_status,
          'metadata', event.metadata,
          'createdAt', event.created_at
        ))
        ORDER BY event.created_at, event.id
      )
      FROM public.service_order_events AS event
      WHERE event.service_order_id = order_record.id
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_service_order(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_order(uuid, uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. list_service_orders_for_day
-- ---------------------------------------------------------------------------

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
  identity_record record;
  target_timezone text;
  day_start timestamptz;
  day_end timestamptz;
  scope_value text;
  result jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
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

  SELECT * INTO identity_record
  FROM public.resolve_business_operational_identity(
    target_establishment_id, actor_id
  )
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF scope_value = 'team'
     AND identity_record.operational_role NOT IN ('owner', 'admin')
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

COMMIT;
