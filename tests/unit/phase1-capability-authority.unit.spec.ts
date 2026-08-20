import { expect, test } from '@playwright/test';

import {
  mapAuthorizedContext,
} from '../../packages/database/src/identity-context';
import {
  mapBusinessOperationalContext,
} from '../../packages/database/src/business';

const testId = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

test.describe('PS1-E1B: Capability Authority Migration Unit Tests', () => {
  test('Admin role template maps full management capabilities including manage_admins', () => {
    const adminContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Matriz',
      organizationId: null,
      organizationName: null,
      membershipId: testId('2'),
      membershipRole: 'admin',
      roleTemplate: 'admin',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'matriz',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: [
        'manage_services',
        'manage_team',
        'manage_admins',
        'view_unit_reports',
        'manage_operational_settings',
        'manage_team_blocks',
        'create_team_walk_in',
        'view_clients',
        'manage_clients',
      ],
      allowedActions: [
        'manage_services',
        'manage_team',
        'manage_admins',
        'view_unit_reports',
        'manage_operational_settings',
        'manage_team_blocks',
        'create_team_walk_in',
        'view_clients',
        'manage_clients',
      ],
      active: true,
      version: 1,
    });

    expect(adminContext).not.toBeNull();
    expect(adminContext?.roleTemplate).toBe('admin');
    expect(adminContext?.capabilities).toContain('manage_services');
    expect(adminContext?.capabilities).toContain('manage_team');
    expect(adminContext?.capabilities).toContain('manage_admins');
    expect(adminContext?.capabilities).toContain('manage_operational_settings');
  });

  test('Manager role template maps team and service management but excludes manage_admins', () => {
    const managerContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Filial',
      organizationId: null,
      organizationName: null,
      membershipId: testId('3'),
      membershipRole: 'professional', // legacy projection
      roleTemplate: 'manager',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'filial',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: [
        'manage_services',
        'manage_team',
        'view_unit_reports',
        'manage_team_blocks',
        'create_team_walk_in',
        'view_clients',
        'manage_clients',
      ],
      allowedActions: [
        'manage_services',
        'manage_team',
        'view_unit_reports',
        'manage_team_blocks',
        'create_team_walk_in',
        'view_clients',
        'manage_clients',
      ],
      active: true,
      version: 1,
    });

    expect(managerContext).not.toBeNull();
    expect(managerContext?.roleTemplate).toBe('manager');
    expect(managerContext?.capabilities).toContain('manage_services');
    expect(managerContext?.capabilities).toContain('manage_team');
    expect(managerContext?.capabilities).not.toContain('manage_admins');
  });

  test('Reception role template maps desk walk-in and client management but excludes services and team management', () => {
    const receptionContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Moema',
      organizationId: null,
      organizationName: null,
      membershipId: testId('4'),
      membershipRole: 'professional',
      roleTemplate: 'reception',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'moema',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: [
        'view_team_agenda',
        'create_team_walk_in',
        'view_clients',
        'manage_clients',
      ],
      allowedActions: [
        'view_team_agenda',
        'create_team_walk_in',
        'view_clients',
        'manage_clients',
      ],
      active: true,
      version: 1,
    });

    expect(receptionContext).not.toBeNull();
    expect(receptionContext?.roleTemplate).toBe('reception');
    expect(receptionContext?.capabilities).toContain('create_team_walk_in');
    expect(receptionContext?.capabilities).toContain('manage_clients');
    expect(receptionContext?.capabilities).not.toContain('manage_services');
    expect(receptionContext?.capabilities).not.toContain('manage_team');
    expect(receptionContext?.capabilities).not.toContain('manage_admins');
    expect(receptionContext?.capabilities).not.toContain('manage_operational_settings');
  });

  test('Finance role template maps analytical and financial reports but excludes operational mutations', () => {
    const financeContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Jardins',
      organizationId: null,
      organizationName: null,
      membershipId: testId('5'),
      membershipRole: 'professional',
      roleTemplate: 'finance',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'jardins',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: [
        'view_financial_reports',
        'view_unit_reports',
        'view_team_commission',
        'view_payments',
      ],
      allowedActions: [
        'view_financial_reports',
        'view_unit_reports',
        'view_team_commission',
        'view_payments',
      ],
      active: true,
      version: 1,
    });

    expect(financeContext).not.toBeNull();
    expect(financeContext?.roleTemplate).toBe('finance');
    expect(financeContext?.capabilities).toContain('view_unit_reports');
    expect(financeContext?.capabilities).toContain('view_financial_reports');
    expect(financeContext?.capabilities).not.toContain('manage_team');
    expect(financeContext?.capabilities).not.toContain('manage_services');
  });

  test('Professional role template maps only own agenda and personal blocks', () => {
    const professionalContext = mapAuthorizedContext({
      appId: 'web',
      contextKind: 'establishment',
      establishmentId: testId('1'),
      establishmentName: 'Unidade Paulista',
      organizationId: null,
      organizationName: null,
      membershipId: testId('6'),
      membershipRole: 'professional',
      roleTemplate: 'professional',
      organizationRole: null,
      membershipStatus: 'active',
      establishmentSlug: 'paulista',
      commissionRate: 0.5,
      establishmentStatus: 'active',
      capabilities: [
        'view_own_agenda',
        'manage_own_blocks',
        'create_self_walk_in',
        'view_services',
        'view_own_commission',
      ],
      allowedActions: [
        'view_own_agenda',
        'manage_own_blocks',
        'create_self_walk_in',
        'view_services',
        'view_own_commission',
      ],
      active: true,
      version: 1,
    });

    expect(professionalContext).not.toBeNull();
    expect(professionalContext?.roleTemplate).toBe('professional');
    expect(professionalContext?.capabilities).toContain('view_own_agenda');
    expect(professionalContext?.capabilities).toContain('manage_own_blocks');
    expect(professionalContext?.capabilities).not.toContain('manage_team_blocks');
    expect(professionalContext?.capabilities).not.toContain('manage_services');
    expect(professionalContext?.capabilities).not.toContain('manage_team');
  });

  test('Mobile operational context mapper accurately maps granular capabilities', () => {
    const mobileContext = mapBusinessOperationalContext({
      membership_id: testId('10'),
      membership_role: 'professional',
      membership_status: 'active',
      establishment_id: testId('1'),
      establishment_name: 'CutSync Matriz',
      establishment_slug: 'matriz',
      timezone: 'America/Sao_Paulo',
      operational_role: 'reception',
      access_mode: 'full',
      capabilities: ['view_team_agenda', 'create_team_walk_in', 'manage_clients'],
      financial_ops_enabled: false,
      billing_owner: false,
      billing_status: 'active',
      trial_ends_at: null,
      grace_ends_at: null,
      current_period_ends_at: '2026-08-31T23:59:59.000Z',
      billing_scope: 'establishment',
      billing_account_id: testId('20'),
      subscription_id: testId('30'),
      organization_id: null,
      covered_establishment_ids: [testId('1')],
      payer_role: null,
      pending_change_at: null,
    });

    expect(mobileContext).not.toBeNull();
    expect(mobileContext?.operationalRole).toBe('reception');
    expect(mobileContext?.capabilities).toContain('create_team_walk_in');
    expect(mobileContext?.capabilities).toContain('manage_clients');
    expect(mobileContext?.capabilities).not.toContain('manage_services');
  });
});
