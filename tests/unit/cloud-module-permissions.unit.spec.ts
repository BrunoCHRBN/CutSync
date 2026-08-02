import { expect, test } from '@playwright/test';

import type { ControlPermission } from '../../apps/control/src/types/control';
import { modulesVisibleTo } from '../../apps/control/src/navigation/module-registry';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

test('Viewer sees only permitted modules', () => {
  const modules = modulesVisibleTo(canFactory([
    'control.dashboard.read',
    'control.live.read',
    'control.support.read',
  ]));
  expect(modules.map((module) => module.id)).toEqual(['operation', 'support']);
});

test('Editor does not see access administration via GSP manage-only surfaces', () => {
  const modules = modulesVisibleTo(canFactory([
    'control.dashboard.read',
    'control.support.read',
    'control.support.manage',
    'control.governance.read',
    'control.billing.read',
  ]));
  expect(modules.map((module) => module.id)).toEqual([
    'operation',
    'support',
    'gsp',
    'finance',
  ]);
  expect(
    modules.find((module) => module.id === 'gsp')?.managePermission,
  ).toBe('control.access.manage');
});

test('Owner sees GSP when access manage is granted', () => {
  const modules = modulesVisibleTo(canFactory([
    'control.access.manage',
  ]));
  expect(modules.map((module) => module.id)).toEqual(['gsp']);
});
