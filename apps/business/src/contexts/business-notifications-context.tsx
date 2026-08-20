import { getBusinessNotificationRoute } from '@cutsync/domain';
import * as Notifications from 'expo-notifications';
import { type Href, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef } from 'react';
import { AppState, Platform } from 'react-native';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import {
  registerRotatedBusinessPushToken,
  syncBusinessPushNotifications,
} from '@/features/notifications/business-push-service';

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

export function BusinessNotificationsProvider({ children }: PropsWithChildren) {
  const { user } = useBusinessSession();
  const { activeContext, isLoading: isContextLoading } = useBusinessOperational();
  const router = useRouter();
  const handledResponseId = useRef<string | null>(null);
  const pendingResponse = useRef<Notifications.NotificationResponse | null>(null);

  const openNotification = useCallback((response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const notificationId = response.notification.request.identifier;
    if (handledResponseId.current === notificationId) return;
    const route = getBusinessNotificationRoute(response.notification.request.content.data);
    if (!route) return;
    if (isContextLoading) {
      pendingResponse.current = response;
      return;
    }
    pendingResponse.current = null;
    handledResponseId.current = notificationId;
    Notifications.clearLastNotificationResponse();
    const { targetEstablishmentId, ...href } = route;
    if (
      !activeContext
      || targetEstablishmentId !== activeContext.establishmentId
    ) {
      router.push('/establishments' as Href);
      return;
    }
    router.push(href as Href);
  }, [activeContext, isContextLoading, router]);

  useEffect(() => {
    if (isContextLoading || !pendingResponse.current) return;
    const response = pendingResponse.current;
    pendingResponse.current = null;
    openNotification(response);
  }, [isContextLoading, openNotification]);

  useEffect(() => {
    if (!user || Platform.OS === 'web') return undefined;
    const sync = () => {
      void syncBusinessPushNotifications().catch(() => undefined);
    };
    sync();
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      void registerRotatedBusinessPushToken(token).catch(() => undefined);
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
