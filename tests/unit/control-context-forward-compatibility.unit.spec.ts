/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  hasControlPermission,
  parseControlContext,
} from '../../apps/control/src/services/control-context';
import { controlPermissions } from '../../apps/control/src/types/control';

const root = process.cwd();

function catalogPermissionsFromMigrations(): string[] {
  const migrationsDirectory = path.join(root, 'supabase/migrations');
  const permissions = new Set<string>();

  for (const filename of fs.readdirSync(migrationsDirectory).filter((entry) => entry.endsWith('.sql'))) {
    const migration = fs
      .readFileSync(path.join(migrationsDirectory, filename), 'utf8')
      .replace(/\r\n/g, '\n');
    const catalogInsert = /INSERT INTO public\.control_permission_catalog\s*\([^)]*\)\s*VALUES([\s\S]*?)ON CONFLICT\s*\(permission\)/g;

    for (const insert of migration.matchAll(catalogInsert)) {
      for (const match of (insert[1] ?? '').matchAll(/'(control\.[a-z_]+\.[a-z_]+)'/g)) {
        if (match[1]) permissions.add(match[1]);
      }
    }
  }

  return [...permissions].sort();
}

function validContextPayload() {
  return {
    profile_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'Usuário de teste',
    email: 'control-contract@example.invalid',
    role: 'SaaS_Owner',
    permissions: [
      'control.dashboard.read',
      'control.cases.approve',
      'control.cases.future_review',
    ],
    assignments: [{
      assignment_id: '11111111-2222-4333-8444-555555555555',
      profile_key: 'saas_owner',
      profile_label: 'SaaS Owner',
      source_type: 'role_compat',
      scope_type: 'global',
      scope_id: null,
      valid_until: null,
    }],
    permission_sources: [
      {
        permission: 'control.cases.approve',
        profile_key: 'saas_owner',
        assignment_id: '11111111-2222-4333-8444-555555555555',
      },
      {
        permission: 'control.cases.future_review',
        profile_key: 'saas_owner',
        assignment_id: '11111111-2222-4333-8444-555555555555',
      },
    ],
    context_version: 2,
    assurance_level: 'aal2',
  };
}

test('keeps the TypeScript capability contract aligned with permission catalog migrations', () => {
  const catalogPermissions = catalogPermissionsFromMigrations();
  expect(catalogPermissions.length).toBeGreaterThan(0);
  expect(catalogPermissions.filter((permission) => !controlPermissions.includes(
    permission as (typeof controlPermissions)[number],
  ))).toEqual([]);
});

test('accepts the approval capability and quarantines future permissions', () => {
  const context = parseControlContext(validContextPayload());

  expect(context.permissions).toEqual([
    'control.dashboard.read',
    'control.cases.approve',
  ]);
  expect(context.unsupportedPermissions).toEqual(['control.cases.future_review']);
  expect(context.permissionSources).toEqual([{
    permission: 'control.cases.approve',
    profileKey: 'saas_owner',
    assignmentId: '11111111-2222-4333-8444-555555555555',
  }]);
  expect(hasControlPermission(context, 'control.cases.approve')).toBe(true);
  expect(hasControlPermission(context, 'control.cases.manage')).toBe(false);
});

test('still rejects malformed permission values instead of widening access', () => {
  const payload = validContextPayload();
  expect(() => parseControlContext({
    ...payload,
    permissions: [...payload.permissions, 42],
  })).toThrow('control_context_invalid');
});
