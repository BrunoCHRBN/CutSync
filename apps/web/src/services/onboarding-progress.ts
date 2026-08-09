import {
  mapOnboardingProgress,
  type AuthorizedContextKind,
  type OnboardingIntent,
  type OnboardingProgress,
  type OnboardingStatus,
} from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { supabase } from './supabase';

export const listWebOnboardingProgress = async (
  intent?: OnboardingIntent,
): Promise<OnboardingProgress[]> => {
  const { data, error } = await (supabase.rpc as any)('get_my_onboarding_progress', {
    target_app_id: 'web',
    target_intent: intent ?? null,
  });
  if (error) throw error;
  const rows = Array.isArray(data) ? data : [];
  const progress = rows.map(mapOnboardingProgress);
  if (progress.some((item) => item === null)) {
    throw new Error('invalid_onboarding_progress_response');
  }
  return progress as OnboardingProgress[];
};

export const setWebOnboardingProgress = async (input: {
  intent: OnboardingIntent;
  contextKind: AuthorizedContextKind;
  establishmentId: string | null;
  organizationId: string | null;
  currentStep: string;
  status: OnboardingStatus;
  expectedVersion: number;
  requestId?: string;
}): Promise<OnboardingProgress> => {
  const requestId = input.requestId ?? createMobileRequestId();
  const { data, error } = await (supabase.rpc as any)('set_my_onboarding_progress', {
    target_app_id: 'web',
    target_intent: input.intent,
    target_context_kind: input.contextKind,
    target_establishment_id: input.establishmentId,
    target_organization_id: input.organizationId,
    target_current_step: input.currentStep,
    target_status: input.status,
    target_expected_version: input.expectedVersion,
    target_request_id: requestId,
  });
  if (error) throw error;
  const progress = mapOnboardingProgress(data);
  if (!progress) throw new Error('invalid_onboarding_progress_response');
  return progress;
};
