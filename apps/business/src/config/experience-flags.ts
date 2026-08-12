import { parsePublicExperienceFlag, resolveExperienceFlags } from '@cutsync/domain';

export const businessExperienceFlags = resolveExperienceFlags({
  business_command_center_v2: parsePublicExperienceFlag(
    process.env.EXPO_PUBLIC_UI_BUSINESS_COMMAND_CENTER_V2,
  ),
  brand_studio_v2: parsePublicExperienceFlag(process.env.EXPO_PUBLIC_UI_BRAND_STUDIO_V2),
});
