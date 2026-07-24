export const CLIENT_ONBOARDING_VERSION = 1 as const;
export const CLIENT_ONBOARDING_STORAGE_KEY = 'cutsync.client.onboarding.version';

export interface ClientOnboardingState {
  version: number | null;
  isComplete: boolean;
}

export type ClientEntryState = 'loading' | 'onboarding' | 'auth' | 'app';

export function resolveClientOnboardingState(storedVersion: string | null): ClientOnboardingState {
  const parsedVersion = storedVersion ? Number.parseInt(storedVersion, 10) : null;
  const version = Number.isFinite(parsedVersion) ? parsedVersion : null;

  return {
    version,
    isComplete: version === CLIENT_ONBOARDING_VERSION,
  };
}

export function resolveClientEntryState({
  isSessionLoading,
  isOnboardingLoading,
  isOnboardingComplete,
  hasSession,
}: {
  isSessionLoading: boolean;
  isOnboardingLoading: boolean;
  isOnboardingComplete: boolean;
  hasSession: boolean;
}): ClientEntryState {
  if (isSessionLoading || isOnboardingLoading) return 'loading';
  if (!isOnboardingComplete) return 'onboarding';
  return hasSession ? 'app' : 'auth';
}
