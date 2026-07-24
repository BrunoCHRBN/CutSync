import type { ClientMotionPreference } from '@/theme/client-theme';
import { clientTheme } from '@/theme/client-theme';

export type ClientMotionSpeed = keyof typeof clientTheme.motion;

export function resolveClientMotionDuration(
  preference: ClientMotionPreference,
  speed: Exclude<ClientMotionSpeed, 'stagger'>,
): number {
  if (preference === 'reduced') return 0;
  return clientTheme.motion[speed];
}

export function resolveClientMotionDelay(
  preference: ClientMotionPreference,
  index: number,
): number {
  if (preference === 'reduced') return 0;
  return Math.max(0, index) * clientTheme.motion.stagger;
}
