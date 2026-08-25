BEGIN;

SET LOCAL search_path = pg_catalog, public, extensions;

-- Financial operations UX, slice 1.
-- Keeps operational receipts separate from billing_* and exposes only
-- capability-scoped aggregates. All monetary values remain integer cents.

CREATE OR REPLACE FUNCTION public.get_establishment_readiness(
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
  establishment_record public.establishments%ROWTYPE;
  opening_hours_configured boolean;
  active_service_configured boolean;
  management_membership_configured boolean;
  configuration_ready boolean;
  governance_allows_operation boolean;
  lifecycle_allows_operation boolean;
  manual_payment_method_configured boolean := false;
  service_fiscal_profile_configured boolean := false;
  operational_ready boolean;
  payments_ready boolean;
  fiscal_ready boolean;
  operational_blockers text[] := ARRAY[]::text[];
  payment_blockers text[] := ARRAY[]::text[];
  fiscal_blockers text[] := ARRAY[]::text[];
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF NOT public.can_view_establishment_readiness(target_establishment_id, actor_id) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO establishment_record
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  opening_hours_configured := NULLIF(
    btrim(COALESCE(establishment_record.opening_hours, '')), ''
  ) IS NOT NULL;
  SELECT EXISTS (
    SELECT 1
    FROM public.services AS service
    WHERE service.establishment_id = target_establishment_id
      AND service.is_active
      AND service.deleted_at IS NULL
  ) INTO active_service_configured;
  SELECT EXISTS (
    SELECT 1
    FROM public.memberships AS membership
    WHERE membership.establishment_id = target_establishment_id
      AND membership.status = 'active'
      AND membership.revoked_at IS NULL
      AND membership.role_template IN ('admin', 'manager')
  ) INTO management_membership_configured;
  SELECT EXISTS (
    SELECT 1
    FROM public.establishment_payment_methods AS method
    WHERE method.establishment_id = target_establishment_id
      AND method.active
  ) INTO manual_payment_method_configured;

  configuration_ready := opening_hours_configured
    AND active_service_configured
    AND management_membership_configured;
  governance_allows_operation := establishment_record.account_status = 'active';
  lifecycle_allows_operation := establishment_record.lifecycle_status IN ('ready', 'active');
  operational_ready := configuration_ready
    AND governance_allows_operation
    AND lifecycle_allows_operation;
  payments_ready := operational_ready
    AND establishment_record.financial_ops_enabled
    AND manual_payment_method_configured;
  fiscal_ready := operational_ready AND service_fiscal_profile_configured;

  IF NOT opening_hours_configured THEN
    operational_blockers := operational_blockers || ARRAY['opening_hours_not_configured'];
  END IF;
  IF NOT active_service_configured THEN
    operational_blockers := operational_blockers || ARRAY['active_service_not_configured'];
  END IF;
  IF NOT management_membership_configured THEN
    operational_blockers := operational_blockers || ARRAY['management_membership_not_configured'];
  END IF;
  IF NOT governance_allows_operation THEN
    operational_blockers := operational_blockers || ARRAY['governance_not_active'];
  END IF;
  IF NOT lifecycle_allows_operation THEN
    operational_blockers := operational_blockers || ARRAY['lifecycle_not_ready'];
  END IF;
  IF NOT establishment_record.financial_ops_enabled THEN
    payment_blockers := payment_blockers || ARRAY['financial_ops_disabled'];
  END IF;
  IF NOT manual_payment_method_configured THEN
    payment_blockers := payment_blockers || ARRAY['payment_methods_not_configured'];
  END IF;
  IF NOT operational_ready THEN
    payment_blockers := payment_blockers || ARRAY['operational_not_ready'];
    fiscal_blockers := fiscal_blockers || ARRAY['operational_not_ready'];
  END IF;
  IF NOT service_fiscal_profile_configured THEN
    fiscal_blockers := fiscal_blockers || ARRAY['service_fiscal_profile_not_configured'];
  END IF;

  RETURN jsonb_build_object(
    'establishmentId', establishment_record.id,
    'lifecycleStatus', establishment_record.lifecycle_status,
    'accountStatus', establishment_record.account_status,
    'operationalReady', operational_ready,
    'paymentsReady', payments_ready,
    'fiscalReady', fiscal_ready,
    'checks', jsonb_build_object(
      'openingHoursConfigured', opening_hours_configured,
      'activeServiceConfigured', active_service_configured,
      'managementMembershipConfigured', management_membership_configured,
      'governanceAllowsOperation', governance_allows_operation,
      'lifecycleAllowsOperation', lifecycle_allows_operation,
      'financialOpsEnabled', establishment_record.financial_ops_enabled,
      'manualPaymentMethodConfigured', manual_payment_method_configured,
      'serviceFiscalProfileConfigured', service_fiscal_profile_configured
    ),
    'blockers', jsonb_build_object(
      'operational', to_jsonb(operational_blockers),
      'payments', to_jsonb(payment_blockers),
      'fiscal', to_jsonb(fiscal_blockers)
    ),
    'version', establishment_record.lifecycle_version,
    'dataCutoffAt', statement_timestamp()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.get_financial_operations_overview(
  target_establishment_id uuid,
  target_local_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  actor_id uuid := (SELECT auth.uid());
  establishment_record public.establishments%ROWTYPE;
  requested_local_date date;
  range_start timestamptz;
  range_end timestamptz;
  can_view_payments boolean := false;
  can_view_cash boolean := false;
  can_view_financial_reports boolean := false;
  unit_scope boolean := false;
  active_method_count integer := 0;
  active_method_types jsonb := '[]'::jsonb;
  cash_method_active boolean := false;
  gross_received_cents bigint := 0;
  voided_cents bigint := 0;
  net_received_cents bigint := 0;
  cash_received_cents bigint := 0;
  pix_received_cents bigint := 0;
  card_received_cents bigint := 0;
  awaiting_order_count integer := 0;
  outstanding_cents bigint := 0;
  register_record public.cash_registers%ROWTYPE;
  session_record public.cash_sessions%ROWTYPE;
  cash_status text := 'unavailable';
  expected_cents bigint;
  expected_visible boolean := false;
  last_closed_variance_cents bigint;
  readiness jsonb;
  alerts jsonb := '[]'::jsonb;
BEGIN
  IF actor_id IS NULL THEN
    RAISE EXCEPTION 'authentication_required' USING ERRCODE = '28000';
  END IF;
  IF target_establishment_id IS NULL THEN
    RAISE EXCEPTION 'invalid_establishment' USING ERRCODE = '22023';
  END IF;

  can_view_payments := public.has_business_capability(
    target_establishment_id, 'view_payments'
  );
  can_view_cash := public.has_business_capability(
    target_establishment_id, 'view_cash'
  );
  IF NOT can_view_payments AND NOT can_view_cash THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO establishment_record
  FROM public.establishments AS establishment
  WHERE establishment.id = target_establishment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'establishment_not_found' USING ERRCODE = 'P0002';
  END IF;

  can_view_financial_reports := public.has_business_capability(
    target_establishment_id, 'view_financial_reports'
  );
  unit_scope := can_view_financial_reports OR public.has_business_capability(
    target_establishment_id, 'view_team_orders'
  );

  requested_local_date := COALESCE(
    target_local_date,
    (statement_timestamp() AT TIME ZONE establishment_record.timezone)::date
  );
  range_start := requested_local_date::timestamp AT TIME ZONE establishment_record.timezone;
  range_end := (requested_local_date + 1)::timestamp AT TIME ZONE establishment_record.timezone;

  SELECT
    count(*) FILTER (WHERE method.active)::integer,
    COALESCE(
      jsonb_agg(method.method_type ORDER BY method.method_type)
        FILTER (WHERE method.active),
      '[]'::jsonb
    ),
    COALESCE(bool_or(method.active AND method.method_type = 'cash'), false)
  INTO active_method_count, active_method_types, cash_method_active
  FROM public.establishment_payment_methods AS method
  WHERE method.establishment_id = target_establishment_id;

  IF can_view_payments THEN
    SELECT
      COALESCE(sum(CASE
        WHEN entry.status = 'succeeded' AND entry.entry_type = 'payment'
          THEN entry.amount_cents ELSE 0 END), 0)::bigint,
      COALESCE(sum(CASE
        WHEN entry.status = 'succeeded' AND entry.entry_type = 'void'
          THEN entry.amount_cents ELSE 0 END), 0)::bigint,
      COALESCE(sum(CASE
        WHEN entry.status <> 'succeeded' THEN 0
        WHEN entry.entry_type = 'payment' THEN entry.amount_cents
        ELSE -entry.amount_cents END), 0)::bigint,
      COALESCE(sum(CASE
        WHEN entry.status <> 'succeeded' OR entry.method_type_snapshot <> 'cash' THEN 0
        WHEN entry.entry_type = 'payment' THEN entry.amount_cents ELSE -entry.amount_cents END), 0)::bigint,
      COALESCE(sum(CASE
        WHEN entry.status <> 'succeeded' OR entry.method_type_snapshot <> 'external_pix' THEN 0
        WHEN entry.entry_type = 'payment' THEN entry.amount_cents ELSE -entry.amount_cents END), 0)::bigint,
      COALESCE(sum(CASE
        WHEN entry.status <> 'succeeded' OR entry.method_type_snapshot <> 'external_card' THEN 0
        WHEN entry.entry_type = 'payment' THEN entry.amount_cents ELSE -entry.amount_cents END), 0)::bigint
    INTO gross_received_cents, voided_cents, net_received_cents,
      cash_received_cents, pix_received_cents, card_received_cents
    FROM public.order_payment_entries AS entry
    JOIN public.service_orders AS service_order
      ON service_order.id = entry.service_order_id
     AND service_order.establishment_id = entry.establishment_id
    WHERE entry.establishment_id = target_establishment_id
      AND entry.created_at >= range_start
      AND entry.created_at < range_end
      AND (unit_scope OR service_order.professional_id = actor_id);

    WITH scoped_orders AS (
      SELECT service_order.id, service_order.total_cents
      FROM public.service_orders AS service_order
      WHERE service_order.establishment_id = target_establishment_id
        AND service_order.status = 'awaiting_payment'
        AND COALESCE(
          service_order.finished_at,
          service_order.started_at,
          service_order.created_at
        ) >= range_start
        AND COALESCE(
          service_order.finished_at,
          service_order.started_at,
          service_order.created_at
        ) < range_end
        AND (unit_scope OR service_order.professional_id = actor_id)
    ), ledger AS (
      SELECT
        scoped_order.id,
        scoped_order.total_cents,
        COALESCE(sum(CASE
          WHEN entry.status <> 'succeeded' THEN 0
          WHEN entry.entry_type = 'payment' THEN entry.amount_cents
          ELSE -entry.amount_cents END), 0)::bigint AS paid_cents
      FROM scoped_orders AS scoped_order
      LEFT JOIN public.order_payment_entries AS entry
        ON entry.service_order_id = scoped_order.id
       AND entry.establishment_id = target_establishment_id
      GROUP BY scoped_order.id, scoped_order.total_cents
    )
    SELECT
      count(*)::integer,
      COALESCE(sum(greatest(ledger.total_cents - ledger.paid_cents, 0)), 0)::bigint
    INTO awaiting_order_count, outstanding_cents
    FROM ledger;
  END IF;

  IF can_view_cash THEN
    SELECT * INTO register_record
    FROM public.cash_registers AS cash_register
    WHERE cash_register.establishment_id = target_establishment_id;

    IF register_record.id IS NULL THEN
      cash_status := 'unavailable';
    ELSE
      SELECT * INTO session_record
      FROM public.cash_sessions AS cash_session
      WHERE cash_session.cash_register_id = register_record.id
        AND cash_session.opened_at < range_end
        AND COALESCE(cash_session.closed_at, statement_timestamp()) > range_start
      ORDER BY (cash_session.status = 'open') DESC,
        cash_session.opened_at DESC,
        cash_session.id DESC
      LIMIT 1;

      IF session_record.id IS NULL THEN
        cash_status := 'not_open';
      ELSE
        cash_status := session_record.status;
        expected_cents := CASE
          WHEN session_record.status = 'closed' THEN session_record.expected_count_cents
          ELSE public.calculate_cash_session_expected_count(session_record.id)
        END;
        expected_visible := session_record.status = 'closed'
          OR can_view_financial_reports;
      END IF;

      SELECT cash_session.variance_cents
      INTO last_closed_variance_cents
      FROM public.cash_sessions AS cash_session
      WHERE cash_session.cash_register_id = register_record.id
        AND cash_session.status = 'closed'
        AND cash_session.closed_at >= range_start
        AND cash_session.closed_at < range_end
      ORDER BY cash_session.closed_at DESC NULLS LAST, cash_session.id DESC
      LIMIT 1;
    END IF;
  END IF;

  readiness := public.get_establishment_readiness(target_establishment_id);

  IF NOT establishment_record.financial_ops_enabled THEN
    alerts := alerts || jsonb_build_array(jsonb_build_object(
      'code', 'financial_ops_disabled',
      'severity', 'warning',
      'title', 'Operações financeiras desativadas',
      'message', 'A unidade precisa ser liberada pelo Control antes de registrar recebimentos.',
      'action', 'review_readiness'
    ));
  END IF;
  IF can_view_payments AND active_method_count = 0 THEN
    alerts := alerts || jsonb_build_array(jsonb_build_object(
      'code', 'payment_methods_not_configured',
      'severity', 'warning',
      'title', 'Escolha os meios de pagamento',
      'message', 'Ative ao menos um meio usado pela unidade.',
      'action', 'configure_payment_methods'
    ));
  END IF;
  IF cash_method_active AND can_view_cash AND cash_status <> 'open' THEN
    alerts := alerts || jsonb_build_array(jsonb_build_object(
      'code', 'cash_session_not_open',
      'severity', 'warning',
      'title', 'Caixa ainda não aberto',
      'message', 'Abra o caixa antes de receber pagamentos em dinheiro.',
      'action', 'open_cash'
    ));
  END IF;
  IF awaiting_order_count > 0 THEN
    alerts := alerts || jsonb_build_array(jsonb_build_object(
      'code', 'orders_awaiting_payment',
      'severity', 'info',
      'title', 'Comandas aguardando recebimento',
      'message', format('%s comanda(s) ainda possuem saldo.', awaiting_order_count),
      'action', 'review_orders'
    ));
  END IF;
  IF last_closed_variance_cents IS NOT NULL AND last_closed_variance_cents <> 0 THEN
    alerts := alerts || jsonb_build_array(jsonb_build_object(
      'code', 'cash_variance_detected',
      'severity', 'warning',
      'title', 'Último caixa fechou com diferença',
      'message', 'Revise a composição do fechamento anterior.',
      'action', 'review_cash'
    ));
  END IF;

  RETURN jsonb_build_object(
    'establishmentId', target_establishment_id,
    'localDate', requested_local_date,
    'timezone', establishment_record.timezone,
    'currency', establishment_record.currency,
    'scope', CASE WHEN unit_scope THEN 'unit' ELSE 'own' END,
    'readiness', jsonb_build_object(
      'ready', COALESCE((readiness->>'paymentsReady')::boolean, false),
      'operationalReady', COALESCE((readiness->>'operationalReady')::boolean, false),
      'financialOpsEnabled', establishment_record.financial_ops_enabled,
      'activePaymentMethodCount', CASE WHEN can_view_payments THEN active_method_count ELSE 0 END,
      'activePaymentMethodTypes', CASE WHEN can_view_payments THEN active_method_types ELSE '[]'::jsonb END,
      'cashMethodActive', cash_method_active,
      'cashSessionOpen', cash_status = 'open',
      'blockers', COALESCE(readiness #> '{blockers,payments}', '[]'::jsonb)
    ),
    'payments', jsonb_build_object(
      'canView', can_view_payments,
      'grossReceivedCents', gross_received_cents,
      'voidedCents', voided_cents,
      'netReceivedCents', net_received_cents,
      'cashReceivedCents', cash_received_cents,
      'pixReceivedCents', pix_received_cents,
      'cardReceivedCents', card_received_cents,
      'awaitingOrderCount', awaiting_order_count,
      'outstandingCents', outstanding_cents
    ),
    'cash', jsonb_build_object(
      'canView', can_view_cash,
      'status', cash_status,
      'sessionId', session_record.id,
      'openedAt', session_record.opened_at,
      'expectedCountCents', CASE WHEN expected_visible THEN expected_cents ELSE NULL END,
      'expectedCountVisibility', CASE WHEN expected_visible THEN 'visible' ELSE 'hidden' END,
      'lastClosedVarianceCents', last_closed_variance_cents
    ),
    'alerts', alerts,
    'dataCutoffAt', statement_timestamp(),
    'correlationId', gen_random_uuid()
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_establishment_readiness(uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_establishment_readiness(uuid)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.get_financial_operations_overview(uuid, date)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_financial_operations_overview(uuid, date)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.get_financial_operations_overview(uuid, date) IS
  'Capability-scoped operational snapshot. Amounts are declared manual POS receipts, not provider settlement, SaaS billing, accounting revenue or profit.';

COMMIT;
