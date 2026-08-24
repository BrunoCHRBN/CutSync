/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824013000_control_access_profiles_and_approvals.sql');
const contextTypes = read('apps/control/src/types/control.ts');
const contextParser = read('apps/control/src/services/control-context.ts');

test('separates organizational titles from reusable permission profiles', () => {
  expect(migration).toContain('CREATE TABLE public.control_job_titles');
  expect(migration).toContain('CREATE TABLE public.control_access_profiles');
  expect(migration).toContain('CREATE TABLE public.control_access_profile_permissions');
  expect(migration).toContain("'Organizational labels only. Job titles never grant authorization.'");
  expect(migration).toContain("assignment_mode IN ('role_compat', 'delegated')");
  expect(migration).toContain("('assistant', 'Assistente', 100)");
  expect(migration).toContain("('access_administrator', 'Administrador de Acessos'");
});

test('keeps new access tables private behind security-definer RPCs', () => {
  for (const table of [
    'control_permission_catalog',
    'control_job_titles',
    'control_access_profiles',
    'control_access_profile_permissions',
    'control_access_requests',
    'control_access_request_approvals',
    'control_user_access_assignments',
  ]) {
    expect(migration).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
  }
  expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
  expect(migration).not.toContain('GRANT SELECT ON TABLE');
  expect(migration).not.toContain('GRANT INSERT ON TABLE');
  expect(migration).toContain('SECURITY DEFINER\nSET search_path = pg_catalog, public');
  expect(migration).not.toContain('user_metadata');
  expect(migration).not.toContain("auth.jwt()->>'email'");
});

test('resolves effective permissions only for active AAL2 governance identities', () => {
  expect(migration).toContain("auth.jwt()->>'aal'" );
  expect(migration).toContain("RAISE EXCEPTION 'control_aal2_required'");
  expect(migration).toContain('FROM public.governance_users AS governance');
  expect(migration).toContain('governance.is_active');
  expect(migration).toContain('governance.revoked_at IS NULL');
  expect(migration).toContain('CREATE TRIGGER governance_users_sync_control_role_profile');
  expect(migration).toContain("'context_version', 2");
  expect(migration).toContain("'permission_sources', actor_permission_sources");
});

test('requires approval separation, owner review and optimistic concurrency', () => {
  expect(migration).toContain('request_row.requested_by = actor_id');
  expect(migration).toContain('request_row.target_profile_id = actor_id');
  expect(migration).toContain("RAISE EXCEPTION 'approval_separation_required'");
  expect(migration).toContain('request_row.version <> target_expected_version');
  expect(migration).toContain("RAISE EXCEPTION 'approval_version_conflict'");
  expect(migration).toContain('request_row.requires_owner_approval');
  expect(migration).toContain('owner_approval_count >= 1');
  expect(migration).toContain("risk_level <> 'critical'");
  expect(migration).toContain('required_approvals = 2 AND requires_owner_approval AND requires_expiry');
});

test('makes request, decision and application retries idempotent and auditable', () => {
  expect(migration).toContain('client_request_id uuid NOT NULL UNIQUE');
  expect(migration).toContain('apply_request_id uuid UNIQUE');
  expect(migration).toContain("RAISE EXCEPTION 'idempotency_conflict'");
  expect(migration).toContain("'control.access.requested'");
  expect(migration).toContain("'control.access.approval_' || target_decision");
  expect(migration).toContain("'control.access.applied'");
  expect(migration).toContain("source_type <> 'role_compat'");
  expect(migration).toContain("request_row.status <> 'approved'");
});

test('extends the frontend context without breaking the legacy RPC payload', () => {
  for (const permission of [
    'control.access.request',
    'control.access.approve',
    'control.access.apply',
    'control.audit.read',
    'control.auth_recovery.manage',
    'control.auth_recovery.approve',
  ]) {
    expect(contextTypes).toContain(`'${permission}'`);
  }
  expect(contextParser).toContain('const contextVersion = payload.context_version ?? 1');
  expect(contextParser).toContain("const assuranceLevel = payload.assurance_level ?? 'aal2'");
  expect(contextParser).toContain('assignments: parseAssignments(payload.assignments)');
  expect(contextParser).toContain('permissionSources: parsePermissionSources(payload.permission_sources)');
});
