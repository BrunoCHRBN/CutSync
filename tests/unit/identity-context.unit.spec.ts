import { expect, test } from '@playwright/test';

import {
  mapActiveContextReceipt,
  mapAuthorizedContext,
  mapEstablishmentReadiness,
  mapOnboardingProgress,
} from '../../packages/database/src/identity-context';

const id = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

test('maps an authorized establishment context and preserves the role template', () => {
  expect(mapAuthorizedContext({
    appId: 'business',
    contextKind: 'establishment',
    establishmentId: id('1'),
    establishmentName: 'Centro',
    organizationId: null,
    organizationName: null,
    membershipId: id('2'),
    membershipRole: 'professional',
    roleTemplate: 'manager',
    organizationRole: null,
    membershipStatus: 'active',
    establishmentSlug: 'centro',
    commissionRate: 0.5,
    establishmentStatus: 'active',
    capabilities: ['view_own_agenda', 'manage_services'],
    allowedActions: ['view_own_agenda', 'manage_services'],
    active: true,
    version: 3,
  })).toMatchObject({
    contextKind: 'establishment',
    roleTemplate: 'manager',
    capabilities: ['view_own_agenda', 'manage_services'],
    active: true,
    version: 3,
  });
});

test('maps resumable onboarding metadata and rejects malformed authority targets', () => {
  const progress = mapOnboardingProgress({
    progressId: id('10'),
    appId: 'web',
    intent: 'professional_profile',
    contextKind: 'establishment',
    establishmentId: id('1'),
    organizationId: null,
    currentStep: 'work_schedule',
    status: 'in_progress',
    allowedActions: ['advance', 'pause', 'block', 'complete', 'abandon'],
    version: 2,
    dataCutoffAt: '2026-08-08T12:00:00.000Z',
    correlationId: id('11'),
    updatedAt: '2026-08-08T12:00:00.000Z',
  });
  expect(progress).toMatchObject({
    currentStep: 'work_schedule',
    status: 'in_progress',
    version: 2,
  });
  expect(mapOnboardingProgress({
    ...progress,
    establishmentId: null,
  })).toBeNull();
  expect(mapOnboardingProgress({
    ...progress,
    allowedActions: ['force_complete'],
  })).toBeNull();
});

test('authorized context mapper fails closed on malformed targets and roles', () => {
  const base = {
    appId: 'business',
    contextKind: 'establishment',
    establishmentId: id('1'),
    establishmentName: 'Centro',
    organizationId: null,
    organizationName: null,
    membershipId: id('2'),
    membershipRole: 'professional',
    roleTemplate: 'professional',
    organizationRole: null,
    active: false,
    version: 0,
  };

  expect(mapAuthorizedContext({ ...base, establishmentId: null })).toBeNull();
  expect(mapAuthorizedContext({ ...base, roleTemplate: 'owner' })).toBeNull();
  expect(mapAuthorizedContext({ ...base, active: 'true' })).toBeNull();
});

test('maps idempotent active-context receipts', () => {
  const receipt = mapActiveContextReceipt({
    appId: 'business',
    contextKind: 'establishment',
    establishmentId: id('1'),
    organizationId: null,
    version: 1,
    requestId: id('3'),
    replayed: false,
  });
  expect(receipt).toMatchObject({ version: 1, replayed: false });
  expect(mapActiveContextReceipt({
    ...receipt,
    organizationId: id('4'),
  })).toBeNull();
});

test('maps calculated establishment readiness without treating SaaS fiscal as operational', () => {
  const readiness = mapEstablishmentReadiness({
    establishmentId: id('1'),
    lifecycleStatus: 'ready',
    accountStatus: 'active',
    operationalReady: true,
    paymentsReady: false,
    fiscalReady: false,
    checks: {
      openingHoursConfigured: true,
      activeServiceConfigured: true,
      managementMembershipConfigured: true,
      governanceAllowsOperation: true,
      lifecycleAllowsOperation: true,
      financialOpsEnabled: false,
      manualPaymentMethodConfigured: false,
      serviceFiscalProfileConfigured: false,
    },
    blockers: {
      operational: [],
      payments: ['financial_ops_disabled', 'payment_methods_not_configured'],
      fiscal: ['service_fiscal_profile_not_configured'],
    },
    version: 2,
    dataCutoffAt: '2026-08-08T12:00:00.000Z',
  });

  expect(readiness).toMatchObject({
    operationalReady: true,
    paymentsReady: false,
    fiscalReady: false,
  });
});

test('readiness mapper fails closed on editable-looking or malformed results', () => {
  expect(mapEstablishmentReadiness({
    establishmentId: id('1'),
    lifecycleStatus: 'enabled',
  })).toBeNull();
  expect(mapEstablishmentReadiness({
    establishmentId: id('1'),
    lifecycleStatus: 'ready',
    accountStatus: 'active',
    operationalReady: 'true',
    paymentsReady: false,
    fiscalReady: false,
    checks: {},
    blockers: {},
    version: 1,
    dataCutoffAt: 'not-a-date',
  })).toBeNull();
});
