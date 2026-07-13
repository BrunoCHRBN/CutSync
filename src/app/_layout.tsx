import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import '../i18n';

// Evitar que a Splash Screen feche antes de carregarmos fontes
SplashScreen.preventAutoHideAsync();

function RootLayoutNavigation() {
  const { user, profile, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';

    if (!user) {
      // Se não estiver logado, redirecionar para tela de Login
      if (!inAuthGroup) {
        router.replace('/(auth)/login');
      }
    } else if (profile) {
      // Se estiver logado e perfil carregado, direciona para o respectivo fluxo
      const inAdminGroup = segments[0] === '(admin)';
      const inClientGroup = segments[0] === '(client)';

      if (profile.role === 'admin' || profile.role === 'barber') {
        if (!inAdminGroup) {
          router.replace('/(admin)');
        }
      } else {
        if (!inClientGroup) {
          router.replace('/(client)');
        }
      }
    }
  }, [user, profile, loading, segments]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Screen name="(auth)" />
      <Stack.Screen name="(client)" />
      <Stack.Screen name="(admin)" />
    </Stack>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Montserrat_700Bold,
    Inter_400Regular,
    Inter_600SemiBold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      // Fechar a Splash Screen quando fontes estiverem prontas
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <AuthProvider>
      <RootLayoutNavigation />
    </AuthProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: '#121212',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
