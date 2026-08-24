import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const root = path.resolve(__dirname, '../..');

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const readHashEntries = (script: string, variableName: string) => {
  const body = script.match(new RegExp(`\\$${variableName} = @\\{([\\s\\S]*?)\\n\\}`))?.[1] ?? '';

  return [...body.matchAll(/'([^']+)' = '([A-F0-9]{64})'/g)].map((match) => ({
    file: match[1],
    expectedHash: match[2],
  }));
};

test('reset reconciliado preserva históricos e monta uma sequência sem versões duplicadas', () => {
  const script = read('scripts/reset-supabase-reconciled.ps1');

  expect(script).toContain('expectedActiveHistoricalHashes');
  expect(script).toContain('retiredDuplicateHashes');
  expect(script).toContain('expectedCanonicalHashes');
  expect(script).toContain('20260806000000_client_discovery_media_and_geo.sql');
  expect(script).toContain('20260807000000_client_favorites.sql');
  expect(script).toContain('20260811000000_access_control_audit_hardening.sql');
  expect(script).toContain('20260811000000_appointment_price_charged_snapshot.sql');
  expect(script).toContain('20260808041238_client_discovery_media_and_geo_reconciled.sql');
  expect(script).toContain('20260808041243_client_favorites_reconciled.sql');
  expect(script).toContain('20260808041248_access_control_audit_hardening_reconciled.sql');
  expect(script).toContain('20260808041253_appointment_price_charged_snapshot_reconciled.sql');
  expect(script).toContain('20260819000000_reconcile_android_cycle_schema_order.sql');
  expect(script).toContain('20260819001000_harden_mobile_public_surface.sql');
  expect(script).toContain("Where-Object Count -gt 1");
  expect(script).toContain('supabase db reset --local --no-seed');
  expect(script).toContain("StartsWith('cutsync-reconciled-reset-'");
});

test('hashes protegidos correspondem ao conteúdo normalizado das migrations', () => {
  const script = read('scripts/reset-supabase-reconciled.ps1');
  const entries = [
    ...readHashEntries(script, 'expectedActiveHistoricalHashes'),
    ...readHashEntries(script, 'expectedCanonicalHashes'),
  ];

  expect(entries).toHaveLength(8);
  for (const entry of entries) {
    const normalizedContent = read(`supabase/migrations/${entry.file}`).replace(/\r\n?/g, '\n');
    const actualHash = createHash('sha256').update(normalizedContent, 'utf8').digest('hex').toUpperCase();

    expect(actualHash, entry.file).toBe(entry.expectedHash);
  }
});

test('duplicatas aposentadas permanecem fora da sequência executável e recuperáveis pelo manifesto', () => {
  const script = read('scripts/reset-supabase-reconciled.ps1');
  const evidence = read('supabase/migration_evidence/duplicate_versions/README.md');
  const retiredEntries = readHashEntries(script, 'retiredDuplicateHashes');

  expect(retiredEntries).toHaveLength(4);
  for (const entry of retiredEntries) {
    expect(fs.existsSync(path.join(root, 'supabase/migrations', entry.file)), entry.file).toBe(false);
    expect(evidence).toContain(entry.file);
    expect(evidence).toContain(entry.expectedHash);
    expect(evidence).toContain(`git show`);
  }
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
