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
  Clock3,
  Flower2,
  Hand,
  LayoutGrid,
  LogIn,
  MapPin,
  Scissors,
  Search,
  Sparkles,
  Star,
  BriefcaseBusiness,
} from 'lucide-react-native';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../theme/landing-tokens';
import { Establishment } from '@cutsync/database';
import { getOpeningStatus } from '@cutsync/domain';
import { trackLandingEvent } from './landing-analytics';
import { EstablishmentMedia } from './landing-primitives';
import { GlassSurface, MagneticButton, MaskedReveal, RevealOnScroll, SectionReveal, SpotlightSection, StaggerGroup, StaggerItem } from './motion/landing-effects';
import { LandingMotionProvider, useLandingMotion, useReducedMotion } from './motion/landing-motion';
import { ProductPreview } from './product-preview';
import { AccessPath, AccessPathModal } from './access-path-modal';
import { LANDING_CLIENT_DISCOVERY, LandingSectionId } from './landing-content';
import { ConnectedEcosystem } from './sections/connected-ecosystem';
import { ContactSection } from './sections/contact-section';
import { DeviceShowcase } from './sections/device-showcase';
import { EditorialScene } from './sections/editorial-scene';
import { FaqSection } from './sections/faq-section';
import { FutureVision } from './sections/future-vision';
import { HowToStart } from './sections/how-to-start';
import { LandingFooter } from './sections/landing-footer';
import { LandingNav } from './sections/landing-nav';
import { ProductTransparency } from './sections/product-transparency';
import { ProposalValues } from './sections/proposal-values';
import { ResourcesHub } from './sections/resources-hub';
import { SecurityPrivacy } from './sections/security-privacy';
import { ServicesCapabilities } from './sections/services-capabilities';
import { TestimonialsSection } from './sections/testimonials-section';
import { useSectionAnchors } from './sections/use-section-anchors';

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

const serviceGroups = [
  { id: 'all', label: 'Todos', icon: LayoutGrid, terms: [] },
  { id: 'hair', label: 'Cabelo', icon: Scissors, terms: ['corte', 'cabelo', 'escova', 'penteado'] },
  { id: 'barber', label: 'Barba', icon: Sparkles, terms: ['barba', 'barbearia', 'bigode'] },
  { id: 'nails', label: 'Unhas', icon: Hand, terms: ['unha', 'manicure', 'pedicure', 'nail'] },
  { id: 'wellness', label: 'Bem-estar', icon: Flower2, terms: ['massagem', 'estética', 'spa', 'sobrancelha'] },
] as const;

/** Transições declarativas só existem na web; ficam fora do StyleSheet como os tokens de sombra. */
const cardMotion = { transitionProperty: 'transform, box-shadow, border-color', transitionDuration: '260ms' } as never;
const coverMotion = { transitionProperty: 'transform', transitionDuration: '420ms' } as never;

const SectionHeading = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) => {
  const { width } = useWindowDimensions();
  const compact = width < landingLayout.mobileBreakpoint;

  return (
    <View style={styles.sectionHeading}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text accessibilityRole="header" style={[styles.sectionTitle, compact && styles.sectionTitleCompact]}>{title}</Text>
      <Text style={styles.sectionDescription}>{description}</Text>
    </View>
  );
};

