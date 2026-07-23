import * as Notifications from 'expo-notifications';
import type { PropsWithChildren } from 'react';
import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';

import { useSession } from '@/contexts/session-context';
import {
  registerRotatedClientPushToken,
  syncClientPushNotifications,
} from '@/features/notifications/client-push-service';

if (Platform.OS !== 'web') {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
}

export function ClientNotificationsProvider({ children }: PropsWithChildren) {
  const { user } = useSession();

  useEffect(() => {
    if (!user || Platform.OS === 'web') return undefined;

    const sync = () => {
      void syncClientPushNotifications().catch(() => undefined);
    };

    sync();
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      void registerRotatedClientPushToken(token).catch(() => undefined);
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });

    return () => {
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [user]);

  return children;
}
