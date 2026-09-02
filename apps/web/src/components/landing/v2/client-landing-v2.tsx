import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  ArrowRight,
  Bell,
  CalendarClock,
  CalendarPlus,
  Flower2,
  Hand,
  LayoutGrid,
  MapPin,
  RefreshCw,
  Scissors,
  Search,
  Sparkles,
  Star,
  Store,
  User,
} from 'lucide-react-native';
import { useAuth } from '../../../contexts/AuthContext';
import { resolveWebOperationalSurface, useOperationalContext } from '../../../contexts/operational-context';
import { supabase } from '../../../services/supabase';
import { Establishment } from '@cutsync/database';
import { getOpeningStatus } from '@cutsync/domain';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { trackLandingEvent } from '../landing-analytics';
import { LandingSectionId, LANDING_CLIENT_DISCOVERY, LANDING_CONTENT } from '../landing-content';
import { EstablishmentMedia } from '../landing-primitives';
import { MagneticButton, MaskedReveal, SectionReveal, StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LandingMotionProvider, useLandingMotion, useReducedMotion } from '../motion/landing-motion';
import { resolveTypeSize, useLandingLayout } from '../landing-layout';
import { useSectionAnchors } from '../sections/use-section-anchors';
import {
  V2Container,
  V2CtaBand,
  V2Ecosystem,
  V2FeatureGrid,
  V2Footer,
  V2Faq,
  V2Header,
  V2SecurityList,
  V2Section,
  V2StepList,
  V2Testimonial,
} from './landing-v2-shared';

