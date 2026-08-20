export const EXPERIENCE_FLAG_NAMES = [
  'ui_foundation_v2',
  'client_availability_recovery_v2',
  'business_command_center_v2',
  'professional_daily_focus_v2',
  'brand_studio_v2',
] as const;

export type ExperienceFlagName = typeof EXPERIENCE_FLAG_NAMES[number];
export type ExperienceFlags = Readonly<Record<ExperienceFlagName, boolean>>;

export const DEFAULT_EXPERIENCE_FLAGS: ExperienceFlags = {
  ui_foundation_v2: true,
  client_availability_recovery_v2: false,
  business_command_center_v2: false,
  professional_daily_focus_v2: false,
  brand_studio_v2: false,
};

export function resolveExperienceFlags(
  overrides?: Partial<Record<ExperienceFlagName, boolean>> | null,
): ExperienceFlags {
  return { ...DEFAULT_EXPERIENCE_FLAGS, ...(overrides ?? {}) };
}

export function parsePublicExperienceFlag(value: string | undefined): boolean | undefined {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'true' || normalized === '1') return true;
  if (normalized === 'false' || normalized === '0') return false;
  return undefined;
}
