import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowRight,
  BriefcaseBusiness,
  CalendarCheck,
  Clock3,
  LogIn,
  MapPin,
  Search,
  ShieldCheck,
  Sparkles,
  Star,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../theme/landing-tokens';
import { Establishment, mapEstablishment } from '@cutsync/database';
import { getOpeningStatus } from '@cutsync/domain';
import { trackLandingEvent } from './landing-analytics';
import { EditorialBand, EstablishmentMedia } from './landing-primitives';
import { GlassSurface, MagneticButton, MaskedReveal, RevealOnScroll, SectionReveal, SpotlightSection, StaggerGroup, StaggerItem } from './motion/landing-effects';
import { LandingMotionProvider, useLandingMotion, useReducedMotion } from './motion/landing-motion';
import { ProductPreview } from './product-preview';
import { AccessPath, AccessPathModal } from './access-path-modal';

interface PublicService {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface PublicEstablishment extends Establishment {
  services: PublicService[];
}

const serviceGroups = [
  { id: 'all', label: 'Todos', terms: [] },
  { id: 'hair', label: 'Cabelo', terms: ['corte', 'cabelo', 'escova', 'penteado'] },
  { id: 'barber', label: 'Barba', terms: ['barba', 'barbearia', 'bigode'] },
  { id: 'nails', label: 'Unhas', terms: ['unha', 'manicure', 'pedicure', 'nail'] },
  { id: 'wellness', label: 'Bem-estar', terms: ['massagem', 'estética', 'spa', 'sobrancelha'] },
] as const;

const SectionHeading = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) => (
  <View style={styles.sectionHeading}>
    <Text style={styles.eyebrow}>{eyebrow}</Text>
    <Text style={styles.sectionTitle}>{title}</Text>
    <Text style={styles.sectionDescription}>{description}</Text>
  </View>
);

