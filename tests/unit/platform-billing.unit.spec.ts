/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const migration = read('supabase/migrations/20260725010000_platform_billing_web_first.sql');
const billingWorker = read('supabase/functions/process-billing-jobs/index.ts');
const stripeWebhook = read('supabase/functions/stripe-webhook/index.ts');
const businessSource = [
  'apps/business/src/app/restricted.tsx',
  'apps/business/src/contexts/business-session.tsx',
].map(read).join('\n');

test('mantém assinatura da plataforma separada do financeiro operacional', () => {
  expect(migration).toContain('CREATE TABLE public.billing_accounts');
  expect(migration).toContain('CREATE TABLE public.billing_subscriptions');
  expect(migration).toContain('CREATE TABLE public.billing_invoices');
  expect(migration).not.toContain("account_status = 'delinquent'");
  expect(migration).toContain("'full'");
  expect(migration).toContain("'read_only'");
  expect(migration).toContain("'blocked'");
});
test('protege trial, tolerância, cancelamento e jornadas existentes no banco', () => {
  expect(migration).toContain("now() + interval '14 days'");
  expect(billingWorker).toContain('7 * 86_400_000');
  expect(migration).toContain("context.subscription_status IN ('active', 'cancelled')");
  expect(migration).toContain('client_cancel := OLD.client_id = actor_id');
  expect(migration).toContain("THEN 'billing_read_only'");
  expect(migration).not.toMatch(/DELETE FROM public\.appointments/i);
});

test('webhook é idempotente e somente processamento confirmado altera direitos', () => {
  expect(stripeWebhook).toContain('constructEventAsync');
  expect(stripeWebhook).toContain('external_event_id: event.id');
  expect(stripeWebhook).toContain('error.code !== "23505"');
  expect(billingWorker).toContain('event.type === "invoice.paid"');
  expect(billingWorker).toContain('trial_ends_at: new Date().toISOString()');
});

test('app business só consome direitos e não possui superfície de compra', () => {
  expect(businessSource).toContain('get_my_business_access_context');
  expect(businessSource).toContain('Keep the last server-confirmed rights');
  expect(businessSource).not.toContain('create-stripe-checkout');
  expect(businessSource).not.toContain('checkout_url');
  expect(businessSource.toLowerCase()).not.toContain('webview');
});
