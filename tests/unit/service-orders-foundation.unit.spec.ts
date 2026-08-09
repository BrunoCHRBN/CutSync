/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260815000000_service_orders_foundation.sql',
);
const sqlTest = read('supabase/tests/service_orders_foundation.sql');
const canonicalDoc = read('docs/architecture/FINANCIAL_OPERATIONAL_P0.md');

const lifecycleRpcs = [
  'open_service_order',
  'start_service_order',
  'finish_service_order',
  'close_service_order',
  'void_service_order',
  'reopen_voided_service_order',
  'upsert_service_order_item',
  'remove_service_order_item',
  'get_service_order',
  'list_service_orders_for_day',
] as const;

const forbiddenTables = [
  'order_payment_entries',
  'cash_registers',
  'commission_entries',
  'payment_intents',
  'payment_refunds',
] as const;

test('migration cria as três tabelas de comanda sem payment_status', () => {
  expect(migration).toContain('CREATE TABLE public.service_orders');
  expect(migration).toContain('CREATE TABLE public.service_order_items');
  expect(migration).toContain('CREATE TABLE public.service_order_events');
  // Documentary mentions explaining calculated payment state are allowed;
  // column definitions / ADD COLUMN are not.
  expect(migration).not.toMatch(/\bpayment_status\s+(text|boolean|varchar)/i);
  expect(migration).not.toMatch(/\bfinancial_status\b/);
  expect(migration).not.toMatch(/\bpaid_status\b/);
  expect(migration).not.toMatch(/\bsettlement_status\b/);
  expect(migration).not.toMatch(/\bbalance_status\b/);
  expect(migration).toContain('never stored on this table');
});

test('unique histórica por appointment ignora só nulos e não filtra status', () => {
  expect(migration).toContain(
    'CREATE UNIQUE INDEX service_orders_one_per_appointment_idx',
  );
  expect(migration).toContain(
    'ON public.service_orders (appointment_id)',
  );
  expect(migration).toContain('WHERE appointment_id IS NOT NULL');
  expect(migration).not.toMatch(
    /service_orders_one_per_appointment_idx[\s\S]{0,200}status\s*<>/,
  );
  expect(migration).not.toMatch(
    /service_orders_one_per_appointment_idx[\s\S]{0,200}status\s+NOT\s+IN/i,
  );
  expect(migration).not.toMatch(
    /service_orders_one_per_appointment_idx[\s\S]{0,200}voided_at\s+IS\s+NULL/i,
  );
});

test('status operacionais, BRL e money em cents estão explícitos', () => {
  for (const status of [
    'open',
    'in_service',
    'awaiting_payment',
    'closed',
    'voided',
  ]) {
    expect(migration).toContain(`'${status}'`);
  }
  expect(migration).toContain("DEFAULT 'BRL'");
  expect(migration).toContain("CHECK (currency = 'BRL')");
  expect(migration).toContain('subtotal_cents');
  expect(migration).toContain('discount_cents');
  expect(migration).toContain('total_cents');
  expect(migration).toContain('unit_price_cents');
  expect(migration).toContain('GENERATED ALWAYS AS');
});

test('RLS, grants de escrita e imutabilidade estão presentes', () => {
  expect(migration).toContain(
    'ALTER TABLE public.service_orders ENABLE ROW LEVEL SECURITY',
  );
  expect(migration).toContain(
    'ALTER TABLE public.service_order_items ENABLE ROW LEVEL SECURITY',
  );
  expect(migration).toContain(
    'ALTER TABLE public.service_order_events ENABLE ROW LEVEL SECURITY',
  );
  expect(migration).toContain(
    'REVOKE ALL ON TABLE public.service_orders FROM PUBLIC, anon, authenticated',
  );
  expect(migration).toContain(
    'REVOKE ALL ON TABLE public.service_order_items FROM PUBLIC, anon, authenticated',
  );
  expect(migration).toContain(
    'REVOKE ALL ON TABLE public.service_order_events FROM PUBLIC, anon, authenticated',
  );
  expect(migration).toContain('service_orders_reject_delete');
  expect(migration).toContain('service_order_events_immutable');
  expect(migration).toContain('reject_immutable_mobile_record');
  expect(migration).toContain('service_order_items_frozen');
  expect(migration).toContain("NOT IN ('open', 'in_service')");
});

test('totals server-side, tenant integrity e freeze após finish', () => {
  expect(migration).toContain('recalculate_service_order_totals');
  expect(migration).toContain('FOR UPDATE');
  expect(migration).toContain('enforce_service_order_tenant_integrity');
  expect(migration).toContain('service_order_appointment_tenant_mismatch');
  expect(migration).toContain('service_order_client_tenant_mismatch');
  expect(migration).toContain('service_order_professional_tenant_mismatch');
  expect(migration).toContain('enforce_service_order_items_mutable');
  expect(migration).toContain('SECURITY DEFINER');
  expect(migration).toContain('SET search_path = pg_catalog, public');
});

