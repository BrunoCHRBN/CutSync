import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BusinessOperationalProvider, useBusinessOperational } from '@/contexts/business-operational-context';
import { BusinessSessionProvider, useBusinessSession } from '@/contexts/business-session';
import {
  BusinessQueryProvider,
  BusinessQueryScopeReset,
} from '@/features/connectivity/business-query-provider';
import { businessTheme } from '@/theme/business-theme';

export default function BusinessRootLayout() {
  return (
    <BusinessQueryProvider>
      <BusinessSessionProvider>
        <BusinessOperationalProvider>
          <BusinessQueryScopeReset />
          <StatusBar style="light" />
          <BusinessRootNavigator />
        </BusinessOperationalProvider>
      </BusinessSessionProvider>
    </BusinessQueryProvider>
  );
}

function BusinessRootNavigator() {
  const { session, isLoading: isSessionLoading } = useBusinessSession();
  const { activeContext, isLoading: isContextLoading } = useBusinessOperational();
  const hasSessionOrIsRestoring = Boolean(session) || isSessionLoading;
  const hasOperationalAccess = Boolean(
    session && activeContext && activeContext.accessMode !== 'blocked',
  );
  const canResolveOperationalRoute = hasSessionOrIsRestoring && (
    isSessionLoading || isContextLoading || hasOperationalAccess
  );

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

      <Stack.Protected guard={hasSessionOrIsRestoring}>
        <Stack.Screen name="(access)" />
      </Stack.Protected>

      <Stack.Protected guard={canResolveOperationalRoute}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
