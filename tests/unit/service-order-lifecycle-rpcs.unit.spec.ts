/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  mapServiceOrderCommandReceipt,
  mapServiceOrderDetail,
  mapServiceOrderSummary,
} from '../../packages/database/src/business';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260816000000_service_order_lifecycle_rpcs.sql',
);
const mobileSurfaceHardening = read(
  'supabase/migrations/20260819001000_harden_mobile_public_surface.sql',
);
const sqlTest = read('supabase/tests/service_order_lifecycle_rpcs.sql');
const generatedRpc = read('packages/database/src/business-rpc.generated.ts');
const canonicalDoc = read('docs/architecture/FINANCIAL_OPERATIONAL_P0.md');

test('close_service_order permanece fora da superfície mobile autenticada', () => {
  expect(mobileSurfaceHardening).toContain(
    'REVOKE ALL ON FUNCTION public.close_service_order(uuid, uuid, bigint, uuid)',
  );
  expect(mobileSurfaceHardening).toContain('FROM PUBLIC, anon, authenticated');
  expect(mobileSurfaceHardening).toContain('TO service_role');
});

const lifecycleRpcs = [
  'open_service_order',
  'start_service_order',
  'upsert_service_order_item',
  'remove_service_order_item',
  'finish_service_order',
  'close_service_order',
  'void_service_order',
  'reopen_voided_service_order',
  'get_service_order',
  'list_service_orders_for_day',
] as const;

const mutationRpcs = [
  'open_service_order',
  'start_service_order',
  'upsert_service_order_item',
  'remove_service_order_item',
  'finish_service_order',
  'close_service_order',
  'void_service_order',
  'reopen_voided_service_order',
] as const;

