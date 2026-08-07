import { expect, test } from '@playwright/test';

import {
  describeDataState,
  formatAuditChangeSummary,
  inferAuditResult,
  labelForAccessState,
  labelForAuditAction,
  labelForRole,
  labelForSurfaceState,
  maskIp,
  resolveAccessState,
  resolvePersonIdentity,
  toneForDataState,
  toAccessSummary,
} from '../../apps/control/src/modules/gsp/presentation';
import type { ControlAccessUser } from '../../apps/control/src/services/control-access';

test('translates roles and access states for operators', () => {
  expect(labelForRole('SaaS_Owner')).toBe('Proprietário');
  expect(labelForRole('SaaS_Editor')).toBe('Editor');
  expect(labelForRole('SaaS_Viewer')).toBe('Leitor');
  expect(labelForAccessState('active')).toBe('Ativo');
  expect(labelForAccessState('expired')).toBe('Expirado');
  expect(labelForSurfaceState('preparing')).toBe('Em preparação');
});

test('maps audit actions and unknown events without breaking', () => {
  expect(labelForAuditAction('control.access.revoked')).toBe('Acesso revogado');
  expect(labelForAuditAction('control.access.changed')).toBe('Acesso alterado');
  expect(labelForAuditAction('some_unknown_event')).toBe('Evento: some unknown event');
  expect(inferAuditResult('login_failed', null)).toBe('failure');
  expect(formatAuditChangeSummary({ old_role: 'SaaS_Viewer', new_role: 'SaaS_Editor' })).toEqual({
    before: 'SaaS_Viewer',
    after: 'SaaS_Editor',
  });
});

test('resolves identities preferring names over opaque ids', () => {
  const named = resolvePersonIdentity({
    displayName: 'Bruno Silva',
    email: 'bruno@example.com',
    profileId: '0be2ea1a-1111-4111-8111-aaaaaaaaaaaa',
  });
  expect(named.primary).toBe('Bruno Silva');
  expect(named.secondary).toBe('bruno@example.com');

  const fallback = resolvePersonIdentity({
    profileId: '0be2ea1a-1111-4111-8111-aaaaaaaaaaaa',
  });
  expect(fallback.primary).toBe('Usuário interno');
  expect(fallback.secondary).toBe('ID 0be2ea1a');
});

test('masks ips and keeps preparing states non-alarmist', () => {
  expect(maskIp('203.0.113.45')).toBe('203.0.•••.•••');
  expect(toneForDataState('not_calculated')).toBe('neutral');
  expect(toneForDataState('source_missing')).toBe('info');
  expect(describeDataState('not_calculated')).toContain('fontes necessárias');
});

test('builds access summary view models from real user records', () => {
  const user: ControlAccessUser = {
    profileId: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    name: 'Ana Costa',
    email: 'ana@example.com',
    role: 'SaaS_Owner',
    isActive: true,
    expiresAt: null,
    grantedAt: new Date().toISOString(),
    revokedAt: null,
  };
  expect(resolveAccessState(user)).toBe('active');
  const summary = toAccessSummary(user, user.profileId);
  expect(summary.roleLabel).toBe('Proprietário');
  expect(summary.stateLabel).toBe('Ativo');
  expect(summary.isYou).toBeTruthy();
  expect(summary.expiresLabel).toBe('Sem expiração');
});
