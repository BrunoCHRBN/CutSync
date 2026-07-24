import { products, sharedBrand } from '@cutsync/brand';
import { type Href, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ClientAvatar,
  ClientBrand,
  SettingsCard,
  SettingsMenuRow,
  SettingsNotice,
  SettingsSectionLabel,
  settingsColors,
} from '@/components/settings/client-settings-ui';
import { useClientProfile } from '@/contexts/client-profile-context';
import { useSession } from '@/contexts/session-context';

export function ClientHomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const { profile, isLoading, error, refresh } = useClientProfile();
  const fallbackName = typeof user?.user_metadata?.name === 'string' ? user.user_metadata.name : 'Cliente CutSync';
  const name = profile?.name || fallbackName;
  const email = profile?.email || user?.email || '';

  return (
    <SafeAreaView testID="client-app-shell" style={styles.safeArea} edges={['top']}>
      <StatusBar style="dark" />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <ClientBrand />

        <View style={styles.heroCard}>
          <View style={styles.heroAvatarWrap}>
            <ClientAvatar avatarUrl={profile?.avatarUrl ?? null} name={name} size={72} />
          </View>
          <View style={styles.heroCopy}>
            <Text style={styles.heroEyebrow}>SUA CONTA</Text>
            <Text selectable style={styles.heroName}>{name}</Text>
            <Text selectable testID="client-session-email" style={styles.heroEmail}>{email}</Text>
          </View>
        </View>

        <View style={styles.introBlock}>
          <Text style={styles.introTitle}>Tudo do seu jeito.</Text>
          <Text style={styles.introDescription}>{products.client.purpose}</Text>
        </View>

        <SettingsSectionLabel>DESCOBRIR</SettingsSectionLabel>
        <Pressable
          testID="client-open-discovery"
          accessibilityRole="button"
          onPress={() => router.push('/explore')}
          style={({ pressed }) => [styles.discoveryCta, pressed && styles.pressed]}
        >
          <View style={styles.discoveryCtaCopy}>
            <Text style={styles.discoveryCtaEyebrow}>ENCONTRAR UM LUGAR</Text>
            <Text style={styles.discoveryCtaTitle}>Descubra estabelecimentos, serviços e profissionais.</Text>
          </View>
          <View style={styles.discoveryCtaArrow}>
            <Text style={styles.discoveryCtaArrowIcon}>→</Text>
          </View>
        </Pressable>

        {isLoading && (
          <View testID="client-profile-loading" style={styles.loadingRow}>
            <ActivityIndicator color={settingsColors.accent} size="small" />
            <Text style={styles.loadingText}>Carregando seu perfil…</Text>
          </View>
        )}
        {error && (
          <SettingsCard>
            <SettingsNotice testID="client-profile-load-error" message={error} />
            <SettingsMenuRow
              testID="client-profile-retry"
              title="Tentar novamente"
              subtitle="Refazer a conexão com seu perfil."
              onPress={() => { void refresh(); }}
            />
          </SettingsCard>
        )}

        <SettingsSectionLabel>CONTA E PREFERÊNCIAS</SettingsSectionLabel>
        <SettingsCard>
          <SettingsMenuRow
            testID="client-open-profile"
            title="Perfil"
            subtitle="Nome, telefone e foto."
            onPress={() => router.push('/(app)/profile')}
          />
          <View style={styles.divider} />
          <SettingsMenuRow
            testID="client-open-preferences"
            title="Preferências"
            subtitle="Canais de comunicação e privacidade."
            onPress={() => router.push('/(app)/preferences')}
          />
          <View style={styles.divider} />
          <SettingsMenuRow
            testID="client-open-security"
            title="Segurança"
            subtitle="Senha e sessão deste dispositivo."
            onPress={() => router.push('/(app)/security')}
          />
          <View style={styles.divider} />
          <SettingsMenuRow
            testID="client-open-introduction"
            title="Conheça o CutSync"
            subtitle="Veja novamente os recursos do aplicativo."
            onPress={() => router.push('/introduction' as Href)}
          />
        </SettingsCard>

        <Text style={styles.securityNote}>
          Seus dados são carregados somente após a sessão segura ser restaurada.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: settingsColors.background },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 48,
    gap: 16,
  },
  heroCard: {
    marginTop: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: sharedBrand.colors.forest,
    borderRadius: 28,
    borderCurve: 'continuous',
    padding: 20,
    boxShadow: '0 16px 32px rgba(20, 27, 23, 0.14)',
  },
  heroAvatarWrap: { borderRadius: 26, padding: 3, backgroundColor: 'rgba(255, 255, 255, 0.15)' },
  heroCopy: { flex: 1, gap: 4 },
  heroEyebrow: { color: 'rgba(255, 255, 255, 0.7)', fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  heroName: { color: '#FFFFFF', fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
  heroEmail: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, lineHeight: 18 },
  introBlock: { paddingTop: 16, gap: 10 },
  introTitle: { color: settingsColors.text, fontSize: 36, lineHeight: 40, fontWeight: '800', letterSpacing: -1.2 },
  introDescription: { color: settingsColors.secondary, fontSize: 15, lineHeight: 23 },
  discoveryCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: sharedBrand.colors.forestSoft,
    borderWidth: 1,
    borderColor: '#CBDCC6',
    borderRadius: 24,
    borderCurve: 'continuous',
    padding: 18,
  },
  discoveryCtaCopy: { flex: 1, gap: 5 },
  discoveryCtaEyebrow: { color: settingsColors.accent, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  discoveryCtaTitle: { color: settingsColors.text, fontSize: 15, lineHeight: 21, fontWeight: '700' },
  discoveryCtaArrow: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: 999, backgroundColor: settingsColors.accent },
  discoveryCtaArrowIcon: { color: '#FFFFFF', fontSize: 18, fontWeight: '900' },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingLeft: 6 },
  loadingText: { color: settingsColors.secondary, fontSize: 12 },
  divider: { height: 1, backgroundColor: settingsColors.border },
  securityNote: { color: settingsColors.muted, fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 18 },
  pressed: { opacity: 0.7 },
});