interface PublicService {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface PublicEstablishment extends Establishment {
  services: PublicService[];
}

const { hero, trust, search: searchCopy } = LANDING_CLIENT_DISCOVERY;
const CONTENT = LANDING_CONTENT.client;

const serviceGroups = [
  { id: 'all', label: 'Todos', icon: LayoutGrid, terms: [] },
  { id: 'hair', label: 'Cabelo', icon: Scissors, terms: ['corte', 'cabelo', 'escova', 'penteado'] },
  { id: 'barber', label: 'Barba', icon: Sparkles, terms: ['barba', 'barbearia', 'bigode'] },
  { id: 'nails', label: 'Unhas', icon: Hand, terms: ['unha', 'manicure', 'pedicure', 'nail'] },
  { id: 'wellness', label: 'Bem-estar', icon: Flower2, terms: ['massagem', 'estética', 'spa', 'sobrancelha'] },
] as const;

const CLIENT_FEATURE_ICONS = [
  Search,
  Store,
  User,
  CalendarPlus,
  CalendarClock,
  RefreshCw,
  Star,
  Bell,
] as const;

const ClientLandingContent = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ audience?: string }>();
  const { user } = useAuth();
  const { activeContext } = useOperationalContext();
  const layout = useLandingLayout();
  const { breakpoint, contentWidth, gutter, isDesktop, width } = layout;
  const reducedMotion = useReducedMotion();
  const { quality } = useLandingMotion();
  const inlineSearch = width >= 900;
  const scrollRef = useRef<ScrollView>(null);
  const reportedDepths = useRef(new Set<50 | 100>());
  const { setBaseline, registerSection, scrollToSection } = useSectionAnchors(scrollRef, reducedMotion);
  const searchReported = useRef(false);
  const [establishments, setEstablishments] = useState<PublicEstablishment[]>([]);
  const [hoveredEstablishment, setHoveredEstablishment] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [serviceGroup, setServiceGroup] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

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
      const { data, error: queryError } = await supabase.rpc('list_public_discovery_establishments' as never, {
        result_limit: 50,
      } as never);
      if (queryError) throw queryError;
      setEstablishments(((data ?? []) as unknown as (Record<string, unknown> & { services?: PublicService[] })[]).map((row) => ({
        id: String(row.id),
        name: String(row.name),
        slug: String(row.slug),
        logoUrl: row.logo_url ? String(row.logo_url) : null,
        bannerUrl: row.banner_url ? String(row.banner_url) : null,
        primaryColor: landingColors.brand,
        timezone: row.timezone ? String(row.timezone) : 'America/Sao_Paulo',
        currency: row.currency ? String(row.currency) : 'BRL',
        description: row.description ? String(row.description) : null,
        address: row.address ? String(row.address) : null,
        openingHours: row.opening_hours ? String(row.opening_hours) : null,
        averageRating: Number(row.average_rating ?? 0),
        reviewCount: Number(row.review_count ?? 0),
        discoveryStatus: 'published',
        publishedAt: row.published_at ? String(row.published_at) : null,
        services: (Array.isArray(row.services) ? row.services : [])
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
      const searchable = [establishment.name, establishment.description, ...serviceNames].filter(Boolean).join(' ').toLocaleLowerCase('pt-BR');
      const address = establishment.address?.toLocaleLowerCase('pt-BR') ?? '';
      const matchesSearch = !search || searchable.includes(search);
      const matchesPlace = !place || address.includes(place);
      const matchesGroup = group.terms.length === 0 || serviceNames.some((name) => group.terms.some((term) => name.includes(term)));
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

  const maximumResultColumns = Math.max(1, Math.min(layout.columns, 3));
  const resultColumns = Math.min(maximumResultColumns, Math.max(filtered.length, 1));
  const resultCardWidth = Math.max(240, (contentWidth - gutter * (resultColumns - 1)) / resultColumns);
  const heroTitleSize = resolveTypeSize('display', breakpoint);

  const navigateToSection = useCallback((section: LandingSectionId) => {
    trackLandingEvent({ name: 'section_navigated', page: 'client', section });
    scrollToSection(section);
  }, [scrollToSection]);

  const scrollToResults = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'client', position: 'hero_primary', destination: 'search' });
    scrollToSection('search');
  };

  const reportSearchStarted = (filterCount: number) => {
    if (searchReported.current) return;
    searchReported.current = true;
    trackLandingEvent({ name: 'search_started', source: 'hero', filterCount });
  };

  const scrollToJourney = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'client', position: 'hero_secondary', destination: 'journey' });
    navigateToSection('how_to_start');
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
    trackLandingEvent({ name: booking ? 'booking_started' : 'establishment_opened', establishmentId: establishment.id });
    router.push((booking ? `/${establishment.slug}/booking` : `/${establishment.slug}`) as never);
  };

  const openAccount = () => {
    if (!user) {
      router.push({ pathname: '/(auth)/login', params: { audience: 'client' } } as never);
      return;
    }
    const surface = resolveWebOperationalSurface(activeContext);
    router.push((surface === 'admin' ? '/admin' : surface === 'professional' ? '/professional' : '/explore') as never);
  };

  if (redirectingToBusiness) {
    return (
      <View testID="v2-landing-legacy-redirect" style={styles.redirectState}>
        <ActivityIndicator color={landingColors.brand} />
      </View>
    );
  }

  const clientFeatures = CONTENT.services.items.map((item, index) => ({
    ...item,
    icon: CLIENT_FEATURE_ICONS[index % CLIENT_FEATURE_ICONS.length],
  }));

  const testimonials = [
    { quote: 'Achei o salão pelo bairro, vi o preço do corte e agendei sem trocar mensagem nenhuma. Exatamente o que eu queria.', author: 'Marina, cliente' },
    { quote: 'Consigo comparar o que cada lugar oferece antes de decidir. O horário aparece como está na agenda do estabelecimento.', author: 'Rafael, cliente' },
  ];

  return (
    <View testID="client-public-landing-v2" style={styles.root}>
      <V2Header audience="client" navItems={[{ id: 'search', label: 'Explorar' }, { id: 'how_to_start', label: 'Como funciona' }, { id: 'security', label: 'Confiança' }, { id: 'contact', label: 'Contato' }]} onNavigate={navigateToSection} />

      <ScrollView ref={scrollRef} onScroll={trackScrollDepth} scrollEventThrottle={32} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <V2Container>
          <View style={[styles.hero, { gap: gutter * 2 }]}>
            <View style={styles.heroCopy}>
              <Text testID="landing-client-hero-brand" style={styles.heroBrand}>CutSync</Text>
              <SectionReveal style={styles.heroBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.heroBadgeText}>{hero.badge}</Text>
              </SectionReveal>
              <MaskedReveal>
                <Text accessibilityRole="header" style={[styles.heroTitle, { fontSize: heroTitleSize, lineHeight: heroTitleSize * 1.1, letterSpacing: heroTitleSize * -0.042 }]}>
                  {hero.title}
                </Text>
              </MaskedReveal>
              <Text style={styles.heroDescription}>{hero.description}</Text>

              <View style={[styles.searchPanel, inlineSearch && styles.searchPanelInline]}>
                <View style={[styles.searchFields, !inlineSearch && styles.searchFieldsStacked]}>
                  <View style={styles.searchField}>
                    <Search size={18} color={landingColors.inkMuted} />
                    <TextInput
                      testID="landing-search-input"
                      accessibilityLabel="Buscar por estabelecimento ou serviço"
                      value={query}
                      onChangeText={(value) => { if (value) reportSearchStarted(locationQuery ? 2 : 1); setQuery(value); }}
                      onSubmitEditing={() => scrollToSection('search')}
                      returnKeyType="search"
                      placeholder={hero.searchPlaceholder}
                      placeholderTextColor={landingColors.inkMuted}
                      style={styles.input}
                    />
                  </View>
                  <View style={[styles.searchDivider, !inlineSearch && styles.searchDividerStacked]} />
                  <View style={styles.searchField}>
                    <MapPin size={18} color={landingColors.inkMuted} />
                    <TextInput
                      testID="landing-location-input"
                      accessibilityLabel="Filtrar por bairro ou cidade"
                      value={locationQuery}
                      onChangeText={(value) => { if (value) reportSearchStarted(query ? 2 : 1); setLocationQuery(value); }}
                      onSubmitEditing={() => scrollToSection('search')}
                      returnKeyType="search"
                      placeholder={hero.locationPlaceholder}
                      placeholderTextColor={landingColors.inkMuted}
                      style={styles.input}
                    />
                  </View>
                  <Pressable
                    testID="landing-search-submit"
                    accessibilityRole="button"
                    accessibilityLabel="Ver estabelecimentos encontrados"
                    onPress={() => scrollToResults()}
                    style={({ pressed }) => [styles.searchSubmit, !inlineSearch && styles.searchSubmitStacked, pressed && styles.pressed]}
                  >
                    <Search size={17} color={landingColors.white} />
                    <Text style={styles.searchSubmitText}>{hero.submitLabel}</Text>
                  </Pressable>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {availableServiceGroups.map((group) => {
                  const selected = group.id === serviceGroup;
                  const Icon = group.icon;
                  return (
                    <Pressable
                      key={group.id}
                      testID={`landing-service-filter-${group.id}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => { if (group.id !== 'all') reportSearchStarted((query ? 1 : 0) + (locationQuery ? 1 : 0) + 1); setServiceGroup(group.id); }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Icon size={15} color={selected ? landingColors.white : landingColors.inkSecondary} />
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{group.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              <View style={styles.heroActions}>
                <MagneticButton label={hero.primaryCta} onPress={() => scrollToResults()} testID="landing-hero-client-cta" />
                <MagneticButton label={hero.secondaryCta} secondary onPress={scrollToJourney} testID="landing-hero-client-secondary-cta" />
                {!isDesktop && (
                  <MagneticButton label={hero.businessCta} secondary testID="landing-business-link" onPress={() => router.push('/para-estabelecimentos' as never)} />
                )}
              </View>
            </View>
          </View>

          <View testID="landing-client-credibility" style={styles.credibilityBand}>
            {trust.map((label, index) => (
              <React.Fragment key={label}>
                {index > 0 && <Text style={styles.credibilityDivider}>·</Text>}
                <Text style={styles.credibilityText}>{label}</Text>
              </React.Fragment>
            ))}
          </View>
        </V2Container>

        <V2Container>
          <V2Section
            id="search"
            testID="landing-client-results"
            onLayout={registerSection('search') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'search' })}
            eyebrow={searchCopy.eyebrow}
            title={searchCopy.title}
            description={searchCopy.description}
            detail={<Text testID="landing-results-count" style={styles.resultsCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento' : 'estabelecimentos'}</Text>}
          >
            {loading ? (
              <View testID="landing-results-loading" style={styles.stateCard}>
                <ActivityIndicator color={landingColors.brand} />
                <Text style={styles.stateText}>{searchCopy.loadingLabel}</Text>
              </View>
            ) : error ? (
              <View testID="landing-results-error" style={styles.stateCard}>
                <Text style={styles.stateTitle}>{searchCopy.errorTitle}</Text>
                <Text selectable style={styles.stateText}>{error}</Text>
                <MagneticButton label={searchCopy.retryLabel} secondary onPress={() => void loadEstablishments()} />
              </View>
            ) : filtered.length === 0 ? (
              <View testID="landing-results-empty" style={styles.stateCard}>
                <Search size={24} color={landingColors.inkMuted} />
                <Text style={styles.stateTitle}>{searchCopy.emptyTitle}</Text>
                <Text style={styles.stateText}>{searchCopy.emptyDescription}</Text>
              </View>
            ) : (
              <StaggerGroup testID="landing-results-grid" style={[styles.establishmentGrid, { gap: gutter }]}>
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
                        <View style={styles.coverShell}>
                          <EstablishmentMedia name={establishment.name} uri={establishment.bannerUrl || establishment.logoUrl} style={styles.cover} />
                          {hasVerifiedRating && (
                            <View style={styles.ratingBadge}>
                              <Star size={12} color={landingColors.accent} fill={landingColors.accent} />
                              <Text style={styles.ratingBadgeText}>{establishment.averageRating?.toFixed(1)}</Text>
                              <Text style={styles.ratingBadgeCount}>({establishment.reviewCount})</Text>
                            </View>
                          )}
                        </View>
                        <View style={styles.cardBody}>
                          <Text numberOfLines={1} style={styles.cardTitle}>{establishment.name}</Text>
                          {!!establishment.address && (
                            <View style={styles.metaRow}><MapPin size={14} color={landingColors.inkMuted} /><Text numberOfLines={2} style={styles.metaText}>{establishment.address}</Text></View>
                          )}
                          {!!opening.text && (
                            <View style={styles.metaRow}>
                              <CalendarClock size={14} color={opening.isOpen ? landingColors.success : landingColors.inkMuted} />
                              <Text style={[styles.metaText, opening.isOpen && styles.openText]}>{opening.isOpen ? `Aberto · ${opening.text}` : opening.text}</Text>
                            </View>
                          )}
                          <View style={styles.cardFooter}>
                            <Text style={styles.priceText}>{startingPrice ? `A partir de R$ ${startingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : searchCopy.noPriceLabel}</Text>
                            <Pressable
                              testID={`landing-booking-${establishment.id}`}
                              accessibilityRole="button"
                              accessibilityLabel={`Ver horários de ${establishment.name}`}
                              onPress={(event) => { event.stopPropagation?.(); openEstablishment(establishment, true); }}
                              style={styles.bookingButton}
                            >
                              <Text style={styles.bookingButtonText}>{searchCopy.bookingLabel}</Text>
                              <ArrowRight size={15} color={landingColors.white} />
                            </Pressable>
                          </View>
                        </View>
                      </Pressable>
                    </StaggerItem>
                  );
                })}
              </StaggerGroup>
            )}
            <Text style={styles.resultsNote}>{searchCopy.note}</Text>
          </V2Section>

          <V2Section
            id="how_to_start"
            testID="landing-client-journey"
            onLayout={registerSection('how_to_start') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'journey' })}
            eyebrow={CONTENT.howToStart.eyebrow}
            title={CONTENT.howToStart.title}
            description={CONTENT.howToStart.description}
          >
            <V2StepList steps={CONTENT.howToStart.steps} />
          </V2Section>

          <V2Section
            id="services"
            onLayout={registerSection('services') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'services' })}
            eyebrow={CONTENT.services.eyebrow}
            title={CONTENT.services.title}
            description={CONTENT.services.description}
          >
            <V2FeatureGrid items={clientFeatures} />
            <Text style={styles.resultsNote}>{CONTENT.services.note}</Text>
          </V2Section>

          <V2Section
            id="ecosystem"
            onLayout={registerSection('ecosystem') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'ecosystem' })}
            eyebrow={CONTENT.ecosystem.eyebrow}
            title={CONTENT.ecosystem.title}
            description={CONTENT.ecosystem.description}
          >
            <V2Ecosystem steps={CONTENT.ecosystem.steps} note={CONTENT.ecosystem.note} />
          </V2Section>

          <V2Section
            id="proposal_values"
            onLayout={registerSection('proposal_values') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'proposal_values' })}
            eyebrow={CONTENT.proposal.eyebrow}
            title={CONTENT.proposal.title}
            description={CONTENT.proposal.statement}
          >
            <V2FeatureGrid items={CONTENT.proposal.values.map((value) => ({ title: value.title, description: value.description }))} />
          </V2Section>

          <V2Section
            id="security"
            onLayout={registerSection('security') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'security' })}
            eyebrow={CONTENT.security.eyebrow}
            title={CONTENT.security.title}
            description={CONTENT.security.description}
          >
            <V2SecurityList items={CONTENT.security.items} />
          </V2Section>

          <V2Section
            id="testimonials"
            eyebrow="QUEM AGENDA, APROVA"
            title="O que muda na hora de marcar."
            align="center"
          >
            <View style={[styles.testimonialRow, { gap: gutter, flexDirection: width >= landingLayout.desktopBreakpoint ? 'row' : 'column' }]}>
              {testimonials.map((item, index) => (
                <V2Testimonial key={index} quote={item.quote} author={item.author} />
              ))}
            </View>
          </V2Section>

          <V2Section
            id="faq"
            onLayout={registerSection('faq') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'faq' })}
            eyebrow={CONTENT.faq.eyebrow}
            title={CONTENT.faq.title}
            description={CONTENT.faq.description}
          >
            <V2Faq entries={CONTENT.faq.entries} />
          </V2Section>

          <V2Section
            id="contact"
            onLayout={registerSection('contact') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'contact' })}
            eyebrow={CONTENT.contact.eyebrow}
            title={CONTENT.contact.title}
            description={CONTENT.contact.description}
          >
            <V2CtaBand
              title="Pronto para encontrar seu próximo horário?"
              description="Explore sem cadastro e entre apenas para confirmar o agendamento."
              primaryLabel={hero.primaryCta}
              onPrimary={() => scrollToResults()}
              secondaryLabel={hero.secondaryCta}
              onSecondary={() => scrollToJourney()}
            />
          </V2Section>

          <V2Section
            id="future"
            eyebrow={CONTENT.future.eyebrow}
            title={CONTENT.future.title}
          >
            {CONTENT.future.paragraphs.map((paragraph, index) => (
              <Text key={index} style={styles.futureParagraph}>{paragraph}</Text>
            ))}
          </V2Section>

          <V2Footer audience="client" onNavigate={navigateToSection} />
        </V2Container>
      </ScrollView>
    </View>
  );
};