const functionBody = (name: string): string => {
  const marker = `CREATE OR REPLACE FUNCTION public.${name}(`;
  const start = migration.indexOf(marker);
  expect(start, `${name} must exist`).toBeGreaterThan(-1);

  let end = migration.length;
  for (const other of lifecycleRpcs) {
    if (other === name) continue;
    const next = migration.indexOf(
      `CREATE OR REPLACE FUNCTION public.${other}(`,
      start + marker.length,
    );
    if (next > start && next < end) end = next;
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

const validOrderBase = {
  id: '11111111-1111-1111-1111-111111111111',
  establishmentId: '22222222-2222-2222-2222-222222222222',
  appointmentId: null as string | null,
  establishmentClientId: null as string | null,
  professionalId: '33333333-3333-3333-3333-333333333333',
  status: 'open' as const,
  currency: 'BRL' as const,
  subtotalCents: 0,
  discountCents: 0,
  totalCents: 0,
  internalNotes: null as string | null,
  openedAt: '2026-08-03T12:00:00.000Z',
  startedAt: null as string | null,
  finishedAt: null as string | null,
  closedAt: null as string | null,
  voidedAt: null as string | null,
  voidReason: null as string | null,
  version: 1,
};

const validItemBase = {
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
};

const validEventBase = {
  id: 1,
  eventType: 'opened',
  previousStatus: null as string | null,
  resultingStatus: 'open',
  actorId: '33333333-3333-3333-3333-333333333333',
  metadata: {},
  createdAt: '2026-08-03T12:00:00.000Z',
};

test('migration defines all lifecycle RPCs as SECURITY DEFINER with fixed search_path', () => {
  for (const rpc of lifecycleRpcs) {
    const body = functionBody(rpc);
    expect(body).toContain('SECURITY DEFINER');
    expect(body).toContain('SET search_path = pg_catalog, public');
  }
});

test('each mutation isolates claim/complete and expected version (except open)', () => {
  for (const rpc of mutationRpcs) {
    const body = functionBody(rpc);
    expect(body, `${rpc} claim`).toContain('claim_mobile_command');
    expect(body, `${rpc} complete`).toContain('complete_mobile_command');
    expect(body, `${rpc} request id`).toContain('target_request_id');
    if (rpc === 'open_service_order') {
      expect(body).not.toContain('target_expected_version');
    } else {
      expect(body, `${rpc} expected version`).toContain('target_expected_version');
    }
  }
});

test('SQL and TypeScript argument names stay aligned', () => {
  for (const rpc of lifecycleRpcs) {
    const sqlArgs = sqlArgNames(functionBody(rpc));
    const tsArgs = tsArgNames(rpc);
    expect(sqlArgs, `${rpc} sql args`).toEqual(tsArgs);
  }
});

test('remove_service_order_item uses canonical item argument name', () => {
  const removeBody = functionBody('remove_service_order_item');
  const upsertBody = functionBody('upsert_service_order_item');

  expect(removeBody).toContain('target_service_order_item_id uuid');
  expect(generatedRpc).toContain('target_service_order_item_id: string');
  expect(removeBody).not.toMatch(/\btarget_item_id\b/);
  expect(upsertBody).toContain('target_item_id uuid DEFAULT NULL');
  expect(removeBody).toContain("'item_removed'");
  expect(removeBody).toContain("'itemId', existing_item.id");
  expect(removeBody).toContain("'serviceId', existing_item.service_id");
});

test('authz helpers and capability gates are present', () => {
  expect(migration).toContain('assert_service_order_mutation_access');
  expect(migration).toContain('assert_service_order_read_access');
  expect(migration).toContain("'void_orders'");
  expect(migration).toContain("'manage_team_orders'");
  expect(migration).toContain("'manage_own_orders'");
  expect(migration).toContain("'apply_order_discounts'");
  expect(migration).toContain("'view_orders'");
});

test('close rejects positive balance; no payment/commission domain', () => {
  expect(migration).toContain('service_order_balance_unresolved');
  expect(migration).not.toMatch(/\bpayment_status\b/);
  expect(migration).not.toContain('CREATE TABLE public.order_payment_entries');
  expect(migration).not.toContain('CREATE TABLE public.cash_registers');
  expect(migration).not.toContain('CREATE TABLE public.commission_entries');
  expect(migration).not.toContain('CREATE TABLE public.payment_intents');
  expect(migration).not.toContain('billing_invoices');
  expect(migration).not.toContain('INSERT INTO public.appointment_events');
  expect(migration).not.toContain('complete_business_appointment');
  expect(migration).toContain('capture_appointment_event_trigger');
});

test('SQL suite covers named remove, frontiers, read_only and blocked', () => {
  expect(sqlTest.trimStart().startsWith('BEGIN;')).toBe(true);
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  expect(sqlTest).toContain('target_service_order_item_id =>');
  expect(sqlTest).toContain('financial_ops_disabled');
  expect(sqlTest).toContain('service_order_balance_unresolved');
  expect(sqlTest).toContain('service_order_already_exists');
  expect(sqlTest).toContain('idempotency_conflict');
  expect(sqlTest).toContain('service_order_version_conflict');
  expect(sqlTest).toContain('service_order_item_not_found');
  expect(sqlTest).toContain('service_order_items_frozen');
  expect(sqlTest).toContain("access_mode IS DISTINCT FROM 'read_only'");
  expect(sqlTest).toContain("access_mode IS DISTINCT FROM 'blocked'");
  expect(sqlTest).toContain('UPDATE public.billing_accounts');
  expect(sqlTest).toContain("account_status = 'blocked'");
  expect(sqlTest).toContain('paymentStatus');
});

test('mappers reject paymentStatus and invalid money/status', () => {
  expect(mapServiceOrderCommandReceipt({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    status: 'open',
    version: 2,
  })).toEqual({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    status: 'open',
    version: 2,
  });
  expect(mapServiceOrderCommandReceipt({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    status: 'open',
    version: 2,
    paymentStatus: 'paid',
  })).toBeNull();
  expect(mapServiceOrderCommandReceipt({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    status: 'paid',
    version: 2,
  })).toBeNull();
  expect(mapServiceOrderSummary({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    appointmentId: null,
    professionalId: '22222222-2222-2222-2222-222222222222',
    establishmentClientId: null,
    status: 'awaiting_payment',
    currency: 'BRL',
    subtotalCents: 100,
    discountCents: 0,
    totalCents: 100,
    openedAt: '2026-08-03T12:00:00.000Z',
    version: 3,
  })?.totalCents).toBe(100);
  expect(mapServiceOrderSummary({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    appointmentId: null,
    professionalId: null,
    establishmentClientId: null,
    status: 'open',
    currency: 'USD',
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    openedAt: '2026-08-03T12:00:00.000Z',
    version: 1,
  })).toBeNull();
  expect(mapServiceOrderDetail({
    order: {
      ...validOrderBase,
      paymentStatus: 'unpaid',
    },
    items: [],
    events: [],
  })).toBeNull();
});

test('mappers reject invalid stripped nullable fields fail-closed', () => {
  expect(mapServiceOrderDetail({
    order: validOrderBase,
    items: [],
    events: [{ ...validEventBase, previousStatus: 'paid' }],
  })).toBeNull();

  expect(mapServiceOrderDetail({
    order: validOrderBase,
    items: [],
    events: [{ ...validEventBase, actorId: 'not-a-uuid' }],
  })).toBeNull();

  expect(mapServiceOrderDetail({
    order: { ...validOrderBase, professionalId: 123 },
    items: [],
    events: [validEventBase],
  })).toBeNull();

  expect(mapServiceOrderDetail({
    order: { ...validOrderBase, appointmentId: {} },
    items: [],
    events: [validEventBase],
  })).toBeNull();

  expect(mapServiceOrderDetail({
    order: validOrderBase,
    items: [{ ...validItemBase, serviceId: 999 }],
    events: [validEventBase],
  })).toBeNull();

  expect(mapServiceOrderDetail({
    order: { ...validOrderBase, startedAt: 'not-a-date' },
    items: [],
    events: [validEventBase],
  })).toBeNull();

  expect(mapServiceOrderSummary({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    appointmentId: {},
    professionalId: 123,
    establishmentClientId: 'not-a-uuid',
    status: 'open',
    currency: 'BRL',
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    openedAt: '2026-08-03T12:00:00.000Z',
    version: 1,
  })).toBeNull();
});

test('mappers accept absent/null stripped fields and valid typed values', () => {
  const withAbsentNullables = mapServiceOrderDetail({
    order: {
      id: validOrderBase.id,
      establishmentId: validOrderBase.establishmentId,
      status: validOrderBase.status,
      currency: validOrderBase.currency,
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      openedAt: validOrderBase.openedAt,
      version: 1,
      // appointmentId / professionalId / timestamps omitted by jsonb_strip_nulls
    },
    items: [{
      id: validItemBase.id,
      serviceOrderId: validItemBase.serviceOrderId,
      establishmentId: validItemBase.establishmentId,
      descriptionSnapshot: validItemBase.descriptionSnapshot,
      quantity: 1,
      unitPriceCents: 0,
      discountCents: 0,
      subtotalCents: 0,
      totalCents: 0,
      sortOrder: 0,
      // serviceId / professionalId omitted
    }],
    events: [{
      id: 1,
      eventType: 'opened',
      resultingStatus: 'open',
      metadata: {},
      createdAt: '2026-08-03T12:00:00.000Z',
      // previousStatus / actorId omitted
    }],
  });
  expect(withAbsentNullables).not.toBeNull();
  expect(withAbsentNullables?.appointmentId).toBeNull();
  expect(withAbsentNullables?.professionalId).toBeNull();
  expect(withAbsentNullables?.startedAt).toBeNull();
  expect(withAbsentNullables?.items[0]?.serviceId).toBeNull();
  expect(withAbsentNullables?.items[0]?.professionalId).toBeNull();
  expect(withAbsentNullables?.events[0]?.previousStatus).toBeNull();
  expect(withAbsentNullables?.events[0]?.actorId).toBeNull();

  const withExplicitNulls = mapServiceOrderDetail({
    order: validOrderBase,
    items: [{ ...validItemBase, serviceId: null, professionalId: null }],
    events: [{ ...validEventBase, previousStatus: null, actorId: null }],
  });
  expect(withExplicitNulls).not.toBeNull();
  expect(withExplicitNulls?.appointmentId).toBeNull();
  expect(withExplicitNulls?.items[0]?.serviceId).toBeNull();
  expect(withExplicitNulls?.events[0]?.previousStatus).toBeNull();

  const withValidValues = mapServiceOrderDetail({
    order: {
      ...validOrderBase,
      appointmentId: 'appt-1',
      professionalId: '33333333-3333-3333-3333-333333333333',
      startedAt: '2026-08-03T12:05:00.000Z',
      internalNotes: 'note',
    },
    items: [validItemBase],
    events: [{
      ...validEventBase,
      previousStatus: 'open',
      resultingStatus: 'in_service',
      eventType: 'started',
    }],
  });
  expect(withValidValues?.appointmentId).toBe('appt-1');
  expect(withValidValues?.professionalId).toBe(
    '33333333-3333-3333-3333-333333333333',
  );
  expect(withValidValues?.startedAt).toBe('2026-08-03T12:05:00.000Z');
  expect(withValidValues?.items[0]?.serviceId).toBe('service-cut');
  expect(withValidValues?.events[0]?.previousStatus).toBe('open');

  const summaryAbsent = mapServiceOrderSummary({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    status: 'open',
    currency: 'BRL',
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    openedAt: '2026-08-03T12:00:00.000Z',
    version: 1,
  });
  expect(summaryAbsent).toEqual({
    serviceOrderId: '11111111-1111-1111-1111-111111111111',
    appointmentId: null,
    professionalId: null,
    establishmentClientId: null,
    status: 'open',
    currency: 'BRL',
    subtotalCents: 0,
    discountCents: 0,
    totalCents: 0,
    openedAt: '2026-08-03T12:00:00.000Z',
    version: 1,
  });
});

test('documento canônico registra Etapa 3', () => {
  expect(canonicalDoc).toContain('15.4 Critério de pronto desta Etapa 3');
  expect(canonicalDoc).toContain('16.5 Etapa 3 — registro de implementação');
  expect(canonicalDoc).toContain(
    '20260816000000_service_order_lifecycle_rpcs.sql',
  );
});
