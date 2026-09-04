import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = path.resolve(__dirname, '../..');

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('cadeia canônica e reset reconciliado rejeitam versões duplicadas', () => {
  const migrationDirectory = path.join(root, 'supabase/migrations');
  const migrationFiles = fs.readdirSync(migrationDirectory)
    .filter((file) => /^\d{14}_.+\.sql$/.test(file));
  const filesByVersion = new Map<string, string[]>();

  for (const file of migrationFiles) {
    const version = file.slice(0, 14);
    filesByVersion.set(version, [...(filesByVersion.get(version) ?? []), file]);
  }

  const duplicateVersions = [...filesByVersion.entries()]
    .filter(([, files]) => files.length > 1)
    .map(([version, files]) => ({ version, files }))
    .sort((left, right) => left.version.localeCompare(right.version));
  const script = read('scripts/reset-supabase-reconciled.ps1');

  expect(duplicateVersions).toEqual([]);
  expect(script).not.toContain('excludedDuplicateFiles');
  expect(script).not.toContain('expectedDuplicateHashes');
  expect(script).toContain('20260806000000_android_business_operational_cycle.sql');
  expect(script).toContain('20260807000000_establishment_client_enrichment.sql');
  expect(script).toContain('20260808041238_client_discovery_media_and_geo_reconciled.sql');
  expect(script).toContain('20260808041243_client_favorites_reconciled.sql');
  expect(script).toContain('20260808041248_access_control_audit_hardening_reconciled.sql');
  expect(script).toContain('20260808041253_appointment_price_charged_snapshot_reconciled.sql');
  expect(script).toContain("Where-Object Count -gt 1");
  expect(script).toContain('supabase db reset --local --no-seed');
  expect(script).toContain("StartsWith('cutsync-reconciled-reset-'");
});

test('ACL do catálogo exclui flags e identidade privada da escrita direta', () => {
  const migration = read('supabase/migrations/20260820006000_reconcile_phase0_canonical_contracts.sql');
  const updateGrant = migration.match(/GRANT UPDATE \(([\s\S]*?)\) ON TABLE public\.establishments TO authenticated;/)?.[1] ?? '';
  const selectGrant = migration.match(/GRANT SELECT \(([\s\S]*?)\) ON TABLE public\.establishments TO anon, authenticated;/)?.[1] ?? '';

  expect(migration).toContain('REVOKE ALL ON TABLE public.establishments FROM anon, authenticated');
  expect(updateGrant).not.toContain('appointment_reassignment_enabled');
  expect(updateGrant).not.toContain('financial_ops_enabled');
  expect(updateGrant).not.toContain('account_status');
  expect(updateGrant).not.toContain('kyc_');
  expect(selectGrant).not.toContain('document_number');
  expect(selectGrant).not.toContain('kyc_document');
});

test('read model CRM não reintroduz chaves de atividade nulas', () => {
  const migration = read('supabase/migrations/20260820006000_reconcile_phase0_canonical_contracts.sql');

  expect(migration).toContain("jsonb_strip_nulls(jsonb_build_object(");
  expect(migration).toContain(")) || jsonb_build_object('status', client.status) AS payload");
  expect(migration).not.toContain("jsonb_build_object(\n+          'status', client.status,\n+          'firstAppointmentAt'");
});
