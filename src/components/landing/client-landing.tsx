import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  useWindowDimensions,
} from 'react-native';
import { Image } from 'expo-image';
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
import { Establishment, mapEstablishment } from '../../types/database';
import { getOpeningStatus } from '../../utils/schedule';
import { AudienceSelector } from './audience-selector';
import { LandingAudience, trackLandingEvent } from './landing-analytics';
import { ProductPreview } from './product-preview';
import { GlassSurface, MagneticButton, RevealOnScroll, SpotlightSection } from './motion/landing-effects';
import { LandingMotionProvider, useReducedMotion } from './motion/landing-motion';
import {
  landingColors,
  landingLayout,
  landingRadii,
  landingShadows,
  landingTypography,
} from '../../theme/landing-tokens';

interface PublicService {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

interface PublicEstablishment extends Establishment {
  services: PublicService[];
}

const audienceFromParam = (value?: string): LandingAudience => (
  value === 'business' || value === 'observer' ? value : 'client'
);

const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase();

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
  const isDesktop = width >= landingLayout.desktopBreakpoint;
  const isMobile = width < landingLayout.mobileBreakpoint;
  const scrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);
  const searchSectionY = useRef(0);
  const [audience, setAudience] = useState<LandingAudience>(() => audienceFromParam(params.audience));
  const [establishments, setEstablishments] = useState<PublicEstablishment[]>([]);
  const [query, setQuery] = useState('');
  const [locationQuery, setLocationQuery] = useState('');
  const [serviceGroup, setServiceGroup] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    trackLandingEvent({ name: 'landing_viewed', page: 'client' });
  }, []);

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
        services: (row.services ?? []).filter((service) => service.is_active !== false).map((service) => ({ ...service, price: Number(service.price) })),
      })));
    } catch {
      setError('Não foi possível carregar os estabelecimentos agora.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadEstablishments();
  }, [loadEstablishments]);

  const selectAudience = (next: LandingAudience) => {
    setAudience(next);
    router.setParams({ audience: next });
    trackLandingEvent({ name: 'audience_selected', audience: next });
  };

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

  const contentWidth = Math.min(Math.max(width - 40, 280), landingLayout.maxWidth);
  const resultColumns = width >= 1180 ? 3 : width >= landingLayout.mobileBreakpoint ? 2 : 1;
  const resultCardWidth = (contentWidth - (resultColumns - 1) * 16) / resultColumns;

  const scrollToSearch = () => {
    if (audience !== 'client') selectAudience('client');
    const delay = reducedMotion ? 0 : 40;
    setTimeout(() => {
      scrollRef.current?.scrollTo({ y: Math.max(0, searchSectionY.current - 86), animated: !reducedMotion });
      setTimeout(() => searchInputRef.current?.focus(), reducedMotion ? 0 : 260);
    }, delay);
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
      router.push('/login' as never);
      return;
    }
    router.push((profile?.role === 'admin' ? '/admin' : profile?.role === 'professional' ? '/professional' : '/explore') as never);
  };

  const businessPreview = (
    <RevealOnScroll style={styles.businessTeaser}>
      <View style={[styles.businessCopy, !isDesktop && styles.fullWidth]}>
        <Text style={styles.eyebrow}>PARA QUEM FAZ A OPERAÇÃO ACONTECER</Text>
        <Text style={styles.featureTitle}>Agenda, equipe e crescimento sem ruído.</Text>
        <Text style={styles.featureDescription}>Veja uma demonstração segura com dados fictícios e conheça o fluxo pensado para gestores e profissionais.</Text>
        <View style={styles.inlineActions}>
          <MagneticButton label="Conhecer a solução" onPress={() => router.push('/para-estabelecimentos' as never)} testID="landing-business-cta" />
        </View>
      </View>
      <ProductPreview
        variant="owner"
        accessibilityLabel="Demonstração ilustrativa do painel de operação do CutSync"
        style={[styles.previewColumn, !isDesktop && styles.fullWidth]}
      />
    </RevealOnScroll>
  );

  return (
    <View testID="client-public-landing" style={styles.root}>
      <GlassSurface variant="header" style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable accessibilityRole="link" onPress={() => router.replace('/' as never)} style={styles.brandRow}>
            <View style={styles.brandMark}><Sparkles size={17} color={landingColors.white} /></View>
            <Text style={styles.brand}>CutSync</Text>
          </Pressable>
          <View style={styles.headerActions}>
            {isDesktop && (
              <Pressable accessibilityRole="link" onPress={() => router.push('/para-estabelecimentos' as never)} style={styles.headerLink}>
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

      <ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SpotlightSection style={[styles.heroSection, !isDesktop && styles.heroSectionStacked]}>
          <View style={styles.heroGlow} />
          <View style={styles.heroCopy}>
            <View style={styles.heroBadge}>
              <View style={styles.liveDot} />
              <Text style={styles.heroBadgeText}>AGENDA CONECTADA AO ESTABELECIMENTO</Text>
            </View>
            <Text style={[styles.heroTitle, isMobile && styles.heroTitleMobile]}>Seu próximo cuidado,{`\n`}mais perto do que parece.</Text>
            <Text style={styles.heroDescription}>Descubra serviços, compare estabelecimentos e escolha um horário sem ligações ou espera.</Text>
            <View style={styles.heroActions}>
              <MagneticButton label="Explorar estabelecimentos" onPress={scrollToSearch} testID="landing-hero-client-cta" />
              <MagneticButton label="Tenho um negócio" secondary onPress={() => selectAudience('business')} />
            </View>
            <AudienceSelector value={audience} onChange={selectAudience} />
          </View>
          {isDesktop && (
            <ProductPreview
              variant="client"
              accessibilityLabel="Demonstração ilustrativa do fluxo de agendamento do CutSync"
              style={styles.heroPreview}
            />
          )}
        </SpotlightSection>

        <View style={styles.content}>
          {audience === 'business' && businessPreview}

          <RevealOnScroll onLayout={(event) => { searchSectionY.current = event.nativeEvent.layout.y; }}>
            <View testID="landing-search-section" style={styles.searchSection}>
            <SectionHeading
              eyebrow="ESTABELECIMENTOS REAIS"
              title="Encontre o lugar certo para você."
              description="Resultados publicados pelos próprios estabelecimentos, com serviços e horários informados no perfil."
            />
            <GlassSurface variant="search" style={[styles.searchPanel, landingShadows.soft]}>
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

            <View style={styles.resultsHeader}>
              <Text testID="landing-results-count" style={styles.resultsCount}>{filtered.length} {filtered.length === 1 ? 'estabelecimento' : 'estabelecimentos'}</Text>
              <Text style={styles.resultsNote}>Sem disponibilidade inventada: confirme os horários no perfil.</Text>
            </View>

            {loading ? (
              <View testID="landing-results-loading" style={styles.stateCard}>
                <ActivityIndicator color={landingColors.brand} />
                <Text style={styles.stateText}>Buscando estabelecimentos…</Text>
              </View>
            ) : error ? (
              <View testID="landing-results-error" style={styles.stateCard}>
                <Text style={styles.stateTitle}>Não foi possível atualizar a vitrine.</Text>
                <Text style={styles.stateText}>{error}</Text>
                <MagneticButton label="Tentar novamente" secondary onPress={() => void loadEstablishments()} />
              </View>
            ) : filtered.length === 0 ? (
              <View testID="landing-results-empty" style={styles.stateCard}>
                <Search size={24} color={landingColors.inkMuted} />
                <Text style={styles.stateTitle}>Nenhum resultado com esses filtros.</Text>
                <Text style={styles.stateText}>Tente outro serviço, bairro ou cidade.</Text>
              </View>
            ) : (
              <View testID="landing-results-grid" style={styles.establishmentGrid}>
                {filtered.map((establishment) => {
                  const opening = getOpeningStatus(establishment.openingHours, establishment.timezone);
                  const prices = establishment.services.map((service) => service.price).filter((price) => price > 0);
                  const startingPrice = prices.length ? Math.min(...prices) : null;
                  return (
                    <Pressable
                      key={establishment.id}
                      testID={`landing-establishment-${establishment.id}`}
                      accessibilityRole="link"
                      accessibilityLabel={`Ver perfil de ${establishment.name}`}
                      onPress={() => openEstablishment(establishment)}
                      style={({ pressed }) => [styles.establishmentCard, { width: resultCardWidth }, pressed && styles.pressed]}
                    >
                      <View style={styles.cover}>
                        {establishment.bannerUrl || establishment.logoUrl ? (
                          <Image source={{ uri: establishment.bannerUrl || establishment.logoUrl || '' }} style={styles.coverImage} contentFit="cover" transition={180} />
                        ) : (
                          <View style={styles.coverFallback}><Text style={styles.coverInitials}>{initials(establishment.name)}</Text></View>
                        )}
                      </View>
                      <View style={styles.cardBody}>
                        <Text numberOfLines={1} style={styles.cardTitle}>{establishment.name}</Text>
                        {!!establishment.address && <View style={styles.metaRow}><MapPin size={14} color={landingColors.inkMuted} /><Text numberOfLines={2} style={styles.metaText}>{establishment.address}</Text></View>}
                        {!!opening.text && <View style={styles.metaRow}><Clock3 size={14} color={opening.isOpen ? landingColors.success : landingColors.inkMuted} /><Text style={[styles.metaText, opening.isOpen && styles.openText]}>{opening.isOpen ? `Aberto · ${opening.text}` : opening.text}</Text></View>}
                        {!!establishment.averageRating && establishment.averageRating > 0 && (
                          <View style={styles.metaRow}><Star size={14} color={landingColors.accent} fill={landingColors.accent} /><Text style={styles.metaText}>{establishment.averageRating.toFixed(1)}{establishment.reviewCount ? ` · ${establishment.reviewCount} avaliações` : ''}</Text></View>
                        )}
                        <View style={styles.cardFooter}>
                          <Text style={styles.priceText}>{startingPrice ? `A partir de R$ ${startingPrice.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'Consulte os serviços'}</Text>
                          <Pressable accessibilityRole="button" accessibilityLabel={`Ver horários de ${establishment.name}`} onPress={(event) => { event.stopPropagation?.(); openEstablishment(establishment, true); }} style={styles.bookingButton}>
                            <Text style={styles.bookingButtonText}>Ver horários</Text><ArrowRight size={15} color={landingColors.white} />
                          </Pressable>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            )}
            </View>
          </RevealOnScroll>

          {!isDesktop && (
            <RevealOnScroll>
              <ProductPreview variant="client" accessibilityLabel="Demonstração ilustrativa do fluxo de agendamento do CutSync" style={styles.fullWidth} />
            </RevealOnScroll>
          )}

          <RevealOnScroll style={styles.journeySection}>
            <SectionHeading eyebrow="DO ENCONTRO À CONFIRMAÇÃO" title="Três passos, sem atalhos confusos." description="Você explora primeiro e cria sua conta somente quando decide reservar." />
            <View style={styles.featureGrid}>
              {[
                { step: '01', Icon: Search, title: 'Encontre', text: 'Busque por estabelecimento, serviço ou localização.' },
                { step: '02', Icon: CalendarCheck, title: 'Escolha', text: 'Compare serviços e consulte os horários no fluxo da unidade.' },
                { step: '03', Icon: ShieldCheck, title: 'Confirme', text: 'Entre na sua conta apenas para concluir a reserva.' },
              ].map(({ step, Icon, title, text }) => (
                <View key={title} style={styles.featureCard}>
                  <View style={styles.stepHeader}><Text style={styles.stepNumber}>{step}</Text><View style={styles.featureIcon}><Icon size={20} color={landingColors.brand} /></View></View>
                  <Text style={styles.featureCardTitle}>{title}</Text>
                  <Text style={styles.featureCardText}>{text}</Text>
                </View>
              ))}
            </View>
          </RevealOnScroll>

          {audience === 'observer' && businessPreview}

          <RevealOnScroll style={styles.faqSection}>
            <SectionHeading eyebrow="PERGUNTAS FREQUENTES" title="Antes de reservar." description="O essencial para navegar com confiança." />
            <View style={styles.faqGrid}>
              {[
                ['Preciso criar conta para pesquisar?', 'Não. Você pode explorar estabelecimentos e serviços sem cadastro.'],
                ['Os horários mostrados são reais?', 'Os horários disponíveis são consultados no fluxo do estabelecimento antes da confirmação.'],
                ['O CutSync recebe o pagamento?', 'Nesta fase, o CutSync organiza o agendamento. Pagamentos seguem as regras de cada estabelecimento.'],
              ].map(([question, answer]) => (
                <View key={question} style={styles.faqCard}><Text style={styles.faqQuestion}>{question}</Text><Text style={styles.faqAnswer}>{answer}</Text></View>
              ))}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.finalCta}>
            <Text style={styles.finalCtaEyebrow}>SEU TEMPO, BEM CUIDADO</Text>
            <Text style={styles.finalCtaTitle}>Encontre seu próximo horário.</Text>
            <Text style={styles.finalCtaText}>Comece pela busca. O cadastro fica para quando você decidir confirmar.</Text>
            <MagneticButton label="Explorar agora" onPress={scrollToSearch} />
          </RevealOnScroll>

          <View style={styles.footer}>
            <Text style={styles.footerBrand}>CutSync</Text>
            <Text style={styles.footerText}>© {new Date().getFullYear()} · Agendamento e operação conectados.</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/para-estabelecimentos' as never)}><Text style={styles.footerLink}>Solução para estabelecimentos</Text></Pressable>
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
  root: { flex: 1, backgroundColor: landingColors.canvas },
  header: { borderWidth: 0, borderBottomWidth: 1, borderColor: 'rgba(41,75,58,0.10)', zIndex: 20 },
  headerInner: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 72, alignSelf: 'center', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brand },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 22 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLink: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 12 },
  headerLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  accountButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  accountButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  scroll: { paddingBottom: 36 },
  heroSection: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', minHeight: 500, paddingHorizontal: 20, paddingVertical: 48, flexDirection: 'row', alignItems: 'center', gap: 38 },
  heroSectionStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 38 },
  heroGlow: { position: 'absolute', width: 440, height: 440, borderRadius: 220, right: 10, top: 52, backgroundColor: 'rgba(199,169,107,0.13)' },
  heroCopy: { flex: 1, minWidth: 280, gap: 16 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 11, paddingVertical: 7, borderRadius: landingRadii.pill, backgroundColor: landingColors.brandSoft },
  liveDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: landingColors.success },
  heroBadgeText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 55, lineHeight: 59, letterSpacing: -2.2 },
  heroTitleMobile: { fontSize: 47, lineHeight: 52, letterSpacing: -1.7 },
  heroDescription: { maxWidth: 560, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 17, lineHeight: 27 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  heroPreview: { width: '46%', maxWidth: 550 },
  fullWidth: { width: '100%', maxWidth: '100%' },
  content: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 20, gap: 68 },
  sectionHeading: { maxWidth: landingLayout.copyWidth, gap: 9 },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  sectionTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 38, lineHeight: 43, letterSpacing: -1.2 },
  sectionDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 23 },
  searchSection: { gap: 22 },
  searchPanel: { borderRadius: landingRadii.lg, padding: 14, gap: 12 },
  searchFields: { flexDirection: 'row', gap: 10 },
  searchFieldsStacked: { flexDirection: 'column' },
  inputShell: { flex: 1, minHeight: 50, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  input: { flex: 1, color: landingColors.ink, fontFamily: landingTypography.body, fontSize: 14, outlineStyle: 'none' } as never,
  chips: { gap: 8 },
  chip: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: landingRadii.pill, backgroundColor: landingColors.surfaceSoft, borderWidth: 1, borderColor: landingColors.border },
  chipSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand },
  chipText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  chipTextSelected: { color: landingColors.white },
  resultsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  resultsCount: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  resultsNote: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  establishmentGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  establishmentCard: { overflow: 'hidden', borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, boxShadow: '0 10px 36px rgba(19,32,25,0.08)' },
  pressed: { opacity: 0.78, transform: [{ scale: 0.995 }] },
  cover: { height: 176, backgroundColor: landingColors.brandSoft },
  coverImage: { width: '100%', height: '100%' },
  coverFallback: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  coverInitials: { color: landingColors.brand, fontFamily: landingTypography.displayBold, fontSize: 42 },
  cardBody: { padding: 17, gap: 10 },
  cardTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 17 },
  metaRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 7 },
  metaText: { flex: 1, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 17 },
  openText: { color: landingColors.success, fontFamily: landingTypography.bodyMedium },
  cardFooter: { minHeight: 46, marginTop: 4, paddingTop: 12, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  priceText: { flex: 1, color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 12 },
  bookingButton: { minHeight: 42, paddingHorizontal: 13, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: landingRadii.pill, backgroundColor: landingColors.brand },
  bookingButtonText: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  stateCard: { minHeight: 190, padding: 30, alignItems: 'center', justifyContent: 'center', gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface },
  stateTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16, textAlign: 'center' },
  stateText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 13, textAlign: 'center' },
  journeySection: { gap: 24 },
  featureGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 16 },
  featureCard: { flex: 1, minWidth: 240, padding: 24, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, gap: 10 },
  stepHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  stepNumber: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 14, letterSpacing: 0.8 },
  featureIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  featureCardTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  featureCardText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  businessTeaser: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 34, padding: 34, borderRadius: landingRadii.xl, backgroundColor: landingColors.canvasWarm },
  businessCopy: { flex: 1, minWidth: 280, gap: 14 },
  featureTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 38, lineHeight: 43 },
  featureDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 23 },
  inlineActions: { alignSelf: 'flex-start', marginTop: 4 },
  previewColumn: { flex: 1, minWidth: 310 },
  faqSection: { gap: 24 },
  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  faqCard: { flex: 1, minWidth: 250, padding: 22, borderTopWidth: 1, borderTopColor: landingColors.border, gap: 8 },
  faqQuestion: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  faqAnswer: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  finalCta: { alignItems: 'center', padding: 44, borderRadius: landingRadii.xl, backgroundColor: landingColors.brand, gap: 13 },
  finalCtaEyebrow: { color: '#BFD5C8', fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  finalCtaTitle: { color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 39, lineHeight: 44, textAlign: 'center' },
  finalCtaText: { maxWidth: 570, color: '#DCE8E0', fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  footer: { minHeight: 92, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' },
  footerBrand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  footerText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerLink: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
