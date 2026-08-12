import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { ExternalLink, Link2, ShieldCheck, Sparkles, UserRound } from 'lucide-react-native';
import { ProfessionalGalleryItem, ProfessionalPublicProfile } from '@cutsync/database';
import { EstablishmentTheme } from '@cutsync/brand';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { atmosphericShadow, colors, layout, radii, typography } from '../../theme/tokens';
import { initialsOf } from '../../theme/color';
import {
  accentText,
  avatarRing,
  iconSoftBackground,
  primaryButton,
} from '../../theme/establishment-styles';

export interface ServiceItemProp {
  id: string;
  name: string;
  durationMinutes: number;
  price: number;
}

export interface ProfessionalProfileContentProps {
  profile: ProfessionalPublicProfile;
  services?: ServiceItemProp[];
  onBook?: () => void;
  onOpenLink?: (url: string) => void;
  theme?: EstablishmentTheme;
  showPrivacyNote?: boolean;
  testIDPrefix?: string;
  contextLabel?: string;
}

export const ProfessionalProfileContent: React.FC<ProfessionalProfileContentProps> = ({
  profile,
  services,
  onBook,
  onOpenLink,
  theme,
  showPrivacyNote = false,
  testIDPrefix = 'public-professional-profile',
  contextLabel,
}) => {
  const { width } = useWindowDimensions();
  const isWide = width >= 860;

  const handleOpenLink = (url?: string | null) => {
    if (!url) return;
    if (onOpenLink) {
      onOpenLink(url);
    }
  };

  const hasSpecialties = Boolean(profile.specialties && profile.specialties.trim());
  const hasBio = Boolean(profile.bio && profile.bio.trim());
  const hasLinks = Boolean(profile.portfolioUrl || profile.instagramUrl);
  const hasServices = Boolean(services && services.length > 0);

  return (
    <View style={styles.container}>
      {/* Hero Box */}
      <View style={[styles.hero, isWide && styles.heroWide]}>
        <View style={styles.portraitWrap}>
          {profile.avatarUrl ? (
            <Image
              testID={`${testIDPrefix}-avatar`}
              source={{ uri: profile.avatarUrl }}
              style={styles.portrait}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.portraitFallback, theme && iconSoftBackground(theme)]}>
              {profile.name ? (
                <Text style={[styles.initials, theme && accentText(theme)]}>
                  {initialsOf(profile.name)}
                </Text>
              ) : (
                <UserRound size={48} color={theme ? theme.primary : colors.brand} />
              )}
            </View>
          )}
          <View style={[styles.portraitAccent, theme && { backgroundColor: theme.primary }]} />
        </View>

        <View style={styles.heroCopy}>
          <Text testID={`${testIDPrefix}-eyebrow`} style={[styles.eyebrow, theme && accentText(theme)]}>
            {(contextLabel || 'PROFISSIONAL INDEPENDENTE').toUpperCase()}
          </Text>
          <Text testID={`${testIDPrefix}-name`} style={styles.name}>
            {profile.name}
          </Text>
          <Text testID={`${testIDPrefix}-title`} style={styles.title}>
            {profile.tituloProfissional || 'Especialista'}
          </Text>

          {/* Oculta especialidades se vazias */}
          {hasSpecialties && (
            <Text testID={`${testIDPrefix}-specialties`} style={styles.specialties}>
              {profile.specialties}
            </Text>
          )}

          {/* Oculta bio se vazia */}
          {hasBio && (
            <Text testID={`${testIDPrefix}-bio`} style={styles.bio}>
              {profile.bio}
            </Text>
          )}

          {/* Oculta links se não houver portfólio nem instagram */}
          {hasLinks && (
            <View style={styles.links}>
              {!!profile.portfolioUrl && (
                <AppButton
                  testID={`${testIDPrefix}-portfolio-button`}
                  label="Abrir portfólio"
                  onPress={() => handleOpenLink(profile.portfolioUrl)}
                  icon={<ExternalLink color={colors.ink} size={16} />}
                />
              )}
              {!!profile.instagramUrl && (
                <AppButton
                  testID={`${testIDPrefix}-instagram-button`}
                  label="Ver Instagram"
                  onPress={() => handleOpenLink(profile.instagramUrl)}
                  variant="secondary"
                  icon={<Link2 color={colors.text} size={16} />}
                />
              )}
            </View>
          )}
        </View>
      </View>

      {/* Oculta seção de serviços se indisponível */}
      {hasServices && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>SERVIÇOS PRESTADOS</Text>
          <View style={styles.servicesList}>
            {services!.map((srv) => (
              <View key={srv.id} style={styles.serviceRow}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={styles.serviceName}>• {srv.name}</Text>
                  <Text style={styles.serviceDuration}>{srv.durationMinutes} min</Text>
                </View>
                <Text style={[styles.servicePrice, theme && accentText(theme)]}>
                  R$ {Number(srv.price).toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Galeria de Trabalhos */}
      <View style={styles.gallerySection}>
        <View style={styles.galleryHeading}>
          <Sparkles color={theme ? theme.primary : colors.brand} size={18} />
          <View>
            <Text style={styles.galleryEyebrow}>TRABALHOS SELECIONADOS</Text>
            <Text testID={`${testIDPrefix}-gallery-title`} style={styles.galleryTitle}>
              Galeria profissional
            </Text>
          </View>
        </View>

        {profile.gallery.length === 0 ? (
          <EmptyState
            testID={`${testIDPrefix}-gallery-empty`}
            title="Galeria em construção"
            description="O profissional ainda não publicou trabalhos neste perfil."
          />
        ) : (
          <View testID={`${testIDPrefix}-gallery`} style={styles.galleryGrid}>
            {profile.gallery.map((item: ProfessionalGalleryItem, index: number) => (
              <View
                key={`${item.url}-${index}`}
                testID={`${testIDPrefix}-gallery-item-${index}`}
                style={[styles.galleryItem, index % 3 === 0 && styles.galleryItemFeatured]}
              >
                <Image
                  accessibilityLabel={item.alt}
                  source={{ uri: item.url }}
                  style={styles.galleryImage}
                  resizeMode="cover"
                />
                {!!item.alt && (
                  <View style={styles.galleryCaption}>
                    <Text style={styles.galleryCaptionText}>{item.alt}</Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        )}
      </View>

      {/* Botão opcional de agendamento (CTA) */}
      {!!onBook && (
        <View style={styles.ctaWrap}>
          <AppButton
            testID={`${testIDPrefix}-book-button`}
            label={`Agendar com ${profile.name.split(' ')[0]}`}
            style={[styles.ctaButton, theme && primaryButton(theme)]}
            onPress={onBook}
          />
        </View>
      )}

      {/* Nota opcional de privacidade */}
      {showPrivacyNote && (
        <View testID={`${testIDPrefix}-privacy-note`} style={styles.privacyNote}>
          <ShieldCheck color={colors.success} size={19} />
          <Text style={styles.privacyText}>
            Este perfil publica somente conteúdo escolhido pelo profissional. E-mail, telefone, agenda e vínculos permanecem privados.
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { width: '100%', gap: 48 },
  hero: { gap: 30, paddingTop: 26 },
  heroWide: { flexDirection: 'row', alignItems: 'center', gap: 64, paddingTop: 48 },
  portraitWrap: {
    width: '100%',
    maxWidth: 420,
    aspectRatio: 0.84,
    borderRadius: radii.xl,
    backgroundColor: colors.surfaceRaised,
    position: 'relative',
    alignSelf: 'flex-start',
  },
  portrait: { width: '100%', height: '100%', borderRadius: radii.xl },
  portraitFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.xl,
    backgroundColor: '#EEE9E0',
  },
  initials: { color: colors.text, fontFamily: typography.serif, fontSize: 72 },
  portraitAccent: {
    position: 'absolute',
    right: -10,
    bottom: -10,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: colors.brand,
    zIndex: -1,
  },
  heroCopy: { flex: 1, maxWidth: 620 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 2.2 },
  name: { color: colors.text, fontFamily: typography.display, fontSize: 46, lineHeight: 50, letterSpacing: -2, marginTop: 14 },
  title: { color: colors.textSecondary, fontFamily: typography.serif, fontSize: 21, marginTop: 10 },
  specialties: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, lineHeight: 20, marginTop: 24 },
  bio: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 15, lineHeight: 25, marginTop: 20 },
  links: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 28 },
  section: { gap: 16 },
  sectionTitle: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.8 },
  servicesList: { gap: 12 },
  serviceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  serviceDuration: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12 },
  servicePrice: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 14 },
  gallerySection: { gap: 24 },
  galleryHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  galleryEyebrow: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.8 },
  galleryTitle: { color: colors.text, fontFamily: typography.display, fontSize: 28, letterSpacing: -1, marginTop: 5 },
  galleryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  galleryItem: {
    width: '48%',
    minWidth: 260,
    flexGrow: 1,
    aspectRatio: 1,
    borderRadius: radii.lg,
    overflow: 'hidden',
    backgroundColor: colors.surfaceRaised,
    ...atmosphericShadow,
  },
  galleryItemFeatured: { aspectRatio: 1.2 },
  galleryImage: { width: '100%', height: '100%' },
  galleryCaption: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 16,
    backgroundColor: 'rgba(10,10,10,0.72)',
  },
  galleryCaptionText: { color: colors.white, fontFamily: typography.bodyStrong, fontSize: 11, lineHeight: 16 },
  ctaWrap: { paddingTop: 16 },
  ctaButton: { minHeight: 52, borderRadius: radii.pill },
  privacyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 20,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  privacyText: { flex: 1, color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 19 },
});
