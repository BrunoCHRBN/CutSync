import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../services/supabase';
import { colors, radii, typography } from '../theme/tokens';
import '../i18n';

// Evitar que a Splash Screen feche antes de carregarmos fontes
SplashScreen.preventAutoHideAsync();

function RootLayoutNavigation() {
  const { user, profile, loading, isSuperadmin } = useAuth();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    const isDynamicSlug = segments[0] === '[slug]';
    const isPublicSalon = segments[0] === 'salon';
    const isInvite = segments[0] === 'invite';
    const isPublicProfessionalProfile = segments[0] === 'profile';
    const isProfessionalProfileEditor = segments[0] === 'professional-profile';

    if (!user) {
      // Se não estiver logado, redirecionar para tela de Login (a menos que seja uma barbearia visitante)
      if (!inAuthGroup && !isDynamicSlug && !isPublicSalon && !isInvite && !isPublicProfessionalProfile) {
        router.replace('/(auth)/login');
      }
    } else if (profile) {
      // Se estiver logado e perfil carregado, direciona para o respectivo fluxo
      const firstSegment = segments[0] as string | undefined;
      const inAdminGroup = firstSegment === '(admin)' || firstSegment === 'admin';
      const inClientGroup = 
        firstSegment === '(client)' || 
        firstSegment === 'explore' || 
        firstSegment === 'appointments' ||
        isDynamicSlug ||
        isPublicSalon || isPublicProfessionalProfile || isProfessionalProfileEditor;
      const inProfessionalGroup = firstSegment === '(professional)' || firstSegment === 'professional';
      const inSuperadminGroup = firstSegment === 'superadmin';

      if (isInvite) return;
      if (isSuperadmin && inAuthGroup) {
        router.replace('/superadmin');
        return;
      }
      if (inSuperadminGroup) {
        if (!isSuperadmin) router.replace('/(client)');
        return;
      }

      if (profile.role === 'admin') {
        if (!inAdminGroup && !isDynamicSlug && !isPublicSalon && !isPublicProfessionalProfile && !isProfessionalProfileEditor) {
          router.replace('/(admin)');
        }
      } else if (profile.role === 'professional') {
        if (!inProfessionalGroup && !isPublicProfessionalProfile && !isProfessionalProfileEditor) {
          router.replace('/(professional)');
        }
      } else {
        if (!inClientGroup) {
          router.replace('/(client)');
        }
      }
    }
  }, [user, profile, loading, isSuperadmin, segments, router]);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return <Stack screenOptions={{ headerShown: false }} />;
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

  if (!isSupabaseConfigured) {
    return (
      <View testID="supabase-configuration-screen" style={styles.configurationScreen}>
        <View testID="supabase-configuration-card" style={styles.configurationCard}>
          <View style={styles.configurationMark} />
          <Text testID="supabase-configuration-eyebrow" style={styles.configurationEyebrow}>CONFIGURAÇÃO NECESSÁRIA</Text>
          <Text testID="supabase-configuration-title" style={styles.configurationTitle}>Conecte o ambiente do CutSync.</Text>
          <Text testID="supabase-configuration-description" style={styles.configurationDescription}>
            Defina EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_ANON_KEY para iniciar autenticação, dados em tempo real e armazenamento.
          </Text>
        </View>
      </View>
    );
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
  configurationScreen: {
    flex: 1,
    backgroundColor: colors.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  configurationCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 32,
  },
  configurationMark: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent,
    marginBottom: 26,
  },
  configurationEyebrow: {
    color: colors.textMuted,
    fontFamily: typography.bodyStrong,
    fontSize: 10,
    letterSpacing: 1.6,
  },
  configurationTitle: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 28,
    letterSpacing: -1,
    marginTop: 10,
  },
  configurationDescription: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 14,
    lineHeight: 22,
    marginTop: 12,
  },
});
