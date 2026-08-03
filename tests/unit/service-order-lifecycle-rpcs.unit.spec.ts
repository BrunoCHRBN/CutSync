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
const sqlTest = read('supabase/tests/service_order_lifecycle_rpcs.sql');
const canonicalDoc = read('docs/architecture/FINANCIAL_OPERATIONAL_P0.md');

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

test('migration defines all lifecycle RPCs as SECURITY DEFINER with fixed search_path', () => {
  for (const rpc of lifecycleRpcs) {
    expect(migration).toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
  }
  const definerCount = (migration.match(/SECURITY DEFINER/g) || []).length;
  expect(definerCount).toBeGreaterThanOrEqual(lifecycleRpcs.length);
  expect(migration).toContain('SET search_path = pg_catalog, public');
});

test('mutations use claim/complete, request id, locks, version and flag', () => {
  expect(migration).toContain('claim_mobile_command');
  expect(migration).toContain('complete_mobile_command');
  expect(migration).toContain('target_request_id');
  expect(migration).toContain('target_expected_version');
  expect(migration).toContain('FOR UPDATE');
  expect(migration).toContain('assert_financial_ops_enabled');
  expect(migration).toContain('service_order_version_conflict');
  expect(migration).toContain("'service_order.opened'");
  expect(migration).toContain("'service_order.started'");
  expect(migration).toContain("'service_order.item_upserted'");
  expect(migration).toContain("'service_order.item_removed'");
  expect(migration).toContain("'service_order.finished'");
  expect(migration).toContain("'service_order.closed'");
  expect(migration).toContain("'service_order.voided'");
  expect(migration).toContain("'service_order.reopened'");
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

test('safe response allowlist and grants are correct', () => {
  expect(migration).toContain("'serviceOrderId'");
  expect(migration).toContain("'serviceOrderItemId'");
  expect(migration).toContain("'version'");
  expect(migration).toContain(
    'GRANT EXECUTE ON FUNCTION public.open_service_order',
  );
  expect(migration).toContain('TO authenticated, service_role');
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.assert_financial_ops_enabled(uuid)\n  FROM PUBLIC, anon, authenticated',
  );
});

test('SQL suite is transactional and covers frontiers', () => {
  expect(sqlTest.trimStart().startsWith('BEGIN;')).toBe(true);
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  expect(sqlTest).toContain('financial_ops_disabled');
  expect(sqlTest).toContain('service_order_balance_unresolved');
  expect(sqlTest).toContain('paymentStatus');
  expect(sqlTest).toContain('service_order_already_exists');
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
      id: '11111111-1111-1111-1111-111111111111',
      establishmentId: '22222222-2222-2222-2222-222222222222',
      appointmentId: null,
      establishmentClientId: null,
      professionalId: null,
      status: 'open',
      currency: 'BRL',
      subtotalCents: 0,
      discountCents: 0,
      totalCents: 0,
      internalNotes: null,
      openedAt: '2026-08-03T12:00:00.000Z',
      startedAt: null,
      finishedAt: null,
      closedAt: null,
      voidedAt: null,
      voidReason: null,
      version: 1,
      paymentStatus: 'unpaid',
    },
    items: [],
    events: [],
  })).toBeNull();
});

test('documento canônico registra Etapa 3', () => {
  expect(canonicalDoc).toContain('15.4 Critério de pronto desta Etapa 3');
  expect(canonicalDoc).toContain('16.5 Etapa 3 — registro de implementação');
  expect(canonicalDoc).toContain(
    '20260816000000_service_order_lifecycle_rpcs.sql',
  );
});
