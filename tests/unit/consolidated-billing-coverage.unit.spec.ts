/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260729000000_consolidated_billing_coverage.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const cutoverWorker = fs.readFileSync(
  path.join(root, 'supabase/functions/process-billing-cutovers/index.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const billingWorker = fs.readFileSync(
  path.join(root, 'supabase/functions/process-billing-jobs/index.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const organizationScreen = fs.readFileSync(
  path.join(root, 'apps/web/src/components/screens/OrganizationExperience.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const businessSession = fs.readFileSync(
  path.join(root, 'apps/business/src/contexts/business-session.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const businessOperationalContext = fs.readFileSync(
  path.join(root, 'apps/business/src/contexts/business-operational-context.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const businessApi = fs.readFileSync(
  path.join(root, 'apps/business/src/services/business-api.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const businessContracts = fs.readFileSync(
  path.join(root, 'packages/database/src/business.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const businessPurchaseSurface = [
  businessSession,
  businessOperationalContext,
  businessApi,
].join('\n').toLowerCase();

test('uses one effective billing coverage without overlapping sources', () => {
  expect(migration).toContain('CREATE TABLE public.billing_coverage_assignments');
  expect(migration).toContain("'overlapping_billing_coverage'");
  expect(migration).toContain("'establishment', 'organization'");
  expect(migration).toContain('pg_advisory_xact_lock');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.resolve_business_billing_context');
});

test('keeps governance status separate from organization delinquency', () => {
  const statusFunction = migration.slice(
    migration.indexOf('CREATE OR REPLACE FUNCTION public.set_control_subscription_status'),
    migration.indexOf('CREATE OR REPLACE FUNCTION public.issue_manual_billing_invoice'),
  );

  expect(statusFunction).toContain("now() + interval '7 days'");
  expect(statusFunction).not.toContain('UPDATE public.establishments');
  expect(migration).toContain("subscription.grace_ends_at > now()");
});

test('freezes the approved progressive unit prices', () => {
  expect(migration).toContain('WHEN 1 THEN 4990');
  expect(migration).toContain('WHEN 2 THEN 4490');
  expect(migration).toContain('WHEN 3 THEN 3990');
  expect(migration).toContain("'network_plan_required'");
  expect(migration).toContain("'pricing_model', 'fixed_progressive_units'");
});

test('requires a reconciled cutover instead of switching on a return URL', () => {
  expect(migration).toContain('CREATE TABLE public.billing_cutover_requests');
  expect(migration).toContain('schedule_organization_billing_cutover');
  expect(migration).toContain('finalize_organization_billing_cutover');
  expect(migration).toContain("'individual_subscription_still_live'");
  expect(migration).toContain("'billing_regularization_required'");
  expect(migration).toContain("status = 'scheduled'");
  expect(migration).toContain("courtesy_ends_at = cutover_time + interval '1 hour'");
  expect(cutoverWorker).toContain('{ cancel_at_period_end: true }');
  expect(cutoverWorker).toContain('finalize_organization_billing_cutover');
});

test('routes Stripe events and fiscal documents through the organization source', () => {
  expect(billingWorker).toContain('processOrganizationEvent');
  expect(billingWorker).toContain('organization_billing_invoices');
  expect(billingWorker).toContain('organization_billing_invoice_id');
  expect(billingWorker).toContain('billing_scope');
  expect(migration).toContain('fiscal_documents_one_invoice_source_check');
});

test('shows consolidated pricing on web and keeps Business purchase-free', () => {
  expect(organizationScreen).toContain('Estimativa consolidada');
  expect(organizationScreen).toContain('Configurar pagamento consolidado');
  expect(organizationScreen).toContain('sete dias de tolerância');
  expect(organizationScreen).toContain('Date.now() + 60_000');
  expect(organizationScreen).toContain('Aguardando confirmação segura da Stripe');
  expect(businessContracts).toContain(
    "export type BusinessBillingScope = 'establishment' | 'organization'",
  );
  expect(businessContracts).toContain('billingScope: BusinessBillingScope | null');
  expect(businessApi).toContain("'get_my_business_operational_contexts'");
  expect(businessPurchaseSurface).not.toContain('create-stripe-checkout');
  expect(businessPurchaseSurface).not.toContain('webview');
});
