import { sharedBrand } from '@cutsync/brand';
import { Stack } from 'expo-router';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { SessionProvider, useSession } from '@/contexts/session-context';

export default function ClientRootLayout() {
  return (
    <SessionProvider>
      <ClientNavigator />
    </SessionProvider>
  );
}

function ClientNavigator() {
  const { isLoading, session } = useSession();

  if (isLoading) {
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
      <Stack.Protected guard={!session}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={Boolean(session)}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Screen name="(callback)" />
    </Stack>
  );
}

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
