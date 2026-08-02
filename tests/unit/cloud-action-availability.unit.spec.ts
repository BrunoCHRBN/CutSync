import { expect, test } from '@playwright/test';

import { resolveCloudActionAvailability } from '../../apps/control/src/features/cloud/cloud-action-availability';
import type { ControlPermission } from '../../apps/control/src/types/control';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

const flagsOff = {
  cloudEnabled: true,
  centralEnabled: true,
  incidentWriteEnabled: false,
  supportCreateEnabled: false,
  accessWriteEnabled: false,
  financeWriteEnabled: false,
  legacyRedirectsEnabled: true,
};

test('disables unhomologated writes behind feature flags', () => {
  const incident = resolveCloudActionAvailability({
    action: 'open_incident',
    can: canFactory(['control.dashboard.read']),
    flags: flagsOff,
  });
  expect(incident.visible).toBeTruthy();
  expect(incident.enabled).toBeFalsy();

  const support = resolveCloudActionAvailability({
    action: 'create_support_ticket',
    can: canFactory(['control.support.manage']),
    allowNewTickets: false,
    flags: { ...flagsOff, supportCreateEnabled: true },
  });
  expect(support.enabled).toBeFalsy();

  const access = resolveCloudActionAvailability({
    action: 'access_write',
    can: canFactory(['control.access.manage']),
    flags: flagsOff,
  });
  expect(access.enabled).toBeFalsy();
});

test('hides actions without permission instead of only disabling them', () => {
  const support = resolveCloudActionAvailability({
    action: 'create_support_ticket',
    can: canFactory(['control.support.read']),
    allowNewTickets: true,
    flags: { ...flagsOff, supportCreateEnabled: true },
  });
  expect(support.visible).toBeFalsy();
});
