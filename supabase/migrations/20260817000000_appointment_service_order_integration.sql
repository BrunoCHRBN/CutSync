BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- P0 Etapa 4 — integração appointment ↔ service_order.
-- Bridge de leitura por appointment + proteção server-side contra bypass
-- pelos RPCs legados de status/reagendamento. Sem pagamentos/caixa/comissão.
--
-- finish_service_order é recriado apenas para marcar a conclusão autorizada
-- via set_config local ligado ao id da comanda. Comportamento de idempotência,
-- locks, receipts, command type e eventos permanece o da Etapa 3.

-- ---------------------------------------------------------------------------
-- 1. Bridge: get_service_order_for_appointment
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_service_order_for_appointment(
  target_establishment_id uuid,
  target_appointment_id text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  appointment_record public.appointments%ROWTYPE;
  order_id uuid;
  detail jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required';
  END IF;

  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'establishment_required';
  END IF;

  IF target_appointment_id IS NULL
     OR btrim(target_appointment_id) = ''
  THEN
    RAISE EXCEPTION 'appointment_required';
  END IF;

  PERFORM public.assert_financial_ops_enabled(target_establishment_id);

  SELECT * INTO appointment_record
  FROM public.appointments AS appointment
  WHERE appointment.id = target_appointment_id
    AND appointment.establishment_id = target_establishment_id
    AND appointment.deleted_at IS NULL;

  IF appointment_record.id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  IF NOT public.has_business_capability(
    target_establishment_id, 'view_orders'
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF NOT public.can_view_business_appointment(
    target_establishment_id, appointment_record.professional_id
  ) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT service_order.id
  INTO order_id
  FROM public.service_orders AS service_order
  WHERE service_order.establishment_id = target_establishment_id
    AND service_order.appointment_id = appointment_record.id
  LIMIT 1;

  IF order_id IS NULL THEN
    RETURN jsonb_build_object(
      'appointmentId', appointment_record.id,
      'serviceOrder', NULL
    );
  END IF;

  detail := public.get_service_order(target_establishment_id, order_id);

  RETURN jsonb_build_object(
    'appointmentId', appointment_record.id,
    'serviceOrder', detail
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_service_order_for_appointment(uuid, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_service_order_for_appointment(uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Consistency trigger: block legacy bypass when financial ops is on
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.enforce_appointment_service_order_consistency()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  flag_value boolean;
  linked_order_id uuid;
  finish_marker text;
  status_changed boolean;
  schedule_changed boolean;
  professional_changed boolean;
  service_changed boolean;
  client_changed boolean;
BEGIN
  SELECT establishment.financial_ops_enabled
  INTO flag_value
  FROM public.establishments AS establishment
  WHERE establishment.id = NEW.establishment_id;

  IF flag_value IS NOT TRUE THEN
    RETURN NEW;
  END IF;

  SELECT service_order.id
  INTO linked_order_id
  FROM public.service_orders AS service_order
  WHERE service_order.establishment_id = NEW.establishment_id
    AND service_order.appointment_id = NEW.id
  LIMIT 1;

  status_changed := OLD.status IS DISTINCT FROM NEW.status;
  schedule_changed := OLD.date_time IS DISTINCT FROM NEW.date_time
    OR OLD.ends_at IS DISTINCT FROM NEW.ends_at;
  professional_changed := OLD.professional_id IS DISTINCT FROM NEW.professional_id;
  service_changed := OLD.service_id IS DISTINCT FROM NEW.service_id;
  client_changed := OLD.establishment_client_id
      IS DISTINCT FROM NEW.establishment_client_id
    OR OLD.client_id IS DISTINCT FROM NEW.client_id;

  IF linked_order_id IS NULL THEN
    -- Sem comanda: legado de confirmação/cancel/no-show/reagendamento ok.
    -- Conclusão direta confirmed → completed é bloqueada.
    IF status_changed
       AND OLD.status = 'confirmed'
       AND NEW.status = 'completed'
    THEN
      RAISE EXCEPTION 'appointment_completion_requires_service_order';
    END IF;
    RETURN NEW;
  END IF;

  -- Comanda histórica existente: só finish_service_order pode completar.
  finish_marker := nullif(
    current_setting('app.service_order_finish_order_id', true),
    ''
  );

  IF status_changed
     AND OLD.status = 'confirmed'
     AND NEW.status = 'completed'
     AND finish_marker IS NOT NULL
     AND finish_marker = linked_order_id::text
     AND NOT schedule_changed
     AND NOT professional_changed
     AND NOT service_changed
     AND NOT client_changed
  THEN
    RETURN NEW;
  END IF;

  IF status_changed
     OR schedule_changed
     OR professional_changed
     OR service_changed
     OR client_changed
  THEN
    RAISE EXCEPTION 'appointment_has_service_order';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS appointments_enforce_service_order_consistency
  ON public.appointments;

CREATE TRIGGER appointments_enforce_service_order_consistency
  BEFORE UPDATE OF
    status,
    date_time,
    ends_at,
    professional_id,
    service_id,
    establishment_client_id,
    client_id
  ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_appointment_service_order_consistency();

REVOKE ALL ON FUNCTION public.enforce_appointment_service_order_consistency()
  FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 3. finish_service_order — same Etapa 3 body + authorized completion marker
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

    -- Marker scoped to this order id; cleared after the authorized UPDATE.
    PERFORM set_config(
      'app.service_order_finish_order_id',
      order_record.id::text,
      true
    );

    -- Status only — capture_appointment_event_trigger records the event.
    UPDATE public.appointments
    SET status = 'completed'
    WHERE id = appointment_record.id;

    PERFORM set_config(
      'app.service_order_finish_order_id',
      '',
      true
    );
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

COMMENT ON FUNCTION public.get_service_order_for_appointment(uuid, text) IS
  'P0 Etapa 4: bridge read of historical service_order for an appointment.';

COMMENT ON FUNCTION public.enforce_appointment_service_order_consistency() IS
  'P0 Etapa 4: when financial_ops_enabled, block direct appointment completion without service order and lock appointment fields after check-in.';

COMMENT ON FUNCTION public.finish_service_order(uuid, uuid, bigint, uuid) IS
  'P0 Etapa 3/4: finish in_service → awaiting_payment; authorized appointment completed via local config marker.';

COMMIT;