const ClientLandingContent = () => {
  const router = useRouter();
  const params = useLocalSearchParams<{ audience?: string }>();
  const { user, profile } = useAuth();
  const { width } = useWindowDimensions();
  const reducedMotion = useReducedMotion();
  const { quality } = useLandingMotion();
  const isDesktop = width >= landingLayout.desktopBreakpoint;
  const isMobile = width < landingLayout.mobileBreakpoint;
  // A busca só cabe em uma linha única a partir de 900px; abaixo disso os campos empilham.
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
  const resultCardWidth = (resultGridWidth - (resultColumns - 1) * 18) / resultColumns;

  const navigateToSection = useCallback((section: LandingSectionId) => {
    trackLandingEvent({ name: 'section_navigated', page: 'client', section });
    scrollToSection(section);
  }, [scrollToSection]);

  const scrollToResults = (position: 'hero_primary' | 'final') => {
    trackLandingEvent({ name: 'cta_clicked', page: 'client', position, destination: 'search' });
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
          {isDesktop && <LandingNav audience="client" onNavigate={navigateToSection} />}
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
              <Text style={styles.heroBadgeText}>{hero.badge}</Text>
            </SectionReveal>
            <MaskedReveal delay={70}>
              <Text accessibilityRole="header" style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>{hero.title}</Text>
            </MaskedReveal>
            <SectionReveal delay={210}><Text style={styles.heroDescription}>{hero.description}</Text></SectionReveal>
            <SectionReveal delay={280}>
              <GlassSurface variant="search" style={[styles.searchPanel, inlineSearch && styles.searchPanelInline, !isDesktop && styles.searchPanelConstrained]}>
                <View style={[styles.searchFields, !inlineSearch && styles.searchFieldsStacked]}>
                  <View style={styles.searchField}>
                    <Search size={18} color={landingColors.inkMuted} />
                    <TextInput
                      testID="landing-search-input"
                      accessibilityLabel="Buscar por estabelecimento ou serviço"
                      value={query}
                      onChangeText={(value) => {
                        if (value) reportSearchStarted(locationQuery ? 2 : 1);
                        setQuery(value);
                      }}
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
                      onChangeText={(value) => {
                        if (value) reportSearchStarted(query ? 2 : 1);
                        setLocationQuery(value);
                      }}
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
                    onPress={() => scrollToResults('hero_primary')}
                    style={({ pressed }) => [styles.searchSubmit, !inlineSearch && styles.searchSubmitStacked, pressed && styles.pressed]}
                  >
                    <Search size={17} color={landingColors.white} />
                    <Text style={styles.searchSubmitText}>{hero.submitLabel}</Text>
                  </Pressable>
                </View>
              </GlassSurface>
            </SectionReveal>
            <SectionReveal delay={340}>
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
                      onPress={() => {
                        if (group.id !== 'all') reportSearchStarted((query ? 1 : 0) + (locationQuery ? 1 : 0) + 1);
                        setServiceGroup(group.id);
                      }}
                      style={[styles.chip, selected && styles.chipSelected]}
                    >
                      <Icon size={15} color={selected ? landingColors.white : landingColors.inkSecondary} />
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{group.label}</Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </SectionReveal>
            <SectionReveal delay={390} style={styles.heroActions}>
              <MagneticButton label={hero.primaryCta} onPress={() => scrollToResults('hero_primary')} testID="landing-hero-client-cta" />
              <MagneticButton label={hero.secondaryCta} secondary onPress={scrollToJourney} testID="landing-hero-client-secondary-cta" />
              {!isDesktop && <MagneticButton label={hero.businessCta} secondary testID="landing-business-link" onPress={() => router.push('/para-estabelecimentos' as never)} />}
            </SectionReveal>
          </View>
          {isDesktop && (
            <MaskedReveal delay={470} style={styles.heroPreview}><ProductPreview
              variant="client"
              accessibilityLabel="Demonstração ilustrativa do fluxo de agendamento do CutSync"
              style={{ width: '100%' }}
            /></MaskedReveal>
          )}
        </SpotlightSection>

        <View testID="landing-client-credibility" style={styles.credibilityBand}>
          {trust.map((label, index) => (
            <React.Fragment key={label}>
              {index > 0 && <Text style={styles.credibilityDivider}>·</Text>}
              <Text style={styles.credibilityText}>{label}</Text>
            </React.Fragment>
          ))}
        </View>

        <View style={styles.content} onLayout={setBaseline}>
          <RevealOnScroll
            onLayout={registerSection('search')}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'search' })}
            style={styles.resultsSection}
          >
            <View style={styles.resultsHeadingRow}>
              <SectionHeading eyebrow={searchCopy.eyebrow} title={searchCopy.title} description={searchCopy.description} />
              <Text testID="landing-results-count" style={styles.resultsCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento' : 'estabelecimentos'}</Text>
            </View>

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
                      style={({ pressed }) => [styles.establishmentCard, cardMotion, hovered && styles.establishmentCardHovered, pressed && styles.pressed]}
                    >
                      <View style={styles.coverShell}>
                        <EstablishmentMedia name={establishment.name} uri={establishment.bannerUrl || establishment.logoUrl} style={[styles.cover, coverMotion, hovered && styles.coverHovered]} />
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
                        {!!establishment.address && <View style={styles.metaRow}><MapPin size={14} color={landingColors.inkMuted} /><Text numberOfLines={2} style={styles.metaText}>{establishment.address}</Text></View>}
                        {!!opening.text && <View style={styles.metaRow}><Clock3 size={14} color={opening.isOpen ? landingColors.success : landingColors.inkMuted} /><Text style={[styles.metaText, opening.isOpen && styles.openText]}>{opening.isOpen ? `Aberto · ${opening.text}` : opening.text}</Text></View>}
                        <View style={styles.cardFooter}>
                          <Text style={styles.priceText}>{startingPrice ? `A partir de R$ ${startingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : searchCopy.noPriceLabel}</Text>
                          <Pressable testID={`landing-booking-${establishment.id}`} accessibilityRole="button" accessibilityLabel={`Ver horários de ${establishment.name}`} onPress={(event) => { event.stopPropagation?.(); openEstablishment(establishment, true); }} style={styles.bookingButton}>
                            <Text style={styles.bookingButtonText}>{searchCopy.bookingLabel}</Text><ArrowRight size={15} color={landingColors.white} />
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
          </RevealOnScroll>

          <HowToStart
            audience="client"
            testID="landing-client-journey"
            onLayout={registerSection('how_to_start') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'journey' })}
          >
            <MagneticButton label={searchCopy.finalCta} onPress={() => scrollToResults('final')} testID="landing-client-final-cta" />
          </HowToStart>

          <ServicesCapabilities
            audience="client"
            onLayout={registerSection('services') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'services' })}
          />

          <EditorialScene
            source="client"
            caption="Cena ilustrativa"
            alternativeText="Cena ilustrativa de uma cliente escolhendo um horário pelo celular em um ambiente brasileiro de autocuidado."
          />

          <ConnectedEcosystem
            audience="client"
            onLayout={registerSection('ecosystem') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'ecosystem' })}
          />

          <DeviceShowcase
            audience="client"
            onLayout={registerSection('devices') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'devices' })}
          />

          <ProposalValues
            audience="client"
            onLayout={registerSection('proposal_values') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'proposal_values' })}
          />

          <ProductTransparency
            audience="client"
            onLayout={registerSection('transparency') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'transparency' })}
          />

          <SecurityPrivacy
            audience="client"
            onLayout={registerSection('security') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'security' })}
          />

          <ResourcesHub
            audience="client"
            onNavigate={navigateToSection}
            onLayout={registerSection('resources') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'resources' })}
          />

          <TestimonialsSection
            audience="client"
            onLayout={registerSection('testimonials') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'testimonials' })}
          />

          <FaqSection
            audience="client"
            onLayout={registerSection('faq') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'faq' })}
          />

          <ContactSection audience="client" onLayout={registerSection('contact') as never} />

          <FutureVision
            audience="client"
            onLayout={registerSection('future') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'client', section: 'future' })}
          />

          <LandingFooter audience="client" onNavigate={navigateToSection} />
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
  heroSection: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', minHeight: 760, paddingHorizontal: 28, paddingTop: 88, paddingBottom: 112, flexDirection: 'row', alignItems: 'center', gap: 64 },
  heroSectionStacked: { minHeight: 0, paddingTop: 56, paddingBottom: 72, flexDirection: 'column', alignItems: 'stretch' },
  heroCopy: { flex: 1.08, minWidth: 280, gap: 18, zIndex: 2 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 9 },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: landingColors.success },
  heroBadgeText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { maxWidth: 650, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 68, lineHeight: 72, letterSpacing: -3.4 },
  heroTitleMobile: { fontSize: 40, lineHeight: 45, letterSpacing: -1.9 },
  heroDescription: { maxWidth: 545, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 17, lineHeight: 29 },
  heroActions: { paddingTop: 4, flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  heroPreview: { width: '49%', maxWidth: 620 },

  // Busca unificada: um único controle no desktop, campos empilhados abaixo do breakpoint.
  searchPanel: { padding: 8, gap: 8, borderRadius: landingRadii.lg, backgroundColor: 'rgba(255,254,250,0.94)' },
  searchPanelInline: { borderRadius: landingRadii.pill },
  searchPanelConstrained: { maxWidth: 720 },
  searchFields: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  searchFieldsStacked: { flexDirection: 'column', alignItems: 'stretch', gap: 8 },
  searchField: { flex: 1, minWidth: 0, minHeight: 56, paddingHorizontal: 18, flexDirection: 'row', alignItems: 'center', gap: 11 },
  searchDivider: { width: 1, alignSelf: 'stretch', marginVertical: 12, backgroundColor: landingColors.border },
  searchDividerStacked: { width: '100%', height: 1, alignSelf: 'auto', marginVertical: 0 },
  input: { flex: 1, minWidth: 0, color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 14, outlineStyle: 'none' } as never,
  searchSubmit: { minHeight: 52, paddingHorizontal: 24, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: landingRadii.pill, backgroundColor: landingColors.brand },
  searchSubmitStacked: { minHeight: 54 },
  searchSubmitText: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  chips: { gap: 8, paddingVertical: 2 },
  chip: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 16, borderRadius: landingRadii.pill, backgroundColor: landingColors.surfaceSoft, borderWidth: 1, borderColor: landingColors.border },
  chipSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand },
  chipText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: landingColors.white },

  credibilityBand: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 68, marginTop: -42, marginBottom: 74, paddingHorizontal: 24, alignSelf: 'center', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, boxShadow: '0 16px 44px rgba(20,33,25,0.07)' },
  credibilityText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  credibilityDivider: { color: landingColors.accent, fontFamily: landingTypography.displayBold, fontSize: 18 },
  content: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 24, gap: 148 },
  sectionHeading: { flexShrink: 1, minWidth: 0, maxWidth: landingLayout.copyWidth, gap: 12 },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  sectionTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 44, lineHeight: 49, letterSpacing: -1.65 },
  sectionTitleCompact: { fontSize: 32, lineHeight: 38, letterSpacing: -1.1 },
  sectionDescription: { maxWidth: 600, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25 },

  resultsSection: { paddingVertical: 48, gap: 40 },
  resultsHeadingRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18 },
  resultsCount: { color: landingColors.brand, fontFamily: landingTypography.mono, fontSize: 13, fontVariant: ['tabular-nums'] },
  establishmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 18 },
  establishmentCard: { width: '100%', overflow: 'hidden', borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, borderWidth: 1, borderColor: 'rgba(41,75,58,0.08)', boxShadow: '0 16px 50px rgba(20,33,25,0.08)' },
  establishmentCardHovered: { transform: [{ translateY: -4 }], borderColor: 'rgba(41,75,58,0.22)', boxShadow: '0 24px 62px rgba(20,33,25,0.15)' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  coverShell: { position: 'relative', overflow: 'hidden' },
  cover: { height: 210 },
  coverHovered: { transform: [{ scale: 1.035 }] },
  ratingBadge: { position: 'absolute', top: 12, right: 12, minHeight: 30, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: landingRadii.pill, backgroundColor: 'rgba(255,254,250,0.94)' },
  ratingBadgeText: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  ratingBadgeCount: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 11 },
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
});
