import { sharedBrand } from '@cutsync/brand';
import * as Sentry from '@sentry/react-native';
import { Stack, useNavigationContainerRef, usePathname } from 'expo-router';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { ReduceMotion, ReducedMotionConfig } from 'react-native-reanimated';

import { SessionProvider, useSession } from '@/contexts/session-context';
import {
  ClientOnboardingProvider,
  useClientOnboarding,
} from '@/contexts/client-onboarding-context';
import {
  clientNavigationIntegration,
  clientObservability,
} from '@/features/observability/client-observability';
import { resolveClientEntryState } from '@/features/onboarding/client-onboarding-state';

function ClientRootLayout() {
  return (
    <>
      <ReducedMotionConfig mode={ReduceMotion.System} />
      <ClientOnboardingProvider>
        <SessionProvider>
          <ClientNavigator />
        </SessionProvider>
      </ClientOnboardingProvider>
    </>
  );
}

function ClientNavigator() {
  const { isLoading, session, user } = useSession();
  const onboarding = useClientOnboarding();
  const navigationContainerRef = useNavigationContainerRef();
  const pathname = usePathname();

  useEffect(() => {
    clientNavigationIntegration.registerNavigationContainer(navigationContainerRef);
  }, [navigationContainerRef]);

  useEffect(() => {
    clientObservability.setUser(user?.id);
  }, [user?.id]);

  useEffect(() => {
    clientObservability.setRoute(pathname);
  }, [pathname]);

  const entryState = resolveClientEntryState({
    isSessionLoading: isLoading,
    isOnboardingLoading: onboarding.isLoading,
    isOnboardingComplete: onboarding.isComplete,
    hasSession: Boolean(session),
  });

  if (entryState === 'loading') {
    return (
      <View testID="client-session-loading" style={styles.loadingScreen}>
        <View style={styles.brandMark} />
        <ActivityIndicator color={sharedBrand.colors.forest} size="small" />
        <Text style={styles.loadingText}>Preparando seu CutSync…</Text>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, animation: 'fade' }}>
      <Stack.Protected guard={entryState === 'onboarding'}>
        <Stack.Screen name="(onboarding)" />
      </Stack.Protected>
      <Stack.Protected guard={entryState === 'auth'}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={entryState === 'app'}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="(callback)" />
    </Stack>
  );
}

export default Sentry.wrap(ClientRootLayout);

const styles = StyleSheet.create({
  loadingScreen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
    backgroundColor: sharedBrand.colors.sandSoft,
  },
  brandMark: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: sharedBrand.colors.forest,
  },
  loadingText: {
    color: sharedBrand.colors.forestDark,
    fontSize: 14,
    fontWeight: '600',
  },
});
