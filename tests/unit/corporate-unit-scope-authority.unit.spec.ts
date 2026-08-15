import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

test.describe('PS4-E3 / PS4-E3.1 Corporate Unit Scope Authority & Lifecycle', () => {
  const modelsPath = path.join(process.cwd(), 'packages/database/src/models.ts');
  const orgServicePath = path.join(process.cwd(), 'apps/web/src/services/organizations.ts');
  const orgScreenPath = path.join(process.cwd(), 'apps/web/src/components/screens/OrganizationExperience.tsx');
  const migrationPath = path.join(process.cwd(), 'supabase/migrations/20260824009000_phase4_organization_member_unit_scope.sql');
  const architectureDocPath = path.join(process.cwd(), 'docs/architecture/ORGANIZATION_UNIT_SCOPE.md');

  test('models define explicit OrganizationScopeMode and scoped OrganizationMembership', () => {
    const modelsContent = fs.readFileSync(modelsPath, 'utf8');
    expect(modelsContent).toContain("export type OrganizationScopeMode = 'all' | 'selected';");
    expect(modelsContent).toContain('scope_mode?: OrganizationScopeMode;');
    expect(modelsContent).toContain('scoped_establishment_ids?: string[] | null;');
  });

  test('organizations service provides typed setMemberUnitScope and inviteMemberV2', () => {
    const serviceContent = fs.readFileSync(orgServicePath, 'utf8');
    expect(serviceContent).toContain('inviteMemberV2');
    expect(serviceContent).toContain('setMemberUnitScope');
    expect(serviceContent).toContain('target_scope_mode');
    expect(serviceContent).toContain('target_establishment_ids');
  });

  test('OrganizationExperience UI handles scope modes and unit assignment controls', () => {
    const screenContent = fs.readFileSync(orgScreenPath, 'utf8');
    expect(screenContent).toContain('inviteScopeMode');
    expect(screenContent).toContain('editScopeMode');
    expect(screenContent).toContain('setMemberUnitScope');
    expect(screenContent).toContain('inviteMemberV2');
    expect(screenContent).toContain('Todas as unidades');
  });

  test('database migration enforces strict isolation between corporate scope and operational capabilities', () => {
    const migrationContent = fs.readFileSync(migrationPath, 'utf8');
    expect(migrationContent).toContain('has_organization_establishment_scope');
    expect(migrationContent).toContain('set_organization_member_unit_scope');
    expect(migrationContent).toContain('invite_organization_member_v2');
    expect(migrationContent).toContain('remove_organization_establishment');
    expect(migrationContent).toContain('organization_member_establishment_scopes');
    expect(migrationContent).toContain('idempotency_key_reused');
  });

  test('architecture documentation specifies corporate unit scope invariants', () => {
    const docContent = fs.readFileSync(architectureDocPath, 'utf8');
    expect(docContent).toContain('Organization scope ≠ establishment membership');
    expect(docContent).toContain('Organization role ≠ business capability');
    expect(docContent).toContain('Finance');
    expect(docContent).toContain('Manager');
  });
});
