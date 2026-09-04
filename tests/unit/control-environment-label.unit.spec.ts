import { expect, test } from '@playwright/test';

import { resolveCloudEnvironmentLabel } from '../../apps/control/src/navigation/environment-label';

test('uses the explicitly configured Control environment', () => {
  expect(resolveCloudEnvironmentLabel({
    EXPO_PUBLIC_CONTROL_ENVIRONMENT: 'homolog',
    NODE_ENV: 'production',
  })).toBe('HOMOLOGAÇÃO');

  expect(resolveCloudEnvironmentLabel({
    EXPO_PUBLIC_APP_ENV: 'production',
    NODE_ENV: 'development',
  })).toBe('PRODUÇÃO');

  expect(resolveCloudEnvironmentLabel({
    EXPO_PUBLIC_APP_ENV: 'preview',
    NODE_ENV: 'production',
  })).toBe('HOMOLOGAÇÃO');
});

test('does not infer production from an optimized bundle', () => {
  expect(resolveCloudEnvironmentLabel({ NODE_ENV: 'production' }))
    .toBe('NÃO CONFIGURADO');
});

test('keeps the development fallback for a local development bundle', () => {
  expect(resolveCloudEnvironmentLabel({ NODE_ENV: 'development' }))
    .toBe('DESENVOLVIMENTO');
});
