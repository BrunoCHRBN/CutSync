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
const businessAccount = read('apps/business/src/screens/account.tsx');
const decisionDetail = read('apps/business/src/screens/decision-detail.tsx');
const businessApi = read('apps/business/src/services/business-api.ts');
const businessManagement = read('apps/business/src/screens/management.tsx');
const businessPaymentMethods = read('apps/business/src/screens/payment-methods.tsx');
const webSettings = read('apps/web/src/components/settings/PaymentMethodsSettings.tsx');
const webPaymentPanel = read('apps/web/src/components/payments/ServiceOrderPaymentPanel.tsx');
const webPaymentHook = read('apps/web/src/features/payments/use-service-order-payments.ts');
const webServiceOrderHook = read('apps/web/src/features/service-orders/use-appointment-service-order.ts');
const migration = read('supabase/migrations/20260824000000_phase4_manual_pos_foundation.sql');
const posOutbox = read('apps/business/src/features/payments/business-pos-outbox.ts');

test('Business payment UI is capability gated and server-confirmed', () => {
  expect(businessScreen).toContain("hasCapability('view_payments')");
  expect(businessScreen).toContain("hasCapability('take_payments')");
  expect(businessScreen).toContain("hasCapability('void_payments')");
  expect(businessScreen).toContain('await executeBusinessPosCommand(entry)');
  expect(businessScreen).toContain('await enqueueBusinessPosCommand');
  expect(businessScreen).toContain('Pagamento confirmado pelo servidor.');
  expect(businessScreen).toContain('business-open-payment-method-settings');
  expect(businessScreen).toContain("router.push('/(app)/payment-methods' as never)");
  expect(businessScreen).not.toContain('Configure os meios no Web.');
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

test('Business exposes the installed build and keeps disabled POS visible', () => {
  expect(businessAccount).toContain('business-installed-version');
  expect(businessAccount).toContain('Constants.nativeBuildVersion');
  expect(businessAccount).toContain('build 2 ou superior');
  expect(businessScreen).toContain('business-financial-ops-disabled');
  expect(businessScreen).toContain('O POS manual está presente nesta build');
});

test('Business explains every server-side reassignment eligibility requirement', () => {
  expect(decisionDetail).toContain('business-reassignment-candidates-guidance');
  expect(decisionDetail).toContain('oferecer este mesmo serviço');
  expect(decisionDetail).toContain('estar livre exatamente no horário');
  expect(decisionDetail).toContain('diferente do');
  expect(decisionDetail).toContain('profissional atual');
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

test('Web records partial and mixed payments through versioned RPC contracts', () => {
  expect(webPaymentPanel).toContain('web-service-order-payment-panel');
  expect(webPaymentPanel).toContain('decimalAmountToCents(amount)');
  expect(webPaymentPanel).toContain('payments.summary.balanceCents');
  expect(webPaymentPanel).toContain('payments.methods.map');
  expect(webPaymentPanel).toContain('payments.summary.entries.map');
  expect(webPaymentPanel).toContain('web-payment-entry-list');
  expect(webPaymentHook).toContain('api.recordPayment');
  expect(webPaymentHook).toContain('expectedVersion: summary.version');
  expect(webPaymentHook).toContain('requestId: commandRef.current.requestId');
  expect(webPaymentHook).toContain("recordError.code !== 'network_error'");
  expect(webPaymentHook).toContain('api.voidPayment');
  expect(webPaymentHook).toContain('requestId: voidCommandRef.current.requestId');
  expect(webPaymentPanel).toContain('web-void-payment-form');
  expect(webPaymentPanel).toContain('exige sessão AAL2');
  expect(webPaymentPanel).not.toContain(".from('order_payment_entries')");
  expect(webPaymentPanel).toContain('web-close-paid-service-order');
  expect(webPaymentPanel).toContain('payments.summary.balanceCents === 0');
  expect(webServiceOrderHook).toContain("type ServiceOrderCommand = 'open' | 'start' | 'finish' | 'close'");
  expect(webServiceOrderHook).toContain('api.closeServiceOrder');
});

test('Business API uses shared RPC contracts instead of direct financial tables', () => {
  expect(businessApi).toContain('createManualPosApi(client).configurePaymentMethod(input)');
  expect(businessApi).toContain('createManualPosApi(client).recordPayment(input)');
  expect(businessApi).toContain('createManualPosApi(client).voidPayment(input)');
  expect(businessApi).toContain('createServiceOrderApi(client).closeServiceOrder(input)');
  expect(migration).toMatch(
    /REVOKE ALL ON public\.establishment_payment_methods,[\s\S]*public\.order_payment_entries,[\s\S]*FROM PUBLIC, anon, authenticated;/,
  );
});

test('Business configures manual POS payment methods through the governed RPC', () => {
  expect(businessManagement).toContain("route: '/(app)/payment-methods'");
  expect(businessManagement).toContain("hasCapability('view_payments')");
  expect(businessPaymentMethods).toContain("hasCapability('manage_operational_settings')");
  expect(businessPaymentMethods).toContain('businessApi.configurePaymentMethod');
  expect(businessPaymentMethods).toContain('expectedVersion: draft.version');
  expect(businessPaymentMethods).toContain('requestId: command.requestId');
  expect(businessPaymentMethods).toContain('Sem confirmação do servidor');
  expect(businessPaymentMethods).not.toContain(".from('establishment_payment_methods')");
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
