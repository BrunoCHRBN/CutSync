import { expect, test } from '@playwright/test';

import type { ControlPermission } from '../../apps/control/src/types/control';
import { searchCloudActions } from '../../apps/control/src/navigation/module-registry';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

test('filters global search by permission and query', () => {
  const viewer = searchCloudActions('tempo', canFactory([
    'control.dashboard.read',
    'control.live.read',
  ]));
  expect(viewer.map((action) => action.id)).toContain('go-tempo-real');
  expect(viewer.map((action) => action.id)).not.toContain('go-acessos');

  const ownerAccess = searchCloudActions('acesso', canFactory([
    'control.access.manage',
  ]));
  expect(ownerAccess.map((action) => action.id)).toEqual(['go-acessos']);
});
