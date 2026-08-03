import {
  compareMobileVersions,
  isMobileUpdateRequired,
  type MobileReleasePolicy,
} from '@cutsync/domain';

import { createBusinessQueryKey } from '@/features/connectivity/business-query';

export const BUSINESS_RELEASE_ANONYMOUS_SCOPE = 'anon';
export const BUSINESS_RELEASE_GLOBAL_SCOPE = 'global';

const SEMANTIC_VERSION_PATTERN = /^\d+\.\d+\.\d+$/;
const BUSINESS_ANDROID_PACKAGE_ID = 'com.cutsync.business';
const BUSINESS_PLAY_STORE_HOST = 'play.google.com';
const BUSINESS_PLAY_STORE_PATH = '/store/apps/details';

const isRecord = (value: unknown): value is Record<string, unknown> => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
);

const isNullableString = (value: unknown): value is string | null => (
  value === null || typeof value === 'string'
);

const isValidBusinessPlayStoreUrl = (value: string) => {
  if (value !== value.trim()) return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === BUSINESS_PLAY_STORE_HOST
      && url.port === ''
      && url.username === ''
      && url.password === ''
      && url.pathname === BUSINESS_PLAY_STORE_PATH
      && url.search === `?id=${BUSINESS_ANDROID_PACKAGE_ID}`
      && url.hash === '';
  } catch {
    return false;
  }
};

/**
 * Keeps the mandatory-update gate fail-closed when the backend contract drifts.
 * In particular, absent or malformed booleans must never be coerced to false.
 */
export const parseBusinessReleasePolicyResponse = (
  value: unknown,
): MobileReleasePolicy | null => {
  if (!Array.isArray(value) || value.length !== 1 || !isRecord(value[0])) return null;
  const row = value[0];
  if (
    row.app_kind !== 'business'
    || row.platform !== 'android'
    || typeof row.minimum_supported_version !== 'string'
    || !SEMANTIC_VERSION_PATTERN.test(row.minimum_supported_version)
    || typeof row.latest_version !== 'string'
    || !SEMANTIC_VERSION_PATTERN.test(row.latest_version)
    || typeof row.update_required !== 'boolean'
    || typeof row.enforcement_enabled !== 'boolean'
    || !isNullableString(row.store_url)
    || !isNullableString(row.message)
  ) {
    return null;
  }

  if (
    (row.store_url !== null && !isValidBusinessPlayStoreUrl(row.store_url))
    || (row.enforcement_enabled && row.update_required && row.store_url === null)
    || compareMobileVersions(row.minimum_supported_version, row.latest_version) > 0
  ) {
    return null;
  }

  return {
    appKind: row.app_kind,
    platform: row.platform,
    minimumSupportedVersion: row.minimum_supported_version,
    latestVersion: row.latest_version,
    updateRequired: row.update_required,
    enforcementEnabled: row.enforcement_enabled,
    storeUrl: row.store_url,
    message: row.message,
  };
};

export const createBusinessReleasePolicyQueryKey = (
  userId: string | null | undefined,
  establishmentId: string | null | undefined,
  appVersion: string,
) => createBusinessQueryKey(
  userId ?? BUSINESS_RELEASE_ANONYMOUS_SCOPE,
  establishmentId ?? BUSINESS_RELEASE_GLOBAL_SCOPE,
  'release-policy',
  appVersion,
  'android',
);

export type BusinessReleaseGateState =
  | 'allow'
  | 'checking'
  | 'blocked'
  | 'validation_error';

interface ResolveBusinessReleaseGateStateInput {
  appVersion: string;
  configured: boolean;
  errorCode?: string | null;
  fetchStatus: 'fetching' | 'paused' | 'idle';
  policy?: MobileReleasePolicy;
  status: 'pending' | 'error' | 'success';
}

export const resolveBusinessReleaseGateState = ({
  appVersion,
  configured,
  errorCode,
  fetchStatus,
  policy,
  status,
}: ResolveBusinessReleaseGateStateInput): BusinessReleaseGateState => {
  if (policy) {
    return isMobileUpdateRequired(appVersion, policy) ? 'blocked' : 'allow';
  }
  if (!configured) return 'allow';
  if (status === 'pending') {
    return fetchStatus === 'fetching' ? 'checking' : 'allow';
  }
  if (status === 'error') {
    return errorCode === 'network_error' || errorCode === 'client_unavailable'
      ? 'allow'
      : 'validation_error';
  }
  return 'validation_error';
};
