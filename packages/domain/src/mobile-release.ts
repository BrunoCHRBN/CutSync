export type MobileAppKind = 'client' | 'business';
export type MobilePlatform = 'android' | 'ios';

export interface MobileReleasePolicy {
  appKind: MobileAppKind;
  platform: MobilePlatform;
  minimumSupportedVersion: string;
  latestVersion: string;
  updateRequired: boolean;
  enforcementEnabled: boolean;
  storeUrl: string | null;
  message: string | null;
}

const VERSION_PATTERN = /^(\d+)\.(\d+)\.(\d+)$/;

export const compareMobileVersions = (left: string, right: string) => {
  const leftMatch = VERSION_PATTERN.exec(left);
  const rightMatch = VERSION_PATTERN.exec(right);
  if (!leftMatch || !rightMatch) throw new Error('invalid_mobile_version');

  for (let index = 1; index <= 3; index += 1) {
    const difference = Number(leftMatch[index]) - Number(rightMatch[index]);
    if (difference !== 0) return difference < 0 ? -1 : 1;
  }
  return 0;
};

export const isMobileUpdateRequired = (
  currentVersion: string,
  policy: MobileReleasePolicy,
) => policy.enforcementEnabled
  && policy.updateRequired
  && compareMobileVersions(currentVersion, policy.minimumSupportedVersion) < 0;
