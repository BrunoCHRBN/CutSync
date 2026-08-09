import { expect, test } from '@playwright/test';

import { resolveWebOperationalSurface } from '../../apps/web/src/features/access/web-operational-surface';

test('Web routing presentation follows backend capabilities instead of profile roles', () => {
  expect(resolveWebOperationalSurface({ capabilities: ['manage_services'] })).toBe('admin');
  expect(resolveWebOperationalSurface({ capabilities: ['view_own_agenda'] })).toBe('professional');
  expect(resolveWebOperationalSurface({ capabilities: [] })).toBe('client');
  expect(resolveWebOperationalSurface(null)).toBe('client');
});

test('financial and reception capabilities open the operational surface', () => {
  expect(resolveWebOperationalSurface({ capabilities: ['view_unit_reports'] })).toBe('admin');
  expect(resolveWebOperationalSurface({ capabilities: ['create_team_walk_in'] })).toBe('admin');
});
