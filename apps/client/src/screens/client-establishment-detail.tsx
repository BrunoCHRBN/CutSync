import { sharedBrand } from '@cutsync/brand';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DiscoveryLoading,
  DiscoveryMessage,
  ProfessionalCard,
  discoveryColors,
  formatDiscoveryPrice,
} from '@/components/discovery/client-discovery-ui';
import {
  type ClientDiscoveryDetail,
  getClientDiscoveryEstablishment,
} from '@/features/discovery/client-discovery-service';

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

  return (
    <ScrollView
      testID="client-establishment-detail-screen"
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
      style={styles.page}
    >
      <StatusBar style="dark" />
      {establishment.bannerUrl ? (
        <Image
          accessibilityLabel={'Imagem de ' + establishment.name}
          contentFit="cover"
          source={{ uri: establishment.bannerUrl }}
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
            <Text testID="client-establishment-name" style={styles.name}>{establishment.name}</Text>
            {!!establishment.slogan && <Text style={styles.slogan}>{establishment.slogan}</Text>}
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
                <View style={styles.serviceRow}>
                  <View style={styles.serviceCopy}>
                    <Text style={styles.serviceName}>{service.name}</Text>
                    <Text style={styles.serviceDuration}>{service.durationMinutes} minutos</Text>
                  </View>
                  <Text style={styles.servicePrice}>{formatDiscoveryPrice(service.price, establishment.currency)}</Text>
                </View>
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

      <View style={styles.bookingCard}>
        <View style={styles.bookingCopy}>
          <Text style={styles.bookingTitle}>Pronto para escolher um horário?</Text>
          <Text style={styles.bookingDescription}>Consulte a disponibilidade real da equipe antes de confirmar.</Text>
        </View>
        <Pressable
          testID="client-establishment-start-booking"
          accessibilityRole="button"
          disabled={establishment.services.length === 0 || establishment.professionals.length === 0}
          onPress={() => router.push({ pathname: '/booking/[slug]', params: { slug: establishment.slug } })}
          style={({ pressed }) => [
            styles.bookingButton,
            (establishment.services.length === 0 || establishment.professionals.length === 0) && styles.bookingButtonDisabled,
            pressed && styles.bookingButtonPressed,
          ]}
        >
          <Text style={styles.bookingButtonText}>Escolher serviço e horário</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: discoveryColors.background },
  centeredPage: { flex: 1, justifyContent: 'center', backgroundColor: discoveryColors.background, padding: 20 },
  content: { width: '100%', maxWidth: 720, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 18, paddingBottom: 60, gap: 22 },
  heroImage: { width: '100%', height: 232, borderRadius: 30, borderCurve: 'continuous', backgroundColor: '#E7E1CE' },
  heroFallback: { width: '100%', height: 160, borderRadius: 30, borderCurve: 'continuous' },
  identityCard: { gap: 20, backgroundColor: '#FFFFFF', borderRadius: 28, borderCurve: 'continuous', padding: 22, boxShadow: '0 14px 32px rgba(20, 27, 23, 0.07)' },
  identityTopline: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  logo: { width: 72, height: 72, borderRadius: 22, backgroundColor: '#E7E1CE' },
  logoFallback: { width: 72, height: 72, borderRadius: 22 },
  identityCopy: { flex: 1, gap: 5 },
  name: { color: discoveryColors.text, fontSize: 26, lineHeight: 30, fontWeight: '800', letterSpacing: -0.6 },
  slogan: { color: discoveryColors.secondary, fontSize: 13, lineHeight: 19 },
  metrics: { flexDirection: 'row', alignItems: 'stretch', borderRadius: 20, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forestSoft, paddingVertical: 15 },
  metric: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 4 },
  metricDivider: { width: 1, backgroundColor: '#CBDCC6' },
  metricValue: { color: sharedBrand.colors.forest, fontSize: 18, fontWeight: '900' },
  metricLabel: { color: discoveryColors.secondary, fontSize: 10, textAlign: 'center', fontWeight: '600' },
  description: { color: discoveryColors.secondary, fontSize: 14, lineHeight: 22 },
  infoRow: { gap: 6, borderTopWidth: 1, borderTopColor: discoveryColors.border, paddingTop: 16 },
  infoLabel: { color: discoveryColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.3 },
  infoValue: { color: discoveryColors.text, fontSize: 13, lineHeight: 20 },
  section: { gap: 14 },
  sectionHeading: { gap: 4, paddingHorizontal: 2 },
  sectionEyebrow: { color: discoveryColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.4 },
  sectionTitle: { color: discoveryColors.text, fontSize: 24, lineHeight: 30, fontWeight: '800', letterSpacing: -0.5 },
  listCard: { backgroundColor: '#FFFFFF', borderRadius: 26, borderCurve: 'continuous', paddingHorizontal: 20, paddingVertical: 4, boxShadow: '0 10px 26px rgba(20, 27, 23, 0.05)' },
  serviceRow: { minHeight: 76, flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  serviceCopy: { flex: 1, gap: 4 },
  serviceName: { color: discoveryColors.text, fontSize: 15, fontWeight: '700' },
  serviceDuration: { color: discoveryColors.secondary, fontSize: 11 },
  servicePrice: { color: sharedBrand.colors.forest, fontSize: 14, fontWeight: '900' },
  divider: { height: 1, backgroundColor: discoveryColors.border },
  bookingCard: { gap: 14, borderRadius: 26, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, padding: 22, boxShadow: '0 16px 32px rgba(20, 27, 23, 0.14)' },
  bookingCopy: { gap: 6 },
  bookingTitle: { color: '#FFFFFF', fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  bookingDescription: { color: 'rgba(255, 255, 255, 0.85)', fontSize: 12, lineHeight: 19 },
  bookingButton: { minHeight: 52, alignItems: 'center', justifyContent: 'center', borderRadius: 999, borderCurve: 'continuous', backgroundColor: '#FFFFFF', paddingHorizontal: 20 },
  bookingButtonDisabled: { opacity: 0.45 },
  bookingButtonPressed: { opacity: 0.85 },
  bookingButtonText: { color: sharedBrand.colors.forest, fontSize: 14, fontWeight: '900', letterSpacing: 0.3 },
});
