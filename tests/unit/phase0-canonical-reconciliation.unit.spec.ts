import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = path.resolve(__dirname, '../..');

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('reset reconciliado preserva históricos e monta uma sequência sem versões duplicadas', () => {
  const script = read('scripts/reset-supabase-reconciled.ps1');

  expect(script).toContain('expectedDuplicateHashes');
  expect(script).toContain('20260806000000_client_discovery_media_and_geo.sql');
  expect(script).toContain('20260807000000_client_favorites.sql');
  expect(script).toContain('20260811000000_access_control_audit_hardening.sql');
  expect(script).toContain('20260811000000_appointment_price_charged_snapshot.sql');
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
