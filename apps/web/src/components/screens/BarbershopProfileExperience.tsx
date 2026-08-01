import React, { useMemo, useState } from 'react';
import { FlatList, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, Camera, Clock3, MapPin, Phone, Scissors, Star, Store, UsersRound } from 'lucide-react-native';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { ScreenBackground } from '../ui/ScreenBackground';
import { SectionHeading } from '../ui/SectionHeading';
import { EstablishmentMedia } from '../ui/EstablishmentMedia';
import { atmosphericShadow, colors, glassSurface, layout, radii, typography } from '../../theme/tokens';
import { initialsOf, readableForeground } from '../../theme/color';
import { tapLight } from '../../utils/haptics';
import {
  formatDisplayName,
  formatEstablishmentDisplayName,
  getOpeningStatus,
  normalizeInstagramHandle,
} from '@cutsync/domain';

function BarbershopProfileSkeleton() {
  return (
    <ScreenBackground testID="barbershop-profile-skeleton" style={{ backgroundColor: colors.canvas }}>
      <View style={[styles.topbar, { opacity: 0.6 }]}>
        <View style={[styles.backButton, { backgroundColor: colors.surfaceRaised, borderWidth: 0 }]} />
        <View style={{ width: 140, height: 18, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
      </View>
      <ScrollView contentContainerStyle={styles.scroll} scrollEnabled={false}>
        <View style={[styles.heroContainer, { backgroundColor: colors.surfaceRaised }]} />
        <View style={styles.heroCopy}>
          <View style={styles.brandContainer}>
            <View style={[styles.logoCircle, { backgroundColor: colors.surfaceRaised }]} />
            <View style={[styles.titleInfo, { gap: 8 }]}>
              <View style={{ width: 220, height: 26, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
              <View style={{ width: 150, height: 14, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
              <View style={{ width: '100%', height: 40, backgroundColor: colors.surfaceRaised, borderRadius: 6, marginTop: 4 }} />
            </View>
          </View>
        </View>
        <View style={styles.infoGrid}>
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised }]} />
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised }]} />
          <View style={[styles.infoItem, { height: 60, backgroundColor: colors.surfaceRaised }]} />
        </View>
        <View style={styles.section}>
          <View style={{ width: 100, height: 20, backgroundColor: colors.surfaceRaised, borderRadius: 4 }} />
          <View style={styles.cardsGrid}>
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised }]} />
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised }]} />
            <View style={[styles.serviceCard, { height: 120, backgroundColor: colors.surfaceRaised }]} />
          </View>
        </View>
      </ScrollView>
    </ScreenBackground>
  );
}

