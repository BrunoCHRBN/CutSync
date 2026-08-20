/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { mapAppointmentServiceOrderContext } from '../../packages/database/src/business';
import {
  AWAITING_PAYMENT_NOTICE,
  appointmentIsLockedByServiceOrder,
  resolveAppointmentOrderPrimaryAction,
} from '../../packages/domain/src';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260817000000_appointment_service_order_integration.sql',
);
const sqlTest = read('supabase/tests/appointment_service_order_integration.sql');
const generatedRpc = read('packages/database/src/business-rpc.generated.ts');
const domainUi = read('packages/domain/src/service-order-ui.ts');

const bridgeRpc = 'get_service_order_for_appointment';

const functionBody = (name: string): string => {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = migration.indexOf(marker);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);

  const nextCreate = migration.indexOf('CREATE OR REPLACE FUNCTION public.', start + marker.length);
  const nextComment = migration.indexOf('\nCOMMENT ON FUNCTION', start + marker.length);
  let end = migration.length;
  for (const candidate of [nextCreate, nextComment]) {
    if (candidate > start && candidate < end) end = candidate;
  }
  return migration.slice(start, end);
};

const sqlArgNames = (body: string): string[] => {
  const headerEnd = body.indexOf('RETURNS');
  expect(headerEnd, 'function header must include RETURNS').toBeGreaterThan(-1);
  const header = body.slice(0, headerEnd);
  return [...header.matchAll(/\b(target_[a-z0-9_]+)\b/g)].map((match) => match[1]!);
};

const tsArgNames = (rpcName: string): string[] => {
  const blockStart = generatedRpc.indexOf(`${rpcName}:`);
  expect(blockStart, `${rpcName} must exist in generated RPC types`).toBeGreaterThan(-1);
  const argsStart = generatedRpc.indexOf('Args: {', blockStart);
  const argsEnd = generatedRpc.indexOf('};', argsStart);
  expect(argsStart).toBeGreaterThan(blockStart);
  expect(argsEnd).toBeGreaterThan(argsStart);
  const argsBlock = generatedRpc.slice(argsStart, argsEnd);
  return [...argsBlock.matchAll(/\b(target_[a-z0-9_]+)\b/g)].map((match) => match[1]!);
};

const validOrderDetail = {
  order: {
    id: '11111111-1111-1111-1111-111111111111',
    establishmentId: '22222222-2222-2222-2222-222222222222',
    appointmentId: 'appt-main',
    establishmentClientId: null as string | null,
    professionalId: '33333333-3333-3333-3333-333333333333',
    status: 'open' as const,
    currency: 'BRL' as const,
    subtotalCents: 7500,
    discountCents: 0,
    totalCents: 7500,
    internalNotes: null as string | null,
    openedAt: '2026-08-03T12:00:00.000Z',
    startedAt: null as string | null,
    finishedAt: null as string | null,
    closedAt: null as string | null,
    voidedAt: null as string | null,
    voidReason: null as string | null,
    version: 1,
  },
  items: [{
    id: '44444444-4444-4444-4444-444444444444',
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    establishmentId: '22222222-2222-2222-2222-222222222222',
    serviceId: 'service-cut',
    professionalId: '33333333-3333-3333-3333-333333333333',
    descriptionSnapshot: 'Cut',
    quantity: 1,
    unitPriceCents: 7500,
    discountCents: 0,
    subtotalCents: 7500,
    totalCents: 7500,
    sortOrder: 0,
  }],
  events: [{
    id: 1,
    eventType: 'opened',
    previousStatus: null as string | null,
    resultingStatus: 'open',
    actorId: '33333333-3333-3333-3333-333333333333',
    metadata: {},
    createdAt: '2026-08-03T12:00:00.000Z',
  }],
};

test('1: migration creates get_service_order_for_appointment bridge RPC', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.get_service_order_for_appointment(',
  );
});

test('2-3: bridge RPC is SECURITY DEFINER with fixed search_path', () => {
  const body = functionBody(bridgeRpc);
  expect(body).toContain('SECURITY DEFINER');
  expect(body).toContain('SET search_path = pg_catalog, public');
});

