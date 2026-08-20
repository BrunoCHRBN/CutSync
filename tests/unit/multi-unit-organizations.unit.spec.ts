import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('operational selection no longer mutates the legacy profile', () => {
  const shell = read('apps/web/src/components/layout/AdminShell.tsx');
  const context = read('apps/web/src/contexts/operational-context.tsx');

  expect(shell).toContain('selectEstablishment(targetShopId)');
  expect(shell).not.toContain('switch_active_establishment');
  expect(context).toContain("get_my_authorized_contexts");
  expect(context).toContain('activeEstablishmentId');
});

test('organization management exposes explicit tenant identifiers', () => {
  const service = read('apps/web/src/services/organizations.ts');

  expect(service).toContain('target_organization_id');
  expect(service).toContain('target_establishment_id');
  expect(service).toContain("rpc('get_organization_report'");
  expect(service).not.toContain('profile.establishment_id');
});

test('consolidated UI labels production without claiming received revenue', () => {
  const screen = read('apps/web/src/components/screens/OrganizationExperience.tsx');

  expect(screen).toContain('produção de catálogo, não receita recebida');
  expect(screen).toContain('produção realizada');
  expect(screen).toContain('estabelecimento');
  expect(screen).not.toContain('lucro');
});

test('control remains a separate web-only workspace with MFA gate', () => {
  const packageJson = JSON.parse(read('apps/control/package.json'));
  const auth = read('apps/control/src/contexts/control-auth-context.tsx');
  const billing = read('apps/control/src/components/billing-operations.tsx');
  const billingService = read('apps/control/src/services/control-billing.ts');

  expect(packageJson.name).toBe('@cutsync/control');
  expect(packageJson.scripts.start).toContain('--web');
  expect(auth).toContain("currentLevel !== 'aal2'");
  expect(auth).not.toContain('123456');
  expect(billingService).toContain("supabase.rpc('list_control_billing_accounts')");
  expect(billing).not.toContain('signInWithPassword');
  expect(billing).not.toContain('mfa.');
});
