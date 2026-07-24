import Stack from 'expo-router/stack';

import { ClientNotificationsProvider } from '@/contexts/client-notifications-context';
import { ClientProfileProvider } from '@/contexts/client-profile-context';
import { clientTheme } from '@/theme/client-theme';

export default function ClientAppLayout() {
  return (
    <ClientProfileProvider>
      <ClientNotificationsProvider>
        <Stack
          screenOptions={{
            headerShadowVisible: false,
            headerStyle: { backgroundColor: clientTheme.colors.canvas },
            headerTintColor: clientTheme.colors.ink,
            headerTitleStyle: { fontWeight: '800' },
            contentStyle: { backgroundColor: clientTheme.colors.canvas },
          }}
        >
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="establishments/[slug]" options={{ title: 'Detalhes' }} />
          <Stack.Screen name="booking/[slug]" options={{ title: 'Agendar' }} />
          <Stack.Screen name="appointments/[id]" options={{ title: 'Atendimento' }} />
          <Stack.Screen
            name="appointments/[id]/cancel"
            options={{
              title: 'Cancelar atendimento',
              presentation: 'formSheet',
              sheetGrabberVisible: true,
              sheetAllowedDetents: [0.75, 1],
            }}
          />
          <Stack.Screen name="profile" options={{ title: 'Editar perfil' }} />
          <Stack.Screen name="preferences" options={{ title: 'Preferências' }} />
          <Stack.Screen name="security" options={{ title: 'Segurança' }} />
          <Stack.Screen name="introduction" options={{ headerShown: false }} />
        </Stack>
      </ClientNotificationsProvider>
    </ClientProfileProvider>
  );
}
