import React, { useCallback, useEffect, useRef, useState } from 'react';
import { NativeScrollEvent, NativeSyntheticEvent, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import {
  ArrowRight,
  CalendarRange,
  Check,
  LogIn,
  MessageSquareText,
  NotebookPen,
  Scissors,
  Sparkles,
  Tags,
  UsersRound,
} from 'lucide-react-native';
import { landingColors, landingLayout, landingRadii, landingShadows, landingTypography } from '../../theme/landing-tokens';
import { LANDING_CAPABILITIES, LandingCapabilityId } from './landing-capabilities';
import { trackLandingEvent } from './landing-analytics';
import { ProductStory } from './landing-primitives';
import { AnimatedTabContent, CustomCursor, GlassSurface, MagneticButton, MaskedReveal, RevealOnScroll, SectionReveal, SpotlightSection, StaggerGroup, StaggerItem } from './motion/landing-effects';
import { LandingMotionProvider, useLandingMotion, useReducedMotion } from './motion/landing-motion';
import { StickyProductStory, StickyProductStoryHandle } from './motion/sticky-product-story';
import { ProductPreview } from './product-preview';
import { AgendaSandbox } from './sandbox/AgendaSandbox';
import { ServicesSandbox } from './sandbox/services-sandbox';
import { TeamSandbox } from './sandbox/team-sandbox';
import { LandingSectionId } from './landing-content';
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

const capabilityComponents: Record<LandingCapabilityId, React.ComponentType> = {
  agenda: AgendaSandbox,
  services: ServicesSandbox,
  team: TeamSandbox,
};

const capabilityIcons = {
  agenda: CalendarRange,
  services: Scissors,
  team: UsersRound,
} as const;

const SectionHeading = ({ eyebrow, title, description, centered = false }: {
  eyebrow: string;
  title: string;
  description: string;
  centered?: boolean;
}) => (
  <View style={[styles.sectionHeading, centered && styles.centered]}>
    <Text style={styles.eyebrow}>{eyebrow}</Text>
    <Text style={[styles.sectionTitle, centered && styles.centerText]}>{title}</Text>
    <Text style={[styles.sectionDescription, centered && styles.centerText]}>{description}</Text>
  </View>
);

const BusinessLandingContent = () => {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { quality } = useLandingMotion();
  const reducedMotion = useReducedMotion();
  const isDesktop = width >= landingLayout.desktopBreakpoint;
  const scrollRef = useRef<ScrollView>(null);
  const contentY = useRef(0);
  const sandboxSectionY = useRef(0);
  const reportedDepths = useRef(new Set<50 | 100>());
  const [activeTab, setActiveTab] = useState<LandingCapabilityId>('agenda');
  const activeTabRef = useRef<LandingCapabilityId>('agenda');
  const stickyStoryRef = useRef<StickyProductStoryHandle>(null);
  const [tabDirection, setTabDirection] = useState<1 | -1>(1);
  const [trackWidth, setTrackWidth] = useState(0);
  const [preview, setPreview] = useState<'owner' | 'professional'>('owner');
  const thumbPosition = useSharedValue(0);
  const { setBaseline, registerSection, scrollToSection } = useSectionAnchors(scrollRef, reducedMotion);

  const navigateToSection = useCallback((section: LandingSectionId) => {
    trackLandingEvent({ name: 'section_navigated', page: 'business', section });
    scrollToSection(section);
  }, [scrollToSection]);

  const activeIndex = LANDING_CAPABILITIES.findIndex((capability) => capability.id === activeTab);
  const ActiveSandbox = capabilityComponents[activeTab];

  useEffect(() => {
    trackLandingEvent({ name: 'landing_viewed', page: 'business' });
  }, []);

  useEffect(() => {
    thumbPosition.value = quality === 'off'
      ? (trackWidth / LANDING_CAPABILITIES.length) * activeIndex
      : withSpring((trackWidth / LANDING_CAPABILITIES.length) * activeIndex, { damping: 24, stiffness: 220 });
  }, [activeIndex, quality, thumbPosition, trackWidth]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbPosition.value }] }));

  const selectTab = useCallback((id: LandingCapabilityId, scrollToChapter = false) => {
    const current = activeTabRef.current;
    if (current === id) {
      if (scrollToChapter) stickyStoryRef.current?.scrollTo(id);
      return;
    }
    const currentIndex = LANDING_CAPABILITIES.findIndex((item) => item.id === current);
    const nextIndex = LANDING_CAPABILITIES.findIndex((item) => item.id === id);
    setTabDirection(nextIndex >= currentIndex ? 1 : -1);
    activeTabRef.current = id;
    setActiveTab(id);
    trackLandingEvent({ name: 'sandbox_tab_changed', tab: id });
    if (scrollToChapter) requestAnimationFrame(() => stickyStoryRef.current?.scrollTo(id));
  }, []);

  const handleTabKey = (event: any, index: number) => {
    const key = event?.nativeEvent?.key ?? event?.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
    event.preventDefault?.();
    const direction = key === 'ArrowRight' ? 1 : -1;
    const next = (index + direction + LANDING_CAPABILITIES.length) % LANDING_CAPABILITIES.length;
    selectTab(LANDING_CAPABILITIES[next].id);
  };

  const scrollToSandbox = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'business', position: 'hero_secondary', destination: 'demo' });
    selectTab('agenda');
    scrollRef.current?.scrollTo({ y: Math.max(0, sandboxSectionY.current - 86), animated: !reducedMotion });
  };

  const startRegistration = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'business', position: 'hero_primary', destination: 'registration' });
    trackLandingEvent({ name: 'registration_started', source: 'business' });
    router.push({
      pathname: '/(auth)/register',
      params: { intent: 'establishment', redirect: '/(client)/request-establishment' },
    } as never);
  };

  const trackScrollDepth = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
    if (contentSize.height <= layoutMeasurement.height) return;
    const depth = ((contentOffset.y + layoutMeasurement.height) / contentSize.height) * 100;
    ([50, 100] as const).forEach((threshold) => {
      if (depth >= threshold && !reportedDepths.current.has(threshold)) {
        reportedDepths.current.add(threshold);
        trackLandingEvent({ name: 'scroll_depth_reached', page: 'business', depth: threshold });
      }
    });
  };

  return (
    <View testID="business-public-landing" style={styles.root}>
      <GlassSurface variant="header" style={styles.header}>
        <View style={styles.headerInner}>
          <Pressable testID="business-brand-client-link" accessibilityRole="link" onPress={() => router.push('/' as never)} style={styles.brandRow}>
            <View style={styles.brandMark}><Scissors size={18} color={landingColors.white} /></View>
            <View><Text style={styles.brand}>CutSync</Text><Text style={styles.brandCaption}>PARA NEGÓCIOS</Text></View>
          </Pressable>
          <View style={styles.headerActions}>
            {isDesktop && <LandingNav audience="business" onNavigate={navigateToSection} />}
            {isDesktop && <Pressable testID="business-header-client-link" accessibilityRole="link" onPress={() => router.push('/' as never)} style={styles.headerLink}><Text style={styles.headerLinkText}>Encontrar um serviço</Text></Pressable>}
            <Pressable testID="business-login-button" accessibilityRole="button" onPress={() => router.push({ pathname: '/(auth)/login', params: { audience: 'business' } } as never)} style={styles.accountButton}>
              <LogIn size={16} color={landingColors.brand} /><Text style={styles.accountButtonText}>Acessar painel</Text>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      <ScrollView ref={scrollRef} onScroll={trackScrollDepth} scrollEventThrottle={32} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.heroOuter}>
          <SpotlightSection style={[styles.hero, !isDesktop && styles.heroStacked]}>
            <View style={[styles.heroCopy, !isDesktop && styles.fullWidth]}>
              <SectionReveal delay={0}><View style={styles.heroBadge}><Sparkles size={14} color={landingColors.accent} /><Text style={styles.heroBadgeText}>VITRINE E OPERAÇÃO CONECTADAS</Text></View></SectionReveal>
              <MaskedReveal delay={70}><Text style={[styles.heroTitle, !isDesktop && styles.heroTitleCompact]}>Sua vitrine e sua agenda{`\n`}trabalhando juntas.</Text></MaskedReveal>
              <SectionReveal delay={210}><Text style={styles.heroDescription}>Publique serviços, receba agendamentos e organize a rotina da equipe em um só fluxo.</Text></SectionReveal>
              <SectionReveal delay={320} style={styles.heroActions}>
                <MagneticButton label="Criar meu estabelecimento" inverse onPress={startRegistration} testID="business-primary-cta" />
                <Pressable testID="business-demo-cta" accessibilityRole="button" onPress={scrollToSandbox} style={styles.heroSecondaryButton}>
                  <Text style={styles.heroSecondaryLabel}>Explorar demonstração</Text><ArrowRight size={16} color={landingColors.white} />
                </Pressable>
              </SectionReveal>
            </View>
            {isDesktop && (
              <MaskedReveal delay={420} style={styles.heroPreviewFrame}>
                <ProductPreview variant="owner" accessibilityLabel="Prévia ilustrativa da visão operacional do dono" style={styles.heroPreview} />
              </MaskedReveal>
            )}
          </SpotlightSection>
        </View>

        <View style={styles.content} onLayout={(event) => { contentY.current = event.nativeEvent.layout.y; setBaseline(event); }}>
          <ProposalValues
            audience="business"
            onLayout={registerSection('proposal_values') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'proposal_values' })}
          />

          <RevealOnScroll testID="business-comparison" onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'comparison' })} style={styles.comparisonSection}>
            <SectionHeading
              eyebrow="UM FLUXO MAIS CLARO"
              title="Reúna o que hoje fica separado."
              description="O CutSync conecta a apresentação do negócio às informações usadas na rotina."
            />
            <StaggerGroup style={styles.comparisonGrid}>
              {[
                { before: 'Mensagens dispersas', after: 'Vitrine pública', Icon: MessageSquareText, fragments: ['Tem horário?', 'Qual o valor?'] },
                { before: 'Anotações separadas', after: 'Agenda centralizada', Icon: NotebookPen, fragments: ['09:30 · Corte', '11:00 · Barba'] },
                { before: 'Catálogo informal', after: 'Serviços com preço e duração', Icon: Tags, fragments: ['Corte', 'Corte + barba'] },
              ].map(({ before, after, Icon, fragments }, index) => (
                <StaggerItem key={before} index={index} style={styles.comparisonItem}>
                  <View style={styles.comparisonBeforePanel}>
                    <View style={styles.comparisonLabelRow}><Icon size={17} color={landingColors.inkMuted} /><Text style={styles.comparisonBefore}>{before}</Text></View>
                    {fragments.map((fragment, fragmentIndex) => (
                      <View key={fragment} style={[styles.comparisonFragment, fragmentIndex === 1 && styles.comparisonFragmentOffset]}>
                        <View style={styles.comparisonFragmentDot} />
                        <Text style={styles.comparisonFragmentText}>{fragment}</Text>
                      </View>
                    ))}
                  </View>
                  <View style={styles.comparisonArrow}><ArrowRight size={18} color={landingColors.accent} /></View>
                  <View style={styles.comparisonAfterPanel}>
                    <Check size={15} color={landingColors.white} />
                    <Text style={styles.comparisonAfter}>{after}</Text>
                  </View>
                </StaggerItem>
              ))}
            </StaggerGroup>
          </RevealOnScroll>

          <EditorialScene
            source="business"
            caption="Cena ilustrativa"
            alternativeText="Cena ilustrativa de uma proprietária e um profissional brasileiros revisando juntos a agenda do estabelecimento."
          />

          <ConnectedEcosystem
            audience="business"
            onLayout={registerSection('ecosystem') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'ecosystem' })}
          />

          <RevealOnScroll onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'roles' })} style={[styles.roleSection, !isDesktop && styles.roleSectionStacked]}>
            <View style={[styles.roleCopy, !isDesktop && styles.fullWidth]}>
              <Text style={styles.eyebrow}>DUAS ROTINAS, UMA OPERAÇÃO</Text>
              <Text style={styles.sectionTitle}>Cada pessoa vê o que precisa para agir.</Text>
              <Text style={styles.sectionDescription}>A visão do dono acompanha a unidade; a visão profissional mantém o foco na própria agenda e produção.</Text>
              <View style={styles.roleToggle}>
                {(['owner', 'professional'] as const).map((role) => {
                  const selected = preview === role;
                  return (
                    <Pressable
                      key={role}
                      testID={`business-role-${role}`}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => {
                        setPreview(role);
                        trackLandingEvent({ name: 'business_preview_interacted', preview: role });
                      }}
                      style={[styles.roleButton, selected && styles.roleButtonSelected]}
                    >
                      <Text style={[styles.roleButtonText, selected && styles.roleButtonTextSelected]}>{role === 'owner' ? 'Visão do dono' : 'Visão profissional'}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <AnimatedTabContent contentKey={preview} direction={preview === 'owner' ? -1 : 1} style={[styles.rolePreview, !isDesktop && styles.fullWidth]}>
              <ProductPreview variant={preview} accessibilityLabel={`Prévia ilustrativa da ${preview === 'owner' ? 'visão do dono' : 'visão profissional'}`} style={styles.fullWidth} />
            </AnimatedTabContent>
          </RevealOnScroll>

          <ServicesCapabilities
            audience="business"
            onLayout={registerSection('services') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'services' })}
          >
            <RevealOnScroll
              onLayout={(event) => { sandboxSectionY.current = contentY.current + event.nativeEvent.layout.y; }}
              onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'demo' })}
              style={[styles.sandboxSection, landingShadows.soft]}
            >
              <SectionHeading
                eyebrow="PRODUTO DISPONÍVEL"
                title="Veja como cada parte sustenta a operação."
                description="Demonstração baseada em funcionalidades disponíveis, com dados fictícios."
              />
              <GlassSurface variant="control" style={styles.tabsFrame}>
                <View accessibilityRole="tablist" onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)} style={styles.tabs}>
                  {LANDING_CAPABILITIES.map((capability, index) => {
                    const selected = capability.id === activeTab;
                    return (
                      <Pressable
                        key={capability.id}
                        testID={`business-sandbox-tab-${capability.id}`}
                        accessibilityRole="tab"
                        accessibilityState={{ selected }}
                        onPress={() => selectTab(capability.id, isDesktop)}
                        {...({ 'aria-selected': selected, onKeyDown: (event: unknown) => handleTabKey(event, index) } as any)}
                        style={styles.tab}
                      >
                        <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{capability.label}</Text>
                      </Pressable>
                    );
                  })}
                  <View style={styles.track}>
                    <Animated.View style={[styles.trackThumb, { width: `${100 / LANDING_CAPABILITIES.length}%` }, thumbStyle]} />
                  </View>
                </View>
              </GlassSurface>

              {isDesktop ? (
                <StickyProductStory
                  ref={stickyStoryRef}
                  chapters={LANDING_CAPABILITIES.map((capability, index) => ({
                    id: capability.id,
                    index: `0${index + 1}`,
                    title: capability.title,
                    description: capability.description,
                    testID: `business-story-${capability.id}`,
                  }))}
                  activeId={activeTab}
                  direction={tabDirection}
                  onActiveChange={(id) => selectTab(id as LandingCapabilityId)}
                  renderPreview={(id) => {
                    const Sandbox = capabilityComponents[id as LandingCapabilityId];
                    return <CustomCursor style={[styles.sandboxFrame, landingShadows.raised]}><Sandbox /></CustomCursor>;
                  }}
                />
              ) : (
                <View style={styles.sandboxStoryLayoutStacked}>
                  <View style={styles.storyRailStacked}>
                    {LANDING_CAPABILITIES.map((capability, index) => {
                      const Icon = capabilityIcons[capability.id];
                      return (
                        <Pressable key={capability.id} testID={`business-story-${capability.id}`} accessibilityRole="button" onPress={() => selectTab(capability.id)} style={styles.storyButton}>
                          <View style={[styles.storyIcon, activeTab === capability.id && styles.storyIconActive]}><Icon size={18} color={activeTab === capability.id ? landingColors.white : landingColors.brand} /></View>
                          <ProductStory index={`0${index + 1}`} title={capability.title} description={capability.description} active={activeTab === capability.id} />
                        </Pressable>
                      );
                    })}
                  </View>
                  <CustomCursor style={[styles.sandboxFrame, landingShadows.raised]}>
                    <AnimatedTabContent contentKey={activeTab} direction={tabDirection}><ActiveSandbox /></AnimatedTabContent>
                  </CustomCursor>
                </View>
              )}
            </RevealOnScroll>
          </ServicesCapabilities>

          <DeviceShowcase
            audience="business"
            onLayout={registerSection('devices') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'devices' })}
          />

          <ProductTransparency
            audience="business"
            onLayout={registerSection('transparency') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'transparency' })}
          />

          <SecurityPrivacy
            audience="business"
            onLayout={registerSection('security') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'security' })}
          />

          <HowToStart
            audience="business"
            onLayout={registerSection('how_to_start') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'how_to_start' })}
          >
            <MagneticButton label="Falar com a equipe" testID="business-contact-cta" onPress={() => {
              trackLandingEvent({ name: 'cta_clicked', page: 'business', position: 'final', destination: 'demo' });
              navigateToSection('contact');
            }} />
            <MagneticButton label="Criar meu estabelecimento" secondary testID="business-final-cta" onPress={() => {
              trackLandingEvent({ name: 'cta_clicked', page: 'business', position: 'final', destination: 'registration' });
              trackLandingEvent({ name: 'registration_started', source: 'business' });
              router.push({
                pathname: '/(auth)/register',
                params: { intent: 'establishment', redirect: '/(client)/request-establishment' },
              } as never);
            }} />
          </HowToStart>

          <ResourcesHub
            audience="business"
            onNavigate={navigateToSection}
            onLayout={registerSection('resources') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'resources' })}
          />

          <TestimonialsSection
            audience="business"
            onLayout={registerSection('testimonials') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'testimonials' })}
          />

          <FaqSection
            audience="business"
            onLayout={registerSection('faq') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'faq' })}
          />

          <ContactSection audience="business" onLayout={registerSection('contact') as never} />

          <FutureVision
            audience="business"
            onLayout={registerSection('future') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'future' })}
          />

          <LandingFooter audience="business" onNavigate={navigateToSection} />
        </View>
      </ScrollView>
    </View>
  );
};