export const ClientLandingV2 = () => (
  <LandingMotionProvider>
    <ClientLandingContent />
  </LandingMotionProvider>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: landingColors.canvas, overflow: 'hidden' },
  redirectState: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.canvas },
  scroll: { paddingTop: 28, paddingBottom: 36 },

  hero: { width: '100%', maxWidth: 860, paddingTop: 56, paddingBottom: 64, gap: 18 },
  heroCopy: { width: '100%', gap: 18 },
  heroBrand: { color: landingColors.brandStrong, fontFamily: landingTypography.displayBold, fontSize: 38, lineHeight: 42, letterSpacing: -1.4 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: landingColors.success },
  heroBadgeText: { color: landingColors.brandStrong, fontFamily: landingTypography.bodySemiBold, fontSize: 12, letterSpacing: 1.6 },
  heroTitle: { maxWidth: 680, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold },
  heroDescription: { maxWidth: 560, color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 16, lineHeight: 27, opacity: 0.84 },
  heroActions: { paddingTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },

  searchPanel: { maxWidth: 720, padding: 8, gap: 8, borderWidth: 1, borderColor: landingColors.borderStrong, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface },
  searchPanelInline: { borderRadius: landingRadii.pill },
  searchFields: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchFieldsStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  searchField: { flex: 1, minWidth: 0, minHeight: 54, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 11 },
  searchDivider: { width: 1, alignSelf: 'stretch', marginVertical: 12, backgroundColor: landingColors.border },
  searchDividerStacked: { width: '100%', height: 1, alignSelf: 'auto', marginVertical: 0 },
  input: { flex: 1, minWidth: 0, color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 14, outlineStyle: 'none' } as never,
  searchSubmit: { minHeight: 50, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: landingRadii.pill, backgroundColor: landingColors.brand },
  searchSubmitStacked: { minHeight: 52 },
  searchSubmitText: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 15, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface, borderWidth: 1, borderColor: landingColors.border },
  chipSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand },
  chipText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: landingColors.white },

  credibilityBand: { width: '100%', minHeight: 56, marginTop: 8, marginBottom: 8, paddingHorizontal: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  credibilityText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  credibilityDivider: { color: landingColors.accent, fontFamily: landingTypography.displayBold, fontSize: 18 },

  resultsCount: { color: landingColors.brand, fontFamily: landingTypography.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
  establishmentGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  establishmentCard: { width: '100%', overflow: 'hidden', borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  establishmentCardHovered: { transform: [{ translateY: -4 }], borderColor: landingColors.borderStrong },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  coverShell: { position: 'relative', overflow: 'hidden' },
  cover: { height: 190 },
  ratingBadge: { position: 'absolute', top: 12, right: 12, minHeight: 28, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  ratingBadgeText: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  ratingBadgeCount: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  cardBody: { flex: 1, padding: 18, gap: 10 },
  cardTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  metaText: { flex: 1, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 17 },
  openText: { color: landingColors.success, fontFamily: landingTypography.bodyMedium },
  cardFooter: { minHeight: 46, paddingTop: 12, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  priceText: { flex: 1, color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 12 },
  bookingButton: { minHeight: 40, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: landingRadii.pill, backgroundColor: landingColors.brand },
  bookingButtonText: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  resultsNote: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },

  stateCard: { minHeight: 180, padding: 28, alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surfaceSoft },
  stateTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16, textAlign: 'center' },
  stateText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 13, textAlign: 'center' },

  testimonialRow: { alignItems: 'stretch' },
  futureParagraph: { maxWidth: 720, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25, marginTop: 8 },
});