test('item mutations lock the order with FOR UPDATE and keep parent immutable', () => {
  const mutableFnMatch = migration.match(
    /CREATE OR REPLACE FUNCTION public\.enforce_service_order_items_mutable\(\)[\s\S]*?\$\$;/,
  );
  expect(mutableFnMatch).not.toBeNull();
  const mutableFn = mutableFnMatch?.[0] ?? '';
  expect(mutableFn).toContain('FOR UPDATE');
  expect(mutableFn).not.toContain('FOR SHARE');
  expect(mutableFn).toContain('service_order_item_parent_immutable');
  expect(mutableFn).toContain('NEW.service_order_id IS DISTINCT FROM OLD.service_order_id');
  expect(mutableFn).toContain('NEW.establishment_id IS DISTINCT FROM OLD.establishment_id');
  // Structural lock fix only — concurrency is not proven by this static test.
  expect(migration).toContain('recalculate_service_order_totals can reuse');
});

test('item BEFORE triggers run mutability before tenant via deterministic names', () => {
  expect(migration).toContain(
    'CREATE TRIGGER service_order_items_10_mutability_guard',
  );
  expect(migration).toContain(
    'CREATE TRIGGER service_order_items_20_tenant_guard',
  );
  const mutabilityIdx = migration.indexOf(
    'CREATE TRIGGER service_order_items_10_mutability_guard',
  );
  const tenantIdx = migration.indexOf(
    'CREATE TRIGGER service_order_items_20_tenant_guard',
  );
  expect(mutabilityIdx).toBeGreaterThanOrEqual(0);
  expect(tenantIdx).toBeGreaterThan(mutabilityIdx);

  // Legacy trigger names must not remain as the final active CREATE TRIGGER.
  expect(migration).not.toMatch(
    /CREATE TRIGGER enforce_service_order_items_mutable\b/,
  );
  expect(migration).not.toMatch(
    /CREATE TRIGGER enforce_service_order_item_tenant_integrity\b/,
  );
  // Functions remain; only trigger object names are ordered.
  expect(migration).toContain(
    'EXECUTE FUNCTION public.enforce_service_order_items_mutable()',
  );
  expect(migration).toContain(
    'EXECUTE FUNCTION public.enforce_service_order_item_tenant_integrity()',
  );
});

test('actors and chronology are paired by CHECK constraints', () => {
  expect(migration).toContain('CONSTRAINT service_orders_transition_actor_chk');
  expect(migration).toContain('(started_at IS NULL) = (started_by IS NULL)');
  expect(migration).toContain('(finished_at IS NULL) = (finished_by IS NULL)');
  expect(migration).toContain('(closed_at IS NULL) = (closed_by IS NULL)');
  expect(migration).toContain('(voided_at IS NULL) = (voided_by IS NULL)');
  expect(migration).toContain('CONSTRAINT service_orders_transition_chronology_chk');
  expect(migration).toContain('started_at >= opened_at');
  expect(migration).toContain('finished_at >= started_at');
  expect(migration).toContain('closed_at >= finished_at');
});

test('teste SQL é transacional e cobre invariantes críticos', () => {
  expect(sqlTest.trimStart().startsWith('BEGIN;')).toBe(true);
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  expect(sqlTest).toContain('payment_status');
  expect(sqlTest).toContain('service_orders_one_per_appointment');
  expect(sqlTest).toContain('service_order_items_frozen');
  expect(sqlTest).toContain('service_orders_is_immutable');
  expect(sqlTest).toContain('service_order_events_is_immutable');
  expect(sqlTest).toContain('service_order_appointment_tenant_mismatch');
  expect(sqlTest).toContain('service_order_item_parent_immutable');
  expect(sqlTest).toContain('service_order_item_service_tenant_mismatch');
  expect(sqlTest).toContain('service_order_item_professional_tenant_mismatch');
  expect(sqlTest).toContain('service_orders_transition_actor_chk');
  expect(sqlTest).toContain('service_orders_transition_chronology_chk');
  expect(sqlTest).toContain('service_orders_foundation checks passed');
});

test('migration não cria RPCs de lifecycle nem tabelas financeiras POS', () => {
  for (const rpc of lifecycleRpcs) {
    expect(migration).not.toContain(`CREATE OR REPLACE FUNCTION public.${rpc}`);
    expect(migration).not.toContain(`CREATE FUNCTION public.${rpc}`);
  }
  for (const tableName of forbiddenTables) {
    expect(migration).not.toContain(`CREATE TABLE public.${tableName}`);
    expect(migration).not.toContain(`CREATE TABLE IF NOT EXISTS public.${tableName}`);
  }
  expect(migration).not.toContain('billing_invoices');
  expect(migration).not.toContain('billing_subscriptions');
});

test('documento canônico registra Etapa 2 e critério de pronto', () => {
  expect(canonicalDoc).toContain('20260815000000_service_orders_foundation.sql');
  expect(canonicalDoc).toContain('15.3 Critério de pronto desta Etapa 2');
  expect(canonicalDoc).toContain('Etapa 3: ver §16.5');
});
