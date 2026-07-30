/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const hardeningMigration = fs
  .readFileSync(
    path.join(
      root,
      'supabase/migrations/20260804003000_harden_control_access_and_identity_resolution.sql',
    ),
    'utf8',
  )
  .replace(/\r\n/g, '\n');
const hardeningSqlTest = fs
  .readFileSync(
    path.join(root, 'supabase/tests/control_access_hardening.sql'),
    'utf8',
  )
  .replace(/\r\n/g, '\n');

test('preserves identity resolution while rejecting inactive delegated actors', () => {
  expect(hardeningMigration).toContain(
    'CREATE OR REPLACE FUNCTION public.resolve_identity_migration_conflict(',
  );
  expect(hardeningMigration).toContain(
    "IF current_user NOT IN ('service_role', 'postgres', 'supabase_admin')",
  );
  expect(hardeningMigration).toContain(
    "AND role IN ('SaaS_Editor', 'SaaS_Owner')",
  );
  expect(hardeningMigration).toContain('AND is_active');
  expect(hardeningMigration).toContain('AND revoked_at IS NULL');
  expect(hardeningMigration).toContain(
    'AND (expires_at IS NULL OR expires_at > now())',
  );

  expect(hardeningMigration).toContain(
    'INSERT INTO public.profile_legal_entities(',
  );
  expect(hardeningMigration).toContain(
    'INSERT INTO public.organization_members(',
  );
  expect(hardeningMigration).toContain(
    'UPDATE public.identity_migration_conflicts SET',
  );
  expect(hardeningMigration).toContain(
    'INSERT INTO public.security_audit_logs(action, actor_id, target_type, target_id, changes)',
  );
});

test('keeps identity conflict resolution callable only by the service role', () => {
  expect(hardeningMigration).toContain(
    ') FROM PUBLIC, anon, authenticated;',
  );
  expect(hardeningMigration).toContain(
    ') TO service_role;',
  );
  expect(hardeningSqlTest).toContain(
    'FAIL: authenticated can call the service-only resolver directly',
  );
  expect(hardeningSqlTest).toContain(
    'FAIL: service_role cannot execute the identity resolver',
  );
});

test('defines an exact Owner AAL2 profile lookup without enumerating profiles', () => {
  expect(hardeningMigration).toContain(
    'CREATE OR REPLACE FUNCTION public.find_control_profile_by_email(target_email text)',
  );
  expect(hardeningMigration).toContain(
    'RETURNS TABLE (\n  profile_id uuid,\n  name text,\n  email text\n)',
  );
  expect(hardeningMigration).toContain('PERFORM public.get_control_context();');
  expect(hardeningMigration).toContain(
    "ARRAY['SaaS_Owner']::public.governance_role_enum[]",
  );
  expect(hardeningMigration).toContain(
    "RAISE EXCEPTION 'profile_email_required'",
  );
  expect(hardeningMigration).toContain(
    'WHERE lower(profile.email) = lower(btrim(target_email))',
  );
  expect(hardeningMigration).toContain('AND profile.deleted_at IS NULL');
  expect(hardeningMigration).toContain('LIMIT 1;');
  expect(hardeningMigration).toContain(
    'REVOKE ALL ON FUNCTION public.find_control_profile_by_email(text) FROM PUBLIC, anon;',
  );
  expect(hardeningMigration).toContain(
    'TO authenticated, service_role;',
  );
});

test('covers AAL, role, exact search, revoked and expired actors in SQL', () => {
  for (const expected of [
    "'aal1'",
    "'SaaS_Viewer'",
    "'SaaS_Editor'",
    "'SaaS_Owner'",
    'exact case-insensitive profile lookup returned unexpected data',
    'partial email lookup returned a profile',
    'deleted profile was returned',
    'Ator revogado não pode resolver conflito',
    'Ator expirado não pode resolver conflito',
    'Editor ativo pode alcançar o conflito',
    'Owner ativo pode alcançar o conflito',
  ]) {
    expect(hardeningSqlTest).toContain(expected);
  }
});
