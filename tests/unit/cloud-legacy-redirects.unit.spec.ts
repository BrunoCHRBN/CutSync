import { expect, test } from '@playwright/test';

import {
  APEX_HOST_REDIRECTS,
  resolveLegacyRedirect,
} from '../../apps/control/src/navigation/legacy-redirects';

test('maps legacy Control routes to Cloud destinations', () => {
  expect(resolveLegacyRedirect('/live')).toBe('/operacao/tempo-real');
  expect(resolveLegacyRedirect('/data-quality')).toBe('/operacao/saude-dos-dados');
  expect(resolveLegacyRedirect('/support')).toBe('/suporte');
  expect(resolveLegacyRedirect('/billing/accounts')).toBe('/financeiro/cobrancas');
  expect(resolveLegacyRedirect('/unknown')).toBeNull();
});

test('defines apex host redirects under /cloud for the dedicated Vercel project', () => {
  expect(APEX_HOST_REDIRECTS).toContainEqual({
    source: '/login',
    destination: '/cloud/login',
    permanent: false,
  });
  expect(APEX_HOST_REDIRECTS).toContainEqual({
    source: '/live',
    destination: '/cloud/operacao/tempo-real',
    permanent: false,
  });
});
