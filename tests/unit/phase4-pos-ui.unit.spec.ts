/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { createServiceOrderApi } from '../../packages/database/src/service-order-api';
import {
  businessPosOutboxKey,
  decodeBusinessPosOutbox,
  encodeBusinessPosOutbox,
  type BusinessPosOutboxEntry,
} from '../../apps/business/src/features/payments/business-pos-outbox-contract';

const read = (relativePath: string) => fs
  .readFileSync(path.join(process.cwd(), relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const businessScreen = read('apps/business/src/screens/appointment-operation.tsx');
const businessApi = read('apps/business/src/services/business-api.ts');
const webSettings = read('apps/web/src/components/settings/PaymentMethodsSettings.tsx');
const migration = read('supabase/migrations/20260824000000_phase4_manual_pos_foundation.sql');
const posOutbox = read('apps/business/src/features/payments/business-pos-outbox.ts');

test('Business payment UI is capability gated and server-confirmed', () => {
  expect(businessScreen).toContain("hasCapability('view_payments')");
  expect(businessScreen).toContain("hasCapability('take_payments')");
  expect(businessScreen).toContain("hasCapability('void_payments')");
  expect(businessScreen).toContain('await executeBusinessPosCommand(entry)');
  expect(businessScreen).toContain('await enqueueBusinessPosCommand');
  expect(businessScreen).toContain('Pagamento confirmado pelo servidor.');
  expect(businessScreen).toContain('salvo neste aparelho. O mesmo protocolo será reenviado');
  expect(businessScreen).not.toContain(".from('order_payment_entries')");
  expect(businessScreen).not.toContain(".from('establishment_payment_methods')");
});

test('Business shows production total, received amount and balance separately', () => {
  expect(businessScreen).toContain('Total {formatCents(serviceOrder.totalCents)}');
  expect(businessScreen).toContain('Recebido {formatCents(paymentSummary.paidCents)}');
  expect(businessScreen).toContain('Saldo {formatCents(paymentSummary.balanceCents)}');
  expect(businessScreen).toContain('Estorno confirmado pelo servidor por lançamento compensatório.');
  expect(businessScreen).toContain('Há uma operação financeira pendente.');
});

test('Business POS outbox is durable, user-scoped and replay-safe', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const now = new Date('2026-08-11T12:00:00.000Z');
  const entry: BusinessPosOutboxEntry = {
    version: 1,
    kind: 'record_payment',
    userId,
    establishmentId: '22222222-2222-4222-8222-222222222222',
    serviceOrderId: '33333333-3333-4333-8333-333333333333',
    paymentMethodId: '44444444-4444-4444-8444-444444444444',
    amountCents: 2500,
    externalReference: 'PIX-LOCAL-1',
    expectedVersion: 3,
    requestId: '55555555-5555-4555-8555-555555555555',
    status: 'offline_pending',
    attempts: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    lastError: 'network_error',
  };

  expect(businessPosOutboxKey(userId)).toContain(userId);
  expect(decodeBusinessPosOutbox(
    encodeBusinessPosOutbox([entry]),
    userId,
    now.getTime(),
  )).toEqual([entry]);
  expect(decodeBusinessPosOutbox(
    encodeBusinessPosOutbox([entry]),
    '66666666-6666-4666-8666-666666666666',
    now.getTime(),
  )).toEqual([]);
  expect(posOutbox).toContain('requestId: entry.requestId');
  expect(posOutbox).toContain("error.code === 'network_error'");
  expect(posOutbox).toContain('replayLocks.get(key)');
  expect(posOutbox).toContain('removeBusinessPosCommand(userId, entry.requestId)');
});

test('Business POS outbox rejects unsafe money and malformed payloads', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const timestamp = '2026-08-11T12:00:00.000Z';
  const unsafe = JSON.stringify([{
    version: 1,
    kind: 'record_payment',
    userId,
    establishmentId: '22222222-2222-4222-8222-222222222222',
    serviceOrderId: '33333333-3333-4333-8333-333333333333',
    paymentMethodId: '44444444-4444-4444-8444-444444444444',
    amountCents: 12.5,
    externalReference: null,
    expectedVersion: 3,
    requestId: '55555555-5555-4555-8555-555555555555',
    status: 'offline_pending',
    attempts: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    lastError: null,
  }]);
  expect(decodeBusinessPosOutbox(unsafe, userId, Date.parse(timestamp))).toEqual([]);
  expect(decodeBusinessPosOutbox('{invalid', userId)).toBeNull();
});

test('Web payment settings remain independent from SaaS billing and fail closed', () => {
  expect(webSettings).toContain('createManualPosApi(supabase)');
  expect(webSettings).toContain("financialOps.hasCapability('view_payments')");
  expect(webSettings).toContain("financialOps.hasCapability('manage_operational_settings')");
  expect(webSettings).toContain('financialOps.financialOpsEnabled');
  expect(webSettings).toContain('não usam billing_* nem Stripe');
  expect(webSettings).not.toContain(".from('billing_");
  expect(webSettings).not.toContain(".from('establishment_payment_methods')");
});

test('Business API uses shared RPC contracts instead of direct financial tables', () => {
  expect(businessApi).toContain('createManualPosApi(client).recordPayment(input)');
  expect(businessApi).toContain('createManualPosApi(client).voidPayment(input)');
  expect(businessApi).toContain('createServiceOrderApi(client).closeServiceOrder(input)');
  expect(migration).toMatch(
    /REVOKE ALL ON public\.establishment_payment_methods,[\s\S]*public\.order_payment_entries,[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
});

test('close service order sends expectedVersion and requestId to the RPC', async () => {
  const establishmentId = '11111111-1111-4111-8111-111111111111';
  const serviceOrderId = '22222222-2222-4222-8222-222222222222';
  const requestId = '33333333-3333-4333-8333-333333333333';
  let calledName = '';
  let calledArgs: Record<string, unknown> = {};
  const api = createServiceOrderApi({
    rpc: async (name: string, args: Record<string, unknown>) => {
      calledName = name;
      calledArgs = args;
      return {
        data: { serviceOrderId, status: 'closed', version: 5 },
        error: null,
      };
    },
  } as never);

  await expect(api.closeServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion: 4,
    requestId,
  })).resolves.toEqual({ serviceOrderId, status: 'closed', version: 5 });
  expect(calledName).toBe('close_service_order');
  expect(calledArgs).toEqual({
    target_establishment_id: establishmentId,
    target_service_order_id: serviceOrderId,
    target_expected_version: 4,
    target_request_id: requestId,
  });
});

test('service order API preserves the Supabase client receiver when invoking rpc', async () => {
  const establishmentId = '11111111-1111-4111-8111-111111111111';
  const serviceOrderId = '22222222-2222-4222-8222-222222222222';
  const requestId = '33333333-3333-4333-8333-333333333333';
  const client = {
    marker: 'supabase-client',
    async rpc(this: { marker: string }) {
      expect(this.marker).toBe('supabase-client');
      return {
        data: { serviceOrderId, status: 'closed', version: 5 },
        error: null,
      };
    },
  };

  await expect(createServiceOrderApi(client as never).closeServiceOrder({
    establishmentId,
    serviceOrderId,
    expectedVersion: 4,
    requestId,
  })).resolves.toEqual({ serviceOrderId, status: 'closed', version: 5 });
});
