import { expect, test } from '@playwright/test';

import type { ControlPermission } from '../../apps/control/src/types/control';
import {
  getLastModuleId,
  isNavItemSelected,
  modulesForSwitcher,
  navItemsForModule,
  rememberLastModule,
  resolveActiveNavModule,
} from '../../apps/control/src/navigation/module-nav';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

test('sidebar items are contextual to the active module', () => {
  const can = canFactory([
    'control.dashboard.read',
    'control.live.read',
    'control.support.read',
    'control.billing.read',
  ]);

  const operationItems = navItemsForModule('operation', can).map((item) => item.label);
  expect(operationItems).toContain('Visão geral');
  expect(operationItems).toContain('Tempo real');
  expect(operationItems).not.toContain('Atendimentos');
  expect(operationItems).not.toContain('Cobranças');

  const supportItems = navItemsForModule('support', can).map((item) => item.label);
  expect(supportItems).toContain('Atendimentos');
  expect(supportItems).not.toContain('Saúde dos dados');
});

test('module switcher hides modules without visible nav items', () => {
  const viewer = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.support.read',
  ]));
  expect(viewer.map((module) => module.id)).toEqual(['central', 'operation', 'support']);

  const ownerAccessOnly = modulesForSwitcher(canFactory(['control.access.manage']));
  expect(ownerAccessOnly.map((module) => module.id)).toEqual(['central', 'gsp']);
});

test('resolveActiveNavModule maps nested routes to their module', () => {
  expect(resolveActiveNavModule('/operacao/saude-dos-dados').id).toBe('operation');
  expect(resolveActiveNavModule('/gsp/acessos').id).toBe('gsp');
  expect(resolveActiveNavModule('/financeiro/cobrancas').id).toBe('finance');
  expect(resolveActiveNavModule('/central').id).toBe('central');
});

test('exact nav selection does not mark sibling overview routes', () => {
  const overview = navItemsForModule(
    'operation',
    canFactory(['control.dashboard.read', 'control.live.read']),
  ).find((item) => item.label === 'Visão geral');
  expect(overview).toBeTruthy();
  expect(isNavItemSelected('/operacao', overview!)).toBe(true);
  expect(isNavItemSelected('/operacao/tempo-real', overview!)).toBe(false);
});

test('last module memory ignores Central and remains in-memory only', () => {
  rememberLastModule('support');
  expect(getLastModuleId()).toBe('support');
  rememberLastModule('central');
  expect(getLastModuleId()).toBe('support');
});

test('Editor sees finance and support; Viewer without billing does not', () => {
  const editor = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.support.read',
    'control.support.manage',
    'control.billing.read',
    'control.governance.read',
  ]));
  expect(editor.map((module) => module.id)).toEqual([
    'central',
    'operation',
    'support',
    'gsp',
    'finance',
  ]);

  const viewer = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.live.read',
  ]));
  expect(viewer.map((module) => module.id)).toEqual(['central', 'operation']);
});
