import { expect, test } from '@playwright/test';

import {
  CLOUD_ROUTES,
  isCloudRoutePath,
  listCloudRoutePaths,
} from '../../apps/control/src/navigation/cloud-routes';

test('registers canonical Cloud router paths without duplicating /cloud', () => {
  expect(CLOUD_ROUTES.central).toBe('/central');
  expect(CLOUD_ROUTES.login).toBe('/login');
  expect(CLOUD_ROUTES.operacao.tempoReal).toBe('/operacao/tempo-real');
  expect(CLOUD_ROUTES.financeiro.cobrancas).toBe('/financeiro/cobrancas');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos');
  expect(listCloudRoutePaths().every((path) => !path.startsWith('/cloud/'))).toBeTruthy();
});

test('validates known Cloud paths', () => {
  expect(isCloudRoutePath('/suporte')).toBeTruthy();
  expect(isCloudRoutePath('/billing')).toBeFalsy();
  expect(isCloudRoutePath('https://evil.example')).toBeFalsy();
});
