import React, { useMemo } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { ArrowRight, ArrowUpRight, Copy, Link2, Store } from 'lucide-react-native';
import { buildEstablishmentTheme } from '@cutsync/brand';
import { EstablishmentMedia } from '../ui/EstablishmentMedia';
import { accentText, logoRing, primaryButton } from '../../theme/establishment-styles';
import { initialsOf } from '../../theme/color';
import { colors, radii, typography } from '../../theme/tokens';

export interface EstablishmentBrandPreviewProps {
  name: string;
  slogan: string;
  address: string;
  phone: string;
  slug: string;
  logoUrl: string | null;
  bannerUrl: string;
  primaryColor: string;
  onCopyLink: () => void;
}

export const EstablishmentBrandPreview = ({
  name,
  slogan,
  address,
  phone,
  slug,
  logoUrl,
  bannerUrl,
  primaryColor,
  onCopyLink,
}: EstablishmentBrandPreviewProps) => {
  const theme = useMemo(() => buildEstablishmentTheme(primaryColor), [primaryColor]);
  const displayName = name || 'Sua barbearia';

  return (
    <View testID="settings-brand-preview" style={styles.root}>
      <View testID="settings-public-profile-preview" style={styles.profileCard}>
        <View testID="settings-preview-accent" style={[styles.previewAccent, { backgroundColor: theme.primary }]} />
        <Text testID="settings-preview-eyebrow" style={[styles.previewEyebrow, accentText(theme)]}>
          PERFIL PÚBLICO
        </Text>

        <View style={styles.bannerWrap}>
          <EstablishmentMedia
            name={displayName}
            uri={bannerUrl || null}
            color={theme.primary}
            category="Prévia do perfil"
            style={styles.banner}
          />
        </View>

        <View style={[styles.previewLogo, logoRing(theme)]}>
          {logoUrl ? (
            <Image source={{ uri: logoUrl }} style={styles.previewLogoImage} />
          ) : (
            <Text style={[styles.logoInitials, accentText(theme)]}>{initialsOf(displayName)}</Text>
          )}
        </View>

        <Text testID="settings-preview-name" style={styles.previewName}>{displayName}</Text>
        {!!slogan && (
          <Text testID="settings-preview-slogan" style={[styles.previewSlogan, accentText(theme)]}>
            “{slogan}”
          </Text>
        )}
        <Text testID="settings-preview-address" style={styles.previewMeta}>
          {address || 'Adicione seu endereço'}
        </Text>
        <Text testID="settings-preview-phone" style={styles.previewMeta}>
          {phone || 'Adicione seu telefone'}
        </Text>

        <View style={[styles.bookingCta, { borderColor: theme.muted }]}>
          <Text style={[styles.bookingEyebrow, accentText(theme)]}>Pronto para o próximo corte?</Text>
          <View style={[styles.bookingButton, primaryButton(theme)]}>
            <Text style={[styles.bookingButtonText, { color: theme.onPrimary }]}>Agendar agora</Text>
            <ArrowRight color={theme.onPrimary} size={14} strokeWidth={2} />
          </View>
        </View>

        <View style={[styles.linkBox, { backgroundColor: theme.soft, borderColor: theme.muted }]}>
          <Link2 color={theme.primary} size={15} />
          <Text testID="settings-public-link" numberOfLines={1} style={[styles.linkText, accentText(theme)]}>
            cutsync.com/salon/{slug || 'sua-barbearia'}
          </Text>
          <Pressable
            testID="settings-copy-public-link-button"
            onPress={onCopyLink}
            style={({ pressed }) => [styles.copyButton, primaryButton(theme), pressed && styles.pressed]}
          >
            <Copy color={theme.onPrimary} size={14} />
          </Pressable>
        </View>
      </View>

      <View testID="settings-explore-card-preview" style={styles.exploreCard}>
        <Text style={styles.exploreEyebrow}>VITRINE EXPLORE</Text>
        <View style={styles.exploreVisual}>
          <EstablishmentMedia
            name={displayName}
            uri={bannerUrl || null}
            color={theme.primary}
            category="Prévia da vitrine"
            style={styles.exploreBanner}
          />
          <View style={[styles.exploreLine, { backgroundColor: theme.muted }]} />
        </View>
        <View style={styles.exploreBody}>
          <Text numberOfLines={1} style={styles.exploreName}>{displayName}</Text>
          <Text numberOfLines={1} style={styles.exploreMeta}>{address || 'Endereço ainda não informado'}</Text>
          <View style={styles.exploreFooter}>
            <Text testID="settings-explore-card-cta" style={[styles.exploreCta, accentText(theme)]}>
              {slug ? 'Agendar' : 'Ver perfil'}
            </Text>
            <View style={[styles.exploreArrow, primaryButton(theme)]}>
              <ArrowUpRight color={theme.onPrimary} size={14} strokeWidth={1.8} />
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { gap: 16 },
  profileCard: {
    position: 'relative',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    padding: 20,
    overflow: 'hidden',
  },
  previewAccent: { position: 'absolute', top: 0, left: 0, right: 0, height: 3 },
  previewEyebrow: {
    alignSelf: 'flex-start',
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    letterSpacing: 1.4,
    marginTop: 4,
  },
  bannerWrap: {
    width: '100%',
    marginTop: 14,
    borderRadius: radii.md,
    overflow: 'hidden',
  },
  banner: { width: '100%', height: 88 },
  previewLogo: {
    width: 64,
    height: 64,
    borderRadius: radii.xl,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -28,
    overflow: 'hidden',
  },
  previewLogoImage: { width: '100%', height: '100%' },
  logoInitials: { fontFamily: typography.display, fontSize: 20 },
  previewName: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 20,
    letterSpacing: -0.6,
    marginTop: 12,
    textAlign: 'center',
  },
  previewSlogan: {
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
  },
  previewMeta: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    marginTop: 5,
    textAlign: 'center',
  },
  bookingCta: {
    width: '100%',
    marginTop: 18,
    paddingTop: 14,
    borderTopWidth: 1,
    gap: 8,
  },
  bookingEyebrow: {
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    letterSpacing: 0.4,
  },
  bookingButton: {
    minHeight: 44,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 16,
  },
  bookingButtonText: { fontFamily: typography.bodyStrong, fontSize: 13 },
  linkBox: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 9,
    marginTop: 14,
  },
  linkText: { flex: 1, fontFamily: typography.bodyStrong, fontSize: 11 },
  copyButton: {
    width: 30,
    height: 30,
    borderRadius: radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  exploreCard: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  exploreEyebrow: {
    color: colors.labelSoft,
    fontFamily: typography.bodyStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  exploreVisual: { position: 'relative', marginTop: 8 },
  exploreBanner: { width: '100%', height: 72 },
  exploreLine: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2 },
  exploreBody: { padding: 14, gap: 4 },
  exploreName: { color: colors.text, fontFamily: typography.display, fontSize: 15 },
  exploreMeta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  exploreFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    paddingTop: 12,
    marginTop: 8,
  },
  exploreCta: { flex: 1, fontFamily: typography.bodyStrong, fontSize: 12 },
  exploreArrow: {
    width: 36,
    height: 36,
    borderRadius: radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  pressed: { opacity: 0.7 },
});