const ClientLandingContent = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ audience?: string }>();
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { quality } = useLandingMotion();
  const isDesktop = width >= landingLayout.desktopBreakpoint;
  const isMobile = width < landingLayout.mobileBreakpoint;
  const scrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const contentY = useRef(0);
  const searchSectionY = useRef(0);
  const journeySectionY = useRef(0);
  const reportedDepths = useRef(new Set<50 | 100>());
  const [establishments, setEstablishments] = useState<PublicEstablishment[]>([]);
  const [hoveredEstablishment, setHoveredEstablishment] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [serviceGroup, setServiceGroup] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [accessModalVisible, setAccessModalVisible] = useState(false);

  const legacyAudience = Array.isArray(params.audience) ? params.audience[0] : params.audience;
  const redirectingToBusiness = legacyAudience === 'business';

  useEffect(() => {
    trackLandingEvent({ name: 'landing_viewed', page: 'client' });
  }, []);

  useEffect(() => {
    if (legacyAudience === 'business') {
      router.replace('/para-estabelecimentos' as never);
    } else if (legacyAudience === 'client' || legacyAudience === 'observer') {
      router.replace('/' as never);
    }
  }, [legacyAudience, router]);

  const loadEstablishments = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data, error: queryError } = await supabase
        .from('establishments')
        .select('*, services(id,name,price,is_active)')
        .eq('account_status', 'active')
        .order('created_at', { ascending: false });
      if (queryError) throw queryError;
      setEstablishments(((data ?? []) as unknown as (Record<string, unknown> & { services?: PublicService[] })[]).map((row) => ({
        ...mapEstablishment(row as never),
        services: (row.services ?? [])
          .filter((service) => service.is_active !== false)
          .map((service) => ({ ...service, price: Number(service.price) })),
      })));
    } catch {
      setError('Não foi possível carregar os estabelecimentos agora.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!redirectingToBusiness) void loadEstablishments();
  }, [loadEstablishments, redirectingToBusiness]);

  const filtered = useMemo(() => {
    const search = query.trim().toLocaleLowerCase('pt-BR');
    const place = locationQuery.trim().toLocaleLowerCase('pt-BR');
    const group = serviceGroups.find((item) => item.id === serviceGroup) ?? serviceGroups[0];

    return establishments.filter((establishment) => {
      const serviceNames = establishment.services.map((service) => service.name.toLocaleLowerCase('pt-BR'));
      const searchable = [establishment.name, establishment.description, ...serviceNames]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase('pt-BR');
      const address = establishment.address?.toLocaleLowerCase('pt-BR') ?? '';
      const matchesSearch = !search || searchable.includes(search);
      const matchesPlace = !place || address.includes(place);
      const matchesGroup = group.terms.length === 0
        || serviceNames.some((name) => group.terms.some((term) => name.includes(term)));
      return matchesSearch && matchesPlace && matchesGroup;
    });
  }, [establishments, locationQuery, query, serviceGroup]);

  const availableServiceGroups = useMemo(() => serviceGroups.filter((group) => (
    group.id === 'all' || establishments.some((establishment) => (
      establishment.services.some((service) => {
        const name = service.name.toLocaleLowerCase('pt-BR');
        return group.terms.some((term) => name.includes(term));
      })
    ))
  )), [establishments]);

  const contentWidth = Math.min(Math.max(width - 40, 280), landingLayout.maxWidth);
  const maximumResultColumns = width >= 1180 ? 3 : width >= landingLayout.mobileBreakpoint ? 2 : 1;
  const resultColumns = Math.min(maximumResultColumns, Math.max(filtered.length, 1));
  const resultGridWidth = Math.max(240, contentWidth - (isMobile ? 36 : 56));
  const resultCardWidth = (resultGridWidth - (resultColumns - 1) * 16) / resultColumns;

  const scrollToSearch = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'client', position: 'hero_primary', destination: 'search' });
    scrollRef.current?.scrollTo({ y: Math.max(0, searchSectionY.current - 84), animated: !reducedMotion });
    setTimeout(() => searchInputRef.current?.focus(), reducedMotion ? 0 : 260);
  };

  const scrollToJourney = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'client', position: 'hero_secondary', destination: 'journey' });
    scrollRef.current?.scrollTo({ y: Math.max(0, journeySectionY.current - 84), animated: !reducedMotion });
  };

  const trackScrollDepth = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height) return;
    const depth = ((contentOffset.y + layoutMeasurement.height) / contentSize.height) * 100;
    ([50, 100] as const).forEach((threshold) => {
      if (depth >= threshold && !reportedDepths.current.has(threshold)) {
        reportedDepths.current.add(threshold);
        trackLandingEvent({ name: 'scroll_depth_reached', page: 'client', depth: threshold });
      }
    });
  };

  const openEstablishment = (establishment: PublicEstablishment, booking = false) => {
    trackLandingEvent({
      name: booking ? 'booking_started' : 'establishment_opened',
      establishmentId: establishment.id,
    });
    router.push((booking ? `/${establishment.slug}/booking` : `/${establishment.slug}`) as never);
  };

  const openAccount = () => {
    if (!user) {
      setAccessModalVisible(true);
      return;
    }
    router.push((profile?.role === 'admin' ? '/admin' : profile?.role === 'professional' ? '/professional' : '/explore') as never);
  };

  const selectAccessPath = (path: AccessPath) => {
    setAccessModalVisible(false);
    if (path === 'client') {
      router.push({ pathname: '/(auth)/login', params: { audience: 'client' } } as never);
      return;
    }
    if (path === 'business') {
      router.push({ pathname: '/(auth)/login', params: { audience: 'business' } } as never);
      return;
    }
    router.push({
      pathname: '/(auth)/register',
      params: { intent: 'establishment', redirect: '/(client)/request-establishment' },
    } as never);
  };

  if (redirectingToBusiness) {
    return (
      <View testID="landing-legacy-redirect" style={styles.redirectState}>
        <ActivityIndicator color={landingColors.brand} />
      </View>
    );
  }

  return (
    <View testID="client-public-landing" style={styles.root}>
      <AccessPathModal
        visible={accessModalVisible}
        source="client"
        onClose={() => setAccessModalVisible(false)}
        onSelect={selectAccessPath}
      />
      <GlassSurface variant="header" style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable testID="client-brand-home-link" accessibilityRole="link" onPress={() => router.replace('/' as never)} style={styles.brandRow}>
            <View style={styles.brandMark}><Sparkles size={17} color={landingColors.white} /></View>
            <Text style={styles.brand}>CutSync</Text>
          </Pressable>
          <View style={styles.headerActions}>
            {isDesktop && (
              <Pressable testID="landing-business-link" accessibilityRole="link" onPress={() => router.push('/para-estabelecimentos' as never)} style={styles.headerLink}>
                <BriefcaseBusiness size={16} color={landingColors.inkSecondary} />
                <Text style={styles.headerLinkText}>Para estabelecimentos</Text>
              </Pressable>
            )}
            <Pressable testID="landing-account-button" accessibilityRole="button" onPress={openAccount} style={styles.accountButton}>
              <LogIn size={16} color={landingColors.brand} />
              <Text style={styles.accountButtonText}>{user ? 'Abrir minha conta' : 'Entrar'}</Text>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      <ScrollView ref={scrollRef} onScroll={trackScrollDepth} scrollEventThrottle={32} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SpotlightSection style={[styles.heroSection, !isDesktop && styles.heroSectionStacked]}>
          <View style={styles.heroCopy}>
            <SectionReveal delay={0} style={styles.heroBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.heroBadgeText}>VITRINES E AGENDAS CONECTADAS</Text>
            </SectionReveal>
            <MaskedReveal delay={70}><Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>Encontre seu próximo horário{`\n`}sem depender de mensagens.</Text></MaskedReveal>
            <SectionReveal delay={210}><Text style={styles.heroDescription}>Explore serviços, consulte a agenda de cada estabelecimento e escolha quando agendar.</Text></SectionReveal>
            <SectionReveal delay={320} style={styles.heroActions}>
              <MagneticButton label="Ver estabelecimentos" onPress={scrollToSearch} testID="landing-hero-client-cta" />
              <MagneticButton label="Como funciona" secondary onPress={scrollToJourney} testID="landing-hero-client-secondary-cta" />
              {!isDesktop && <MagneticButton label="Tenho um negócio" secondary testID="landing-business-link" onPress={() => router.push('/para-estabelecimentos' as never)} />}
            </SectionReveal>
          </View>
          {isDesktop && (
            <MaskedReveal delay={420} style={styles.heroPreview}><ProductPreview
              variant="client"
              accessibilityLabel="Demonstração ilustrativa do fluxo de agendamento do CutSync"
              style={{ width: '100%' }}
            /></MaskedReveal>
          )}
        </SpotlightSection>

        <View testID="landing-client-credibility" style={styles.credibilityBand}>
          {['Explore sem cadastro', 'Consulte serviços e preços', 'Entre apenas para confirmar'].map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 && <Text style={styles.credibilityDivider}>·</Text>}
              <Text style={styles.credibilityText}>{label}</Text>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.content} onLayout={(event) => { contentY.current = event.nativeEvent.layout.y; }}>
          <RevealOnScroll
            onLayout={(event) => { searchSectionY.current = contentY.current + event.nativeEvent.layout.y; }}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'search' })}
            style={styles.searchSection}
          >
            <SectionHeading
              eyebrow="BUSCA DIRETA"
              title="O que você procura hoje?"
              description="Pesquise por serviço, estabelecimento, bairro ou cidade. Os horários são confirmados no fluxo de agendamento."
            />
            <GlassSurface variant="search" style={styles.searchPanel}>
              <View style={[styles.searchFields, !isDesktop && styles.searchFieldsStacked]}>
                <View style={styles.inputShell}>
                  <Search size={18} color={landingColors.inkMuted} />
                  <TextInput
                    ref={searchInputRef}
                    testID="landing-search-input"
                    accessibilityLabel="Buscar por estabelecimento ou serviço"
                    value={query}
                    onChangeText={(value) => {
                      if (!query && value) trackLandingEvent({ name: 'search_started', filterCount: locationQuery ? 2 : 1 });
                      setQuery(value);
                    }}
                    placeholder="Estabelecimento ou serviço"
                    placeholderTextColor={landingColors.inkMuted}
                    style={styles.input}
                  />
                </View>
                <View style={styles.inputShell}>
                  <MapPin size={18} color={landingColors.inkMuted} />
                  <TextInput
                    testID="landing-location-input"
                    accessibilityLabel="Filtrar por bairro ou cidade"
                    value={locationQuery}
                    onChangeText={setLocationQuery}
                    placeholder="Bairro ou cidade"
                    placeholderTextColor={landingColors.inkMuted}
                    style={styles.input}
                  />
                </View>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {availableServiceGroups.map((group) => {
                  const selected = group.id === serviceGroup;
                  return (
                    <Pressable
                      key={group.id}
                      testID={`landing-service-filter-${group.id}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setServiceGroup(group.id)}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{group.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </GlassSurface>
          </RevealOnScroll>

          <RevealOnScroll style={styles.resultsSection}>
            <View style={styles.resultsHeadingRow}>
              <SectionHeading
                eyebrow="VITRINES PUBLICADAS"
                title="Escolha com informações reais."
                description="Serviços, localização e situação informados a partir do perfil de cada estabelecimento."
              />
              <Text testID="landing-results-count" style={styles.resultsCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento' : 'estabelecimentos'}</Text>
            </View>

            {loading ? (
              <View testID="landing-results-loading" style={styles.stateCard}>
                <ActivityIndicator color={landingColors.brand} />
                <Text style={styles.stateText}>Buscando estabelecimentos…</Text>
              </View>
            ) : error ? (
              <View testID="landing-results-error" style={styles.stateCard}>
                <Text style={styles.stateTitle}>Não foi possível atualizar a vitrine.</Text>
                <Text selectable style={styles.stateText}>{error}</Text>
                <MagneticButton label="Tentar novamente" secondary onPress={() => void loadEstablishments()} />
              </View>
            ) : filtered.length === 0 ? (
              <View testID="landing-results-empty" style={styles.stateCard}>
                <Search size={24} color={landingColors.inkMuted} />
                <Text style={styles.stateTitle}>Nenhum resultado com esses filtros.</Text>
                <Text style={styles.stateText}>Tente outro serviço, bairro ou cidade.</Text>
              </View>
            ) : (
              <StaggerGroup testID="landing-results-grid" style={styles.establishmentGrid}>
                {filtered.map((establishment, index) => {
                  const opening = getOpeningStatus(establishment.openingHours, establishment.timezone);
                  const prices = establishment.services.map((service) => service.price).filter((price) => price > 0);
                  const startingPrice = prices.length ? Math.min(...prices) : null;
                  const hasVerifiedRating = Boolean(establishment.averageRating && establishment.averageRating > 0 && establishment.reviewCount && establishment.reviewCount > 0);
                  const hovered = quality === 'high' && hoveredEstablishment === establishment.id;
                  return (
                    <StaggerItem key={establishment.id} index={index % 6} style={{ width: resultCardWidth }}>
                    <Pressable
                      testID={`landing-establishment-${establishment.id}`}
                      accessibilityRole="link"
                      accessibilityLabel={`Ver perfil de ${establishment.name}`}
                      onPress={() => openEstablishment(establishment)}
                      onHoverIn={() => setHoveredEstablishment(establishment.id)}
                      onHoverOut={() => setHoveredEstablishment(null)}
                      style={({ pressed }) => [styles.establishmentCard, hovered && styles.establishmentCardHovered, pressed && styles.pressed]}
                    >
                      <EstablishmentMedia name={establishment.name} uri={establishment.bannerUrl || establishment.logoUrl} style={[styles.cover, hovered && styles.coverHovered]} />
                      <View style={styles.cardBody}>
                        <Text numberOfLines={1} style={styles.cardTitle}>{establishment.name}</Text>
                        {!!establishment.address && <View style={styles.metaRow}><MapPin size={14} color={landingColors.inkMuted} /><Text numberOfLines={2} style={styles.metaText}>{establishment.address}</Text></View>}
                        {!!opening.text && <View style={styles.metaRow}><Clock3 size={14} color={opening.isOpen ? landingColors.success : landingColors.inkMuted} /><Text style={[styles.metaText, opening.isOpen && styles.openText]}>{opening.isOpen ? `Aberto · ${opening.text}` : opening.text}</Text></View>}
                        {hasVerifiedRating && (
                          <View style={styles.metaRow}><Star size={14} color={landingColors.accent} fill={landingColors.accent} /><Text style={styles.metaText}>{establishment.averageRating?.toFixed(1)} · {establishment.reviewCount} avaliações</Text></View>
                        )}
                        <View style={styles.cardFooter}>
                          <Text style={styles.priceText}>{startingPrice ? `A partir de R$ ${startingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Consulte os serviços'}</Text>
                          <Pressable testID={`landing-booking-${establishment.id}`} accessibilityRole="button" accessibilityLabel={`Ver horários de ${establishment.name}`} onPress={(event) => { event.stopPropagation?.(); openEstablishment(establishment, true); }} style={styles.bookingButton}>
                            <Text style={styles.bookingButtonText}>Ver horários</Text><ArrowRight size={15} color={landingColors.white} />
                          </Pressable>
                        </View>
                      </View>
                    </Pressable>
                    </StaggerItem>
                  );
                })}
              </StaggerGroup>
            )}
            <Text style={styles.resultsNote}>A disponibilidade é consultada antes da confirmação do agendamento.</Text>
          </RevealOnScroll>

          <RevealOnScroll
            testID="landing-client-journey"
            onLayout={(event) => { journeySectionY.current = contentY.current + event.nativeEvent.layout.y; }}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'journey' })}
            style={styles.journeySection}
          >
            <SectionHeading eyebrow="DO ENCONTRO À CONFIRMAÇÃO" title="Uma decisão de cada vez." description="Você pode explorar antes de entrar. A conta é necessária somente para concluir a reserva." />
            <StaggerGroup style={styles.journeyGrid}>
              {[
                { step: '01', Icon: Search, title: 'Descubra', text: 'Busque por serviço, estabelecimento ou localização.' },
                { step: '02', Icon: CalendarCheck, title: 'Escolha', text: 'Consulte o catálogo e os horários da unidade.' },
                { step: '03', Icon: ShieldCheck, title: 'Confirme', text: 'Acesse sua conta apenas para finalizar o agendamento.' },
              ].map(({ step, Icon, title, text }, index) => (
                <StaggerItem key={title} index={index} style={styles.journeyItem}>
                  <View style={styles.journeyTop}><Text style={styles.stepNumber}>{step}</Text><Icon size={20} color={landingColors.brand} /></View>
                  <Text style={styles.journeyTitle}>{title}</Text>
                  <Text style={styles.journeyText}>{text}</Text>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </RevealOnScroll>

          <RevealOnScroll onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'connected_platform' })}>
            <EditorialBand
              testID="landing-connected-platform"
              eyebrow="UMA PLATAFORMA CONECTADA"
              title="O que o cliente encontra acompanha o que o estabelecimento disponibiliza na agenda."
              description="O CutSync conecta informações já publicadas pelo negócio ao caminho de descoberta e agendamento do cliente."
            >
              <View style={styles.platformFlow}>
                {['Serviços publicados', 'Descoberta', 'Agendamento', 'Operação organizada'].map((label, index) => (
                  <View key={label} style={styles.platformStep}>
                    <Text style={styles.platformIndex}>0{index + 1}</Text>
                    <Text style={styles.platformLabel}>{label}</Text>
                    {index < 3 && <ArrowRight size={16} color={landingColors.onBrandSubtle} />}
                  </View>
                ))}
              </View>
            </EditorialBand>
          </RevealOnScroll>

          <RevealOnScroll onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'faq' })} style={styles.faqSection}>
            <SectionHeading eyebrow="ANTES DE RESERVAR" title="O essencial, sem letras pequenas." description="Informações diretas para navegar com confiança." />
            <View style={styles.faqGrid}>
              {[
                ['Preciso criar conta para pesquisar?', 'Não. Você pode explorar estabelecimentos e serviços sem cadastro.'],
                ['Os horários mostrados são reais?', 'A disponibilidade é consultada no fluxo do estabelecimento antes da confirmação.'],
                ['O CutSync recebe o pagamento?', 'Nesta fase, o CutSync organiza o agendamento. Pagamentos seguem as regras de cada estabelecimento.'],
              ].map(([question, answer]) => (
                <View key={question} style={styles.faqItem}><Text style={styles.faqQuestion}>{question}</Text><Text style={styles.faqAnswer}>{answer}</Text></View>
              ))}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.finalCta}>
            <Text style={styles.finalCtaEyebrow}>COMECE PELA BUSCA</Text>
            <Text style={styles.finalCtaTitle}>Seu próximo horário começa com uma escolha clara.</Text>
            <Text style={styles.finalCtaText}>Explore as vitrines publicadas e consulte os horários quando encontrar o serviço certo.</Text>
            <MagneticButton label="Ver estabelecimentos" onPress={() => {
              trackLandingEvent({ name: 'cta_clicked', page: 'client', position: 'final', destination: 'search' });
              scrollRef.current?.scrollTo({ y: Math.max(0, searchSectionY.current - 84), animated: !reducedMotion });
            }} />
          </RevealOnScroll>

          <View style={styles.footer}>
            <Text style={styles.footerBrand}>CutSync</Text>
            <Text style={styles.footerText}>© {new Date().getFullYear()} · Vitrine e operação conectadas.</Text>
            <Pressable testID="client-footer-business-link" accessibilityRole="link" onPress={() => router.push('/para-estabelecimentos' as never)}><Text style={styles.footerLink}>Solução para estabelecimentos</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export const ClientLanding = () => (
  <LandingMotionProvider>
    <ClientLandingContent />
  </LandingMotionProvider>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: landingColors.canvas, overflow: 'hidden' },
  redirectState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.canvas },
  header: { borderWidth: 0, borderBottomWidth: 1, borderColor: 'rgba(41,75,58,0.08)', zIndex: 20 },
  headerInner: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 66, alignSelf: 'center', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brand },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 22 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  headerLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  accountButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 16, borderWidth: 1, borderColor: 'rgba(41,75,58,0.14)', borderRadius: landingRadii.md, backgroundColor: 'rgba(255,254,250,0.68)' },
  accountButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  scroll: { paddingBottom: 36 },
  heroSection: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', minHeight: 680, paddingHorizontal: 28, paddingTop: 104, paddingBottom: 160, flexDirection: 'row', alignItems: 'center', gap: 96 },
  heroSectionStacked: { minHeight: 0, paddingTop: 96, paddingBottom: 136, flexDirection: 'column', alignItems: 'stretch' },
  heroCopy: { flex: 1, minWidth: 280, gap: 22, zIndex: 2 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: landingColors.success },
  heroBadgeText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { maxWidth: 650, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 68, lineHeight: 72, letterSpacing: -3.4 },
  heroTitleMobile: { fontSize: 44, lineHeight: 49, letterSpacing: -2.1 },
  heroDescription: { maxWidth: 545, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 17, lineHeight: 29 },
  heroActions: { paddingTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  heroPreview: { width: '47%', maxWidth: 570 },
  credibilityBand: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 68, marginTop: -42, marginBottom: 74, paddingHorizontal: 24, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, boxShadow: '0 16px 44px rgba(20,33,25,0.07)' },
  credibilityText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  credibilityDivider: { color: landingColors.accent, fontFamily: landingTypography.displayBold, fontSize: 18 },
  content: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 24, gap: 148 },
  sectionHeading: { maxWidth: landingLayout.copyWidth, gap: 12 },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  sectionTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 44, lineHeight: 49, letterSpacing: -1.65 },
  sectionDescription: { maxWidth: 600, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25 },
  searchSection: { paddingVertical: 48, paddingHorizontal: 40, gap: 32, borderRadius: landingRadii.xl, backgroundColor: 'rgba(239,236,226,0.72)', borderWidth: 1, borderColor: 'rgba(41,75,58,0.06)', transform: [{ translateY: -72 }] },
  searchPanel: { padding: 16, gap: 14, borderRadius: landingRadii.lg },
  searchFields: { flexDirection: 'row', gap: 10 },
  searchFieldsStacked: { flexDirection: 'column' },
  inputShell: { flex: 1, minHeight: 58, paddingHorizontal: 17, flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: 'rgba(41,75,58,0.12)', borderRadius: landingRadii.md, backgroundColor: 'rgba(255,254,250,0.86)' },
  input: { flex: 1, color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 14, outlineStyle: 'none' } as never,
  chips: { gap: 8 },
  chip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: landingRadii.pill, backgroundColor: landingColors.surfaceSoft, borderWidth: 1, borderColor: landingColors.border },
  chipSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand },
  chipText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: landingColors.white },
  resultsSection: { marginTop: -36, paddingVertical: 16, gap: 40 },
  resultsHeadingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18 },
  resultsCount: { color: landingColors.brand, fontFamily: landingTypography.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
  establishmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  establishmentCard: { width: '100%', overflow: 'hidden', borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, borderWidth: 1, borderColor: 'rgba(41,75,58,0.08)', boxShadow: '0 16px 50px rgba(20,33,25,0.08)', transitionProperty: 'transform, box-shadow, border-color' as never, transitionDuration: '260ms' as never },
  establishmentCardHovered: { transform: [{ translateY: -4 }], borderColor: 'rgba(41,75,58,0.22)', boxShadow: '0 24px 62px rgba(20,33,25,0.15)' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  cover: { height: 210, transitionProperty: 'transform' as never, transitionDuration: '420ms' as never },
  coverHovered: { transform: [{ scale: 1.035 }] },
  cardBody: { padding: 20, gap: 11 },
  cardTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  metaText: { flex: 1, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 17 },
  openText: { color: landingColors.success, fontFamily: landingTypography.bodyMedium },
  cardFooter: { minHeight: 48, paddingTop: 12, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  priceText: { flex: 1, color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 12 },
  bookingButton: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: landingRadii.pill, backgroundColor: landingColors.brand },
  bookingButtonText: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  resultsNote: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },
  stateCard: { minHeight: 190, padding: 30, alignItems: 'center', justifyContent: 'center', gap: 12, borderRadius: landingRadii.lg, backgroundColor: landingColors.surfaceSoft },
  stateTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16, textAlign: 'center' },
  stateText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 13, textAlign: 'center' },
  journeySection: { paddingHorizontal: 8, gap: 38 },
  journeyGrid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: landingColors.border },
  journeyItem: { flex: 1, minWidth: 240, minHeight: 200, paddingVertical: 36, paddingHorizontal: 24, gap: 14, borderRightWidth: 1, borderRightColor: landingColors.border },
  journeyTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepNumber: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 13 },
  journeyTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 23 },
  journeyText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  platformFlow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  platformStep: { flex: 1, minWidth: 180, minHeight: 68, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(220,232,224,0.22)' },
  platformIndex: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 11 },
  platformLabel: { flex: 1, color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  faqSection: { paddingHorizontal: 8, gap: 34 },
  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  faqItem: { flex: 1, minWidth: 250, paddingTop: 24, gap: 12, borderTopWidth: 1, borderTopColor: landingColors.border },
  faqQuestion: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  faqAnswer: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  finalCta: { alignItems: 'flex-start', paddingVertical: 88, paddingHorizontal: 56, gap: 18, borderRadius: landingRadii.xl, backgroundColor: landingColors.canvasWarm },
  finalCtaEyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  finalCtaTitle: { maxWidth: 720, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 42, lineHeight: 48, letterSpacing: -1.8 },
  finalCtaText: { maxWidth: 590, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
  footer: { minHeight: 130, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' },
  footerBrand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  footerText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerLink: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
