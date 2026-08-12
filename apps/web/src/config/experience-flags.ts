import { parsePublicExperienceFlag, resolveExperienceFlags } from '@cutsync/domain';

export const webExperienceFlags = resolveExperienceFlags({
  client_availability_recovery_v2: parsePublicExperienceFlag(
    process.env.EXPO_PUBLIC_UI_CLIENT_AVAILABILITY_RECOVERY_V2,
  ),
  business_command_center_v2: parsePublicExperienceFlag(
    process.env.EXPO_PUBLIC_UI_BUSINESS_COMMAND_CENTER_V2,
  ),
  professional_daily_focus_v2: parsePublicExperienceFlag(
    process.env.EXPO_PUBLIC_UI_PROFESSIONAL_DAILY_FOCUS_V2,
  ),
  brand_studio_v2: parsePublicExperienceFlag(process.env.EXPO_PUBLIC_UI_BRAND_STUDIO_V2),
});
