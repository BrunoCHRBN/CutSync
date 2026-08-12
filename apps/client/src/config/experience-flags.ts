import { parsePublicExperienceFlag, resolveExperienceFlags } from '@cutsync/domain';

export const clientExperienceFlags = resolveExperienceFlags({
  client_availability_recovery_v2: parsePublicExperienceFlag(
    process.env.EXPO_PUBLIC_UI_CLIENT_AVAILABILITY_RECOVERY_V2,
  ),
});
