import * as Sentry from '@sentry/react-native';
import { Stack, useNavigationContainerRef, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { BusinessOperationalProvider, useBusinessOperational } from '@/contexts/business-operational-context';
import { BusinessSessionProvider, useBusinessSession } from '@/contexts/business-session';
import {
  BusinessQueryProvider,
  BusinessQueryScopeReset,
} from '@/features/connectivity/business-query-provider';
import { resolveBusinessDeepLink } from '@/features/links/business-deep-links';
import { BusinessNotificationsProvider } from '@/features/notifications/business-notifications-provider';
import {
  businessNavigationIntegration,
  businessObservability,
} from '@/features/observability/business-observability';
import { BusinessReleaseGate } from '@/features/updates/business-release-gate';
import { businessTheme } from '@/theme/business-theme';

function BusinessRootLayout() {
  return (
    <BusinessQueryProvider>
      <BusinessSessionProvider>
        <BusinessOperationalProvider>
          <BusinessQueryScopeReset />
          <BusinessNotificationsProvider>
            <BusinessReleaseGate>
              <StatusBar style="light" />
              <BusinessRootNavigator />
            </BusinessReleaseGate>
          </BusinessNotificationsProvider>
        </BusinessOperationalProvider>
      </BusinessSessionProvider>
    </BusinessQueryProvider>
  );
}

function BusinessRootNavigator() {
  const { isLoading: isSessionLoading, session, user } = useBusinessSession();
  const { activeContext, contexts, isLoading: isOperationalLoading } = useBusinessOperational();
  const navigationContainerRef = useNavigationContainerRef();
  const pathname = usePathname();
  const isAccessBootstrapping = isSessionLoading || Boolean(session && isOperationalLoading);
  const routeLink = resolveBusinessDeepLink(pathname);
  const canResolveAppointmentRoute = Boolean(
    session
    && routeLink?.kind === 'appointment'
    && contexts.some((context) => context.accessMode !== 'blocked'),
  );
  const hasOperationalAccess = isAccessBootstrapping
    || canResolveAppointmentRoute
    || Boolean(session && activeContext && activeContext.accessMode !== 'blocked');

  useEffect(() => {
    businessNavigationIntegration.registerNavigationContainer(navigationContainerRef);
  }, [navigationContainerRef]);

  useEffect(() => {
    businessObservability.setUser(user?.id);
  }, [user?.id]);

  useEffect(() => {
    businessObservability.setRoute(pathname);
  }, [pathname]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: businessTheme.colors.canvas },
      }}
    >
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(callback)" />
      <Stack.Screen name="invite/[token]" />

      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(access)" />
      </Stack.Protected>

      <Stack.Protected guard={hasOperationalAccess}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default Sentry.wrap(BusinessRootLayout);
