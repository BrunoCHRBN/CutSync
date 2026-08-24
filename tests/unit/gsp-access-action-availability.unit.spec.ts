import { expect, test } from '@playwright/test';

import { resolveCloudActionAvailability } from '../../apps/control/src/features/cloud/cloud-action-availability';
import type { CloudFeatureFlags } from '../../apps/control/src/features/cloud/cloud-feature-flags';
import type { ControlPermission } from '../../apps/control/src/types/control';

function canFactory(allowed: ControlPermission[]) {
  return (permission: ControlPermission) => allowed.includes(permission);
}

const flagsOff: CloudFeatureFlags = {
  cloudEnabled: true,
  centralEnabled: true,
  incidentWriteEnabled: false,
  supportCreateEnabled: false,
  accessWriteEnabled: false,
  financeWriteEnabled: false,
  legacyRedirectsEnabled: true,
};

const flagsOn: CloudFeatureFlags = {
  ...flagsOff,
  accessWriteEnabled: true,
};

test('access write stays disabled when flag is off even for owners', () => {
  const availability = resolveCloudActionAvailability({
    action: 'access_write',
    can: canFactory(['control.access.manage']),
    flags: flagsOff,
  });
  expect(availability.visible).toBeTruthy();
  expect(availability.enabled).toBeFalsy();
  expect(availability.reason).toBeTruthy();
});

test('access write enables for owners when flag is on', () => {
  const availability = resolveCloudActionAvailability({
    action: 'access_write',
    can: canFactory(['control.access.manage']),
    flags: flagsOn,
  });
  expect(availability.enabled).toBeTruthy();
  expect(availability.reason).toBeNull();
});

test('access write is hidden without manage permission', () => {
  const availability = resolveCloudActionAvailability({
    action: 'access_write',
    can: canFactory(['control.governance.read']),
    flags: flagsOn,
  });
  expect(availability.visible).toBeFalsy();
  expect(availability.enabled).toBeFalsy();
});
