import { getClientAppointmentNotificationRoute } from '@cutsync/domain';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';
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
  const router = useRouter();
  const handledResponseId = useRef<string | null>(null);

  const openNotification = useCallback((response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const notificationId = response.notification.request.identifier;
    if (handledResponseId.current === notificationId) return;

    const route = getClientAppointmentNotificationRoute(
      response.notification.request.content.data,
    );
    if (!route) return;

    handledResponseId.current = notificationId;
    Notifications.clearLastNotificationResponse();
    router.push(route);
  }, [router]);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return undefined;

    const sync = () => {
      void syncClientPushNotifications().catch(() => undefined);
    };

    sync();
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      void registerRotatedClientPushToken(token).catch(() => undefined);
    });
    const responseSubscription = Notifications.addNotificationResponseReceivedListener(openNotification);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    let active = true;
    void Notifications.getLastNotificationResponseAsync().then((response) => {
      if (active && response) openNotification(response);
    }).catch(() => undefined);

    return () => {
      active = false;
      tokenSubscription.remove();
      responseSubscription.remove();
      appStateSubscription.remove();
    };
  }, [openNotification, user]);

  return children;
}
