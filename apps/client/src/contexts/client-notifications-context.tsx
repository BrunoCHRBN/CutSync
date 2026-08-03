import {
  getClientNotificationRoute,
  type ClientNotificationRoute,
} from '@cutsync/domain';
import * as Notifications from 'expo-notifications';
import { type Href, useRouter } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useSession } from '@/contexts/session-context';
import { loadClientAppointment } from '@/features/appointments/client-appointments-service';
import { listMyEstablishmentClientLinks } from '@/features/establishment-links/client-establishment-links-service';
import {
  registerRotatedClientPushToken,
  syncClientPushNotifications,
} from '@/features/notifications/client-push-service';
import { clientObservability } from '@/features/observability/client-observability';
import { loadClientSupportTicket } from '@/features/support/client-support-service';

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
  const { isLoading, user } = useSession();
  const router = useRouter();
  const handledResponseId = useRef<string | null>(null);
  const [pendingNotification, setPendingNotification] = useState<{
    notificationId: string;
    payload: Record<string, unknown>;
    route: ClientNotificationRoute;
  } | null>(null);

  const openNotification = useCallback((response: Notifications.NotificationResponse) => {
    if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;

    const notificationId = response.notification.request.identifier;
    if (handledResponseId.current === notificationId) return;

    const route = getClientNotificationRoute(
      response.notification.request.content.data,
    );
    if (!route) return;

    handledResponseId.current = notificationId;
    Notifications.clearLastNotificationResponse();
    setPendingNotification({
      notificationId,
      payload: response.notification.request.content.data ?? {},
      route,
    });
  }, []);

  useEffect(() => {
    if (!pendingNotification || isLoading) return;
    if (!user) {
      setPendingNotification(null);
      return;
    }

    let active = true;
    const { payload, route } = pendingNotification;
    const preflight = async () => {
      if (route.pathname === '/appointments/[id]') {
        return Boolean(await loadClientAppointment(route.params.id));
      }
      if (route.pathname === '/support/[id]') {
        return Boolean(await loadClientSupportTicket(route.params.id));
      }

      const linkId = typeof payload.linkId === 'string' ? payload.linkId : '';
      const establishmentId = typeof payload.establishmentId === 'string'
        ? payload.establishmentId
        : '';
      const links = await listMyEstablishmentClientLinks();
      return links.some((link) => (
        link.linkId === linkId && link.establishmentId === establishmentId
      ));
    };

    void preflight()
      .then((authorized) => {
        if (!active) return;
        setPendingNotification(null);
        if (authorized) router.push(route as unknown as Href);
      })
      .catch((error) => {
        if (!active) return;
        setPendingNotification(null);
        if (handledResponseId.current === pendingNotification.notificationId) {
          handledResponseId.current = null;
        }
        clientObservability.captureError(error, 'client_notification_preflight_failed', {
          route: route.pathname,
          operation: route.pathname === '/appointments/[id]'
            ? 'get_client_appointment'
            : route.pathname === '/support/[id]'
              ? 'get_my_support_ticket'
              : 'get_my_establishment_client_link_requests',
        });
      });

    return () => {
      active = false;
    };
  }, [isLoading, pendingNotification, router, user]);

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