export const BusinessLanding = () => <LandingMotionProvider><BusinessLandingContent /></LandingMotionProvider>;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: landingColors.canvas, overflow: 'hidden' },
  header: { borderWidth: 0, borderBottomWidth: 1, borderColor: 'rgba(41,75,58,0.08)', zIndex: 20 },
  headerInner: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 66, alignSelf: 'center', paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brand },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  brandCaption: { color: landingColors.inkMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLink: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  headerLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  accountButton: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: 'rgba(41,75,58,0.14)', borderRadius: landingRadii.md, backgroundColor: 'rgba(255,254,250,0.68)' },
  accountButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  scroll: { paddingBottom: 36 },
  heroOuter: { backgroundColor: landingColors.brandStrong },
  hero: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 720, paddingHorizontal: 34, paddingVertical: 104, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 96 },
  heroStacked: { minHeight: 0, paddingVertical: 88, flexDirection: 'column', alignItems: 'stretch' },
  heroCopy: { flex: 1, minWidth: 280, gap: 22, zIndex: 2 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroBadgeText: { color: landingColors.onBrand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { maxWidth: 650, color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 68, lineHeight: 72, letterSpacing: -3.4 },
  heroTitleCompact: { fontSize: 48, lineHeight: 54, letterSpacing: -2.2 },
  heroDescription: { maxWidth: 540, color: landingColors.onBrand, fontFamily: landingTypography.body, fontSize: 17, lineHeight: 29 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  heroSecondaryButton: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: landingRadii.pill, borderWidth: 1, borderColor: 'rgba(255,255,255,0.28)', backgroundColor: 'rgba(255,255,255,0.05)' },
  heroSecondaryLabel: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  heroNote: { maxWidth: 530, color: landingColors.onBrandSubtle, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },
  heroPreviewFrame: { width: '47%', maxWidth: 570, padding: 10, borderWidth: 1, borderColor: 'rgba(255,255,255,0.12)', borderRadius: landingRadii.lg, backgroundColor: 'rgba(247,246,242,0.06)' },
  heroPreview: { width: '100%' },
  fullWidth: { width: '100%', maxWidth: '100%' },
  content: { width: '100%', maxWidth: landingLayout.maxWidth, paddingHorizontal: 24, paddingTop: 140, alignSelf: 'center', gap: 148 },
  sectionHeading: { maxWidth: landingLayout.copyWidth, gap: 12 },
  centered: { alignSelf: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  sectionTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 44, lineHeight: 49, letterSpacing: -1.65 },
  sectionDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25 },
  connectionSection: { gap: 48 },
  connectionFlow: { flexDirection: 'row', flexWrap: 'wrap', borderLeftWidth: 1, borderLeftColor: landingColors.borderStrong },
  connectionItem: { flex: 1, minWidth: 220, minHeight: 180, paddingHorizontal: 24, paddingVertical: 30, gap: 12, borderTopWidth: 1, borderRightWidth: 1, borderBottomWidth: 1, borderColor: landingColors.borderStrong },
  connectionTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  connectionIndex: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 12 },
  connectionTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  connectionText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  sandboxSection: { paddingVertical: 24, gap: 40 },
  tabsFrame: { borderRadius: landingRadii.md },
  tabs: { position: 'relative', flexDirection: 'row' },
  tab: { flex: 1, minHeight: 54, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: landingColors.inkMuted, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  tabTextSelected: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: landingColors.border },
  trackThumb: { height: 3, backgroundColor: landingColors.brand },
  sandboxStoryLayout: { flexDirection: 'row', alignItems: 'stretch', gap: 32 },
  sandboxStoryLayoutStacked: { flexDirection: 'column' },
  storyRail: { width: 310, gap: 5 },
  storyRailStacked: { width: '100%' },
  storyButton: { flexDirection: 'row', alignItems: 'center' },
  storyIcon: { width: 38, height: 38, marginRight: 7, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  storyIconActive: { backgroundColor: landingColors.brand },
  sandboxFrame: { flex: 1, minWidth: 0, borderRadius: landingRadii.xl },
  roleSection: { paddingVertical: 72, paddingHorizontal: 48, flexDirection: 'row', alignItems: 'center', gap: 72, borderTopWidth: 1, borderBottomWidth: 1, borderColor: landingColors.border },
  roleSectionStacked: { flexDirection: 'column', alignItems: 'stretch' },
  roleCopy: { flex: 1, minWidth: 280, gap: 14 },
  roleToggle: { alignSelf: 'flex-start', padding: 4, flexDirection: 'row', gap: 4, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  roleButton: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: landingRadii.pill },
  roleButtonSelected: { backgroundColor: landingColors.brand },
  roleButtonText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  roleButtonTextSelected: { color: landingColors.white },
  rolePreview: { flex: 1, minWidth: 320 },
  onboardingGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  onboardingItem: { flex: 1, minWidth: 210, padding: 18, gap: 9, borderTopWidth: 1, borderTopColor: 'rgba(220,232,224,0.25)' },
  onboardingStep: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  onboardingStepText: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 13 },
  onboardingTitle: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  onboardingText: { color: landingColors.onBrandMuted, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  comparisonSection: { paddingHorizontal: 8, gap: 34 },
  comparisonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  comparisonItem: { flex: 1, minWidth: 270, minHeight: 250, padding: 18, gap: 13, borderRadius: landingRadii.lg, borderWidth: 1, borderColor: landingColors.border, backgroundColor: landingColors.surfaceSoft },
  comparisonBeforePanel: { minHeight: 116, padding: 14, gap: 9, borderRadius: landingRadii.md, borderWidth: 1, borderColor: landingColors.border, backgroundColor: landingColors.surface },
  comparisonLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  comparisonBefore: { flex: 1, color: landingColors.inkMuted, fontFamily: landingTypography.bodyMedium, fontSize: 12, lineHeight: 18 },
  comparisonFragment: { maxWidth: '82%', paddingVertical: 7, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: landingRadii.sm, backgroundColor: landingColors.canvasWarm },
  comparisonFragmentOffset: { alignSelf: 'flex-end' },
  comparisonFragmentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: landingColors.borderStrong },
  comparisonFragmentText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 10 },
  comparisonArrow: { position: 'absolute', top: 123, alignSelf: 'center', width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.surface, borderWidth: 1, borderColor: landingColors.border },
  comparisonAfterPanel: { minHeight: 72, padding: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: landingRadii.md, backgroundColor: landingColors.brand },
  comparisonAfter: { flex: 1, color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 13, lineHeight: 19 },
  faqSection: { gap: 34 },
  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 32 },
  faqItem: { flex: 1, minWidth: 250, paddingTop: 24, gap: 12, borderTopWidth: 1, borderTopColor: landingColors.border },
  faqQuestion: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  faqAnswer: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  finalCta: { paddingVertical: 88, paddingHorizontal: 56, alignItems: 'flex-start', gap: 18, borderRadius: landingRadii.xl, backgroundColor: landingColors.canvasWarm },
  finalCtaIcon: { width: 48, height: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 16, backgroundColor: landingColors.surface },
  finalCtaEyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  finalCtaTitle: { maxWidth: 760, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 42, lineHeight: 48, letterSpacing: -1.8 },
  finalCtaText: { maxWidth: 570, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
  footer: { minHeight: 150, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 24, borderTopWidth: 1, borderTopColor: landingColors.border },
  footerIdentity: { gap: 7 },
  footerLinks: { flexDirection: 'row', flexWrap: 'wrap', gap: 20 },
  footerBrand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  footerText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerLink: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
