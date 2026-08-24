import { expect, test } from '@playwright/test';

import {
  navItemsForModule,
  resolveActiveNavModule,
} from '../../apps/control/src/navigation/module-nav';
import {
  searchCloudActions,
} from '../../apps/control/src/navigation/module-registry';
import {
  formatCorporateCaseDeadline,
  isCorporateCaseUuid,
} from '../../apps/control/src/modules/cases/corporate-cases-presentation';
import type { ControlPermission } from '../../apps/control/src/types/control';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

test('resolves Chamados as a first-level Cloud module', () => {
  expect(resolveActiveNavModule('/chamados/meus').id).toBe('cases');
  expect(resolveActiveNavModule('/chamados/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee').id).toBe('cases');
});

test('shows only the case navigation packages authorized to the profile', () => {
  const requester = navItemsForModule('cases', canFactory(['control.cases.request']));
  expect(requester.map((item) => item.id)).toEqual([
    'cases-create',
    'cases-mine',
    'cases-notifications',
  ]);

  const reader = navItemsForModule('cases', canFactory(['control.cases.read']));
  expect(reader.map((item) => item.id)).toEqual([
    'cases-mine',
    'cases-observing',
    'cases-pending',
    'cases-notifications',
  ]);

  const triager = navItemsForModule('cases', canFactory(['control.cases.triage']));
  expect(triager.map((item) => item.id)).toContain('cases-queue');
  expect(triager.map((item) => item.id)).not.toContain('cases-all');

  const manager = navItemsForModule('cases', canFactory(['control.cases.manage']));
  expect(manager.map((item) => item.id)).toContain('cases-all');
  expect(manager.map((item) => item.id)).not.toContain('cases-settings');

  const runtimeOwner = navItemsForModule('cases', canFactory(['control.cases.configure']));
  expect(runtimeOwner.map((item) => item.id)).toEqual(['cases-settings']);

  const approver = navItemsForModule('cases', canFactory(['control.cases.approve']));
  expect(approver.map((item) => item.id)).toEqual([
    'cases-mine',
    'cases-pending',
    'cases-notifications',
  ]);

  const executor = navItemsForModule('cases', canFactory(['control.cases.fulfill']));
  expect(executor.map((item) => item.id)).toEqual([
    'cases-fulfillment',
    'cases-notifications',
  ]);
});

test('makes Chamados discoverable to every valid case access package', () => {
  for (const permission of [
    'control.cases.request',
    'control.cases.read',
    'control.cases.triage',
    'control.cases.route',
    'control.cases.approve',
    'control.cases.manage',
    'control.cases.audit',
    'control.cases.fulfill',
  ] as const) {
    const actions = searchCloudActions('chamados', canFactory([permission]));
    expect(actions.map((action) => action.id)).toContain('go-chamados');
  }
});

test('discovers the critical configuration action only with its dedicated capability', () => {
  expect(
    searchCloudActions('configurar chamados', canFactory(['control.cases.configure']))
      .map((action) => action.id),
  ).toContain('go-configurar-chamados');
  expect(
    searchCloudActions('configurar chamados', canFactory(['control.cases.manage']))
      .map((action) => action.id),
  ).not.toContain('go-configurar-chamados');
});

test('validates opaque UUIDs and classifies deadlines without using user data', () => {
  expect(isCorporateCaseUuid('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee')).toBeTruthy();
  expect(isCorporateCaseUuid('email@example.com')).toBeFalsy();
  expect(formatCorporateCaseDeadline('2026-08-22T12:00:00.000Z', Date.parse('2026-08-22T10:00:00.000Z'))).toEqual({
    label: 'Vence em 2h',
    tone: 'warning',
  });
});
