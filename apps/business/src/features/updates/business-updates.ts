import type { MobileReleasePolicy } from '@cutsync/domain';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';

import { BusinessFeatureError, callBusinessRpc } from '@/features/connectivity/business-rpc';
import { businessObservability } from '@/features/observability/business-observability';

import { parseBusinessReleasePolicyResponse } from './business-release-policy';

export type BusinessUpdateCheckResult =
  | { status: 'disabled' }
  | { status: 'current' }
  | { status: 'downloaded'; rollbackToEmbedded: boolean }
  | { status: 'error' };

export const getBusinessUpdateContext = () => ({
  enabled: Updates.isEnabled,
  channel: Updates.channel,
  runtimeVersion: Updates.runtimeVersion,
  updateId: Updates.updateId,
  embedded: Updates.isEmbeddedLaunch,
});

export const getBusinessNativeVersion = () => Constants.expoConfig?.version ?? '0.0.0';

export const getBusinessReleasePolicy = async (): Promise<MobileReleasePolicy> => {
  const data = await callBusinessRpc('get_mobile_release_policy', {
    target_app_kind: 'business',
    target_platform: 'android',
    target_app_version: getBusinessNativeVersion(),
  });
  const policy = parseBusinessReleasePolicyResponse(data);
  if (!policy) throw new BusinessFeatureError('invalid_response');
  return policy;
};

export const downloadAvailableBusinessUpdate = async (): Promise<BusinessUpdateCheckResult> => {
  if (!Updates.isEnabled) return { status: 'disabled' };

  try {
    const check = await Updates.checkForUpdateAsync();
    if (!check.isAvailable && !check.isRollBackToEmbedded) return { status: 'current' };

    const fetched = await Updates.fetchUpdateAsync();
    if (!fetched.isNew && !fetched.isRollBackToEmbedded) return { status: 'current' };
    return {
      status: 'downloaded',
      rollbackToEmbedded: fetched.isRollBackToEmbedded,
    };
  } catch (error) {
    businessObservability.captureError(error, 'business_update_download_failed', {
      operation: 'updates.check_and_download',
    });
    return { status: 'error' };
  }
};

export const reloadDownloadedBusinessUpdate = async () => {
  if (!Updates.isEnabled) return false;
  try {
    await Updates.reloadAsync();
    return true;
  } catch (error) {
    businessObservability.captureError(error, 'business_update_reload_failed', {
      operation: 'updates.reload',
    });
    return false;
  }
};
