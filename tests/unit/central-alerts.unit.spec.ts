import { expect, test } from '@playwright/test';

import { formatAlertAreaBreakdown } from '../../apps/control/src/modules/central/central-alerts';

test('formats area breakdown only for positive counts', () => {
  expect(formatAlertAreaBreakdown({
    support: 2,
    gsp: 0,
    finance: 1,
  })).toBe('2 em Suporte · 1 em Financeiro');
});

test('returns empty string when there are no alerts', () => {
  expect(formatAlertAreaBreakdown({})).toBe('');
});