test('4: bridge RPC grants EXECUTE to authenticated and service_role', () => {
  expect(migration).toContain(
    'GRANT EXECUTE ON FUNCTION public.get_service_order_for_appointment(uuid, text)',
  );
  expect(migration).toMatch(
    /GRANT EXECUTE ON FUNCTION public\.get_service_order_for_appointment\(uuid, text\)\s+TO authenticated, service_role/,
  );
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.get_service_order_for_appointment(uuid, text)',
  );
});

test('5: consistency trigger is installed on appointments', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.enforce_appointment_service_order_consistency()',
  );
  expect(migration).toContain(
    'CREATE TRIGGER appointments_enforce_service_order_consistency',
  );
  expect(migration).toContain('BEFORE UPDATE OF');
  expect(migration).toContain('EXECUTE FUNCTION public.enforce_appointment_service_order_consistency()');
});

test('6: trigger checks financial_ops_enabled flag', () => {
  const triggerStart = migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.enforce_appointment_service_order_consistency()',
  );
  const triggerBody = migration.slice(triggerStart, migration.indexOf(
    'CREATE OR REPLACE FUNCTION public.finish_service_order(',
    triggerStart,
  ));
  expect(triggerBody).toContain('financial_ops_enabled');
  expect(triggerBody).toContain('appointment_completion_requires_service_order');
  expect(triggerBody).toContain('appointment_has_service_order');
});

test('7: finish marks authorized completion with order id config', () => {
  const finishBody = functionBody('finish_service_order');
  expect(finishBody).toContain("app.service_order_finish_order_id");
  expect(finishBody).toContain('order_record.id::text');
  expect(finishBody).toContain("set_config(");
});

test('8: finish keeps command type service_order.finished', () => {
  const finishBody = functionBody('finish_service_order');
  expect(finishBody).toContain("'service_order.finished'");
  expect(finishBody).not.toContain("'appointment.completed'");
});

test('9: finish does not INSERT appointment_events manually', () => {
  const finishBody = functionBody('finish_service_order');
  expect(finishBody).not.toContain('INSERT INTO public.appointment_events');
  expect(finishBody).toContain('capture_appointment_event_trigger');
});

test('10: SQL and TypeScript arg names align for get_service_order_for_appointment', () => {
  const sqlArgs = sqlArgNames(functionBody(bridgeRpc));
  const tsArgs = tsArgNames(bridgeRpc);
  expect(sqlArgs).toEqual([
    'target_establishment_id',
    'target_appointment_id',
  ]);
  expect(sqlArgs).toEqual(tsArgs);
});

test('11: mapAppointmentServiceOrderContext returns null for invalid root', () => {
  expect(mapAppointmentServiceOrderContext(null)).toBeNull();
  expect(mapAppointmentServiceOrderContext(undefined)).toBeNull();
  expect(mapAppointmentServiceOrderContext('x')).toBeNull();
  expect(mapAppointmentServiceOrderContext({})).toBeNull();
  expect(mapAppointmentServiceOrderContext({ appointmentId: '' })).toBeNull();
});

test('12: mapAppointmentServiceOrderContext accepts null serviceOrder', () => {
  expect(mapAppointmentServiceOrderContext({
    appointmentId: 'appt-1',
    serviceOrder: null,
  })).toEqual({ appointmentId: 'appt-1', serviceOrder: null });
  expect(mapAppointmentServiceOrderContext({
    appointmentId: 'appt-1',
  })).toEqual({ appointmentId: 'appt-1', serviceOrder: null });
});

test('13: mapAppointmentServiceOrderContext maps valid nested detail', () => {
  const mapped = mapAppointmentServiceOrderContext({
    appointmentId: 'appt-main',
    serviceOrder: validOrderDetail,
  });
  expect(mapped).not.toBeNull();
  expect(mapped?.appointmentId).toBe('appt-main');
  expect(mapped?.serviceOrder?.id).toBe('11111111-1111-1111-1111-111111111111');
  expect(mapped?.serviceOrder?.totalCents).toBe(7500);
  expect(mapped?.serviceOrder?.items).toHaveLength(1);
});

