import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { BusinessOperationalProvider, useBusinessOperational } from '@/contexts/business-operational-context';
import { BusinessSessionProvider, useBusinessSession } from '@/contexts/business-session';
import { businessTheme } from '@/theme/business-theme';

export default function BusinessRootLayout() {
  return (
    <BusinessSessionProvider>
      <BusinessOperationalProvider>
        <StatusBar style="light" />
        <BusinessRootNavigator />
      </BusinessOperationalProvider>
    </BusinessSessionProvider>
  );
}

function BusinessRootNavigator() {
  const { session } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const hasOperationalAccess = Boolean(
    session && activeContext && activeContext.accessMode !== 'blocked',
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

      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(access)" />
      </Stack.Protected>

      <Stack.Protected guard={hasOperationalAccess}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}
