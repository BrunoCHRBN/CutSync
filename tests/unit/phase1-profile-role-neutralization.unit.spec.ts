import { expect, test } from '@playwright/test';

import {
  mapAuthorizedContext,
  mapActiveContextReceipt,
} from '../../packages/database/src/identity-context';
import {
  mapBusinessOperationalContext,
} from '../../packages/database/src/business';
import {
  resolveWebOperationalSurface,
} from '../../apps/web/src/features/access/web-operational-surface';
import {
  resolveReassignmentResponsibility,
} from '../../apps/business/src/features/decisions/appointment-reassignment-request';
import type { BusinessAccessContext } from '../../apps/web/src/contexts/BillingAccessContext';

const testId = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

const canManageBillingAction = (access: BusinessAccessContext | null | undefined): boolean => Boolean(
  access && (
    access.billing_owner ||
    ['owner', 'finance', 'billing_owner'].includes(access.payer_role ?? '')
  )
);

test.describe('PS1-E1A.1: Hardening and neutralization of profiles.role as decision source', () => {
  test('Negative 1: Stale profiles.role=admin with revoked/null context safely resolves to client surface and empty capabilities', () => {
    // Null context (e.g. user without membership, or all memberships revoked)
    expect(resolveWebOperationalSurface(null)).toBe('client');
    expect(resolveWebOperationalSurface(undefined)).toBe('client');
    expect(resolveWebOperationalSurface({ capabilities: [] })).toBe('client');
  });

  test('Negative 2 & Test 2: Reception capabilities resolve to business/admin operational surface without granting administrative or billing capabilities', () => {
    const receptionContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Centro',
      organizationId: null,
      organizationName: null,
      membershipId: testId('2'),
      membershipRole: 'professional', // legacy projection
      roleTemplate: 'reception',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'centro',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: ['view_team_agenda', 'create_team_walk_in', 'manage_clients'],
      allowedActions: ['view_team_agenda', 'create_team_walk_in', 'manage_clients'],
      active: true,
      version: 1,
    });

    expect(receptionContext).not.toBeNull();
    expect(receptionContext?.roleTemplate).toBe('reception');
    expect(receptionContext?.membershipRole).toBe('professional'); // legacy projection preserved
    // UX: reception opens business/admin desk operational surface
    expect(resolveWebOperationalSurface(receptionContext)).toBe('admin');
    // But does not have sensitive admin capabilities
    expect(receptionContext?.capabilities).not.toContain('manage_services');
    expect(receptionContext?.capabilities).not.toContain('manage_team');
    expect(receptionContext?.capabilities).not.toContain('manage_operational_settings');
  });

  test('Negative 3: Business/admin operational surface does NOT grant billing authority', () => {
    // User is in admin operational surface (e.g. reception desk) but has no billing ownership or payer role
    const nonBillingAccess: BusinessAccessContext = {
      establishment_id: testId('1'),
      membership_role: 'professional',
      billing_owner: false,
      account_status: 'active',
      billing_status: 'active',
      access_mode: 'full',
      trial_ends_at: null,
      grace_ends_at: null,
      current_period_ends_at: '2026-08-31T23:59:59.000Z',
      cancel_at_period_end: false,
      entitlements: ['core_pos'],
      billing_scope: 'establishment',
      billing_account_id: testId('20'),
      subscription_id: testId('30'),
      organization_id: null,
      covered_establishment_ids: [testId('1')],
      payer_role: null,
      pending_change_at: null,
    };

    expect(canManageBillingAction(nonBillingAccess)).toBe(false);

    // Positive billing authority test: Billing owner or corporate finance
    const ownerBillingAccess: BusinessAccessContext = {
      ...nonBillingAccess,
      billing_owner: true,
      payer_role: 'owner',
    };
    expect(canManageBillingAction(ownerBillingAccess)).toBe(true);

    const financeBillingAccess: BusinessAccessContext = {
      ...nonBillingAccess,
      billing_owner: false,
      payer_role: 'finance',
    };
    expect(canManageBillingAction(financeBillingAccess)).toBe(true);
  });

  test('Test 4: Professional template with only own agenda resolves to personal professional surface', () => {
    const professionalContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Moema',
      organizationId: null,
      organizationName: null,
      membershipId: testId('4'),
      membershipRole: 'professional',
      roleTemplate: 'professional',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'moema',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: ['view_own_agenda'],
      allowedActions: ['view_own_agenda'],
      active: true,
      version: 1,
    });

    expect(professionalContext).not.toBeNull();
    expect(resolveWebOperationalSurface(professionalContext)).toBe('professional');
  });

  test('Test 5: Manager role template resolves to business/admin surface and preserves managerial capabilities', () => {
    const managerContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Jardins',
      organizationId: null,
      organizationName: null,
      membershipId: testId('3'),
      membershipRole: 'professional', // legacy projection
      roleTemplate: 'manager',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'jardins',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: ['view_team_agenda', 'manage_services', 'manage_team', 'view_unit_reports'],
      allowedActions: ['view_team_agenda', 'manage_services', 'manage_team', 'view_unit_reports'],
      active: true,
      version: 1,
    });

    expect(managerContext).not.toBeNull();
    expect(managerContext?.roleTemplate).toBe('manager');
    expect(resolveWebOperationalSurface(managerContext)).toBe('admin');
    expect(managerContext?.capabilities).toContain('manage_services');
    expect(managerContext?.capabilities).toContain('manage_team');
  });

  test('Test 6: Mobile operational context maps role template and capabilities independently of profiles.role', () => {
    const mobileContext = mapBusinessOperationalContext({
      membership_id: testId('10'),
      membership_role: 'professional', // legacy projection
      membership_status: 'active',
      establishment_id: testId('1'),
      establishment_name: 'CutSync Matriz',
      establishment_slug: 'matriz',
      timezone: 'America/Sao_Paulo',
      operational_role: 'manager',
      access_mode: 'full',
      capabilities: ['view_team_agenda', 'manage_team_blocks', 'view_unit_reports'],
      financial_ops_enabled: false,
      billing_owner: false,
      billing_status: 'active',
      trial_ends_at: null,
      grace_ends_at: null,
      current_period_ends_at: '2026-08-31T23:59:59.000Z',
      billing_scope: 'organization',
      billing_account_id: testId('20'),
      subscription_id: testId('30'),
      organization_id: testId('40'),
      covered_establishment_ids: [testId('1')],
      payer_role: 'owner',
      pending_change_at: null,
    });

    expect(mobileContext).not.toBeNull();
    expect(mobileContext?.operationalRole).toBe('manager');
    expect(mobileContext?.capabilities).toContain('manage_team_blocks');
  });

  test('Test 7: Decision responsibility resolution uses operational role template instead of legacy profiles.role', () => {
    expect(resolveReassignmentResponsibility('admin')).toBe('admin');
    expect(resolveReassignmentResponsibility('manager')).toBe('manager');
    expect(resolveReassignmentResponsibility('reception')).toBe('reception');
    expect(resolveReassignmentResponsibility('professional')).toBe('professional');
    expect(resolveReassignmentResponsibility('owner')).toBe('owner');
    // Non-decision roles resolve to null
    expect(resolveReassignmentResponsibility('cashier')).toBeNull();
    expect(resolveReassignmentResponsibility('finance')).toBeNull();
  });

  test('Negative 8 & 9 & 10: Unauthorized or malformed context targets fail closed', () => {
    // Malformed context without establishmentId
    expect(mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: null,
      establishmentName: 'Invalido',
      organizationId: null,
      organizationName: null,
      membershipId: testId('50'),
      membershipRole: 'professional',
      roleTemplate: 'professional',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'invalido',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: ['view_own_agenda'],
      allowedActions: ['view_own_agenda'],
      active: true,
      version: 1,
    })).toBeNull();

    // Invalid role template
    expect(mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Valido',
      organizationId: null,
      organizationName: null,
      membershipId: testId('50'),
      membershipRole: 'professional',
      roleTemplate: 'super_owner' as any,
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'valido',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: ['view_own_agenda'],
      allowedActions: ['view_own_agenda'],
      active: true,
      version: 1,
    })).toBeNull();
  });
});
