import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

import {
  ManualPosApiError,
  createManualPosApi,
  mapPaymentMethodsReadModel,
  mapServiceOrderPaymentSummary,
  translateManualPosRpcError,
} from '../../packages/database/src/manual-pos';

const ids = {
  establishment: '11111111-1111-4111-8111-111111111111',
  order: '22222222-2222-4222-8222-222222222222',
  method: '33333333-3333-4333-8333-333333333333',
  entry: '44444444-4444-4444-8444-444444444444',
  correlation: '55555555-5555-4555-8555-555555555555',
  request: '66666666-6666-4666-8666-666666666666',
};

test('maps payment methods and fails closed on an unknown method type', () => {
  const payload = {
    establishmentId: ids.establishment,
    dataCutoffAt: '2026-08-11T12:00:00.000Z',
    correlationId: ids.correlation,
    methods: [{
      id: ids.method,
      methodType: 'cash',
      displayName: 'Dinheiro',
      active: true,
      requiresReference: false,
      version: 1,
    }],
  };

  expect(mapPaymentMethodsReadModel(payload)).toEqual(payload);
  expect(mapPaymentMethodsReadModel({
    ...payload,
    methods: [{ ...payload.methods[0], methodType: 'billing_card' }],
  })).toBeNull();
});

test('maps an auditable payment summary and rejects unsafe money', () => {
  const payload = {
    serviceOrderId: ids.order,
    establishmentId: ids.establishment,
    orderStatus: 'awaiting_payment',
    paymentStatus: 'partially_paid',
    currency: 'BRL',
    totalCents: 10000,
    paidCents: 4000,
    balanceCents: 6000,
    version: 3,
    lastEntryAt: '2026-08-11T12:00:00.000Z',
    dataCutoffAt: '2026-08-11T12:00:01.000Z',
    correlationId: ids.correlation,
    entries: [{
      id: ids.entry,
      entryType: 'payment',
      status: 'succeeded',
      amountCents: 4000,
      currency: 'BRL',
      paymentMethodId: ids.method,
      methodType: 'cash',
      methodName: 'Dinheiro',
      originalPaymentEntryId: null,
      externalReference: null,
      reason: null,
      correlationId: ids.correlation,
      createdAt: '2026-08-11T12:00:00.000Z',
    }],
  };

  expect(mapServiceOrderPaymentSummary(payload)).toEqual(payload);
  expect(mapServiceOrderPaymentSummary({
    ...payload,
    paidCents: Number.MAX_SAFE_INTEGER + 1,
  })).toBeNull();
  expect(mapServiceOrderPaymentSummary({
    ...payload,
    entries: [{ ...payload.entries[0], status: 'invented' }],
  })).toBeNull();
});

test('manual POS API sends integer cents and versioned idempotent arguments', async () => {
  let calledName = '';
  let calledArgs: Record<string, unknown> = {};
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calledName = name;
      calledArgs = args;
      return {
        data: {
          serviceOrderId: ids.order,
          paymentEntryId: ids.entry,
          status: 'awaiting_payment',
          version: 4,
          paymentStatus: 'paid',
          paidCents: 10000,
          balanceCents: 0,
        },
        error: null,
      };
    },
  };
  const api = createManualPosApi(client as never);

  const result = await api.recordPayment({
    establishmentId: ids.establishment,
    serviceOrderId: ids.order,
    paymentMethodId: ids.method,
    amountCents: 10000,
    externalReference: null,
    expectedVersion: 3,
    requestId: ids.request,
  });

  expect(calledName).toBe('record_order_payment');
  expect(calledArgs).toEqual({
    target_establishment_id: ids.establishment,
    target_service_order_id: ids.order,
    target_payment_method_id: ids.method,
    target_amount_cents: 10000,
    target_external_reference: null,
    target_expected_version: 3,
    target_request_id: ids.request,
  });
  expect(result.paymentStatus).toBe('paid');
});

test('manual POS API rejects decimal cents before calling the backend', async () => {
  const api = createManualPosApi({
    rpc: async () => {
      throw new Error('RPC should not run');
    },
  } as never);

  await expect(api.recordPayment({
    establishmentId: ids.establishment,
    serviceOrderId: ids.order,
    paymentMethodId: ids.method,
    amountCents: 10.5,
    expectedVersion: 1,
    requestId: ids.request,
  })).rejects.toMatchObject({ code: 'invalid_request' });
});

test('manual POS API preserves the Supabase client receiver when invoking rpc', async () => {
  const client = {
    marker: 'supabase-client',
    async rpc(this: { marker: string }) {
      expect(this.marker).toBe('supabase-client');
      return {
        data: {
          establishmentId: ids.establishment,
          dataCutoffAt: '2026-08-11T12:00:00.000Z',
          correlationId: ids.correlation,
          methods: [],
        },
        error: null,
      };
    },
  };

  await expect(createManualPosApi(client as never).listPaymentMethods(ids.establishment))
    .resolves.toMatchObject({ establishmentId: ids.establishment, methods: [] });
});

test('translates backend payment conflicts without leaking provider details', () => {
  expect(translateManualPosRpcError({
    code: 'P0001',
    message: 'payment_exceeds_order_balance',
  })).toMatchObject({ code: 'payment_exceeds_order_balance' });
  expect(translateManualPosRpcError({
    code: '42501',
    message: 'aal2_required',
  })).toMatchObject({ code: 'aal2_required' });
  expect(new ManualPosApiError('invalid_response').message).toBe('invalid_response');
});

test('payment summary access allows finance but keeps professionals scoped to their own orders', () => {
  const migration = readFileSync(
    'supabase/migrations/20260824002000_phase4_payment_summary_capability_scope.sql',
    'utf8',
  );

  expect(migration).toContain("'view_payments', 'full'");
  expect(migration).toContain("'view_orders', 'full'");
  expect(migration).toContain("'manage_team_orders', 'full'");
  expect(migration).toContain("'view_financial_reports', 'full'");
  expect(migration).toContain("'manage_own_orders', 'full'");
  expect(migration).toContain('target_professional_id = actor_id');
  expect(migration).toContain('assert_service_order_payment_read_access');
});
