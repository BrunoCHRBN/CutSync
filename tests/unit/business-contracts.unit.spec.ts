import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  BUSINESS_CAPABILITIES,
  filterBusinessCapabilities,
  mapBusinessAgendaItem,
  mapBusinessInvitationAcceptance,
  mapBusinessInvitationDetails,
  mapBusinessOperationalContext,
} from '../../packages/database/src/business';

const id = (suffix: string) => `00000000-0000-0000-0000-${suffix.padStart(12, '0')}`;

const fullContextRow = {
  membership_id: id('1'),
  membership_role: 'admin',
  membership_status: 'active',
  establishment_id: id('2'),
  establishment_name: 'Unidade Centro',
  establishment_slug: 'unidade-centro',
  timezone: 'America/Sao_Paulo',
  operational_role: 'owner',
  access_mode: 'full',
  capabilities: [...BUSINESS_CAPABILITIES, 'unknown_privilege'],
  billing_owner: true,
  billing_status: 'active',
  trial_ends_at: null,
  grace_ends_at: null,
  current_period_ends_at: '2026-08-31T23:59:59.000Z',
  billing_scope: 'organization',
  billing_account_id: id('3'),
  subscription_id: id('4'),
  organization_id: id('5'),
  covered_establishment_ids: [id('2'), id('6')],
  payer_role: 'owner',
  pending_change_at: null,
};

test('mapeia contexto operacional e descarta capabilities desconhecidas', () => {
  const context = mapBusinessOperationalContext(fullContextRow);

  expect(context).toMatchObject({
    membershipId: id('1'),
    membershipRole: 'admin',
    membershipStatus: 'active',
    establishmentId: id('2'),
    operationalRole: 'owner',
    accessMode: 'full',
    billingScope: 'organization',
    billingAccountId: id('3'),
  });
  expect(context?.capabilities).toEqual(BUSINESS_CAPABILITIES);
  expect(context?.capabilities).not.toContain('unknown_privilege');
});

test('nega contexto com papel, acesso, membership ou identificadores inválidos', () => {
  expect(mapBusinessOperationalContext({
    ...fullContextRow,
    operational_role: 'manager',
  })).toBeNull();
  expect(mapBusinessOperationalContext({
    ...fullContextRow,
    access_mode: 'write',
  })).toBeNull();
  expect(mapBusinessOperationalContext({
    ...fullContextRow,
    membership_status: 'revoked',
  })).toBeNull();
  expect(mapBusinessOperationalContext({
    ...fullContextRow,
    establishment_id: 'not-an-id',
  })).toBeNull();
  expect(mapBusinessOperationalContext({
    ...fullContextRow,
    membership_role: 'professional',
    operational_role: 'owner',
  })).toBeNull();
  expect(mapBusinessOperationalContext({
    ...fullContextRow,
    billing_scope: null,
    billing_account_id: null,
  })).toBeNull();
});

test('aplica limite de papel e remove mutações em read_only ou blocked', () => {
  expect(filterBusinessCapabilities(
    BUSINESS_CAPABILITIES,
    'professional',
    'full',
  )).toEqual([
    'view_own_agenda',
    'view_team_agenda',
    'create_self_walk_in',
    'manage_own_blocks',
    'view_services',
    'view_own_commission',
  ]);

  expect(filterBusinessCapabilities(
    BUSINESS_CAPABILITIES,
    'admin',
    'read_only',
  )).toEqual([
    'view_own_agenda',
    'view_team_agenda',
    'view_services',
    'view_own_commission',
    'view_unit_reports',
  ]);
  expect(filterBusinessCapabilities(BUSINESS_CAPABILITIES, 'owner', 'blocked')).toEqual([]);
});

test('mapeia contexto bloqueado sem conta de cobrança', () => {
  const context = mapBusinessOperationalContext({
    ...fullContextRow,
    access_mode: 'blocked',
    capabilities: BUSINESS_CAPABILITIES,
    billing_owner: false,
    billing_status: 'unconfigured',
    billing_scope: null,
    billing_account_id: null,
    subscription_id: null,
    organization_id: null,
    covered_establishment_ids: [],
    payer_role: null,
    current_period_ends_at: null,
  });

  expect(context).toMatchObject({
    accessMode: 'blocked',
    capabilities: [],
    billingStatus: 'unconfigured',
    billingScope: null,
    billingAccountId: null,
  });
});

test('mapeia agenda mínima e rejeita dados incompletos ou cronologia inválida', () => {
  const row = {
    appointment_id: id('10'),
    establishment_id: id('2'),
    professional_id: id('11'),
    professional_name: 'Ana',
    service_id: id('12'),
    service_name: 'Corte',
    client_display_name: 'Cliente',
    starts_at: '2026-07-26T13:00:00.000Z',
    ends_at: '2026-07-26T13:30:00.000Z',
    appointment_status: 'confirmed',
  };

  expect(mapBusinessAgendaItem(row)).toEqual({
    id: id('10'),
    establishmentId: id('2'),
    professionalId: id('11'),
    professionalName: 'Ana',
    serviceId: id('12'),
    serviceName: 'Corte',
    clientDisplayName: 'Cliente',
    startsAt: '2026-07-26T13:00:00.000Z',
    endsAt: '2026-07-26T13:30:00.000Z',
    status: 'confirmed',
  });
  expect(mapBusinessAgendaItem({ ...row, client_display_name: '' })).toBeNull();
  expect(mapBusinessAgendaItem({
    ...row,
    ends_at: '2026-07-26T12:59:59.000Z',
  })).toBeNull();
  expect(mapBusinessAgendaItem({ ...row, appointment_status: 'unknown' })).toBeNull();
  expect(mapBusinessAgendaItem({
    ...row,
    appointment_id: 'legacy-appointment-id',
    service_id: 'legacy-service-id',
  })).toMatchObject({
    id: 'legacy-appointment-id',
    serviceId: 'legacy-service-id',
  });
});

test('mapeia inspeção e aceite sem carregar o token no resultado', () => {
  const invitation = mapBusinessInvitationDetails({
    establishment_name: 'Unidade Centro',
    invited_email: 'profissional@example.test',
    invited_role: 'professional',
    invitation_status: 'pending',
    expiration: '2026-07-27T12:00:00.000Z',
    invitation_token: 'sensitive-token',
  });
  const acceptance = mapBusinessInvitationAcceptance({
    accepted_establishment_id: id('2'),
    accepted_role: 'professional',
    invitation_token: 'sensitive-token',
  });

  expect(invitation).toEqual({
    establishmentName: 'Unidade Centro',
    invitedEmail: 'profissional@example.test',
    invitedRole: 'professional',
    status: 'pending',
    expiresAt: '2026-07-27T12:00:00.000Z',
  });
  expect(acceptance).toEqual({
    establishmentId: id('2'),
    role: 'professional',
  });
  expect(JSON.stringify({ invitation, acceptance })).not.toContain('sensitive-token');
});

test('camada Business não registra token nem propaga o erro remoto', () => {
  const source = fs.readFileSync(
    path.join(process.cwd(), 'apps/business/src/services/business-api.ts'),
    'utf8',
  );

  expect(source).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
  expect(source).not.toContain('throw new Error(error.message)');
  expect(source).not.toContain('cause: error');
  expect(source).toContain("new BusinessApiError('invitation_expired')");
  expect(source).toContain("new BusinessApiError('network_error')");
  expect(source).toContain('contexts.length !== rows.length');
  expect(source).toContain('agenda.length !== rows.length');
});
