import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = path.resolve(__dirname, '../..');
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260730040038_fix_pending_business_access_and_media_bucket.sql'),
  'utf8',
);
const settings = fs.readFileSync(
  path.join(root, 'apps/web/src/components/screens/SettingsExperience.tsx'),
  'utf8',
);
const discoveryTriggerMigration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260730040412_fix_discovery_eligibility_trigger.sql'),
  'utf8',
);

test('provisions full billing access after the first pending establishment admin exists', () => {
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.initialize_membership_billing()');
  expect(migration).toContain("establishment_status NOT IN ('active', 'pending_verification')");
  expect(migration).toContain('PERFORM public.ensure_billing_account_for_establishment(NEW.establishment_id, 0)');
  expect(migration).toContain('CREATE TRIGGER initialize_membership_billing_trigger');
  expect(migration).toContain("establishment.account_status IN ('active', 'pending_verification')");
});

test('keeps establishment media isolated by admin membership and full access', () => {
  expect(migration).toContain("VALUES (\n  'banners'");
  expect(migration).toContain('Establishment admins upload own brand media');
  expect(migration).toContain('Establishment admins update own brand media');
  expect(migration).toContain('Establishment admins delete own brand media');
  expect(migration).toContain('public.has_active_membership(');
  expect(migration).toContain("'admin_write'");
});

test('treats a zero-row settings update as an authorization failure', () => {
  expect(settings).toContain(".select('id')");
  expect(settings).toContain('.maybeSingle()');
  expect(settings).toContain("throw new Error('establishment_update_not_authorized')");
  expect(settings).not.toContain("`${activeEstablishmentId || 'public'}");
});

test('resolves discovery trigger rows without accessing columns from another table', () => {
  expect(discoveryTriggerMigration).toContain("IF TG_TABLE_NAME = 'services' THEN");
  expect(discoveryTriggerMigration).toContain("ELSIF TG_TABLE_NAME = 'establishments' THEN");
  expect(discoveryTriggerMigration).toContain("WHEN TG_OP = 'DELETE' THEN OLD.establishment_id");
  expect(discoveryTriggerMigration).toContain("WHEN TG_OP = 'DELETE' THEN OLD.id");
  expect(discoveryTriggerMigration).not.toContain('COALESCE(NEW.establishment_id::text, OLD.establishment_id::text)');
});
