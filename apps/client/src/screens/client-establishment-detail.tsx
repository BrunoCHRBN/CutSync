import { sharedBrand } from '@cutsync/brand';
import { formatDisplayName, getOpeningStatus, parseSchedule } from '@cutsync/domain';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Linking, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DiscoveryLoading,
  DiscoveryMessage,
  ProfessionalCard,
  discoveryColors,
  formatDiscoveryPrice,
} from '@/components/discovery/client-discovery-ui';
import { ClientStickyFooter } from '@/components/ui/client-ui';
import {
  type ClientDiscoveryDetail,
  getClientDiscoveryEstablishment,
} from '@/features/discovery/client-discovery-service';
import { performClientHaptic } from '@/features/experience/client-haptics';

export function ClientEstablishmentDetailScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug?: string | string[] }>();
  const slug = Array.isArray(params.slug) ? params.slug[0] : params.slug;
  const [establishment, setEstablishment] = useState<ClientDiscoveryDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    if (!slug) {
      setError('Este estabelecimento não está disponível.');
      setIsLoading(false);
      return;
    }
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);
    try {
      setEstablishment(await getClientDiscoveryEstablishment(slug));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível carregar este lugar.');
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
      <View testID="client-establishment-detail-loading" style={styles.centeredPage}>
        <StatusBar style="dark" />
        <DiscoveryLoading label="Preparando os detalhes…" />
      </View>
    );
  }

  if (error || !establishment) {
    return (
      <View testID="client-establishment-detail-error" style={styles.centeredPage}>
        <StatusBar style="dark" />
        <DiscoveryMessage
          title={error ? 'Os detalhes não carregaram' : 'Lugar indisponível'}
          description={error || 'Este estabelecimento não está disponível para agendamento.'}
          actionLabel="Tentar novamente"
          onAction={() => { void load(); }}
        />
      </View>
    );
  }

  // Banner leads the gallery so the establishment's chosen cover stays first.
  const photos = [establishment.bannerUrl, ...establishment.galleryUrls]
    .filter((photo): photo is string => Boolean(photo))
    .filter((photo, index, all) => all.indexOf(photo) === index);
  const galleryWidth = Math.min(Dimensions.get('window').width, 720) - 40;
  const canBook = establishment.services.length > 0 && establishment.professionals.length > 0;
  const displayName = formatDisplayName(establishment.name);
  const opening = getOpeningStatus(establishment.openingHours, establishment.timezone);
  const schedule = parseSchedule(establishment.openingHours);
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const openMaps = () => {
    void performClientHaptic('selection');
    const query = establishment.latitude !== null && establishment.longitude !== null
      ? `${establishment.latitude},${establishment.longitude}`
      : establishment.address;
    if (!query) return;
    void Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`);
  };
  const startBooking = (serviceId?: string) => {
    void performClientHaptic('selection');
    router.push({
      pathname: '/booking/[slug]',
      params: serviceId ? { slug: establishment.slug, serviceId } : { slug: establishment.slug },
    });
  };

  return (
    <View testID="client-establishment-detail-screen" style={styles.page}>
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
        {photos.length > 1 ? (
          <ScrollView
            testID="client-establishment-gallery"
            horizontal
            pagingEnabled
            showsHorizontalScrollIndicator={false}
            style={styles.gallery}
          >
            {photos.map((photo, index) => (
              <Image
                key={photo}
                accessibilityLabel={`Foto ${index + 1} de ${establishment.name}`}
                contentFit="cover"
                source={{ uri: photo }}
                style={[styles.heroImage, { width: galleryWidth }]}
                transition={180}
              />
            ))}
          </ScrollView>
        ) : photos.length === 1 ? (
          <Image
            accessibilityLabel={'Imagem de ' + establishment.name}
            contentFit="cover"
            source={{ uri: photos[0] }}
            style={styles.heroImage}
            transition={180}
          />
        ) : (
          <View style={[styles.heroFallback, { backgroundColor: establishment.primaryColor }]} />
        )}

        <View style={styles.identityCard}>
          <View style={styles.identityTopline}>
            {establishment.logoUrl ? (
              <Image
                accessibilityLabel={'Logo de ' + establishment.name}
                contentFit="cover"
                source={{ uri: establishment.logoUrl }}
                style={styles.logo}
                transition={180}
              />
            ) : (
              <View style={[styles.logoFallback, { backgroundColor: establishment.primaryColor }]} />
            )}
            <View style={styles.identityCopy}>
              <Text testID="client-establishment-name" style={styles.name}>{displayName}</Text>
              {!!establishment.slogan && <Text style={styles.slogan}>{establishment.slogan}</Text>}
              {!!opening.text && (
                <Text
                  testID="client-establishment-opening-status"
                  style={[styles.openingStatus, opening.isOpen ? styles.openingOpen : styles.openingClosed]}
                >
                  {opening.isOpen ? 'Aberto agora' : 'Fechado'} · {opening.text}
                </Text>
              )}
            </View>
          </View>

          <View style={styles.metrics}>
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{establishment.averageRating.toFixed(1)}</Text>
              <Text style={styles.metricLabel}>{establishment.reviewCount} avaliações</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{establishment.services.length}</Text>
              <Text style={styles.metricLabel}>serviços</Text>
            </View>
            <View style={styles.metricDivider} />
            <View style={styles.metric}>
              <Text style={styles.metricValue}>{establishment.professionals.length}</Text>
              <Text style={styles.metricLabel}>profissionais</Text>
            </View>
          </View>

          {!!establishment.description && <Text style={styles.description}>{establishment.description}</Text>}
          {!!establishment.address && (
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>ENDEREÇO</Text>
              <Text selectable style={styles.infoValue}>{establishment.address}</Text>
              <Pressable
                testID="client-establishment-open-maps"
                accessibilityRole="button"
                accessibilityLabel="Abrir no mapa"
                onPress={openMaps}
                style={({ pressed }) => [styles.mapButton, pressed && styles.rowPressed]}
              >
                <Text style={styles.mapButtonText}>Como chegar</Text>
              </Pressable>
            </View>
          )}
          {schedule.length > 0 && (
            <View testID="client-establishment-hours" style={styles.infoRow}>
              <Text style={styles.infoLabel}>HORÁRIO</Text>
              {schedule
                .slice()
                .sort((a, b) => a.day - b.day)
                .map((day) => (
                  <View key={day.day} style={styles.hoursRow}>
                    <Text style={styles.hoursDay}>{dayNames[day.day] ?? day.name ?? 'Dia'}</Text>
                    <Text style={styles.hoursValue}>
                      {day.isOpen ? `${day.open} – ${day.close}` : 'Fechado'}
                    </Text>
                  </View>
                ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>SERVIÇOS</Text>
            <Text style={styles.sectionTitle}>Escolha o seu cuidado</Text>
          </View>
          {establishment.services.length === 0 ? (
            <DiscoveryMessage title="Serviços em atualização" description="Este lugar ainda não publicou serviços ativos." />
          ) : (
            <View testID="client-establishment-services" style={styles.listCard}>
              {establishment.services.map((service, index) => (
                <View key={service.id}>
                  <Pressable
                    testID={'client-establishment-service-' + service.id}
                    accessibilityRole="button"
                    accessibilityLabel={'Agendar ' + service.name}
                    disabled={!canBook}
                    onPress={() => startBooking(service.id)}
                    style={({ pressed }) => [styles.serviceRow, pressed && styles.rowPressed]}
                  >
                    <View style={styles.serviceCopy}>
                      <Text style={styles.serviceName}>{service.name}</Text>
                      <Text style={styles.serviceDuration}>{service.durationMinutes} minutos</Text>
                    </View>
                    <View style={styles.serviceAction}>
                      <Text style={styles.servicePrice}>{formatDiscoveryPrice(service.price, establishment.currency)}</Text>
                      {canBook && <Text style={styles.serviceBookLabel}>Reservar</Text>}
                    </View>
                  </Pressable>
                  {index < establishment.services.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionEyebrow}>EQUIPE</Text>
            <Text style={styles.sectionTitle}>Quem vai cuidar de você</Text>
          </View>
          {establishment.professionals.length === 0 ? (
            <DiscoveryMessage title="Equipe em atualização" description="Os profissionais ainda não foram publicados." />
          ) : (
            <View testID="client-establishment-professionals" style={styles.listCard}>
              {establishment.professionals.map((professional, index) => (
                <View key={professional.id}>
                  <ProfessionalCard professional={professional} />
                  {index < establishment.professionals.length - 1 && <View style={styles.divider} />}
                </View>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <ClientStickyFooter>
        <Text style={styles.bookingHint}>
          {canBook
            ? 'Disponibilidade conferida em tempo real na agenda da equipe.'
            : 'Este lugar ainda não liberou agendamento pelo aplicativo.'}
        </Text>
        <Pressable
          testID="client-establishment-start-booking"
          accessibilityRole="button"
          disabled={!canBook}
          onPress={() => startBooking()}
          style={({ pressed }) => [
            styles.bookingButton,
            !canBook && styles.bookingButtonDisabled,
            pressed && canBook && styles.bookingButtonPressed,
          ]}
        >
          <Text style={styles.bookingButtonText}>Escolher serviço e horário</Text>
        </Pressable>
      </ClientStickyFooter>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: discoveryColors.background },
  centeredPage: { flex: 1, justifyContent: 'center', backgroundColor: discoveryColors.background, padding: 20 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 28, gap: 22 },
  gallery: { borderRadius: 30, borderCurve: 'continuous' },
  heroImage: { width: '100%', height: 232, borderRadius: 30, borderCurve: 'continuous', backgroundColor: '#E7E1CE' },
  heroFallback: { width: '100%', height: 160, borderRadius: 30, borderCurve: 'continuous' },
  identityCard: { gap: 20, backgroundColor: '#FFFFFF', borderRadius: 28, borderCurve: 'continuous', padding: 22, boxShadow: '0 14px 32px rgba(20, 27, 23, 0.07)' },
  identityTopline: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#E7E1CE' },
  logoFallback: { width: 72, height: 72, borderRadius: 22 },
  identityCopy: { flex: 1, gap: 5 },
  name: { color: discoveryColors.text, fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 },
  slogan: { color: discoveryColors.secondary, fontSize: 13, lineHeight: 19 },
  openingStatus: { fontSize: 12, fontWeight: '800', paddingTop: 4 },
  openingOpen: { color: sharedBrand.colors.forest },
  openingClosed: { color: discoveryColors.muted },
  metrics: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 20, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forestSoft, paddingVertical: 15 },
  metric: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  metricDivider: { width: 1, backgroundColor: '#CBDCC6' },
  metricValue: { color: sharedBrand.colors.forest, fontSize: 18, fontWeight: '900' },
  metricLabel: { color: discoveryColors.secondary, fontSize: 10, textAlign: 'center', fontWeight: '600' },
  description: { color: discoveryColors.secondary, fontSize: 14, lineHeight: 22 },
  infoRow: { gap: 6, borderTopWidth: 1, borderTopColor: discoveryColors.border, paddingTop: 16 },
  infoLabel: { color: discoveryColors.muted, fontSize: 11, fontWeight: '900', letterSpacing: 1.3 },
  infoValue: { color: discoveryColors.text, fontSize: 13, lineHeight: 20 },
  mapButton: { alignSelf: 'flex-start', minHeight: 40, justifyContent: 'center', borderRadius: 999, backgroundColor: sharedBrand.colors.forestSoft, paddingHorizontal: 14, marginTop: 4 },
  mapButtonText: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '800' },
  hoursRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  hoursDay: { color: discoveryColors.secondary, fontSize: 12, fontWeight: '600' },
  hoursValue: { color: discoveryColors.text, fontSize: 12, fontWeight: '700' },
  section: { gap: 14 },
  sectionHeading: { gap: 4, paddingHorizontal: 2 },
  sectionEyebrow: { color: discoveryColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: discoveryColors.text, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 26, borderCurve: 'continuous', paddingHorizontal: 20, paddingVertical: 4, boxShadow: '0 10px 26px rgba(20, 27, 23, 0.05)' },
  serviceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  rowPressed: { opacity: 0.6 },
  serviceCopy: { flex: 1, gap: 4 },
  serviceName: { color: discoveryColors.text, fontSize: 15, fontWeight: '700' },
  serviceDuration: { color: discoveryColors.secondary, fontSize: 11 },
  serviceAction: { alignItems: 'flex-end', gap: 4 },
  servicePrice: { color: sharedBrand.colors.forest, fontSize: 14, fontWeight: '900' },
  serviceBookLabel: { color: discoveryColors.muted, fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  divider: { height: 1, backgroundColor: discoveryColors.border },
  bookingHint: { color: discoveryColors.secondary, fontSize: 11, lineHeight: 16 },
  bookingButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, paddingHorizontal: 20 },
  bookingButtonDisabled: { opacity: 0.45 },
  bookingButtonPressed: { opacity: 0.85 },
  bookingButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
});
