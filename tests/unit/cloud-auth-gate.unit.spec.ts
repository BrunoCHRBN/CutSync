import { expect, test } from '@playwright/test';

import {
  resolveCloudRootGate,
  resolveProtectedLayoutDecision,
} from '../../apps/control/src/navigation/cloud-auth-gate';
import { sanitizeReturnTo, resolvePostAuthDestination } from '../../apps/control/src/navigation/safe-return-to';

test('routes Cloud root by auth status', () => {
  expect(resolveCloudRootGate('signed_out')).toEqual({ kind: 'redirect', href: '/login' });
  expect(resolveCloudRootGate('mfa_required')).toEqual({ kind: 'redirect', href: '/mfa' });
  expect(resolveCloudRootGate('unauthorized')).toEqual({ kind: 'redirect', href: '/sem-acesso' });
  expect(resolveCloudRootGate('ready', '', ['control.dashboard.read'])).toEqual({
    kind: 'redirect',
    href: '/central',
  });
  expect(resolveCloudRootGate('ready', '', ['control.access.manage'])).toEqual({
    kind: 'redirect',
    href: '/gsp',
  });
  expect(resolveCloudRootGate('ready', '', ['control.live.read'])).toEqual({
    kind: 'redirect',
    href: '/operacao/tempo-real',
  });
  expect(resolveCloudRootGate('ready')).toEqual({
    kind: 'redirect',
    href: '/sem-acesso',
  });
  expect(resolveCloudRootGate('error', 'falhou').kind).toBe('recoverable');
  expect(resolveCloudRootGate('loading')).toEqual({ kind: 'loading' });
});

test('keeps protected layout aligned with the same machine', () => {
  expect(resolveProtectedLayoutDecision('signed_out')).toEqual({ kind: 'redirect', href: '/login' });
  expect(resolveProtectedLayoutDecision('ready').kind).toBe('ready');
});

test('accepts only safe relative returnTo destinations', () => {
  expect(sanitizeReturnTo('/operacao/tempo-real')).toBe('/operacao/tempo-real');
  expect(sanitizeReturnTo('/login')).toBeNull();
  expect(sanitizeReturnTo('//evil.example')).toBeNull();
  expect(sanitizeReturnTo('https://evil.example')).toBeNull();
  expect(sanitizeReturnTo('/billing')).toBeNull();
  expect(resolvePostAuthDestination('/gsp/acessos', ['control.access.manage']))
    .toBe('/gsp/acessos');
  expect(resolvePostAuthDestination('/gsp/acessos', ['control.governance.read']))
    .toBe('/gsp');
  expect(resolvePostAuthDestination('https://evil.example', ['control.dashboard.read']))
    .toBe('/central');
  expect(resolvePostAuthDestination('/central', ['control.knowledge.read']))
    .toBe('/gsp');
});
