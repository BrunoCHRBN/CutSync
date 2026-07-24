import * as SecureStore from 'expo-secure-store';

import {
  CLIENT_ONBOARDING_VERSION,
  CLIENT_ONBOARDING_STORAGE_KEY,
  type ClientOnboardingState,
  resolveClientOnboardingState,
} from '@/features/onboarding/client-onboarding-state';

const isWeb = process.env.EXPO_OS === 'web';

export async function readClientOnboardingState(): Promise<ClientOnboardingState> {
  const storedVersion = isWeb
    ? globalThis.localStorage?.getItem(CLIENT_ONBOARDING_STORAGE_KEY) ?? null
    : await SecureStore.getItemAsync(CLIENT_ONBOARDING_STORAGE_KEY);
  return resolveClientOnboardingState(storedVersion);
}

export async function persistClientOnboardingCompletion(): Promise<void> {
  const value = String(CLIENT_ONBOARDING_VERSION);

  if (isWeb) {
    globalThis.localStorage?.setItem(CLIENT_ONBOARDING_STORAGE_KEY, value);
    return;
  }

  await SecureStore.setItemAsync(CLIENT_ONBOARDING_STORAGE_KEY, value);
}
