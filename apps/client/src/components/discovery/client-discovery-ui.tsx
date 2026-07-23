import { sharedBrand } from '@cutsync/brand';
import { Image } from 'expo-image';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  ClientDiscoveryEstablishment,
  ClientDiscoveryProfessional,
} from '@/features/discovery/client-discovery-service';

export const discoveryColors = {
  background: sharedBrand.colors.canvas,
  card: sharedBrand.colors.surface,
  text: sharedBrand.colors.ink,
  secondary: sharedBrand.colors.inkSoft,
  muted: sharedBrand.colors.inkMuted,
  border: sharedBrand.colors.border,
  accent: sharedBrand.colors.forest,
  accentBright: sharedBrand.colors.forestBright,
  accentSoft: sharedBrand.colors.forestSoft,
  amber: sharedBrand.colors.amber,
  amberSoft: sharedBrand.colors.amberSoft,
};

const initialsOf = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'CS';
  return (parts[0][0] + (parts.at(-1)?.[0] ?? '')).toUpperCase();
};

export const formatDiscoveryPrice = (value: number, currency = 'BRL') => {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value);
  } catch {
    return 'R$ ' + value.toFixed(2).replace('.', ',');
  }
};

const StarIcon = ({ size = 11, color }: { size?: number; color: string }) => (
  <Text style={{ color, fontSize: size, lineHeight: size + 2, fontWeight: '900' }}>★</Text>
);

export function DiscoveryPageState({ children }: PropsWithChildren) {
  return <View style={styles.stateCard}>{children}</View>;
}

export function DiscoveryLoading({ label = 'Buscando lugares para você…' }: { label?: string }) {
  return (
    <DiscoveryPageState>
      <ActivityIndicator color={discoveryColors.accent} />
      <Text style={styles.stateTitle}>{label}</Text>
    </DiscoveryPageState>
  );
}

export function DiscoveryMessage({ title, description, actionLabel, onAction, testID }: {
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  testID?: string;
}) {
  return (
    <DiscoveryPageState>
      <View testID={testID} style={styles.messageCopy}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text style={styles.stateDescription}>{description}</Text>
      </View>
      {actionLabel && onAction && (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          style={({ pressed }) => [styles.stateButton, pressed && styles.pressed]}
        >
          <Text style={styles.stateButtonText}>{actionLabel}</Text>
        </Pressable>
      )}
    </DiscoveryPageState>
  );
}

