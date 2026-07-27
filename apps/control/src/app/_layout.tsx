import React from 'react';
import { Stack } from 'expo-router/stack';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ControlAuthProvider } from '@/contexts/control-auth-context';

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ControlAuthProvider>
        <Stack screenOptions={{ headerShown: false }} />
      </ControlAuthProvider>
    </SafeAreaProvider>
  );
}
