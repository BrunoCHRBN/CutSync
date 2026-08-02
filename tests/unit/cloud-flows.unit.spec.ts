import { expect, test } from '@playwright/test';

import {
  advanceCloudFlow,
  createCloudFlowState,
  listCriticalCloudFlows,
} from '../../apps/control/src/features/cloud/cloud-flows';

test('covers the critical Cloud flows and advances confirmation states', () => {
  expect(listCriticalCloudFlows()).toContain('open_incident');
  expect(listCriticalCloudFlows()).toContain('sign_out');

  const revoke = createCloudFlowState('revoke_access');
  expect(revoke.step).toBe('confirm');
  expect(revoke.auditEvent).toBe('cloud.access.revoked');

  const loading = advanceCloudFlow(revoke, 'confirm');
  expect(loading.step).toBe('loading');
  expect(advanceCloudFlow(loading, 'success').step).toBe('success');
  expect(advanceCloudFlow(loading, 'error').step).toBe('error');
});
