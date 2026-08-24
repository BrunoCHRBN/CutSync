/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  parseCorporateCaseRuntimeAdministrationContext,
  parseCorporateCaseRuntimeMutationResult,
} from '../../apps/control/src/services/corporate-cases';
import { controlPermissions } from '../../apps/control/src/types/control';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260824021000_corporate_case_runtime_administration.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const routeAccess = fs.readFileSync(
  path.join(root, 'apps/control/src/navigation/cloud-route-access.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const screen = fs.readFileSync(
  path.join(root, 'apps/control/src/modules/cases/corporate-case-runtime-settings-screen.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const route = fs.readFileSync(
  path.join(root, 'apps/control/src/app/(cloud)/chamados/configuracao.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');

const flags = {
  enabled: false,
  creation_enabled: false,
  workflow_enabled: false,
  automation_enabled: false,
  email_enabled: false,
  legacy_redirects_enabled: false,
};

test('creates a dedicated Owner-only critical capability for runtime settings', () => {
  expect(controlPermissions).toContain('control.cases.configure');
  expect(migration).toContain("'control.cases.configure'");
  expect(migration).toContain("WHERE access_profile.profile_key = 'saas_owner'");
  expect(migration).not.toContain("('governance_manager', 'control.cases.configure')");
  expect(routeAccess).toContain("anyOf: ['control.cases.configure']");
});

test('requires AAL2 context, SaaS Owner role and the dedicated capability in both RPCs', () => {
  expect(migration.match(/actor_context := public\.get_control_context\(\);/g)).toHaveLength(2);
  expect(migration.match(/actor_context->>'role' <> 'SaaS_Owner'/g)).toHaveLength(2);
  expect(migration.match(/'control\.cases\.configure'/g)?.length).toBeGreaterThanOrEqual(4);
  expect(migration.match(/SECURITY DEFINER\nSET search_path = pg_catalog\n/g)).toHaveLength(2);
  expect(migration).not.toContain('SECURITY DEFINER\nSET search_path = pg_catalog, public');
  expect(migration).toContain('TO authenticated;');
  expect(migration).not.toContain('TO authenticated, service_role;');
});

test('keeps the file-based configuration route in the delivery', () => {
  expect(route).toContain("import { CorporateCaseRuntimeSettingsScreen }");
  expect(route).toContain('export default function CorporateCaseRuntimeSettingsRoute()');
  expect(route).toContain('return <CorporateCaseRuntimeSettingsScreen />;');
});

test('keeps runtime flags unchanged while adding concurrency and immutable audit controls', () => {
  expect(migration).toContain('ADD COLUMN version integer NOT NULL DEFAULT 1');
  expect(migration).not.toContain('SET enabled = true');
  expect(migration).toContain('FOR UPDATE;');
  expect(migration).toContain("RAISE EXCEPTION 'corporate_case_runtime_version_conflict'");
  expect(migration).toContain('request_id uuid NOT NULL UNIQUE');
  expect(migration).toContain('corporate_case_runtime_changes_immutable');
  expect(migration).toContain("'corporate_case.runtime_settings.changed'");
});

test('validates flag dependencies and requires an auditable reason', () => {
  expect(migration).toContain('char_length(normalized_reason) NOT BETWEEN 20 AND 1000');
  expect(migration).toContain('target_email_enabled AND NOT target_automation_enabled');
  expect(migration).toContain("RAISE EXCEPTION 'corporate_case_runtime_dependency_invalid'");
  expect(screen).toContain('Não inclua senhas, tokens ou dados pessoais desnecessários.');
  expect(screen).toContain('setPendingRequestId(null);');
});

test('parses the guarded administration context and mutation response', () => {
  expect(parseCorporateCaseRuntimeAdministrationContext({
    settings: {
      ...flags,
      version: 1,
      updated_by: null,
      updated_at: '2026-08-23T12:00:00.000Z',
    },
    recent_changes: [{
      change_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      request_id: '11111111-2222-4333-8444-555555555555',
      actor_profile_id: '99999999-8888-4777-8666-555555555555',
      actor_name: 'SaaS Owner',
      reason: 'Ativação após validação formal em homologação.',
      expected_version: 1,
      resulting_version: 2,
      previous_settings: flags,
      new_settings: { ...flags, enabled: true },
      created_at: '2026-08-23T12:01:00.000Z',
    }],
  })).toMatchObject({
    settings: { enabled: false, version: 1 },
    recentChanges: [{ actorName: 'SaaS Owner', resultingVersion: 2 }],
  });

  expect(parseCorporateCaseRuntimeMutationResult({
    change_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    request_id: '11111111-2222-4333-8444-555555555555',
    resulting_version: 2,
    settings: { ...flags, enabled: true },
    idempotent: false,
  })).toMatchObject({
    resultingVersion: 2,
    settings: { enabled: true },
    idempotent: false,
  });
});