// Featured big card used inside the "Destaques" horizontal carousel (hero-like).
export function FeaturedEstablishmentCard({ establishment, onPress }: {
  establishment: ClientDiscoveryEstablishment;
  onPress: () => void;
}) {
  return (
    <Pressable
      testID={'client-discovery-featured-' + establishment.slug}
      accessibilityRole="button"
      accessibilityLabel={'Abrir ' + establishment.name}
      onPress={onPress}
      style={({ pressed }) => [styles.featuredCard, pressed && styles.cardPressed]}
    >
      {establishment.bannerUrl ? (
        <Image
          accessibilityLabel={'Imagem de ' + establishment.name}
          contentFit="cover"
          source={{ uri: establishment.bannerUrl }}
          style={styles.featuredImage}
          transition={220}
        />
      ) : (
        <View style={[styles.featuredImage, styles.featuredFallback, { backgroundColor: establishment.primaryColor }]}>
          <Text style={styles.featuredInitials}>{initialsOf(establishment.name)}</Text>
        </View>
      )}
      <View style={styles.featuredGradientTop} />
      <View style={styles.featuredGradientBottom} />
      <View style={styles.featuredBadgeRow}>
        {establishment.instantBookingEnabled && (
          <View style={styles.featuredInstantBadge}>
            <Text style={styles.featuredInstantText}>CONFIRMAÇÃO IMEDIATA</Text>
          </View>
        )}
        <View style={styles.featuredRatingBadge}>
          <StarIcon color={discoveryColors.amber} size={11} />
          <Text style={styles.featuredRatingText}>{establishment.averageRating.toFixed(1)}</Text>
        </View>
      </View>
      <View style={styles.featuredCopy}>
        <Text numberOfLines={1} style={styles.featuredTitle}>{establishment.name}</Text>
        {!!establishment.address && (
          <Text numberOfLines={1} style={styles.featuredAddress}>{establishment.address}</Text>
        )}
        <View style={styles.featuredMetaRow}>
          <Text style={styles.featuredMeta}>
            {establishment.serviceCount} {establishment.serviceCount === 1 ? 'serviço' : 'serviços'}
          </Text>
          <View style={styles.featuredMetaDot} />
          <Text style={styles.featuredMeta}>
            {establishment.professionalCount} {establishment.professionalCount === 1 ? 'profissional' : 'profissionais'}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

// Compact horizontal card used in "Próximos" / "Populares" carousels.
export function CompactEstablishmentCard({ establishment, onPress }: {
  establishment: ClientDiscoveryEstablishment;
  onPress: () => void;
}) {
  const services = establishment.serviceNames.slice(0, 2).join(' · ');
  return (
    <Pressable
      testID={'client-discovery-compact-' + establishment.slug}
      accessibilityRole="button"
      accessibilityLabel={'Abrir ' + establishment.name}
      onPress={onPress}
      style={({ pressed }) => [styles.compactCard, pressed && styles.cardPressed]}
    >
      {establishment.bannerUrl ? (
        <Image
          accessibilityLabel={'Imagem de ' + establishment.name}
          contentFit="cover"
          source={{ uri: establishment.bannerUrl }}
          style={styles.compactImage}
          transition={200}
        />
      ) : (
        <View style={[styles.compactImage, styles.compactFallback, { backgroundColor: establishment.primaryColor }]}>
          <Text style={styles.compactInitials}>{initialsOf(establishment.name)}</Text>
        </View>
      )}
      <View style={styles.compactBody}>
        <View style={styles.compactHeadline}>
          <Text numberOfLines={1} style={styles.compactTitle}>{establishment.name}</Text>
          <View style={styles.compactRatingPill}>
            <StarIcon color={discoveryColors.amber} size={9} />
            <Text style={styles.compactRatingText}>{establishment.averageRating.toFixed(1)}</Text>
          </View>
        </View>
        {!!establishment.address && (
          <Text numberOfLines={1} style={styles.compactAddress}>{establishment.address}</Text>
        )}
        {!!services && <Text numberOfLines={1} style={styles.compactServices}>{services}</Text>}
      </View>
    </Pressable>
  );
}

// Category pill used in the horizontal categories row.
export function CategoryChip({ label, active, onPress, testID }: {
  label: string;
  active: boolean;
  onPress: () => void;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.categoryChip,
        active && styles.categoryChipActive,
        pressed && styles.pressed,
      ]}
    >
      <Text style={[styles.categoryChipText, active && styles.categoryChipTextActive]}>{label}</Text>
    </Pressable>
  );
}

