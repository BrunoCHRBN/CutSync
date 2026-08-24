import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = path.resolve(__dirname, '../..');
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const phase1Workflow = read('.github/workflows/phase1-gate.yml');
const remoteMonitor = read('.github/workflows/supabase-schema-drift.yml');
const checkScript = read('scripts/check-supabase-schema.sh');
const generateScript = read('scripts/generate-supabase-types.sh');
const catalogMonitor = read('scripts/validate-supabase-homolog-catalog.mjs');

test('pull requests compare versioned types with the reconciled local replay', () => {
  expect(phase1Workflow).toContain("- '.github/workflows/supabase-schema-drift.yml'");
  expect(phase1Workflow).toContain("- 'scripts/check-supabase-schema.sh'");
  expect(phase1Workflow).toContain("- 'scripts/generate-supabase-types.sh'");
  expect(phase1Workflow).toContain("- 'scripts/validate-supabase-homolog-catalog.mjs'");
  expect(phase1Workflow).toContain("- 'tests/unit/phase0-canonical-reconciliation.unit.spec.ts'");
  expect(phase1Workflow).toContain("- 'tests/unit/supabase-schema-contract-modes.unit.spec.ts'");
  expect(phase1Workflow.match(/tests\/unit\/phase0-canonical-reconciliation\.unit\.spec\.ts/g)).toHaveLength(2);
  expect(phase1Workflow).toContain('version: 2.115.0');

  const resetIndex = phase1Workflow.indexOf('run: ./scripts/reset-supabase-reconciled.ps1');
  const localCheckIndex = phase1Workflow.indexOf('name: Validar contrato de tipos contra o replay local');
  const sqlScenariosIndex = phase1Workflow.indexOf('name: Executar cenários SQL de Chamados corporativos');

  expect(resetIndex).toBeGreaterThan(-1);
  expect(localCheckIndex).toBeGreaterThan(resetIndex);
  expect(sqlScenariosIndex).toBeGreaterThan(localCheckIndex);
  expect(phase1Workflow.slice(localCheckIndex, sqlScenariosIndex)).toContain(
    "SUPABASE_TYPES_LOCAL: 'true'",
  );
  expect(phase1Workflow.slice(localCheckIndex, sqlScenariosIndex)).toContain(
    'run: bash scripts/check-supabase-schema.sh',
  );
});

test('Homolog remains a separate read-only drift monitor outside pull requests', () => {
  expect(remoteMonitor).not.toMatch(/^\s{2}pull_request:/m);
  expect(remoteMonitor).toMatch(/^\s{2}push:/m);
  expect(remoteMonitor).toMatch(/^\s{2}schedule:/m);
  expect(remoteMonitor).toMatch(/^\s{2}workflow_dispatch:/m);
  expect(remoteMonitor).toContain('name: Monitorar drift read-only de Homolog');
  expect(remoteMonitor).toContain("SUPABASE_TYPES_LOCAL: 'false'");
  expect(remoteMonitor).toContain('SUPABASE_PROJECT_ID: sphbbqdgcreowxzjgibj');
  expect(remoteMonitor).toContain('version: 2.115.0');
  expect(remoteMonitor).toContain('uses: actions/setup-node@v4');
  expect(remoteMonitor).toContain('node-version: 22');
  expect(remoteMonitor).not.toMatch(/supabase\s+(?:db\s+push|migration\s+repair)/);

  const typesIndex = remoteMonitor.indexOf('run: bash scripts/check-supabase-schema.sh');
  const catalogIndex = remoteMonitor.indexOf(
    'run: node scripts/validate-supabase-homolog-catalog.mjs',
  );
  expect(typesIndex).toBeGreaterThan(-1);
  expect(catalogIndex).toBeGreaterThan(typesIndex);

  expect(checkScript).toContain('Drift detectado entre Homolog e o contrato de tipos do replay local.');
  expect(checkScript).toContain('Não regenere os tipos a partir de Homolog para ocultar o drift');
  expect(checkScript).toContain('O monitor é somente leitura');
  expect(checkScript).toContain('exit 1');
  expect(generateScript).toContain('SUPABASE_CLI_VERSION:-2.115.0');
  expect(generateScript).toContain('source_args+=(--local)');
  expect(generateScript).toContain('source_args+=(--project-id "$project_id")');

  expect(catalogMonitor).toContain('/database/query/read-only');
  expect(catalogMonitor).toContain("method: 'POST'");
  expect(catalogMonitor).toContain('Authorization: `Bearer ${accessToken}`');
  expect(catalogMonitor).toContain("migration.version = '20260824022000'");
  expect(catalogMonitor).toContain("migration.version = '20260824190722'");
  expect(catalogMonitor).toContain("attribute.attname = 'expected_request_version'");
  expect(catalogMonitor).toContain('attribute.attnotnull');
  expect(catalogMonitor).toContain("'unique_per_request', EXISTS");
  expect(catalogMonitor).toContain('pg_catalog.pg_advisory_xact_lock');
  expect(catalogMonitor).toContain('target_expected_version is null');
  expect(catalogMonitor).toContain('target_decision is null');
  expect(catalogMonitor).toContain('request_row.version is distinct from target_expected_version');
  expect(catalogMonitor).toContain('corporate_case_events_truncate_immutable');
  expect(catalogMonitor).toContain("'service_role'");
  expect(catalogMonitor).toContain('assertSelectOnly(catalogQuery)');
  expect(catalogMonitor).not.toMatch(/fetch\([^)]*\/database\/query(?:[?'"`])/);
});
