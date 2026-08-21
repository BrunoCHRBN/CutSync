/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const service = read('apps/control/src/services/control-access.ts');
const route = read('apps/control/src/app/(control)/access.tsx');
const screen = read('apps/control/src/modules/gsp/access-directory.tsx');

test('parses the private access contract instead of trusting unknown RPC payloads', () => {
  expect(service).toContain('export function parseControlAccessProfile');
  expect(service).toContain('export function parseControlAccessUser');
  expect(service).toContain("parseGovernanceRole(record.role)");
  expect(service).toContain("typeof record.is_active !== 'boolean'");
  expect(service).toContain('Array.isArray(result.data)');
  expect(service).toContain('result.data.length > 1');
  expect(service).toContain('Os dados de acesso retornaram em um formato inesperado.');
});

test('uses only the four protected RPC contracts through the service layer', () => {
  expect(service).toContain("rpc('find_control_profile_by_email', { target_email: email })");
  expect(service).toContain("rpc('list_control_users')");
  expect(service).toContain("rpc('set_control_user_access', {");
  expect(service).toContain("rpc('revoke_control_user_access', {");
  expect(service).toContain('target_profile_id: profileId');
  expect(service).toContain('target_expires_at: expiresAt');
  expect(screen).not.toContain("from '@/services/supabase'");
  expect(screen).not.toContain('.rpc(');
  expect(route).toContain('CLOUD_ROUTES.gsp.acessos');
});

test('translates authorization and business errors without rendering raw backend details', () => {
  for (const code of [
    'access_expiry_invalid',
    'access_reason_required',
    'control_aal2_required',
    'forbidden',
    'governance_user_not_active',
    'last_owner_protected',
    'profile_not_found',
    'PGRST202',
  ]) {
    expect(service).toContain(`${code}:`);
  }
  expect(service).toContain('export class ControlAccessError extends Error');
  expect(screen).toContain('getControlAccessErrorMessage(');
  expect(screen).not.toContain('error.message');
  expect(screen).not.toContain('error.details');
});

test('requires a reviewed reason and optional future expiry before every mutation', () => {
  expect(service).toContain('reason.length < 10 || reason.length > 500');
  expect(service).toContain("/^\\d{4}-\\d{2}-\\d{2}$/");
  expect(screen).toContain('<ControlConfirmPanel');
  expect(screen).toContain('pending.kind ===');
  expect(screen).toContain('validateControlAccessReason(reason)');
  expect(screen).toContain('parseControlAccessExpiryInput(expiryInput)');
  expect(screen).toContain('Revisar alteração');
  expect(screen).toContain('Revisar revogação');
});

test('supports grant, edit, reactivation and revocation with a refreshed list', () => {
  expect(screen).toContain("type EditorIntent = 'grant' | 'edit' | 'reactivate' | 'revoke'");
  expect(screen).toContain('Editar acesso');
  expect(screen).toContain('Reativar acesso');
  expect(screen).toContain('Revogar acesso');
  expect(screen).toContain('await refreshUsers(false)');
  expect(screen).toContain("can('control.access.manage')");
  expect(screen).toContain('Somente SaaS_Owner com sessão AAL2');
});
