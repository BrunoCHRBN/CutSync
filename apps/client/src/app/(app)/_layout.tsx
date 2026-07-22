import { Stack } from 'expo-router';

import { ClientProfileProvider } from '@/contexts/client-profile-context';

export default function ClientAppLayout() {
  return (
    <ClientProfileProvider>
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: '#F0ECE0' },
          headerTintColor: '#18201B',
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: '#F0ECE0' },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="profile" options={{ title: 'Editar perfil' }} />
        <Stack.Screen name="preferences" options={{ title: 'Preferências' }} />
        <Stack.Screen name="security" options={{ title: 'Segurança' }} />
      </Stack>
    </ClientProfileProvider>
  );
}
