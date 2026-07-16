import React from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { ArrowLeft, ExternalLink, Instagram, ShieldCheck, Sparkles } from 'lucide-react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { usePublicProfessionalProfile } from '../../hooks/useProfessionalProfile';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { ScreenBackground } from '../ui/ScreenBackground';
import { atmosphericShadow, colors, glassSurface, layout, radii, typography } from '../../theme/tokens';
import { initialsOf } from '../../theme/color';

export const PublicProfessionalProfileExperience = () => {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const { width } = useWindowDimensions();
  const isWide = width >= 860;
  const { profile, loading } = usePublicProfessionalProfile(slug);
  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(client)');

  if (loading) return <ScreenBackground testID="public-professional-profile-loading" style={styles.center}><ActivityIndicator color={colors.brand} size="large" /></ScreenBackground>;
  if (!profile) return <ScreenBackground testID="public-professional-profile-not-found" style={styles.center}><EmptyState testID="public-professional-profile-empty" title="Perfil indisponível" description="Este profissional pode ter ocultado ou alterado seu perfil público." action={<AppButton testID="public-professional-profile-back-empty-button" label="Voltar" onPress={goBack} />} /></ScreenBackground>;

  return (
    <ScreenBackground testID="public-professional-profile-screen">
      <View style={styles.topbar}>
        <Pressable testID="public-professional-profile-back-button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><ArrowLeft color={colors.text} size={18} /></Pressable>
        <Text testID="public-professional-profile-topbar-title" numberOfLines={1} style={styles.topbarTitle}>Perfil profissional</Text>
        <View style={styles.privacyBadge}><ShieldCheck color={colors.success} size={14} /><Text style={styles.privacyBadgeText}>Perfil controlado</Text></View>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        <View style={[styles.hero, isWide && styles.heroWide]}>
          <View style={styles.portraitWrap}>{profile.avatarUrl ? <Image testID="public-professional-profile-avatar" source={{ uri: profile.avatarUrl }} style={styles.portrait} resizeMode="cover" /> : <View style={styles.portraitFallback}><Text style={styles.initials}>{initialsOf(profile.name)}</Text></View>}<View style={styles.portraitAccent} /></View>
          <View style={styles.heroCopy}>
            <Text testID="public-professional-profile-eyebrow" style={styles.eyebrow}>PROFISSIONAL INDEPENDENTE</Text>
            <Text testID="public-professional-profile-name" style={styles.name}>{profile.name}</Text>
            <Text testID="public-professional-profile-title" style={styles.title}>{profile.tituloProfissional || 'Especialista'}</Text>
            {!!profile.specialties && <Text testID="public-professional-profile-specialties" style={styles.specialties}>{profile.specialties}</Text>}
            {!!profile.bio && <Text testID="public-professional-profile-bio" style={styles.bio}>{profile.bio}</Text>}
            <View style={styles.links}>
              {!!profile.portfolioUrl && <AppButton testID="public-professional-profile-portfolio-button" label="Abrir portfólio" onPress={() => Linking.openURL(profile.portfolioUrl!)} icon={<ExternalLink color={colors.ink} size={16} />} />}
              {!!profile.instagramUrl && <AppButton testID="public-professional-profile-instagram-button" label="Ver Instagram" onPress={() => Linking.openURL(profile.instagramUrl!)} variant="secondary" icon={<Instagram color={colors.text} size={16} />} />}
            </View>
          </View>
        </View>

        <View style={styles.gallerySection}>
          <View style={styles.galleryHeading}><Sparkles color={colors.brand} size={18} /><View><Text style={styles.galleryEyebrow}>TRABALHOS SELECIONADOS</Text><Text testID="public-professional-profile-gallery-title" style={styles.galleryTitle}>Galeria profissional</Text></View></View>
          {profile.gallery.length === 0 ? <EmptyState testID="public-professional-profile-gallery-empty" title="Galeria em construção" description="O profissional ainda não publicou trabalhos neste perfil." /> : <View testID="public-professional-profile-gallery" style={styles.galleryGrid}>{profile.gallery.map((item, index) => <View key={`${item.url}-${index}`} testID={`public-professional-profile-gallery-item-${index}`} style={[styles.galleryItem, index % 3 === 0 && styles.galleryItemFeatured]}><Image accessibilityLabel={item.alt} source={{ uri: item.url }} style={styles.galleryImage} resizeMode="cover" /><View style={styles.galleryCaption}><Text style={styles.galleryCaptionText}>{item.alt}</Text></View></View>)}</View>}
        </View>

        <View testID="public-professional-profile-privacy-note" style={styles.privacyNote}><ShieldCheck color={colors.success} size={19} /><Text style={styles.privacyText}>Este perfil publica somente conteúdo escolhido pelo profissional. E-mail, telefone, agenda e vínculos permanecem privados.</Text></View>
      </ScrollView>
    </ScreenBackground>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24 },
  topbar: { minHeight: 68, flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.hairline, zIndex: 5, ...glassSurface },
  backButton: { width: 42, height: 42, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border }, pressed: { opacity: 0.7, transform: [{ scale: 0.97 }] },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 }, privacyBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 7, borderRadius: radii.pill, backgroundColor: colors.successSoft }, privacyBadgeText: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 9 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 22, paddingBottom: 80, gap: 64 },
  hero: { gap: 30, paddingTop: 26 }, heroWide: { flexDirection: 'row', alignItems: 'center', gap: 64, paddingTop: 48 },
  portraitWrap: { width: '100%', maxWidth: 420, aspectRatio: 0.84, borderRadius: radii.xl, backgroundColor: colors.surfaceRaised, position: 'relative', alignSelf: 'flex-start' }, portrait: { width: '100%', height: '100%', borderRadius: radii.xl }, portraitFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', borderRadius: radii.xl, backgroundColor: '#EEE9E0' }, initials: { color: colors.text, fontFamily: typography.serif, fontSize: 72 }, portraitAccent: { position: 'absolute', right: -10, bottom: -10, width: 70, height: 70, borderRadius: 35, backgroundColor: colors.brand, zIndex: -1 },
  heroCopy: { flex: 1, maxWidth: 620 }, eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 10, letterSpacing: 2.2 }, name: { color: colors.text, fontFamily: typography.display, fontSize: 46, lineHeight: 50, letterSpacing: -2, marginTop: 14 }, title: { color: colors.textSecondary, fontFamily: typography.serif, fontSize: 21, marginTop: 10 }, specialties: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, lineHeight: 20, marginTop: 24 }, bio: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 15, lineHeight: 25, marginTop: 20 }, links: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  gallerySection: { gap: 24 }, galleryHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 }, galleryEyebrow: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.8 }, galleryTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, letterSpacing: -1, marginTop: 5 }, galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 }, galleryItem: { width: '48%', minWidth: 260, flexGrow: 1, aspectRatio: 1, borderRadius: radii.lg, overflow: 'hidden', backgroundColor: colors.surfaceRaised, ...atmosphericShadow }, galleryItemFeatured: { aspectRatio: 1.2 }, galleryImage: { width: '100%', height: '100%' }, galleryCaption: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: 'rgba(10,10,10,0.72)' }, galleryCaptionText: { color: colors.white, fontFamily: typography.bodyStrong, fontSize: 11, lineHeight: 16 },
  privacyNote: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface }, privacyText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 19 },
});
