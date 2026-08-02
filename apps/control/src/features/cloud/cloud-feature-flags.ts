type EnvMap = Record<string, string | undefined>;

function readFlag(env: EnvMap, name: string, defaultValue: boolean): boolean {
  const raw = env[name];
  if (raw == null || raw.trim() === '') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1' || normalized === 'yes') return true;
  if (normalized === 'false' || normalized === '0' || normalized === 'no') return false;
  return defaultValue;
}

export interface CloudFeatureFlags {
  cloudEnabled: boolean;
  centralEnabled: boolean;
  incidentWriteEnabled: boolean;
  supportCreateEnabled: boolean;
  accessWriteEnabled: boolean;
  financeWriteEnabled: boolean;
  legacyRedirectsEnabled: boolean;
}

export function getCloudFeatureFlags(
  env: EnvMap = process.env as EnvMap,
): CloudFeatureFlags {
  return {
    cloudEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_ENABLED', true),
    centralEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_CENTRAL_ENABLED', true),
    incidentWriteEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_INCIDENT_WRITE_ENABLED', false),
    supportCreateEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_SUPPORT_CREATE_ENABLED', false),
    accessWriteEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_ACCESS_WRITE_ENABLED', false),
    financeWriteEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_FINANCE_WRITE_ENABLED', true),
    legacyRedirectsEnabled: readFlag(env, 'EXPO_PUBLIC_CLOUD_LEGACY_REDIRECTS_ENABLED', true),
  };
}

export const cloudFeatureFlags = getCloudFeatureFlags();

export function isCloudFlagEnabled(
  flag: keyof CloudFeatureFlags,
  env?: EnvMap,
): boolean {
  return getCloudFeatureFlags(env ?? (process.env as EnvMap))[flag];
}
