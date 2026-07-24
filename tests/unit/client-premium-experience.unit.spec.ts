/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CLIENT_ONBOARDING_VERSION,
  resolveClientEntryState,
  resolveClientOnboardingState,
} from '../../apps/client/src/features/onboarding/client-onboarding-state';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('resolve a versão persistida do onboarding', () => {
  expect(resolveClientOnboardingState(null)).toEqual({ version: null, isComplete: false });
  expect(resolveClientOnboardingState('invalid')).toEqual({ version: null, isComplete: false });
  expect(resolveClientOnboardingState(String(CLIENT_ONBOARDING_VERSION))).toEqual({
    version: CLIENT_ONBOARDING_VERSION,
    isComplete: true,
  });
  expect(resolveClientOnboardingState('0')).toEqual({ version: 0, isComplete: false });
});

test('prioriza carregamento, onboarding, autenticação e sessão', () => {
  expect(resolveClientEntryState({
    isSessionLoading: true,
    isOnboardingLoading: false,
    isOnboardingComplete: false,
    hasSession: false,
  })).toBe('loading');
  expect(resolveClientEntryState({
    isSessionLoading: false,
    isOnboardingLoading: false,
    isOnboardingComplete: false,
    hasSession: true,
  })).toBe('onboarding');
  expect(resolveClientEntryState({
    isSessionLoading: false,
    isOnboardingLoading: false,
    isOnboardingComplete: true,
    hasSession: false,
  })).toBe('auth');
  expect(resolveClientEntryState({
    isSessionLoading: false,
    isOnboardingLoading: false,
    isOnboardingComplete: true,
    hasSession: true,
  })).toBe('app');
});

test('mantém callback fora das guardas e não pede notificações no onboarding', () => {
  const rootLayout = readSource('apps/client/src/app/_layout.tsx');
  const onboarding = readSource('apps/client/src/screens/client-onboarding.tsx');

  expect(rootLayout).toContain('<Stack.Screen name="(callback)" />');
  expect(onboarding).not.toContain('requestPermissionsAsync');
  expect(onboarding).not.toContain('expo-notifications');
});
