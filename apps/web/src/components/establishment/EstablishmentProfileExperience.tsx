import React, { useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, FlatList, Image, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Head from 'expo-router/head';
import { LinearGradient } from 'expo-linear-gradient';
import { ArrowLeft, ArrowRight, Camera, Clock3, Coins, MapPin, Phone, Scissors, Store, UsersRound } from 'lucide-react-native';
import { useEstablishment } from '../../hooks/useEstablishment';
import { useEstablishmentRouteParams } from '../../hooks/use-establishment-route-params';
import { useServices } from '../../hooks/useServices';
import { usePublicTeam } from '../../hooks/usePublicTeam';
import { useEstablishmentServicePrices } from '../../features/services/use-establishment-service-prices';
import { PublicTeamMember } from '@cutsync/database';
import { ProfessionalProfileSheet } from '../professional/ProfessionalProfileSheet';
import { AppButton } from '../ui/AppButton';
import { EmptyState } from '../ui/EmptyState';
import { ScreenBackground } from '../ui/ScreenBackground';
import { SectionHeading } from '../ui/SectionHeading';
import { StatusBadge } from '../ui/StatusBadge';
import { EstablishmentMedia } from '../ui/EstablishmentMedia';
import { EstablishmentThemeProvider, useEstablishmentTheme } from '../../contexts/establishment-theme-context';
import { EstablishmentThemeScope } from '../theme/establishment-theme-scope';
import {
  accentBorderLeft,
  accentText,
  avatarRing,
  iconSoftBackground,
  logoRing,
  outlineSurface,
  primaryButton,
} from '../../theme/establishment-styles';
import { atmosphericShadow, colors, glassSurface, layout, radii, typography } from '../../theme/tokens';
import { getOpeningStatus } from '@cutsync/domain';
import { initialsOf } from '../../theme/color';
import { tapLight } from '../../utils/haptics';

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

export const EstablishmentProfileExperience = () => {
  const { by, identifier, slug } = useEstablishmentRouteParams();
  const { width } = useWindowDimensions();
  const isWide = width >= 900;
  const router = useRouter();

  const { establishment: barbershop, loading } = useEstablishment(identifier, by);
  const { services } = useServices(barbershop?.id, true);
  const { prices: pricedServices } = useEstablishmentServicePrices(barbershop?.id);
  const { team: barbers } = usePublicTeam(barbershop?.id);
  const [mapUrl, setMapUrl] = useState<string | null>(null);
  const [selectedTeamMember, setSelectedTeamMember] = useState<PublicTeamMember | null>(null);

  const showcaseServices = useMemo(() => {
    if (pricedServices.length) {
      return pricedServices.filter((service) => service.isActive);
    }
    return services.map((service) => ({
      serviceId: service.id,
      kind: service.kind,
      name: service.name,
      listPrice: service.price,
      effectivePrice: service.price,
      durationMinutes: service.durationMinutes,
      discountType: null as 'percent' | 'fixed_price' | null,
      discountValue: null as number | null,
      promotionId: null as string | null,
      savings: 0,
      membersTotal: null as number | null,
      isActive: service.isActive,
      sortOrder: service.sortOrder,
    }));
  }, [pricedServices, services]);

  useEffect(() => {
    if (!barbershop?.address) return;
    let active = true;
    fetch(`https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(barbershop.address)}&format=json&limit=1`, {
      headers: { 'User-Agent': 'CutSync-App/1.0' }
    })
      .then(res => res.json())
      .then(data => {
        if (!active || !data || !data[0]) return;
        const { lat, lon } = data[0];
        setMapUrl(`https://staticmap.openstreetmap.de/staticmap.php?center=${lat},${lon}&zoom=16&size=600x200&maptype=mapnik&markers=${lat},${lon},red-pushpin`);
      })
      .catch(() => {});
    return () => { active = false; };
  }, [barbershop?.address]);

  // Parse da galeria personalizada cadastrada pelo dono
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
  
  const currency = (value: number) => new Intl.NumberFormat('pt-BR', { 
    style: 'currency', 
    currency: barbershop?.currency || 'BRL' 
  }).format(value);

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

  const isEligiblePublicProfile = by === 'slug'
    && barbershop.accountStatus === 'active'
    && barbershop.discoveryStatus === 'published';
  const publicSlug = slug || barbershop.slug;
  const configuredSiteUrl = process.env.EXPO_PUBLIC_SITE_URL?.replace(/\/$/, '');
  const canonicalUrl = configuredSiteUrl ? `${configuredSiteUrl}/${publicSlug}` : `/${publicSlug}`;
  const description = (barbershop.description || `Conheça serviços, equipe e horários de ${barbershop.name}.`).slice(0, 160);
  const structuredData = isEligiblePublicProfile ? {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: barbershop.name,
    description,
    url: canonicalUrl,
    ...(barbershop.logoUrl ? { image: barbershop.logoUrl } : {}),
    ...(barbershop.phone ? { telephone: barbershop.phone } : {}),
    ...(barbershop.address ? { address: barbershop.address } : {}),
  } : null;

  return (
    <>
      <Head>
        <title>{barbershop.name} — serviços e horários | CutSync</title>
        <meta name="description" content={description} />
        <meta name="robots" content={isEligiblePublicProfile ? 'index,follow' : 'noindex,nofollow'} />
        {isEligiblePublicProfile ? <link rel="canonical" href={canonicalUrl} /> : null}
        {isEligiblePublicProfile ? <meta property="og:type" content="website" /> : null}
        {isEligiblePublicProfile ? <meta property="og:title" content={`${barbershop.name} — serviços e horários`} /> : null}
        {isEligiblePublicProfile ? <meta property="og:description" content={description} /> : null}
        {isEligiblePublicProfile ? <meta property="og:url" content={canonicalUrl} /> : null}
        {isEligiblePublicProfile && barbershop.bannerUrl ? <meta property="og:image" content={barbershop.bannerUrl} /> : null}
        {structuredData ? <script type="application/ld+json">{JSON.stringify(structuredData)}</script> : null}
      </Head>
      <EstablishmentThemeProvider primaryColor={barbershop.primaryColor} establishmentId={barbershop.id} establishmentName={barbershop.name}>
        <EstablishmentThemeScope>
          <EstablishmentProfileBody
            barbershop={barbershop}
            barbers={barbers}
            services={services}
            galleryPhotos={galleryPhotos}
            mapUrl={mapUrl}
            statusInfo={statusInfo}
            isWide={isWide}
            slug={slug}
            goBack={goBack}
            currency={currency}
          />
        </EstablishmentThemeScope>
      </EstablishmentThemeProvider>
    </>
  );
};

interface EstablishmentProfileBodyProps {
  barbershop: NonNullable<ReturnType<typeof useEstablishment>['establishment']>;
  barbers: PublicTeamMember[];
  services: ReturnType<typeof useServices>['services'];
  galleryPhotos: string[];
  mapUrl: string | null;
  statusInfo: ReturnType<typeof getOpeningStatus>;
  isWide: boolean;
  slug?: string;
  goBack: () => void;
  currency: (value: number) => string;
}

function EstablishmentProfileBody({
  barbershop,
  barbers,
  services,
  galleryPhotos,
  mapUrl,
  statusInfo,
  isWide,
  slug,
  goBack,
  currency,
}: EstablishmentProfileBodyProps) {
  const router = useRouter();
  const { theme } = useEstablishmentTheme();
  const [selectedTeamMember, setSelectedTeamMember] = useState<PublicTeamMember | null>(null);
  const bookingSlug = slug || barbershop.slug;

  const routeParams = useLocalSearchParams<{
    professional_slug?: string | string[];
    professional_id?: string | string[];
    professionalSlug?: string | string[];
    professionalId?: string | string[];
  }>();

  const currentProfSlug = Array.isArray(routeParams.professional_slug)
    ? routeParams.professional_slug[0]
    : routeParams.professional_slug ||
      (Array.isArray(routeParams.professionalSlug)
        ? routeParams.professionalSlug[0]
        : routeParams.professionalSlug);

  const currentProfId = Array.isArray(routeParams.professional_id)
    ? routeParams.professional_id[0]
    : routeParams.professional_id ||
      (Array.isArray(routeParams.professionalId)
        ? routeParams.professionalId[0]
        : routeParams.professionalId);

  // Sincroniza parâmetro da URL com a seleção do profissional (ex: recarga, deep link ou voltar)
  useEffect(() => {
    if (!currentProfSlug && !currentProfId) {
      if (selectedTeamMember !== null) {
        setSelectedTeamMember(null);
      }
      return;
    }

    if (barbers.length === 0) return;

    const matched = barbers.find(
      (b) =>
        (currentProfSlug && b.profileSlug === currentProfSlug) ||
        (currentProfId && b.id === currentProfId)
    );

    if (matched) {
      if (selectedTeamMember?.id !== matched.id) {
        setSelectedTeamMember(matched);
      }
    } else {
      // Slug/ID inválido na URL -> limpa os parâmetros sem quebrar a página (Requisito 5)
      setSelectedTeamMember(null);
      router.setParams({
        professional_slug: undefined,
        professional_id: undefined,
        professionalSlug: undefined,
        professionalId: undefined,
      } as never);
    }
  }, [currentProfSlug, currentProfId, barbers]);

  const handleOpenProfessional = (member: PublicTeamMember) => {
    tapLight();
    setSelectedTeamMember(member);
    if (member.profileSlug) {
      router.setParams({
        professional_slug: member.profileSlug,
        professional_id: undefined,
      } as never);
    } else {
      router.setParams({
        professional_id: member.id,
        professional_slug: undefined,
      } as never);
    }
  };

  const handleCloseProfessional = () => {
    setSelectedTeamMember(null);
    router.setParams({
      professional_slug: undefined,
      professional_id: undefined,
      professionalSlug: undefined,
      professionalId: undefined,
    } as never);
  };

  const { prices: pricedServices } = useEstablishmentServicePrices(barbershop.id);
  const showcaseServices = useMemo(() => {
    if (pricedServices.length) {
      return pricedServices.filter((service) => service.isActive);
    }
    return services.map((service) => ({
      serviceId: service.id,
      kind: service.kind,
      name: service.name,
      listPrice: service.price,
      effectivePrice: service.price,
      durationMinutes: service.durationMinutes,
      discountType: null as 'percent' | 'fixed_price' | null,
      discountValue: null as number | null,
      promotionId: null as string | null,
      savings: 0,
      membersTotal: null as number | null,
      isActive: service.isActive,
      sortOrder: service.sortOrder,
    }));
  }, [pricedServices, services]);

  const goBooking = (professionalId?: string) => {
    tapLight();
    handleCloseProfessional();
    if (bookingSlug) {
      router.push({
        pathname: `/${bookingSlug}/booking`,
        params: professionalId ? { professional_id: professionalId } : undefined,
      } as never);
      return;
    }
    router.push({
      pathname: '/(client)/booking',
      params: { establishmentId: barbershop.id, ...(professionalId ? { professionalId } : {}) },
    } as never);
  };

  const openDirections = () => {
    const address = barbershop.address || '';
    const url = Platform.select({
      ios: `maps:0,0?q=${encodeURIComponent(address)}`,
      android: `geo:0,0?q=${encodeURIComponent(address)}`,
      default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`,
    });
    Linking.openURL(url);
  };

  return (
    <ScreenBackground testID="barbershop-profile-screen">
      <View style={styles.topbar}>
        <Pressable testID="barbershop-profile-back-button" onPress={goBack} style={({ pressed }) => [styles.backButton, pressed && styles.pressedScale]}>
          <ArrowLeft color={colors.text} size={18} strokeWidth={1.8} />
        </Pressable>
        <Text testID="barbershop-profile-topbar-title" numberOfLines={1} style={styles.topbarTitle}>
          {barbershop.name}
        </Text>
        {!!statusInfo.text && (
          <View style={styles.topbarStatus}>
            <View style={[styles.statusDot, { backgroundColor: statusInfo.isOpen ? colors.success : colors.danger }]} />
            <Text style={[styles.topbarStatusText, { color: statusInfo.isOpen ? colors.success : colors.danger }]}>{statusInfo.isOpen ? 'Aberto' : 'Fechado'}</Text>
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Banner Hero com máscara de gradiente */}
        <View style={styles.heroContainer}>
          <EstablishmentMedia
            testID="barbershop-profile-banner"
            name={barbershop.name}
            uri={barbershop.bannerUrl}
            color={theme.primary}
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
            <View style={[styles.logoCircle, logoRing(theme)]}>
              {barbershop.logoUrl ? (
                <Image testID="barbershop-profile-logo" source={{ uri: barbershop.logoUrl }} style={styles.logoImage} resizeMode="contain" />
              ) : (
                <View style={[styles.logoFallback, { backgroundColor: theme.primary }]}>
                  <Text style={[styles.logoLetter, { color: theme.onPrimary }]}>{initialsOf(barbershop.name)}</Text>
                </View>
              )}
            </View>
            <View style={styles.titleInfo}>
              <View style={styles.titleRow}>
                <Text testID="barbershop-profile-name" style={styles.title}>{barbershop.name}</Text>
                {!!barbershop.instagram && (
                  <Pressable 
                    onPress={() => Linking.openURL(`https://instagram.com/${barbershop.instagram}`)}
                    style={({ pressed }) => [styles.instagramBadge, pressed && styles.pressedScale]}
                  >
                    <Camera color={colors.textSecondary} size={12} strokeWidth={1.8} />
                    <Text style={styles.instagramBadgeText}>@{barbershop.instagram}</Text>
                  </Pressable>
                )}
              </View>
              {!!barbershop.slogan && <Text testID="barbershop-profile-slogan" style={[styles.slogan, accentText(theme)]}>“{barbershop.slogan}”</Text>}
              <Text testID="barbershop-profile-description" style={styles.description}>
                {barbershop.description || 'Este estabelecimento ainda não publicou uma descrição.'}
              </Text>
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
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Phone color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Contato</Text>
              <Text style={styles.infoValue}>{barbershop.phone || 'Telefone não informado'}</Text>
            </View>
          </View>
          <View style={styles.infoItem}>
            <View style={styles.infoIcon}><Coins color={colors.textSecondary} size={15} strokeWidth={1.6} /></View>
            <View style={styles.infoCopyText}>
              <Text style={styles.infoLabel}>Moeda oficial</Text>
              <Text style={styles.infoValue}>{barbershop.currency || 'BRL'}</Text>
            </View>
          </View>
        </View>

        {/* Mapa Estético Integrado */}
        {!!barbershop.address && (
          <View style={styles.mapCard}>
            <View style={{ flex: 1, height: 180 }}>
              {Platform.OS === 'web' ? (
                React.createElement('iframe', {
                  src: `https://maps.google.com/maps?q=${encodeURIComponent(barbershop.address)}&t=&z=15&ie=UTF8&iwloc=&output=embed`,
                  width: '100%',
                  height: '100%',
                  style: { border: 0 },
                  loading: 'lazy',
                  title: 'Mapa do Estabelecimento'
                })
              ) : (
                <Pressable
                  onPress={() => {
                    const address = barbershop.address || '';
                    const url = Platform.select({
                      ios: `maps:0,0?q=${encodeURIComponent(address)}`,
                      android: `geo:0,0?q=${encodeURIComponent(address)}`,
                      default: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
                    });
                    Linking.openURL(url);
                  }}
                  style={{ flex: 1 }}
                >
                  <Image 
                    source={{ uri: mapUrl || 'https://images.unsplash.com/photo-1524661135-423995f22d0b?auto=format&fit=crop&q=80&w=600' }} 
                    style={styles.mapThumbnail} 
                    resizeMode="cover"
                  />
                </Pressable>
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
                onPress={openDirections}
                variant="secondary"
                style={[styles.routeBtn, outlineSurface(theme)]}
                icon={<MapPin color={theme.primary} size={13} strokeWidth={1.6} />}
              />
            </View>
          </View>
        )}

        {/* Serviços */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-services-heading" eyebrow="Catálogo" title="Serviços" description="" />
          {showcaseServices.length === 0 ? (
            <EmptyState testID="barbershop-services-empty" title="Catálogo" description="O estabelecimento ainda não publicou serviços ativos." icon={<Scissors color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
            <View testID="barbershop-services-grid" style={styles.cardsGrid}>
              {showcaseServices.map((service) => {
                const onPromo = service.savings > 0;
                const comboSavings = service.kind === 'combo' && service.membersTotal && service.membersTotal > service.listPrice
                  ? service.membersTotal - service.listPrice
                  : 0;
                return (
                  <View key={service.serviceId} testID={`barbershop-service-${service.serviceId}`} style={[styles.serviceCard, accentBorderLeft(theme), service.kind === 'combo' && styles.comboCard]}>
                    <View style={styles.serviceBadgeRow}>
                      <View style={[styles.cardIcon, iconSoftBackground(theme)]}>
                        <Scissors color={theme.primary} size={14} strokeWidth={1.6} />
                      </View>
                      {service.kind === 'combo' ? <StatusBadge label="Combo" tone="info" /> : null}
                      {onPromo ? <StatusBadge label="Promo" tone="warning" /> : null}
                    </View>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <View style={styles.priceRow}>
                      {onPromo ? (
                        <Text style={styles.listPrice}>{currency(service.listPrice)}</Text>
                      ) : null}
                      <Text testID={`barbershop-service-${service.serviceId}-price`} style={[styles.servicePrice, accentText(theme)]}>
                        {currency(service.effectivePrice)}
                      </Text>
                    </View>
                    {comboSavings > 0 && !onPromo ? (
                      <Text style={styles.comboSavings}>Economia de {currency(comboSavings)} vs avulsos</Text>
                    ) : null}
                    <Text style={styles.serviceDuration}>{service.durationMinutes} min</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>

        {/* Galeria de Inspirações / Referências do Dono */}
        <View style={styles.section}>
          <SectionHeading testID="barbershop-gallery-heading" eyebrow="Galeria" title="Inspirações & cortes" description="" />
          {galleryPhotos.length === 0 ? (
            <EmptyState testID="barbershop-gallery-empty" title="Galeria" description="As fotos do estabelecimento aparecerão aqui em breve." icon={<Store color={colors.textSecondary} size={22} strokeWidth={1.6} />} />
          ) : (
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
              renderItem={({ item }) => (
                <Pressable onPress={() => handleOpenProfessional(item)} style={({ pressed }) => [pressed && styles.pressedScale]}>
                  <View testID={`barbershop-professional-${item.id}`} style={[styles.professionalCard, { borderColor: theme.muted }]}>
                    <View style={[styles.avatarCircleSmall, avatarRing(theme), !item.avatarUrl && iconSoftBackground(theme)]}>
                      {item.avatarUrl ? (
                        <Image source={{ uri: item.avatarUrl }} style={styles.avatarImage} />
                      ) : (
                        <Text style={[styles.avatarInitials, accentText(theme)]}>{initialsOf(item.name)}</Text>
                      )}
                    </View>
                    <Text style={styles.professionalName}>{item.name}</Text>
                    <Text style={styles.professionalRole}>{item.tituloProfissional || 'Especialista'}</Text>
                    {!!item.specialties && <Text numberOfLines={2} style={styles.professionalSpecialties}>{item.specialties}</Text>}
                    {'instagram' in item && !!(item as any).instagram && (
                      <View style={styles.barberInstaBtn}>
                        <Camera color={colors.textMuted} size={11} strokeWidth={1.6} />
                        <Text style={styles.barberInstaText}>@{(item as any).instagram}</Text>
                      </View>
                    )}
                  </View>
                </Pressable>
              )}
            />
          )}
        </View>

        {/* Janela Adaptativa do Profissional (Side Panel no Desktop / Bottom Sheet no Mobile) */}
        <ProfessionalProfileSheet
          visible={!!selectedTeamMember}
          professional={selectedTeamMember}
          establishmentId={barbershop?.id}
          establishmentName={barbershop?.name}
          onClose={handleCloseProfessional}
          onBook={(profId) => {
            goBooking(profId);
          }}
        />
      </ScrollView>

      {/* Barra de ação flutuante (glassmorphism) */}
      <View style={styles.floatingWrap} pointerEvents="box-none">
        <View testID="barbershop-booking-cta" style={[styles.floatingBar, { borderColor: theme.muted }]}>
          <View style={styles.floatingCopy}>
            <Text style={[styles.floatingEyebrow, accentText(theme)]}>Pronto para o próximo corte?</Text>
            <Text numberOfLines={1} style={styles.floatingTitle}>Garanta seu horário na agenda</Text>
          </View>
          <Pressable
            testID="barbershop-profile-book-button"
            onPress={() => goBooking()}
            style={({ pressed }) => [styles.floatingButton, primaryButton(theme), pressed && styles.pressedScale]}
          >
            <Text style={[styles.floatingButtonText, { color: theme.onPrimary }]}>Agendar agora</Text>
            <ArrowRight color={theme.onPrimary} size={15} strokeWidth={2} />
          </Pressable>
        </View>
      </View>
    </ScreenBackground>
  );
}

const hairlineW = Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth;

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 20 },
  topbar: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, borderBottomWidth: hairlineW, borderBottomColor: colors.hairline, zIndex: 3, ...glassSurface },
  backButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.pill },
  topbarTitle: { flex: 1, color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12 },
  topbarStatus: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  topbarStatusText: { fontFamily: typography.bodyStrong, fontSize: 12, textTransform: 'uppercase', letterSpacing: 0.8 },
  scroll: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', paddingBottom: 150 },
  // Hero
  heroContainer: { width: '100%', height: 250, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  bannerFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brandSoft },
  bannerFade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 130 },
  heroCopy: { paddingHorizontal: 20, marginTop: -48, zIndex: 2 },
  heroCopyWide: { paddingHorizontal: 40 },
  brandContainer: { flexDirection: 'row', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' },
  logoCircle: { width: 88, height: 88, borderRadius: 44, borderWidth: 3, borderColor: colors.surface, backgroundColor: '#FAFAF8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', ...atmosphericShadow },
  logoFallback: { width: '100%', height: '100%', alignItems: 'center', justifyContent: 'center' },
  logoImage: { width: '100%', height: '100%' },
  logoLetter: { fontFamily: typography.serif, fontSize: 30, letterSpacing: 1 },
  titleInfo: { flex: 1, minWidth: 260, justifyContent: 'flex-end' },
  titleRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 10 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 28, letterSpacing: -1 },
  slogan: { fontFamily: typography.serif, fontSize: 13, marginTop: 5, fontStyle: 'italic' },
  instagramBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderRadius: radii.pill, paddingHorizontal: 10, paddingVertical: 5, borderWidth: hairlineW, borderColor: colors.border },
  instagramBadgeText: { fontSize: 12, fontFamily: typography.bodyStrong, color: colors.textSecondary },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, lineHeight: 19, marginTop: 8 },
  // Info Grid
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, paddingHorizontal: 20, marginTop: 24 },
  infoItem: { flex: 1, minWidth: 200, flexDirection: 'row', gap: 11, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, padding: 15, ...atmosphericShadow },
  infoIcon: { width: 32, height: 32, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.canvas, borderRadius: radii.pill },
  infoCopyText: { flex: 1 },
  infoLabel: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.6 },
  infoValue: { color: colors.text, fontFamily: typography.body, fontSize: 12, marginTop: 3 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3, flexWrap: 'wrap' },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusLabelText: { fontSize: 12, fontFamily: typography.bodyStrong },
  // Mapa
  mapCard: { marginHorizontal: 20, marginTop: 24, borderRadius: radii.xl, borderWidth: hairlineW, borderColor: colors.hairline, overflow: 'hidden', backgroundColor: colors.surface, ...atmosphericShadow },
  mapThumbnail: { width: '100%', height: '100%' },
  mapInfoBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: colors.surface, borderTopWidth: hairlineW, borderTopColor: colors.hairline },
  mapInfoAddress: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  routeBtn: { minHeight: 34, paddingVertical: 6, paddingHorizontal: 12 },
  section: { marginTop: 44, paddingHorizontal: 20, gap: 16 },
  cardsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  serviceCard: { flex: 1, minWidth: 160, maxWidth: 260, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, padding: 18, ...atmosphericShadow },
  comboCard: { borderColor: colors.brandSecondary },
  serviceBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  cardIcon: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  serviceName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 16 },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 8, flexWrap: 'wrap' },
  listPrice: { color: colors.textMuted, fontFamily: typography.body, fontSize: 12, textDecorationLine: 'line-through' },
  servicePrice: { fontFamily: typography.display, fontSize: 16, letterSpacing: -0.4 },
  comboSavings: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 4 },
  serviceDuration: { color: colors.labelSoft, fontFamily: typography.body, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1, marginTop: 5 },
  // Equipe
  professionalCard: { width: 180, alignItems: 'center', gap: 6, padding: 18, backgroundColor: colors.surface, borderWidth: hairlineW, borderColor: colors.hairline, borderRadius: radii.lg, ...atmosphericShadow },
  avatarCircleSmall: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: colors.canvas },
  avatarImage: { width: '100%', height: '100%' },
  avatarInitials: { fontFamily: typography.serif, fontSize: 20, letterSpacing: 1 },
  professionalName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, textAlign: 'center', marginTop: 6 },
  professionalRole: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 12, textTransform: 'uppercase', letterSpacing: 1.4 },
  professionalSpecialties: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12, textAlign: 'center', marginTop: 2 },
  barberInstaBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 10, paddingVertical: 4, paddingHorizontal: 9, borderRadius: radii.pill, backgroundColor: colors.canvas, borderWidth: hairlineW, borderColor: colors.hairline },
  barberInstaText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 12 },
  galleryImage: { width: 200, height: 260, borderRadius: radii.lg, resizeMode: 'cover' },
  // Barra flutuante
  floatingWrap: { position: 'absolute', left: 16, right: 16, bottom: 16, alignItems: 'center', zIndex: 10 },
  floatingBar: {
    width: '100%',
    maxWidth: 680,
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
  floatingEyebrow: { fontFamily: typography.bodyStrong, fontSize: 12, letterSpacing: 1.8, textTransform: 'uppercase' },
  floatingTitle: { color: colors.text, fontFamily: typography.display, fontSize: 13, letterSpacing: -0.3, marginTop: 3 },
  floatingButton: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 44, paddingHorizontal: 18, borderRadius: radii.pill },
  floatingButtonText: { fontFamily: typography.bodyStrong, fontSize: 12 },
  pressedScale: { transform: [{ scale: 0.98 }], opacity: 0.9 },
});