test('14: mapAppointmentServiceOrderContext rejects paymentStatus and invalid order', () => {
  expect(mapAppointmentServiceOrderContext({
    appointmentId: 'appt-1',
    paymentStatus: 'paid',
    serviceOrder: null,
  })).toBeNull();
  expect(mapAppointmentServiceOrderContext({
    appointmentId: 'appt-1',
    serviceOrder: { ...validOrderDetail, paymentStatus: 'unpaid' },
  })).toBeNull();
  expect(mapAppointmentServiceOrderContext({
    appointmentId: 'appt-1',
    serviceOrder: {
      order: { ...validOrderDetail.order, payment_status: 'paid' },
      items: validOrderDetail.items,
      events: validOrderDetail.events,
    },
  })).toBeNull();
  expect(mapAppointmentServiceOrderContext({
    appointmentId: 'appt-1',
    serviceOrder: { order: { status: 'paid' }, items: [], events: [] },
  })).toBeNull();
});

test('15-19: resolveAppointmentOrderPrimaryAction matrix', () => {
  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: false,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
  })).toBe('none');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: 'open',
    appointmentStartsAt: '2026-08-13T12:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
    now: new Date('2026-08-12T15:00:00.000Z'),
  })).toBe('none');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: 'open',
    appointmentStartsAt: '2026-08-12T23:00:00.000Z',
    timeZone: 'America/Sao_Paulo',
    now: new Date('2026-08-12T12:00:00.000Z'),
  })).toBe('start_order');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'read_only',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
  })).toBe('none');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: false,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
  })).toBe('none');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
  })).toBe('open_order');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'pending',
    serviceOrderStatus: null,
  })).toBe('none');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: 'open',
  })).toBe('start_order');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: 'in_service',
  })).toBe('finish_order');

  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'completed',
    serviceOrderStatus: 'awaiting_payment',
  })).toBe('none');
});

test('20: appointmentIsLockedByServiceOrder', () => {
  expect(appointmentIsLockedByServiceOrder({
    financialOpsEnabled: false,
    serviceOrderStatus: 'open',
  })).toBe(false);
  expect(appointmentIsLockedByServiceOrder({
    financialOpsEnabled: true,
    serviceOrderStatus: null,
  })).toBe(false);
  expect(appointmentIsLockedByServiceOrder({
    financialOpsEnabled: true,
    serviceOrderStatus: 'open',
  })).toBe(true);
  expect(appointmentIsLockedByServiceOrder({
    financialOpsEnabled: true,
    serviceOrderStatus: 'awaiting_payment',
  })).toBe(true);
});

test('SQL suite covers read_only/blocked and named error patterns', () => {
  expect(sqlTest.trimStart().startsWith('BEGIN;')).toBe(true);
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  expect(sqlTest).toContain("access_mode IS DISTINCT FROM 'read_only'");
  expect(sqlTest).toContain("access_mode IS DISTINCT FROM 'blocked'");
  expect(sqlTest).toContain('UPDATE public.billing_accounts');
  expect(sqlTest).toContain("account_status = 'blocked'");
  expect(sqlTest).toContain('appointment_completion_requires_service_order');
  expect(sqlTest).toContain('appointment_has_service_order');
  expect(sqlTest).toContain('financial_ops_disabled');
  expect(sqlTest).toContain('get_service_order_for_appointment');
  expect(sqlTest).toContain('complete_business_appointment');
  expect(sqlTest).toContain('update_appointment_status_v2');
  expect(sqlTest).toContain('reschedule');
});

test('awaiting payment copy never implies paid', () => {
  expect(AWAITING_PAYMENT_NOTICE).toContain('Aguardando pagamento'.slice(0, 0) + 'Atendimento finalizado');
  expect(AWAITING_PAYMENT_NOTICE).toContain('saldo zero');
  expect(AWAITING_PAYMENT_NOTICE).not.toContain('Pagamento concluído');
  expect(domainUi).not.toContain('Pagamento concluído');
  expect(domainUi).toContain("return 'Aguardando pagamento'");
});
