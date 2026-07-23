import { products, sharedBrand } from '@cutsync/brand';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  ClientAvatar,
  ClientBrand,
  SettingsCard,
  SettingsMenuRow,
  SettingsNotice,
  SettingsSectionLabel,
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

        <View style={styles.intro}>
          <Text style={styles.eyebrow}>SUA CONTA</Text>
          <Text style={styles.title}>Tudo do seu jeito.</Text>
          <Text style={styles.description}>{products.client.purpose}</Text>
        </View>

        <SettingsSectionLabel>DESCOBRIR</SettingsSectionLabel>
        <SettingsCard>
          <SettingsMenuRow
            testID="client-open-discovery"
            title="Encontrar um lugar"
            subtitle="Busque estabelecimentos, serviços e profissionais."
            onPress={() => router.push('/explore')}
          />
        </SettingsCard>

        <SettingsCard>
          <View style={styles.profileSummary}>
            <ClientAvatar avatarUrl={profile?.avatarUrl ?? null} name={name} />
            <View style={styles.profileCopy}>
              <Text selectable style={styles.profileName}>{name}</Text>
              <Text selectable testID="client-session-email" style={styles.profileEmail}>{email}</Text>
            </View>
          </View>
          {isLoading && (
            <View testID="client-profile-loading" style={styles.loadingRow}>
              <ActivityIndicator color={sharedBrand.colors.forest} size="small" />
              <Text style={styles.loadingText}>Carregando seu perfil…</Text>
            </View>
          )}
          {error && (
            <>
              <SettingsNotice testID="client-profile-load-error" message={error} />
              <SettingsMenuRow
                testID="client-profile-retry"
                title="Tentar novamente"
                subtitle="Refazer a conexão com seu perfil."
                onPress={() => { void refresh(); }}
              />
            </>
          )}
        </SettingsCard>

        <SettingsSectionLabel>CONTA E PREFERÊNCIAS</SettingsSectionLabel>
        <SettingsCard>
          <SettingsMenuRow
            testID="client-open-profile"
            title="Perfil"
            subtitle="Nome, telefone e foto."
            onPress={() => router.push('./profile')}
          />
          <View style={styles.divider} />
          <SettingsMenuRow
            testID="client-open-preferences"
            title="Preferências"
            subtitle="Canais de comunicação e privacidade."
            onPress={() => router.push('./preferences')}
          />
          <View style={styles.divider} />
          <SettingsMenuRow
            testID="client-open-security"
            title="Segurança"
            subtitle="Senha e sessão deste dispositivo."
            onPress={() => router.push('./security')}
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
  safeArea: { flex: 1, backgroundColor: sharedBrand.colors.sandSoft },
  content: {
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 44,
    gap: 16,
  },
  intro: { paddingTop: 32, paddingBottom: 8, gap: 10 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 11, fontWeight: '800', letterSpacing: 1.4 },
  title: { color: sharedBrand.colors.forestDark, fontSize: 39, lineHeight: 44, fontWeight: '700', letterSpacing: -1.2 },
  description: { color: '#60675F', fontSize: 15, lineHeight: 23 },
  profileSummary: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  profileCopy: { flex: 1, gap: 5 },
  profileName: { color: sharedBrand.colors.forestDark, fontSize: 20, fontWeight: '700' },
  profileEmail: { color: '#6B7068', fontSize: 12, lineHeight: 18 },
  loadingRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingTop: 4 },
  loadingText: { color: '#6B7068', fontSize: 12 },
  divider: { height: 1, backgroundColor: '#ECE8DD' },
  securityNote: { color: '#817A6C', fontSize: 11, lineHeight: 17, textAlign: 'center', paddingHorizontal: 18 },
});