export const BarbershopProfileExperience = () => {
  const { barbershopId } = useLocalSearchParams<{ barbershopId: string }>();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const router = useRouter();
  const { establishment: barbershop, loading } = useEstablishment(barbershopId);
  const { services } = useServices(barbershopId, true);
  const { team: barbers } = usePublicTeam(barbershopId);
  const [mapLoaded, setMapLoaded] = useState(false);

  const galleryPhotos = useMemo(() => {
    if (!barbershop?.galleryUrls) return [];
    try {
      const parsed = JSON.parse(barbershop.galleryUrls);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return String(barbershop.galleryUrls).split(',').map(s => s.trim()).filter(Boolean);
    }
  }, [barbershop?.galleryUrls]);

  const goBack = () => router.canGoBack() ? router.back() : router.replace('/(client)');
  
  const currency = (value: number) => {
    return new Intl.NumberFormat('pt-BR', { 
      style: 'currency', 
      currency: barbershop?.currency || 'BRL' 
    }).format(value);
  };

  // Cálculo de Status em Tempo Real
  const statusInfo = useMemo(() => getOpeningStatus(barbershop?.openingHours, barbershop?.timezone), [barbershop?.openingHours, barbershop?.timezone]);

  if (loading) {
    return <BarbershopProfileSkeleton />;
  }

  if (!barbershop) {
    return (
      <ScreenBackground testID="barbershop-profile-not-found" style={styles.center}>
        <EmptyState 
          testID="barbershop-profile-error" 
          title="Estabelecimento não encontrado" 
          description="Este perfil pode ter sido removido ou o endereço está incorreto." 
          icon={<Store color={colors.textSecondary} size={22} strokeWidth={1.6} />} 
          action={<AppButton label="Voltar" testID="barbershop-profile-error-back-button" onPress={goBack} />} 
        />
      </ScreenBackground>
    );
  }

  const accent = barbershop.primaryColor || colors.accent;
  const accentFg = readableForeground(accent);
  const displayName = formatEstablishmentDisplayName(barbershop.name, barbershop.slug);
  const instagramHandle = normalizeInstagramHandle(barbershop.instagram);
  const goBooking = (options?: { professionalId?: string; serviceId?: string }) => {
    tapLight();
    const params = new URLSearchParams({ barbershopId: String(barbershopId) });
    if (options?.professionalId) params.set('professionalId', options.professionalId);
    if (options?.serviceId) params.set('serviceId', options.serviceId);
    router.push(`/(client)/booking?${params.toString()}`);
  };
  const openProfessional = (professional: (typeof barbers)[number]) => {
    tapLight();
    if (professional.profileSlug) {
      router.push(`/profile/${professional.profileSlug}`);
      return;
    }
    goBooking({ professionalId: professional.id });
  };

  return (
    <ScreenBackground testID="barbershop-profile-screen">
      <View style={styles.topbar}>
        <Pressable testID="barbershop-profile-back-button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressedScale]}>
          <ArrowLeft color={colors.text} size={18} strokeWidth={1.8} />
        </Pressable>
        <Text testID="barbershop-profile-topbar-title" numberOfLines={1} style={styles.topbarTitle}>
          {displayName}
        </Text>
        {!!statusInfo.text && (
          <View style={styles.topbarStatus}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.isOpen ? colors.success : colors.danger }]} />
            <Text style={[styles.topbarStatusText, { color: statusInfo.isOpen ? colors.success : colors.danger }]}>{statusInfo.isOpen ? 'Aberto' : 'Fechado'}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Mídia real ou fallback institucional, sem imagem genérica externa. */}
        <View style={styles.heroContainer}>
          <EstablishmentMedia
            testID="barbershop-profile-banner"
            name={displayName}
            uri={barbershop.bannerUrl}
            color={accent}
            category="Perfil do estabelecimento"
            style={styles.bannerImage}
          />
          <LinearGradient
            colors={['rgba(245,245,242,0)', 'rgba(245,245,242,0.2)', colors.canvas]}
            locations={[0, 0.62, 1]}
            style={styles.bannerFade}
            pointerEvents="none"
          />
        </View>

        {/* Informações Principais */}
        <View style={[styles.heroCopy, isWide && styles.heroCopyWide]}>
          <View style={styles.brandContainer}>
            <View style={styles.logoCircle}>
              {barbershop.logoUrl ? (
                <Image testID="barbershop-profile-logo" source={{ uri: barbershop.logoUrl }} style={styles.logoImage} />
              ) : (
                <Text style={styles.logoLetter}>{initialsOf(displayName)}</Text>
              )}
            </View>
            <View style={styles.titleInfo}>
              <View style={styles.titleRow}>
                <Text testID="barbershop-profile-name" style={styles.title}>{displayName}</Text>
                {!!instagramHandle && (
                  <Pressable 
                    onPress={() => Linking.openURL(`https://instagram.com/${instagramHandle}`)}
                    style={({ pressed }) => [styles.instagramBadge, pressed && styles.pressedScale]}
                  >
                    <Camera color={colors.textSecondary} size={12} strokeWidth={1.8} />
                    <Text style={styles.instagramBadgeText}>@{instagramHandle}</Text>
                  </Pressable>
                )}
              </View>
              {!!barbershop.slogan && <Text style={styles.slogan}>“{barbershop.slogan}”</Text>}
              <Text testID="barbershop-profile-rating" style={styles.ratingLine}>
                {barbershop.averageRating
                  ? `★ ${barbershop.averageRating.toFixed(1)}${barbershop.reviewCount ? ` · ${barbershop.reviewCount} avaliações` : ''}`
                  : '★ Novo no CutSync'}
              </Text>
              {!!barbershop.description && (
                <Text testID="barbershop-profile-description" style={styles.description}>
                  {barbershop.description}
                </Text>
              )}
            </View>
          </View>
        </View>

        {/* Informações Rápidas */}
        <View style={styles.infoGrid}>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Clock3 color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Funcionamento</Text>
              <View style={styles.statusRow}>
                <View style={[styles.statusDot, { backgroundColor: statusInfo.isOpen ? colors.success : colors.danger }]} />
                <Text style={[styles.statusLabelText, { color: statusInfo.isOpen ? colors.success : colors.danger }]}>
                  {statusInfo.isOpen ? 'Aberto' : 'Fechado'}
                </Text>
                {!!statusInfo.text && (
                  <Text style={styles.infoValue}>· {statusInfo.text}</Text>
                )}
              </View>
            </View>
          </View>
          {!!barbershop.phone && (
            <View style={styles.infoItem}>
              <View style={styles.infoIcon}><Phone color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
              <View style={styles.infoCopyText}>
                <Text style={styles.infoLabel}>Contato</Text>
                <Text style={styles.infoValue}>{barbershop.phone}</Text>
              </View>
            </View>
          )}
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Star color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Avaliação</Text>
              <Text style={styles.infoValue}>
                {barbershop.averageRating
                  ? `${barbershop.averageRating.toFixed(1)} · ${barbershop.reviewCount || 0} reviews`
                  : 'Ainda sem avaliações'}
              </Text>
            </View>
          </View>
        </View>

        {/* Mapa Estético Integrado */}
        {!!barbershop.address && (
          <View style={styles.mapCard}>
            <View style={{ flex: 1, height: 180 }}>
              {mapLoaded && Platform.OS === 'web' ? (
                React.createElement('iframe', {
                  src: `https://maps.google.com/maps?q=${encodeURIComponent(barbershop.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`,
                  width: '100%',
                  height: '100%',
                  style: { border: 0 },
                  loading: 'lazy',
                  title: 'Mapa do Estabelecimento'
                })
              ) : mapLoaded ? (
                <Image 
                  source={{ uri: 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=600' }} 
                  style={styles.mapThumbnail} 
                  resizeMode="cover"
                />
              ) : (
                <View style={styles.mapPlaceholder}>
                  <MapPin color={colors.brandPrimary} size={26} />
                  <Text style={styles.mapPlaceholderTitle}>Veja a localização no mapa</Text>
                  <Text style={styles.mapPlaceholderText}>{barbershop.address}. O mapa interativo só será conectado após sua escolha.</Text>
                  <AppButton label="Carregar mapa" onPress={() => setMapLoaded(true)} testID="barbershop-profile-load-map-button" variant="secondary" />
                </View>
              )}
            </View>
            <View style={styles.mapInfoBar}>
              <View style={{ flex: 1, marginRight: 12 }}>
                <Text style={styles.mapInfoAddress} numberOfLines={1}>
                  {barbershop.address}
                </Text>
              </View>
              <AppButton 
                testID="barbershop-profile-route-button"
                label="Como chegar" 
                onPress={() => {
                  const address = barbershop.address || '';
                  const url = Platform.select({
                    ios: `maps:0,0?q=${encodeURIComponent(address)}`,
                    android: `geo:0,0?q=${encodeURIComponent(address)}`,
                    default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                  });
                  Linking.openURL(url);
                }}
                variant="secondary"
                style={styles.routeBtn}
                icon={<MapPin color={colors.textSecondary} size={13} strokeWidth={1.6} />}
              />
            </View>
          </View>
        )}

        {/* Serviços */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-services-heading" eyebrow="Catálogo" title="Serviços" description="" />
          {services.length === 0 ? (
            <EmptyState testID="barbershop-services-empty" title="Catálogo" description="O estabelecimento ainda não publicou serviços ativos." icon={<Scissors color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
            <View testID="barbershop-services-grid" style={styles.cardsGrid}>
              {services.map((service) => (
                <Pressable
                  key={service.id}
                  testID={`barbershop-service-${service.id}`}
                  accessibilityRole="button"
                  accessibilityLabel={`Agendar ${service.name}`}
                  onPress={() => goBooking({ serviceId: service.id })}
                  style={({ pressed }) => [styles.serviceCard, pressed && styles.pressedScale]}
                >
                  <View style={styles.cardIcon}>
                    <Scissors color={colors.textSecondary} size={14} strokeWidth={1.6} />
                  </View>
                  <View style={styles.serviceCopy}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                  </View>
                  <Text style={styles.servicePrice}>{currency(service.price)}</Text>
                  <Text style={styles.serviceBookHint}>Reservar</Text>
                </Pressable>
              ))}
            </View>
          )}
        </View>

        {/* Equipe (LGPD Safe) */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-team-heading" eyebrow="Profissionais" title="Nossa equipe" description="" />
          {barbers.length === 0 ? (
            <EmptyState testID="barbershop-team-empty" title="Nossa equipe" description="Os profissionais aparecerão aqui em breve." icon={<UsersRound color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
            <FlatList
              data={barbers}
              keyExtractor={(barber) => barber.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12, paddingVertical: 4 }}
              renderItem={({ item }) => {
                const professionalName = formatDisplayName(item.name);
                const professionalInstagram = normalizeInstagramHandle(item.instagram);
                return (
                  <Pressable
                    testID={`barbershop-professional-${item.id}`}
                    accessibilityRole="button"
                    accessibilityLabel={
                      item.profileSlug
                        ? `Ver perfil de ${professionalName}`
                        : `Agendar com ${professionalName}`
                    }
                    onPress={() => openProfessional(item)}
                    style={({ pressed }) => [styles.professionalCard, pressed && styles.pressedScale]}
                  >
                    <View style={styles.avatarCircleSmall}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                      ) : (
                        <Text style={styles.avatarInitials}>{initialsOf(professionalName)}</Text>
                      )}
                    </View>
                    <Text style={styles.professionalName}>{professionalName}</Text>
                    <Text style={styles.professionalRole}>{item.tituloProfissional || 'Especialista'}</Text>
                    {!!item.specialties && <Text numberOfLines={2} style={styles.professionalSpecialties}>{item.specialties}</Text>}
                    <Text style={styles.barberInstaText}>
                      {item.profileSlug ? 'Ver perfil →' : 'Agendar →'}
                    </Text>
                    {!item.profileSlug && !!professionalInstagram && (
                      <View style={styles.barberInstaBtn}>
                        <Camera color={colors.textMuted} size={11} strokeWidth={1.6} />
                        <Text style={styles.barberInstaText}>@{professionalInstagram}</Text>
                      </View>
                    )}
                  </Pressable>
                );
              }}
            />
          )}
        </View>

        {/* Galerias vazias não ocupam espaço na jornada do cliente. */}
        {galleryPhotos.length > 0 ? (
          <View style={styles.section}>
            <SectionHeading testID="barbershop-gallery-heading" eyebrow="Galeria" title="Inspirações & cortes" description="" />
            <FlatList
              data={galleryPhotos}
              keyExtractor={(url, idx) => `${url}-${idx}`}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 12 }}
              renderItem={({ item }) => (
                <Image source={{ uri: item }} style={styles.galleryImage} />
              )}
            />
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.floatingWrap} pointerEvents="box-none">
        <View testID="barbershop-booking-cta" style={styles.floatingBar}>
          <View style={styles.floatingCopy}>
            <Text style={styles.floatingEyebrow}>Agendar neste lugar</Text>
            <Text numberOfLines={1} style={styles.floatingTitle}>Escolha serviço e horário</Text>
          </View>
          <Pressable
            testID="barbershop-profile-book-button"
            onPress={() => goBooking()}
            style={({ pressed }) => [styles.floatingButton, { backgroundColor: accent }, pressed && styles.pressedScale]}
          >
            <Text style={[styles.floatingButtonText, { color: accentFg }]}>Agendar agora</Text>
            <ArrowRight color={accentFg} size={15} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
};

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  topbar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, borderBottomWidth: hairlineW, borderBottomColor: colors.hairline, zIndex: 3, ...glassSurface },
  backButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.pill },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  topbarStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topbarStatusText: { fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.8 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingBottom: 150 },
  heroContainer: { width: '100%', aspectRatio: 3.8, minHeight: 140, maxHeight: 220, position: 'relative', overflow: 'hidden' },
  bannerImage: { width: '100%', height: '100%' },
  bannerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 48 },
  heroCopy: { paddingHorizontal: 20, marginTop: 14, zIndex: 2 },
  heroCopyWide: { paddingHorizontal: 40 },
  brandContainer: { flexDirection: 'row', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' },
  logoCircle: { width: 72, height: 72, borderRadius: 36, borderWidth: 3, borderColor: colors.surface, backgroundColor: '#FAFAF8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...atmosphericShadow },
  logoImage: { width: '100%', height: '100%' },
  logoLetter: { fontFamily: typography.serif, fontSize: 26, color: '#52525B', letterSpacing: 1 },
  titleInfo: { flex: 1, minWidth: 240, justifyContent: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 26, letterSpacing: -1 },
  slogan: { color: colors.textSecondary, fontFamily: typography.serif, fontSize: 13, marginTop: 5, fontStyle: 'italic' },
  ratingLine: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, marginTop: 8 },
  instagramBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: hairlineW, borderColor: colors.border },
  instagramBadgeText: { fontSize: 11, fontFamily: typography.bodyStrong, color: colors.textSecondary },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 21, marginTop: 8 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, marginTop: 20 },
  infoItem: { flex: 1, minWidth: 180, flexDirection: 'row', gap: 11, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, padding: 15, ...atmosphericShadow },
  infoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderRadius: radii.pill },
  infoCopyText: { flex: 1 },
  infoLabel: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  infoValue: { color: colors.text, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabelText: { fontSize: 11, fontFamily: typography.bodyStrong },
  mapCard: { marginHorizontal: 20, marginTop: 24, borderRadius: radii.xl, borderWidth: hairlineW, borderColor: colors.hairline, overflow: 'hidden', backgroundColor: colors.surface, ...atmosphericShadow },
  mapThumbnail: { width: '100%', height: '100%' },
  mapPlaceholder: { alignItems: 'center', backgroundColor: colors.surfaceMuted, flex: 1, gap: 8, justifyContent: 'center', padding: 20 },
  mapPlaceholderTitle: { color: colors.textPrimary, fontFamily: typography.bodyStrong, fontSize: 14 },
  mapPlaceholderText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, textAlign: 'center' },
  mapInfoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: colors.surface, borderTopWidth: hairlineW, borderTopColor: colors.hairline },
  mapInfoAddress: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  routeBtn: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 12 },
  section: { marginTop: 32, paddingHorizontal: 20, gap: 14 },
  cardsGrid: { borderColor: colors.borderSubtle, borderRadius: radii.lg, borderWidth: 1, overflow: 'hidden' },
  serviceCard: { alignItems: 'center', backgroundColor: colors.surface, borderBottomColor: colors.borderSubtle, borderBottomWidth: hairlineW, flexDirection: 'row', gap: 12, minHeight: 68, paddingHorizontal: 16, paddingVertical: 12 },
  cardIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  serviceCopy: { flex: 1, gap: 2 },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  servicePrice: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  serviceDuration: { color: colors.labelSoft, fontFamily: typography.body, fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.6 },
  serviceBookHint: { color: colors.brandPrimary, fontFamily: typography.bodyStrong, fontSize: 11 },
  professionalCard: { width: 180, alignItems: 'center', gap: 6, padding: 18, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, ...atmosphericShadow },
  avatarCircleSmall: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.canvas },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontFamily: typography.serif, fontSize: 20, color: '#52525B', letterSpacing: 1 },
  professionalName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, textAlign: 'center', marginTop: 6 },
  professionalRole: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  professionalSpecialties: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, textAlign: 'center', marginTop: 2 },
  barberInstaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  barberInstaText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11 },
  galleryImage: { width: 200, height: 260, borderRadius: radii.lg, resizeMode: 'cover' },
  floatingWrap: { position: 'absolute', left: 0, right: 0, bottom: 0, alignItems: 'center', zIndex: 10, paddingHorizontal: 16, paddingBottom: 16, paddingTop: 8 },
  floatingBar: {
    width: '100%',
    maxWidth: layout.contentMax,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderWidth: hairlineW,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    paddingVertical: 13,
    paddingHorizontal: 18,
    ...glassSurface,
    ...Platform.select({
      web: { boxShadow: '0 16px 44px rgba(0,0,0,0.10)' } as any,
      default: { elevation: 9, shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 18, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  floatingCopy: { flex: 1, minWidth: 0 },
  floatingEyebrow: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase' },
  floatingTitle: { color: colors.text, fontFamily: typography.display, fontSize: 13, letterSpacing: -0.3, marginTop: 3 },
  floatingButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 18, borderRadius: radii.pill },
  floatingButtonText: { fontFamily: typography.bodyStrong, fontSize: 12 },
  pressedScale: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
