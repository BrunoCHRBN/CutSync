import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Montserrat_700Bold } from '@expo-google-fonts/montserrat/700Bold';
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Inter_700Bold } from '@expo-google-fonts/inter/700Bold';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import { WebAutofillStyles } from '../components/ui/web-autofill-styles';
import { CommandPaletteProvider } from '../components/command/command-palette-provider';
import { AuthProvider, useAuth } from '../contexts/AuthContext';
import { isSupabaseConfigured } from '../services/supabase';
import { colors, radii, typography } from '../theme/tokens';
import '../i18n';

// Evitar que a Splash Screen feche antes de carregarmos fontes
SplashScreen.preventAutoHideAsync();

function RootLayoutNavigation() {
  const buildTarget = process.env.EXPO_PUBLIC_BUILD_TARGET;
  const { user, profile, loading, isSuperadmin, governanceRole } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const firstSegment = segments[0] as string | undefined;
  const isPublicMarketing = firstSegment == null || firstSegment === 'index' || firstSegment === 'para-estabelecimentos';

  useEffect(() => {
    if (loading) return;

    const secondSegment = segments[1] as string | undefined;
    const inAuthGroup = firstSegment === '(auth)';
    const isDynamicSlug = firstSegment === '[slug]';
    const isPublicSalon = firstSegment === 'salon';
    const isInvite = firstSegment === 'invite';
    const isPublicProfessionalProfile = firstSegment === 'profile';
    const isProfessionalProfileEditor = firstSegment === 'professional-profile';
    const isSecurity = firstSegment === 'security';
    const isPasswordReset = inAuthGroup && secondSegment === 'reset-password';
    const isGovernance = firstSegment === 'governance';

    // 1. Isolamento Absoluto em Produção (Redirecionamento/Bloqueio físico de rotas restritas)
    if (buildTarget === 'production' && (isGovernance || firstSegment === 'superadmin')) {
      router.replace('/');
      return;
    }

    // A Central mantém uma sessão Supabase separada e volátil no layout de governança.
    if (isGovernance) return;

    if (!user) {
      // Rotas protegidas exigem autenticação — redirecionar para o Marketplace público (/)
      const protectedSegments = ['(admin)', '(client)', '(professional)', 'superadmin', 'governance', 'appointments', 'admin', 'professional', 'security', 'professional-profile'];
      const isProtectedRoute = protectedSegments.includes(firstSegment || '');
      if (isProtectedRoute) {
        router.replace('/');
      }
      // Rotas públicas: /, /para-estabelecimentos, /(auth), /[slug], /salon, /invite, /profile, /welcome, /embed — sem redirect
    } else if (profile) {
      if (isPasswordReset || isSecurity) return;
      
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

      // 2. Redirecionamento da Central de Governança
      if (governanceRole && inAuthGroup) {
        router.replace('/governance');
        return;
      }
      // 3. Superadmin legado
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
        if (!inProfessionalGroup && !isPublicProfessionalProfile && !isProfessionalProfileEditor && !isDynamicSlug && !isPublicSalon) {
          router.replace('/(professional)');
        }
      } else {
        if (!inClientGroup) {
          router.replace('/(client)');
        }
      }
    }
  }, [buildTarget, user, profile, loading, isSuperadmin, governanceRole, segments, router, firstSegment]);

  if (loading && !isPublicMarketing) {
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
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_600SemiBold: require('../../assets/fonts/Fraunces144pt-SemiBold.ttf'),
    Fraunces_700Bold: require('../../assets/fonts/Fraunces144pt-Bold.ttf'),
    Geist_400Regular: require('../../assets/fonts/Geist-Regular.ttf'),
    Geist_500Medium: require('../../assets/fonts/Geist-Medium.ttf'),
    Geist_600SemiBold: require('../../assets/fonts/Geist-SemiBold.ttf'),
    GeistMono_500Medium: require('../../assets/fonts/GeistMono-Medium.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError || process.env.EXPO_OS === 'web') {
      // Fechar a Splash Screen quando fontes estiverem prontas
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError && process.env.EXPO_OS !== 'web') {
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
      <SafeAreaProvider initialMetrics={initialWindowMetrics}>
        <WebAutofillStyles />
        <AuthProvider>
          <CommandPaletteProvider>
            <RootLayoutNavigation />
          </CommandPaletteProvider>
        </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: colors.brandPrimary,
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
    fontSize: 11,
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
