import { sharedBrand } from '@cutsync/brand';
import { formatDisplayName } from '@cutsync/domain';
import type { ProfessionalPublicProfile } from '@cutsync/database';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import {
  Dimensions,
  Linking,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DiscoveryLoading,
  DiscoveryMessage,
  discoveryColors,
} from '@/components/discovery/client-discovery-ui';
import { ClientStickyFooter } from '@/components/ui/client-ui';
import { getClientPublicProfessionalProfile } from '@/features/discovery/client-professional-profile-service';
import { performClientHaptic } from '@/features/experience/client-haptics';

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CS';
  return (parts[0][0] + (parts.at(-1)?.[0] ?? '')).toUpperCase();
};

const openSafeUrl = (url: string) => {
  if (!url.startsWith('http://') && !url.startsWith('https://')) return;
  void Linking.openURL(url);
};

export function ClientProfessionalProfileScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    slug?: string | string[];
    establishmentSlug?: string | string[];
    professionalId?: string | string[];
  }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const establishmentSlug = Array.isArray(params.establishmentSlug)
    ? params.establishmentSlug[0]
    : params.establishmentSlug;
  const professionalId = Array.isArray(params.professionalId)
    ? params.professionalId[0]
    : params.professionalId;

  const [profile, setProfile] = useState<ProfessionalPublicProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!slug) {
      setError('Este perfil não está disponível.');
      setIsLoading(false);
      return;
    }
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      setProfile(await getClientPublicProfessionalProfile(slug));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível carregar este perfil.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [slug]);

  useEffect(() => {
    void load();
  }, [load]);

  if (isLoading) {
    return (
      <View testID="client-professional-profile-loading" style={styles.centeredPage}>
        <StatusBar style="dark" />
        <DiscoveryLoading label="Abrindo o perfil…" />
      </View>
    );
  }

  if (error || !profile) {
    return (
      <View testID="client-professional-profile-error" style={styles.centeredPage}>
        <StatusBar style="dark" />
        <DiscoveryMessage
          title={error ? 'Perfil indisponível' : 'Perfil oculto'}
          description={error || 'Este profissional pode ter ocultado ou alterado o perfil público.'}
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      </View>
    );
  }

  const displayName = formatDisplayName(profile.name);
  const galleryWidth = Math.min(Dimensions.get('window').width, 720) - 40;
  const canBook = Boolean(establishmentSlug && professionalId);

  const startBooking = () => {
    if (!establishmentSlug || !professionalId) return;
    void performClientHaptic('selection');
    router.push({
      pathname: '/booking/[slug]',
      params: { slug: establishmentSlug, professionalId },
    });
  };

  return (
    <View testID="client-professional-profile-screen" style={styles.page}>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        refreshControl={(
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={() => { void load(true); }}
            tintColor={sharedBrand.colors.forest}
          />
        )}
        showsVerticalScrollIndicator={false}
      >
        <StatusBar style="dark" />

        <View style={styles.heroCard}>
          {profile.avatarUrl ? (
            <Image
              testID="client-professional-profile-avatar"
              accessibilityLabel={'Foto de ' + displayName}
              contentFit="cover"
              source={{ uri: profile.avatarUrl }}
              style={styles.avatar}
              transition={180}
            />
          ) : (
            <View testID="client-professional-profile-avatar-fallback" style={styles.avatarFallback}>
              <Text style={styles.initials}>{initialsOf(displayName)}</Text>
            </View>
          )}
          <View style={styles.heroCopy}>
            <Text style={styles.eyebrow}>PROFISSIONAL</Text>
            <Text testID="client-professional-profile-name" style={styles.name}>{displayName}</Text>
            <Text testID="client-professional-profile-title" style={styles.title}>
              {profile.tituloProfissional || 'Especialista'}
            </Text>
            {!!profile.specialties && (
              <Text testID="client-professional-profile-specialties" style={styles.specialties}>
                {profile.specialties}
              </Text>
            )}
            {!!profile.bio && (
              <Text testID="client-professional-profile-bio" style={styles.bio}>{profile.bio}</Text>
            )}
          </View>
        </View>

        {(profile.portfolioUrl || profile.instagramUrl) && (
          <View testID="client-professional-profile-links" style={styles.linksRow}>
            {!!profile.portfolioUrl && (
              <Pressable
                testID="client-professional-profile-portfolio"
                accessibilityRole="link"
                onPress={() => openSafeUrl(profile.portfolioUrl!)}
                style={({ pressed }) => [styles.linkButton, pressed && styles.pressed]}
              >
                <Text style={styles.linkButtonText}>Portfólio</Text>
              </Pressable>
            )}
            {!!profile.instagramUrl && (
              <Pressable
                testID="client-professional-profile-instagram"
                accessibilityRole="link"
                onPress={() => openSafeUrl(profile.instagramUrl!)}
                style={({ pressed }) => [styles.linkButton, styles.linkButtonSecondary, pressed && styles.pressed]}
              >
                <Text style={[styles.linkButtonText, styles.linkButtonTextSecondary]}>Instagram</Text>
              </Pressable>
            )}
          </View>
        )}

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>TRABALHOS</Text>
            <Text style={styles.sectionTitle}>Galeria</Text>
          </View>
          {profile.gallery.length === 0 ? (
            <DiscoveryMessage
              title="Galeria em construção"
              description="O profissional ainda não publicou trabalhos neste perfil."
            />
          ) : (
            <ScrollView
              testID="client-professional-profile-gallery"
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              style={styles.gallery}
            >
              {profile.gallery.map((item, index) => (
                <Image
                  key={item.url + '-' + index}
                  testID={'client-professional-profile-gallery-item-' + index}
                  accessibilityLabel={item.alt}
                  contentFit="cover"
                  source={{ uri: item.url }}
                  style={[styles.galleryImage, { width: galleryWidth }]}
                  transition={180}
                />
              ))}
            </ScrollView>
          )}
        </View>

        <Text testID="client-professional-profile-privacy" style={styles.privacyNote}>
          Este perfil mostra só o que o profissional escolheu publicar. Contato, agenda e vínculos do estabelecimento permanecem privados.
        </Text>
      </ScrollView>

      {canBook && (
        <ClientStickyFooter>
          <Text style={styles.bookingHint}>Agende com este profissional no estabelecimento atual.</Text>
          <Pressable
            testID="client-professional-profile-start-booking"
            accessibilityRole="button"
            onPress={startBooking}
            style={({ pressed }) => [styles.bookingButton, pressed && styles.bookingButtonPressed]}
          >
            <Text style={styles.bookingButtonText}>Agendar com {displayName.split(' ')[0]}</Text>
          </Pressable>
        </ClientStickyFooter>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: discoveryColors.background },
  centeredPage: { flex: 1, justifyContent: 'center', backgroundColor: discoveryColors.background, padding: 20 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 22 },
  heroCard: {
    gap: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    borderCurve: 'continuous',
    padding: 22,
    boxShadow: '0 14px 32px rgba(20, 27, 23, 0.07)',
  },
  avatar: { width: '100%', height: 280, borderRadius: 24, borderCurve: 'continuous', backgroundColor: '#E7E1CE' },
  avatarFallback: {
    width: '100%',
    height: 220,
    borderRadius: 24,
    borderCurve: 'continuous',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: sharedBrand.colors.forest,
  },
  initials: { color: '#FFFFFF', fontSize: 56, fontWeight: '800' },
  heroCopy: { gap: 6 },
  eyebrow: { color: discoveryColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  name: { color: discoveryColors.text, fontSize: 28, lineHeight: 32, fontWeight: '800', letterSpacing: -0.6 },
  title: { color: discoveryColors.accent, fontSize: 15, fontWeight: '700' },
  specialties: { color: discoveryColors.text, fontSize: 13, lineHeight: 20, fontWeight: '600', paddingTop: 6 },
  bio: { color: discoveryColors.secondary, fontSize: 14, lineHeight: 22, paddingTop: 8 },
  linksRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  linkButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: 999,
    backgroundColor: sharedBrand.colors.forest,
    paddingHorizontal: 16,
  },
  linkButtonSecondary: { backgroundColor: sharedBrand.colors.forestSoft },
  linkButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800' },
  linkButtonTextSecondary: { color: sharedBrand.colors.forest },
  section: { gap: 14 },
  sectionHeading: { gap: 4, paddingHorizontal: 2 },
  sectionEyebrow: { color: discoveryColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: discoveryColors.text, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  gallery: { borderRadius: 26, borderCurve: 'continuous' },
  galleryImage: { height: 240, borderRadius: 26, borderCurve: 'continuous', backgroundColor: '#E7E1CE', marginRight: 10 },
  privacyNote: { color: discoveryColors.secondary, fontSize: 12, lineHeight: 18 },
  bookingHint: { color: discoveryColors.secondary, fontSize: 11, lineHeight: 16 },
  bookingButton: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 999,
    borderCurve: 'continuous',
    backgroundColor: sharedBrand.colors.forest,
    paddingHorizontal: 20,
  },
  bookingButtonPressed: { opacity: 0.85 },
  bookingButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
  pressed: { opacity: 0.7 },
});
