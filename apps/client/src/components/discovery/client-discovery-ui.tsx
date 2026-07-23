import { sharedBrand } from '@cutsync/brand';
import { Image } from 'expo-image';
import type { PropsWithChildren } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import type {
  ClientDiscoveryEstablishment,
  ClientDiscoveryProfessional,
} from '@/features/discovery/client-discovery-service';

export const discoveryColors = {
  background: '#F4F1E8',
  card: '#FFFFFF',
  text: sharedBrand.colors.forestDark,
  secondary: '#667068',
  muted: '#8A8578',
  border: '#E5DFD1',
  accentSoft: '#E4EADF',
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

export function DiscoveryPageState({ children }: PropsWithChildren) {
  return <View style={styles.stateCard}>{children}</View>;
}

export function DiscoveryLoading({ label = 'Buscando lugares para você…' }: { label?: string }) {
  return (
    <DiscoveryPageState>
      <ActivityIndicator color={sharedBrand.colors.forest} />
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
            <Text style={styles.ratingValue}>{establishment.averageRating.toFixed(1)}</Text>
            <Text style={styles.ratingCount}>{establishment.reviewCount} avaliações</Text>
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
          <Text style={styles.openLabel}>Ver detalhes</Text>
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

const styles = StyleSheet.create({
  stateCard: {
    alignItems: 'center',
    gap: 14,
    backgroundColor: discoveryColors.card,
    borderRadius: 24,
    borderCurve: 'continuous',
    paddingHorizontal: 22,
    paddingVertical: 32,
  },
  messageCopy: { alignItems: 'center', gap: 7 },
  stateTitle: { color: discoveryColors.text, fontSize: 16, lineHeight: 22, fontWeight: '700', textAlign: 'center' },
  stateDescription: { color: discoveryColors.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
  stateButton: { minHeight: 46, justifyContent: 'center', borderRadius: 14, backgroundColor: sharedBrand.colors.forest, paddingHorizontal: 20 },
  stateButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
  establishmentCard: {
    overflow: 'hidden',
    backgroundColor: discoveryColors.card,
    borderRadius: 26,
    borderCurve: 'continuous',
    boxShadow: '0 10px 28px rgba(44, 67, 52, 0.08)',
  },
  cardPressed: { opacity: 0.76, transform: [{ scale: 0.995 }] },
  banner: { width: '100%', height: 148, backgroundColor: '#D9DDCF' },
  bannerFallback: { width: '100%', height: 148, alignItems: 'center', justifyContent: 'center' },
  bannerInitials: { color: '#FFFFFF', fontSize: 34, fontWeight: '800', letterSpacing: 1 },
  cardBody: { gap: 11, padding: 18 },
  cardTopline: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  cardTitleCopy: { flex: 1, gap: 5 },
  cardTitle: { color: discoveryColors.text, fontSize: 19, lineHeight: 24, fontWeight: '700' },
  cardAddress: { color: discoveryColors.secondary, fontSize: 12, lineHeight: 18 },
  ratingPill: { alignItems: 'flex-end', gap: 2, backgroundColor: discoveryColors.accentSoft, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 7 },
  ratingValue: { color: sharedBrand.colors.forest, fontSize: 14, fontWeight: '800' },
  ratingCount: { color: '#687267', fontSize: 9 },
  previewText: { color: '#4E5B52', fontSize: 12, fontWeight: '600' },
  professionalText: { color: discoveryColors.muted, fontSize: 11, lineHeight: 17 },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, borderTopWidth: 1, borderTopColor: discoveryColors.border, paddingTop: 13 },
  cardMeta: { flex: 1, color: discoveryColors.muted, fontSize: 10, lineHeight: 16 },
  openLabel: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '800' },
  professionalCard: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13 },
  professionalAvatar: { width: 54, height: 54, borderRadius: 18, backgroundColor: '#D9DDCF' },
  professionalAvatarFallback: { width: 54, height: 54, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: sharedBrand.colors.forest },
  professionalInitials: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
  professionalCopy: { flex: 1, gap: 3 },
  professionalName: { color: discoveryColors.text, fontSize: 15, fontWeight: '700' },
  professionalTitle: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '600' },
  professionalSpecialties: { color: discoveryColors.secondary, fontSize: 11, lineHeight: 16 },
  pressed: { opacity: 0.65 },
});
