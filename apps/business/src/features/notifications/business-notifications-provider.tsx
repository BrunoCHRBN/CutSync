import * as Network from 'expo-network';
import * as Notifications from 'expo-notifications';
import { type Href, router } from 'expo-router';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef, useState } from 'react';
import { AppState, Platform } from 'react-native';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { businessAppointmentsApi } from '@/features/appointments/business-appointments-api';
import { getLocalDateInTimeZone } from '@/features/agenda/business-agenda';
import { isNetworkStateOnline } from '@/features/connectivity/business-query';
import {
  type BusinessDeepLink,
  resolveBusinessAppointmentContext,
  resolveBusinessNotificationLink,
} from '@/features/links/business-deep-links';
import { shouldSyncBusinessPushAfterReconnect } from '@/features/notifications/business-push-lifecycle';
import {
  registerRotatedBusinessPushToken,
  syncBusinessPushNotifications,
} from '@/features/notifications/business-push-service';
import { businessObservability } from '@/features/observability/business-observability';
import { sanitizeSentryRoute } from '@/features/observability/sentry-sanitization';
import { businessTeamApi } from '@/features/team/business-team-api';
import { businessApi } from '@/services/business-api';

if (Platform.OS === 'android') {
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
  const { isLoading: isSessionLoading, user } = useBusinessSession();
  const {
    activeContext,
    contexts,
    hasCapability,
    isLoading: isOperationalLoading,
    selectEstablishment,
  } = useBusinessOperational();
  const [pendingLink, setPendingLink] = useState<BusinessDeepLink | null>(null);
  const handledResponseId = useRef<string | null>(null);

  useEffect(() => {
    if (!pendingLink) return;

    if (pendingLink.kind === 'invitation') {
      if (isSessionLoading) return;
      if (!user) {
        setPendingLink(null);
        router.push(pendingLink.href as Href);
        return;
      }
      let active = true;
      void businessApi.inspectInvitation(pendingLink.invitationToken)
        .then(() => {
          if (!active) return;
          setPendingLink(null);
          router.push(pendingLink.href as Href);
        })
        .catch((error) => {
          if (!active) return;
          setPendingLink(null);
          businessObservability.captureError(error, 'business_notification_preflight_failed', {
            route: sanitizeSentryRoute(pendingLink.href),
            operation: 'inspect_invitation',
          });
        });
      return () => {
        active = false;
      };
    }

    if (pendingLink.kind === 'team_invitation') {
      if (isSessionLoading) return;
      if (!user) {
        setPendingLink(null);
        router.push({
          pathname: '/sign-in',
          params: { redirect: pendingLink.href },
        } as Href);
        return;
      }
      let active = true;
      void businessTeamApi.getMyInvitation(pendingLink.invitationId)
        .then(() => {
          if (!active) return;
          setPendingLink(null);
          router.push(pendingLink.href as Href);
        })
        .catch((error) => {
          if (!active) return;
          setPendingLink(null);
          businessObservability.captureError(error, 'business_notification_preflight_failed', {
            route: sanitizeSentryRoute(pendingLink.href),
            operation: 'get_my_business_team_invitation',
          });
        });
      return () => {
        active = false;
      };
    }

    if (isSessionLoading || isOperationalLoading) return;
    if (!user) {
      setPendingLink(null);
      return;
    }

    if (pendingLink.kind === 'appointment' && !pendingLink.establishmentId) {
      let active = true;
      void resolveBusinessAppointmentContext({
        appointmentId: pendingLink.appointmentId,
        activeEstablishmentId: activeContext?.establishmentId ?? null,
        contexts,
        loadDetail: businessAppointmentsApi.getDetail,
      })
        .then((establishmentId) => {
          if (!active) return;
          if (!establishmentId) {
            setPendingLink(null);
            return;
          }
          if (establishmentId === activeContext?.establishmentId) {
            setPendingLink(null);
            router.push(pendingLink.href as Href);
            return;
          }
          setPendingLink({ ...pendingLink, establishmentId });
        })
        .catch((error) => {
          if (!active) return;
          setPendingLink(null);
          businessObservability.captureError(error, 'business_notification_preflight_failed', {
            route: sanitizeSentryRoute(pendingLink.href),
            operation: 'resolve_business_appointment_context',
          });
        });
      return () => {
        active = false;
      };
    }

    if (
      pendingLink.establishmentId
      && activeContext?.establishmentId !== pendingLink.establishmentId
    ) {
      const destination = contexts.find(
        (context) => context.establishmentId === pendingLink.establishmentId,
      );
      if (!destination || destination.accessMode === 'blocked') {
        setPendingLink(null);
        return;
      }
      let active = true;
      void selectEstablishment(destination.establishmentId)
        .then((selected) => {
          if (active && !selected) setPendingLink(null);
        })
        .catch((error) => {
          if (!active) return;
          setPendingLink(null);
          businessObservability.captureError(error, 'business_notification_context_failed', {
            route: sanitizeSentryRoute(pendingLink.href),
            operation: 'select_establishment',
          });
        });
      return () => {
        active = false;
      };
    }

    if (!activeContext || activeContext.accessMode === 'blocked') {
      setPendingLink(null);
      return;
    }

    let active = true;
    const preflight = pendingLink.kind === 'appointment'
      ? businessAppointmentsApi.getDetail(
        activeContext.establishmentId,
        pendingLink.appointmentId,
      )
      : businessApi.getAgendaDay(
        activeContext.establishmentId,
        getLocalDateInTimeZone(activeContext.timezone),
        hasCapability('view_team_agenda') ? 'team' : 'own',
      );

    void preflight
      .then(() => {
        if (!active) return;
        setPendingLink(null);
        router.push(pendingLink.href as Href);
      })
      .catch((error) => {
        if (!active) return;
        setPendingLink(null);
        businessObservability.captureError(error, 'business_notification_preflight_failed', {
          route: sanitizeSentryRoute(pendingLink.href),
          operation: pendingLink.kind === 'appointment'
            ? 'get_business_appointment_detail'
            : 'get_business_agenda_day',
        });
      });
    return () => {
      active = false;
    };
  }, [
    activeContext,
    contexts,
    hasCapability,
    isOperationalLoading,
    isSessionLoading,
    pendingLink,
    selectEstablishment,
    user,
  ]);

  useEffect(() => {
    if (Platform.OS !== 'android') return undefined;
    const openNotification = (response: Notifications.NotificationResponse) => {
      if (response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
      const responseId = response.notification.request.identifier;
      if (handledResponseId.current === responseId) return;

      handledResponseId.current = responseId;
      Notifications.clearLastNotificationResponse();
      const link = resolveBusinessNotificationLink(
        response.notification.request.content.data ?? {},
      );
      if (link) setPendingLink(link);
    };

    const responseSubscription = Notifications.addNotificationResponseReceivedListener(
      openNotification,
    );
    const initialResponse = Notifications.getLastNotificationResponse();
    if (initialResponse) openNotification(initialResponse);

    return () => {
      responseSubscription.remove();
    };
  }, []);

  useEffect(() => {
    if (!user || Platform.OS !== 'android') return undefined;

    let active = true;
    let appState = AppState.currentState;
    let networkOnline: boolean | null = null;
    let networkEventObserved = false;
    let syncInFlight = false;
    let syncQueued = false;

    const capturePushError = (error: unknown, code: string, operation: string) => {
      businessObservability.captureError(error, code, { operation });
    };
    const sync = () => {
      if (!active) return;
      if (syncInFlight) {
        syncQueued = true;
        return;
      }
      syncInFlight = true;
      void syncBusinessPushNotifications()
        .catch((error) => {
          capturePushError(error, 'business_push_sync_failed', 'push.sync');
        })
        .finally(() => {
          syncInFlight = false;
          if (!active || !syncQueued) return;
          syncQueued = false;
          if (appState === 'active' && networkOnline !== false) sync();
        });
    };

    if (appState === 'active') sync();
    void Network.getNetworkStateAsync()
      .then((state) => {
        if (active && !networkEventObserved) networkOnline = isNetworkStateOnline(state);
      })
      .catch((error) => {
        if (active) {
          capturePushError(
            error,
            'business_push_network_state_failed',
            'push.network_state',
          );
        }
      });
    const networkSubscription = Network.addNetworkStateListener((state) => {
      networkEventObserved = true;
      const previousOnline = networkOnline;
      networkOnline = isNetworkStateOnline(state);
      if (shouldSyncBusinessPushAfterReconnect(previousOnline, state, appState)) sync();
    });
    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      void registerRotatedBusinessPushToken(token).catch((error) => {
        capturePushError(error, 'business_push_token_rotation_failed', 'push.rotate_token');
      });
    });
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      appState = state;
      if (state === 'active' && networkOnline !== false) sync();
    });

    return () => {
      active = false;
      networkSubscription.remove();
      tokenSubscription.remove();
      appStateSubscription.remove();
    };
  }, [user]);

  return children;
}
