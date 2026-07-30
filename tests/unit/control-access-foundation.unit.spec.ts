/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const migration = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260730000000_control_access_foundation.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const auditTriggerFix = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260730001000_fix_governance_audit_trigger.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const authProfileTriggerFix = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260801001000_restore_auth_profile_creation_trigger.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const ownerBootstrap = fs.readFileSync(
  path.join(root, 'supabase/snippets/bootstrap_control_owner_by_email.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const controlRpcGrantFix = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260801002000_harden_control_rpc_execute_grants.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const governanceAal2Guard = fs.readFileSync(
  path.join(root, 'supabase/migrations/20260804002000_restore_governance_aal2_guard.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const governanceAal2SqlTest = fs.readFileSync(
  path.join(root, 'supabase/tests/governance_aal2_guard.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const controlSqlTest = fs.readFileSync(
  path.join(root, 'supabase/tests/control_access_foundation.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const authContext = fs.readFileSync(
  path.join(root, 'apps/control/src/contexts/control-auth-context.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const supabaseClient = fs.readFileSync(
  path.join(root, 'apps/control/src/services/supabase.ts'),
  'utf8',
).replace(/\r\n/g, '\n');
const controlShell = fs.readFileSync(
  path.join(root, 'apps/control/src/components/control-shell.tsx'),
  'utf8',
).replace(/\r\n/g, '\n');
const routes = [
  '(auth)/login.tsx',
  '(auth)/mfa.tsx',
  '(control)/index.tsx',
  '(control)/live.tsx',
  '(control)/support.tsx',
  '(control)/billing.tsx',
  '(control)/governance.tsx',
  '(control)/knowledge.tsx',
  '(control)/access.tsx',
];

test('keeps the Control session volatile and requires real AAL2', () => {
  expect(supabaseClient).toContain('persistSession: false');
  expect(authContext).toContain("currentLevel !== 'aal2'");
  expect(authContext).toContain("factorType: 'totp'");
  expect(authContext).not.toContain('123456');
  expect(authContext).toContain('IDLE_TIMEOUT_MS = 30 * 60 * 1000');
  expect(authContext).toContain('ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000');
  expect(authContext).toContain('ACCESS_REVALIDATION_MS = 60 * 1000');
  expect(authContext).toContain("('get_control_context')");
  expect(authContext).toContain(
    "setStatus(needsMfa ? 'mfa_required' : denied ? 'unauthorized' : 'error')",
  );
  expect(authContext).toContain(
    "window.addEventListener('focus', revalidateWhenVisible)",
  );
  expect(authContext).toContain(
    "document.addEventListener('visibilitychange', revalidateWhenVisible)",
  );
});

test('defines explicit, private Control RPC grants', () => {
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.get_control_context()');
  expect(migration).toContain("auth.jwt()->>'aal'");
  expect(migration).toContain("RAISE EXCEPTION 'control_aal2_required'");
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_control_context() FROM PUBLIC, anon');
  expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_control_context() TO authenticated');
  expect(migration).toContain("'control.access.manage'");
});

test('requires an active AAL2 session in the shared governance guard', () => {
  expect(governanceAal2Guard).toContain('SELECT public.current_session_is_aal2()');
  expect(governanceAal2Guard).toContain('AND is_active');
  expect(governanceAal2Guard).toContain('AND revoked_at IS NULL');
  expect(governanceAal2Guard).toContain('AND (expires_at IS NULL OR expires_at > now())');
  expect(governanceAal2Guard).toContain(
    'REVOKE ALL ON FUNCTION public.is_governance_user(',
  );
  expect(governanceAal2Guard).toContain(
    ') TO authenticated, service_role;',
  );
  expect(governanceAal2SqlTest).toContain('FAIL: AAL1 session passed the governance guard');
  expect(governanceAal2SqlTest).toContain(
    "'SELECT * FROM public.list_control_billing_accounts()'",
  );
  expect(governanceAal2SqlTest).toContain(
    "SELECT public.configure_control_plan('network', 4990, 'BRL')",
  );
  expect(governanceAal2SqlTest).toContain(
    "PERFORM public.configure_control_plan('network', 4990, 'BRL');",
  );
  expect(governanceAal2SqlTest).toContain(
    'FAIL: active AAL2 viewer failed the governance guard',
  );
});

test('supports expiring and revocable delegated access without removing the final owner', () => {
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true');
  expect(migration).toContain('ADD COLUMN IF NOT EXISTS expires_at timestamptz');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.set_control_user_access');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.revoke_control_user_access');
  expect(migration).toContain("RAISE EXCEPTION 'last_owner_protected'");
  expect(migration).toContain("'control.access.revoked'");
  expect(migration).not.toContain("'reason', reason");
});

test('creates separate auth and private application routes', () => {
  for (const route of routes) {
    expect(fs.existsSync(path.join(root, 'apps/control/src/app', route))).toBeTruthy();
  }
});

test('flattens styles forwarded by Link asChild in the Control navigation', () => {
  expect(controlShell).toContain('style={StyleSheet.flatten([');
  expect(controlShell).not.toContain('<Pressable style={[styles.navigationItem');
});

test('keeps initial metrics operational and avoids unsupported financial claims', () => {
  expect(migration).toContain("'appointments_today'");
  expect(migration).toContain("'completed_last_28_days'");
  expect(migration).toContain("'cancelled_last_28_days'");
  expect(migration).not.toContain("'revenue'");
  expect(migration).not.toContain("'profit'");
  expect(migration).not.toContain("'cash'");
});

test('branches on the trigger table before reading table-specific fields', () => {
  expect(auditTriggerFix).toContain("IF TG_TABLE_NAME = 'establishments' THEN");
  expect(auditTriggerFix).toContain('IF NEW.account_status IS DISTINCT FROM OLD.account_status THEN');
  expect(auditTriggerFix).not.toContain(
    "IF TG_TABLE_NAME = 'establishments' AND NEW.account_status IS DISTINCT FROM OLD.account_status THEN",
  );
  expect(auditTriggerFix).toContain("ELSIF TG_TABLE_NAME = 'governance_users' THEN");
});

test('restores profile creation after schema-only Auth restores', () => {
  expect(authProfileTriggerFix).toContain("to_regprocedure('public.handle_new_user()')");
  expect(authProfileTriggerFix).toContain("trigger.tgrelid = 'auth.users'::regclass");
  expect(authProfileTriggerFix).toContain("trigger.tgname = 'on_auth_user_created'");
  expect(authProfileTriggerFix).toContain('EXECUTE FUNCTION public.handle_new_user()');
});

test('bootstraps only the first Control owner without copying a UUID', () => {
  expect(ownerBootstrap).toContain("RAISE EXCEPTION 'replace_bootstrap_email'");
  expect(ownerBootstrap).toContain("RAISE EXCEPTION 'profile_not_found'");
  expect(ownerBootstrap).toContain(
    "RAISE EXCEPTION 'active_owner_already_exists_use_control_access_management'",
  );
  expect(ownerBootstrap).toContain("governance.role = 'SaaS_Owner'");
  expect(ownerBootstrap).toContain('governance.profile_id <> target_profile_id');
  expect(ownerBootstrap).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
});

test('keeps every Control RPC unavailable to anonymous sessions', () => {
  const restoredBillingRpcs = [
    'list_control_billing_accounts()',
    'list_identity_migration_conflicts()',
    'configure_control_plan(text, integer, text)',
    'activate_control_subscription(uuid, text, date)',
    'set_control_subscription_enforcement(uuid, boolean, text)',
  ];

  for (const signature of restoredBillingRpcs) {
    expect(controlRpcGrantFix).toContain(
      `REVOKE ALL ON FUNCTION public.${signature} FROM PUBLIC, anon`,
    );
  }

  expect(controlSqlTest).toContain("has_function_privilege('anon', control_rpc, 'EXECUTE')");
  expect(controlSqlTest).toContain("RAISE EXCEPTION 'FAIL: anon can execute %'");
});
