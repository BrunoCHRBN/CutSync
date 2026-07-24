import * as Haptics from 'expo-haptics';

import {
  type ClientHapticEvent,
  type ClientHapticPlatform,
  resolveClientHapticPattern,
} from '@/features/experience/client-haptic-state';

const platform: ClientHapticPlatform = process.env.EXPO_OS === 'android'
  ? 'android'
  : process.env.EXPO_OS === 'ios'
    ? 'ios'
    : 'web';

export async function performClientHaptic(event: ClientHapticEvent): Promise<void> {
  const pattern = resolveClientHapticPattern(event, platform);
  if (pattern === 'none') return;

  try {
    if (platform === 'android') {
      if (pattern === 'segment-tick') {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Segment_Tick);
      } else if (pattern === 'confirm') {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Confirm);
      } else if (pattern === 'reject') {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Reject);
      } else if (pattern === 'toggle-on') {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_On);
      } else if (pattern === 'toggle-off') {
        await Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Toggle_Off);
      }
      return;
    }

    if (pattern === 'selection') {
      await Haptics.selectionAsync();
      return;
    }

    if (pattern === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (pattern === 'warning') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    } else if (pattern === 'error') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  } catch {
    // Feedback tátil é complementar e nunca deve interromper a ação principal.
  }
}