// Kept for search-result list on discovery screen (vertical richer card).
export function EstablishmentCard({ establishment, onPress }: {
  establishment: ClientDiscoveryEstablishment;
  onPress: () => void;
}) {
  const services = establishment.serviceNames.join(' · ');
  const professionals = establishment.professionalNames.join(', ');
  return (
    <Pressable
      testID={'client-discovery-card-' + establishment.slug}
      accessibilityRole="button"
      accessibilityLabel={'Abrir ' + establishment.name}
      onPress={onPress}
      style={({ pressed }) => [styles.establishmentCard, pressed && styles.cardPressed]}
    >
      {establishment.bannerUrl ? (
        <Image
          accessibilityLabel={'Imagem de ' + establishment.name}
          contentFit="cover"
          source={{ uri: establishment.bannerUrl }}
          style={styles.banner}
          transition={180}
        />
      ) : (
        <View style={[styles.bannerFallback, { backgroundColor: establishment.primaryColor }]}>
          <Text style={styles.bannerInitials}>{initialsOf(establishment.name)}</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        <View style={styles.cardTopline}>
          <View style={styles.cardTitleCopy}>
            <Text numberOfLines={1} style={styles.cardTitle}>{establishment.name}</Text>
            {!!establishment.address && (
              <Text numberOfLines={2} style={styles.cardAddress}>{establishment.address}</Text>
            )}
          </View>
          <View style={styles.ratingPill}>
            <StarIcon color={discoveryColors.amber} size={11} />
            <Text style={styles.ratingValue}>{establishment.averageRating.toFixed(1)}</Text>
          </View>
        </View>
        {!!services && <Text numberOfLines={1} style={styles.previewText}>{services}</Text>}
        {!!professionals && <Text numberOfLines={1} style={styles.professionalText}>Equipe: {professionals}</Text>}
        <View style={styles.cardFooter}>
          <Text style={styles.cardMeta}>
            {establishment.serviceCount} {establishment.serviceCount === 1 ? 'serviço' : 'serviços'}
            {'  ·  '}
            {establishment.professionalCount} {establishment.professionalCount === 1 ? 'profissional' : 'profissionais'}
          </Text>
          <Text style={styles.openLabel}>Ver detalhes →</Text>
        </View>
      </View>
    </Pressable>
  );
}

export function ProfessionalCard({ professional }: { professional: ClientDiscoveryProfessional }) {
  return (
    <View style={styles.professionalCard}>
      {professional.avatarUrl ? (
        <Image
          accessibilityLabel={'Foto de ' + professional.name}
          contentFit="cover"
          source={{ uri: professional.avatarUrl }}
          style={styles.professionalAvatar}
          transition={180}
        />
      ) : (
        <View style={styles.professionalAvatarFallback}>
          <Text style={styles.professionalInitials}>{initialsOf(professional.name)}</Text>
        </View>
      )}
      <View style={styles.professionalCopy}>
        <Text style={styles.professionalName}>{professional.name}</Text>
        {!!professional.title && <Text style={styles.professionalTitle}>{professional.title}</Text>}
        {!!professional.specialties && (
          <Text numberOfLines={2} style={styles.professionalSpecialties}>{professional.specialties}</Text>
        )}
      </View>
    </View>
  );
}

// Compact card size constants (also exported for the carousel snapping intervals).
export const COMPACT_CARD_WIDTH = 262;
export const FEATURED_CARD_WIDTH = 296;

const styles = StyleSheet.create({
  stateCard: {
    alignItems: 'center',
    gap: 14,
    backgroundColor: discoveryColors.card,
    borderRadius: 26,
    borderCurve: 'continuous',
    paddingHorizontal: 22,
    paddingVertical: 34,
    boxShadow: '0 10px 28px rgba(20, 27, 23, 0.05)',
  },
  messageCopy: { alignItems: 'center', gap: 7 },
  stateTitle: { color: discoveryColors.text, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  stateDescription: { color: discoveryColors.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  stateButton: { minHeight: 46, justifyContent: 'center', borderRadius: 999, backgroundColor: discoveryColors.accent, paddingHorizontal: 22 },
  stateButtonText: { color: '#FFFFFF', fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },

  // Featured (hero) card
  featuredCard: {
    width: FEATURED_CARD_WIDTH,
    height: 380,
    overflow: 'hidden',
    borderRadius: 28,
    borderCurve: 'continuous',
    backgroundColor: '#1D2620',
    position: 'relative',
    boxShadow: '0 18px 36px rgba(20, 27, 23, 0.14)',
  },
  featuredImage: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: '#1D2620' },
  featuredFallback: { alignItems: 'center', justifyContent: 'center' },
  featuredInitials: { color: '#FFFFFF', fontSize: 56, fontWeight: '900', letterSpacing: 1.2, opacity: 0.72 },
  featuredGradientTop: { position: 'absolute', top: 0, left: 0, right: 0, height: 110, backgroundColor: 'rgba(20, 27, 23, 0.42)' },
  featuredGradientBottom: { position: 'absolute', bottom: 0, left: 0, right: 0, height: 210, backgroundColor: 'rgba(20, 27, 23, 0.7)' },
  featuredBadgeRow: { position: 'absolute', top: 16, left: 16, right: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  featuredInstantBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.92)' },
  featuredInstantText: { color: discoveryColors.accent, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  featuredRatingBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, backgroundColor: 'rgba(20, 27, 23, 0.62)' },
  featuredRatingText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  featuredCopy: { position: 'absolute', left: 20, right: 20, bottom: 20, gap: 6 },
  featuredTitle: { color: '#FFFFFF', fontSize: 24, lineHeight: 28, fontWeight: '800', letterSpacing: -0.5 },
  featuredAddress: { color: 'rgba(255, 255, 255, 0.86)', fontSize: 12, lineHeight: 18 },
  featuredMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 },
  featuredMeta: { color: 'rgba(255, 255, 255, 0.82)', fontSize: 11, fontWeight: '600' },
  featuredMetaDot: { width: 3, height: 3, borderRadius: 999, backgroundColor: 'rgba(255, 255, 255, 0.55)' },

  // Compact horizontal card
  compactCard: {
    width: COMPACT_CARD_WIDTH,
    overflow: 'hidden',
    borderRadius: 22,
    borderCurve: 'continuous',
    backgroundColor: discoveryColors.card,
    boxShadow: '0 10px 22px rgba(20, 27, 23, 0.07)',
  },
  compactImage: { width: '100%', height: 148, backgroundColor: '#E7E1CE' },
  compactFallback: { alignItems: 'center', justifyContent: 'center' },
  compactInitials: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: 1, opacity: 0.75 },
  compactBody: { padding: 14, gap: 6 },
  compactHeadline: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  compactTitle: { flex: 1, color: discoveryColors.text, fontSize: 15, fontWeight: '700', letterSpacing: -0.2 },
  compactRatingPill: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: discoveryColors.amberSoft },
  compactRatingText: { color: discoveryColors.amber, fontSize: 11, fontWeight: '800' },
  compactAddress: { color: discoveryColors.secondary, fontSize: 11, lineHeight: 16 },
  compactServices: { color: discoveryColors.accent, fontSize: 11, fontWeight: '700' },

  // Category chip
  categoryChip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: discoveryColors.border,
    backgroundColor: discoveryColors.card,
    paddingHorizontal: 16,
  },
  categoryChipActive: { borderColor: discoveryColors.accent, backgroundColor: discoveryColors.accent },
  categoryChipText: { color: discoveryColors.text, fontSize: 13, fontWeight: '700', letterSpacing: -0.1 },
  categoryChipTextActive: { color: '#FFFFFF' },

  // Full search-result card (existing pattern, polished)
  establishmentCard: {
    overflow: 'hidden',
    backgroundColor: discoveryColors.card,
    borderRadius: 26,
    borderCurve: 'continuous',
    boxShadow: '0 12px 28px rgba(20, 27, 23, 0.07)',
  },
  cardPressed: { opacity: 0.85, transform: [{ scale: 0.994 }] },
  banner: { width: '100%', height: 172, backgroundColor: '#E7E1CE' },
  bannerFallback: { width: '100%', height: 172, alignItems: 'center', justifyContent: 'center' },
  bannerInitials: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: 1 },
  cardBody: { gap: 11, padding: 20 },
  cardTopline: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitleCopy: { flex: 1, gap: 5 },
  cardTitle: { color: discoveryColors.text, fontSize: 19, lineHeight: 24, fontWeight: '700', letterSpacing: -0.3 },
  cardAddress: { color: discoveryColors.secondary, fontSize: 12, lineHeight: 18 },
  ratingPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: discoveryColors.amberSoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  ratingValue: { color: discoveryColors.amber, fontSize: 12, fontWeight: '800' },
  previewText: { color: discoveryColors.accent, fontSize: 12, fontWeight: '700' },
  professionalText: { color: discoveryColors.muted, fontSize: 11, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: discoveryColors.border, paddingTop: 13 },
  cardMeta: { flex: 1, color: discoveryColors.muted, fontSize: 10, lineHeight: 16 },
  openLabel: { color: discoveryColors.accent, fontSize: 12, fontWeight: '800' },

  // Professional row
  professionalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  professionalAvatar: { width: 54, height: 54, borderRadius: 20, backgroundColor: '#E7E1CE' },
  professionalAvatarFallback: { width: 54, height: 54, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: discoveryColors.accent },
  professionalInitials: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  professionalCopy: { flex: 1, gap: 3 },
  professionalName: { color: discoveryColors.text, fontSize: 15, fontWeight: '700' },
  professionalTitle: { color: discoveryColors.accent, fontSize: 12, fontWeight: '700' },
  professionalSpecialties: { color: discoveryColors.secondary, fontSize: 11, lineHeight: 16 },

  pressed: { opacity: 0.65 },
});
