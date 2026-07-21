import React, { useEffect } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Montserrat_700Bold } from '@expo-google-fonts/montserrat';
import { Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
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

  useEffect(() => {
    if (loading) return;

    const firstSegment = segments[0] as string | undefined;
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
    const isWelcome = firstSegment === 'welcome';

    // 1. Isolamento Absoluto em Produção (Redirecionamento/Bloqueio físico de rotas restritas)
    if (buildTarget === 'production' && (isGovernance || firstSegment === 'superadmin')) {
      router.replace('/(client)');
      return;
    }

    // A Central mantém uma sessão Supabase separada e volátil no layout de governança.
    if (isGovernance) return;

    if (!user) {
      // Se não estiver logado, redirecionar para a Landing Page /welcome
      if (!inAuthGroup && !isDynamicSlug && !isPublicSalon && !isInvite && !isPublicProfessionalProfile && !isWelcome) {
        router.replace('/welcome');
      }
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
      const inGovernanceGroup = firstSegment === 'governance';

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
        if (!inProfessionalGroup && !isPublicProfessionalProfile && !isProfessionalProfileEditor) {
          router.replace('/(professional)');
        }
      } else {
        if (!inClientGroup) {
          router.replace('/(client)');
        }
      }
    }
  }, [buildTarget, user, profile, loading, isSuperadmin, governanceRole, segments, router]);

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
