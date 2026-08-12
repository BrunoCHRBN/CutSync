import { expect, test } from '@playwright/test';

import {
  DEFAULT_EXPERIENCE_FLAGS,
  parsePublicExperienceFlag,
  resolveExperienceFlags,
} from '../../packages/domain/src/experience-flags';

test.describe('UI/UX experience flags', () => {
  test('keeps vertical slices disabled until rollout is explicit', () => {
    expect(DEFAULT_EXPERIENCE_FLAGS.ui_foundation_v2).toBe(true);
    expect(DEFAULT_EXPERIENCE_FLAGS.client_availability_recovery_v2).toBe(false);
    expect(DEFAULT_EXPERIENCE_FLAGS.business_command_center_v2).toBe(false);
    expect(DEFAULT_EXPERIENCE_FLAGS.professional_daily_focus_v2).toBe(false);
    expect(DEFAULT_EXPERIENCE_FLAGS.brand_studio_v2).toBe(false);
  });

  test('accepts only explicit public boolean values and preserves defaults', () => {
    expect(parsePublicExperienceFlag(' TRUE ')).toBe(true);
    expect(parsePublicExperienceFlag('0')).toBe(false);
    expect(parsePublicExperienceFlag('enabled')).toBeUndefined();
    expect(resolveExperienceFlags({ brand_studio_v2: true })).toEqual({
      ...DEFAULT_EXPERIENCE_FLAGS,
      brand_studio_v2: true,
    });
  });
});
