import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  createFinancialOperationsApi,
  mapFinancialOperationsOverview,
} from '../../packages/database/src/financial-operations';

const ids = {
  establishment: '11111111-1111-4111-8111-111111111111',
  session: '22222222-2222-4222-8222-222222222222',
  correlation: '33333333-3333-4333-8333-333333333333',
};

const overview = {
  establishmentId: ids.establishment,
  localDate: '2026-08-21',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  scope: 'unit',
  readiness: {
    ready: true,
    operationalReady: true,
    financialOpsEnabled: true,
    activePaymentMethodCount: 2,
    activePaymentMethodTypes: ['cash', 'external_pix'],
    cashMethodActive: true,
    cashSessionOpen: true,
    blockers: [],
  },
  payments: {
    canView: true,
    grossReceivedCents: 15000,
    voidedCents: 2000,
    netReceivedCents: 13000,
    cashReceivedCents: 5000,
    pixReceivedCents: 8000,
    cardReceivedCents: 0,
    awaitingOrderCount: 2,
    outstandingCents: 7000,
  },
  cash: {
    canView: true,
    status: 'open',
    sessionId: ids.session,
    openedAt: '2026-08-21T10:00:00.000Z',
    expectedCountCents: null,
    expectedCountVisibility: 'hidden',
    lastClosedVarianceCents: -100,
  },
  alerts: [{
    code: 'orders_awaiting_payment',
    severity: 'info',
    title: 'Comandas aguardando recebimento',
    message: '2 comanda(s) ainda possuem saldo.',
    action: 'review_orders',
  }],
  dataCutoffAt: '2026-08-21T12:00:00.000Z',
  correlationId: ids.correlation,
};

test('maps the financial overview and fails closed on unsafe or contradictory data', () => {
  expect(mapFinancialOperationsOverview(overview)).toEqual(overview);
  expect(mapFinancialOperationsOverview({
    ...overview,
    currency: ' brl ',
  })).toMatchObject({ currency: 'BRL' });
  expect(mapFinancialOperationsOverview({
    ...overview,
    currency: 'R$',
  })).toBeNull();
  expect(mapFinancialOperationsOverview({
    ...overview,
    currency: null,
  })).toBeNull();
  expect(mapFinancialOperationsOverview({
    ...overview,
    payments: { ...overview.payments, outstandingCents: Number.MAX_SAFE_INTEGER + 1 },
  })).toBeNull();
  expect(mapFinancialOperationsOverview({
    ...overview,
    payments: { ...overview.payments, canView: false },
  })).toBeNull();
  expect(mapFinancialOperationsOverview({
    ...overview,
    readiness: {
      ...overview.readiness,
      activePaymentMethodCount: 0,
      activePaymentMethodTypes: [],
    },
    payments: {
      canView: false,
      grossReceivedCents: 0,
      voidedCents: 0,
      netReceivedCents: 0,
      cashReceivedCents: 0,
      pixReceivedCents: 0,
      cardReceivedCents: 0,
      awaitingOrderCount: 0,
      outstandingCents: 0,
    },
  })).toMatchObject({ payments: { canView: false } });
  expect(mapFinancialOperationsOverview({
    ...overview,
    cash: { ...overview.cash, expectedCountCents: 10000 },
  })).toBeNull();
  expect(mapFinancialOperationsOverview({
    ...overview,
    alerts: [{ ...overview.alerts[0], code: 'billing_payment_failed' }],
  })).toBeNull();
});

test('financial overview API invokes the exact read-only RPC contract', async () => {
  let calledName = '';
  let calledArgs: Record<string, unknown> = {};
  const api = createFinancialOperationsApi({
    marker: 'supabase-client',
    async rpc(this: { marker: string }, name: string, args: Record<string, unknown>) {
      expect(this.marker).toBe('supabase-client');
      calledName = name;
      calledArgs = args;
      return { data: overview, error: null };
    },
  } as never);

  await expect(api.getOverview(ids.establishment, overview.localDate))
    .resolves.toMatchObject({ scope: 'unit', payments: { netReceivedCents: 13000 } });
  expect(calledName).toBe('get_financial_operations_overview');
  expect(calledArgs).toEqual({
    target_establishment_id: ids.establishment,
    target_local_date: overview.localDate,
  });
});

test('financial overview rejects malformed identifiers and dates before calling the backend', async () => {
  const api = createFinancialOperationsApi({
    rpc: async () => { throw new Error('RPC should not run'); },
  } as never);

  await expect(api.getOverview('not-a-uuid', overview.localDate))
    .rejects.toMatchObject({ code: 'invalid_request' });
  await expect(api.getOverview(ids.establishment, '2026-02-31'))
    .rejects.toMatchObject({ code: 'invalid_request' });
});

test('slice 1 migration keeps POS, cash and SaaS billing boundaries explicit', () => {
  const migration = readFileSync(
    'supabase/migrations/20260826000000_financial_operations_overview_slice1.sql',
    'utf8',
  );
  const overviewFunction = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.get_financial_operations_overview'),
  );

  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_financial_operations_overview');
  expect(migration).toContain('LANGUAGE plpgsql\nVOLATILE');
  expect(migration).toContain('entry.amount_cents');
  expect(migration).toContain("service_order.status = 'awaiting_payment'");
  expect(migration).toContain("service_order.professional_id = actor_id");
  expect(migration).toContain('service_order.finished_at');
  expect(migration).toContain('cash_session.opened_at < range_end');
  expect(migration).toContain('COALESCE(cash_session.closed_at, statement_timestamp()) > range_start');
  expect(migration).toContain("'view_financial_reports'");
  expect(migration).toContain("'view_team_orders'");
  expect(migration).toContain("method.active");
  expect(migration).toContain('expected_visible');
  expect(migration).toContain("'canView', can_view_payments");
  expect(overviewFunction.indexOf("can_view_payments := public.has_business_capability(")).toBeLessThan(
    overviewFunction.indexOf('SELECT * INTO establishment_record'),
  );
  expect(migration).toContain('FROM PUBLIC, anon, authenticated');
  expect(migration).not.toContain('public.billing_');
  expect(migration).not.toContain('commission_entries');
});

test('Web and Business surfaces consume the shared overview without direct ledger reads', () => {
  const webHook = readFileSync(
    'apps/web/src/features/financial-operations/use-financial-operations-overview.ts',
    'utf8',
  );
  const businessHook = readFileSync(
    'apps/business/src/features/payments/use-financial-operations-overview.ts',
    'utf8',
  );
  const webScreen = readFileSync('apps/web/src/components/screens/AdminDashboardExperience.tsx', 'utf8');
  const settingsScreen = readFileSync('apps/web/src/components/screens/SettingsExperience.tsx', 'utf8');
  const businessScreen = readFileSync('apps/business/src/screens/today.tsx', 'utf8');

  for (const source of [webHook, businessHook, webScreen, businessScreen]) {
    expect(source).not.toContain(".from('order_payment_entries')");
    expect(source).not.toContain(".from('cash_sessions')");
  }
  expect(webScreen).toContain('admin-financial-overview');
  expect(webScreen).toContain("? 'Indisponível'");
  expect(settingsScreen).toContain('router.setParams({ section: key })');
  expect(businessScreen).toContain('business-financial-overview');
});
