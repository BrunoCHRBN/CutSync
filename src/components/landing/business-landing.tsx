import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { FadeIn, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  ArrowRight,
  CalendarRange,
  Check,
  LogIn,
  Scissors,
  Sparkles,
  Store,
  UsersRound,
} from 'lucide-react-native';
import { landingColors, landingLayout, landingRadii, landingShadows, landingTypography } from '../../theme/landing-tokens';
import { LANDING_CAPABILITIES, LandingCapabilityId } from './landing-capabilities';
import { trackLandingEvent } from './landing-analytics';
import { EditorialBand, ProductStory } from './landing-primitives';
import { CustomCursor, GlassSurface, MagneticButton, RevealOnScroll, SpotlightSection } from './motion/landing-effects';
import { LandingMotionProvider, useLandingMotion, useReducedMotion } from './motion/landing-motion';
import { ProductPreview } from './product-preview';
import { AgendaSandbox } from './sandbox/AgendaSandbox';
import { ServicesSandbox } from './sandbox/services-sandbox';
import { TeamSandbox } from './sandbox/team-sandbox';

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
  const [activeTab, setActiveTab] = useState<LandingCapabilityId>('agenda');
  const [trackWidth, setTrackWidth] = useState(0);
  const [preview, setPreview] = useState<'owner' | 'professional'>('owner');
  const thumbPosition = useSharedValue(0);

  const activeIndex = LANDING_CAPABILITIES.findIndex((capability) => capability.id === activeTab);
  const ActiveSandbox = capabilityComponents[activeTab];

  useEffect(() => {
    trackLandingEvent({ name: 'landing_viewed', page: 'business' });
  }, []);

  useEffect(() => {
    thumbPosition.value = withTiming((trackWidth / LANDING_CAPABILITIES.length) * activeIndex, {
      duration: quality === 'off' ? 0 : 180,
    });
  }, [activeIndex, quality, thumbPosition, trackWidth]);

  const thumbStyle = useAnimatedStyle(() => ({ transform: [{ translateX: thumbPosition.value }] }));

  const selectTab = (id: LandingCapabilityId) => {
    setActiveTab(id);
    trackLandingEvent({ name: 'sandbox_tab_changed', tab: id });
  };

  const handleTabKey = (event: any, index: number) => {
    const key = event?.nativeEvent?.key ?? event?.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
    event.preventDefault?.();
    const direction = key === 'ArrowRight' ? 1 : -1;
    const next = (index + direction + LANDING_CAPABILITIES.length) % LANDING_CAPABILITIES.length;
    selectTab(LANDING_CAPABILITIES[next].id);
  };

  const scrollToSandbox = () => {
    selectTab('agenda');
    scrollRef.current?.scrollTo({ y: Math.max(0, sandboxSectionY.current - 86), animated: !reducedMotion });
  };

  const startRegistration = () => {
    trackLandingEvent({ name: 'registration_started', source: 'business' });
    router.push('/register' as never);
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
            {isDesktop && <Pressable testID="business-header-client-link" accessibilityRole="link" onPress={() => router.push('/' as never)} style={styles.headerLink}><Text style={styles.headerLinkText}>Encontrar um serviço</Text></Pressable>}
            <Pressable testID="business-login-button" accessibilityRole="button" onPress={() => router.push('/login' as never)} style={styles.accountButton}>
              <LogIn size={16} color={landingColors.brand} /><Text style={styles.accountButtonText}>Acessar painel</Text>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      <ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <View style={styles.heroOuter}>
          <SpotlightSection style={[styles.hero, !isDesktop && styles.heroStacked]}>
            <View style={styles.heroGlow} />
            <View style={[styles.heroCopy, !isDesktop && styles.fullWidth]}>
              <View style={styles.heroBadge}><Sparkles size={14} color={landingColors.accent} /><Text style={styles.heroBadgeText}>VITRINE E OPERAÇÃO CONECTADAS</Text></View>
              <Text style={styles.heroTitle}>Do serviço publicado{`\n`}à agenda organizada.</Text>
              <Text style={styles.heroDescription}>Apresente seu negócio, receba agendamentos e conduza a rotina da equipe em uma experiência conectada.</Text>
              <View style={styles.heroActions}>
                <MagneticButton label="Cadastrar estabelecimento" inverse onPress={startRegistration} testID="business-primary-cta" />
                <Pressable testID="business-demo-cta" accessibilityRole="button" onPress={scrollToSandbox} style={styles.heroSecondaryButton}>
                  <Text style={styles.heroSecondaryLabel}>Ver o produto em ação</Text><ArrowRight size={16} color={landingColors.white} />
                </Pressable>
              </View>
              <Text style={styles.heroNote}>Demonstrações baseadas em funcionalidades disponíveis, com dados fictícios.</Text>
            </View>
            {isDesktop && (
              <View style={styles.heroPreviewFrame}>
                <ProductPreview variant="owner" accessibilityLabel="Prévia ilustrativa da visão operacional do dono" style={styles.heroPreview} />
              </View>
            )}
          </SpotlightSection>
        </View>

        <View style={styles.content} onLayout={(event) => { contentY.current = event.nativeEvent.layout.y; }}>
          <RevealOnScroll style={styles.connectionSection}>
            <SectionHeading
              eyebrow="UM CAMINHO CONTÍNUO"
              title="A presença pública alimenta a rotina do negócio."
              description="O cliente encontra a vitrine; o estabelecimento recebe a decisão dentro da agenda que já organiza."
            />
            <View style={styles.connectionFlow}>
              {[
                ['01', 'Cadastre os serviços', 'Defina nome, duração e preço.'],
                ['02', 'Publique a vitrine', 'Apresente as informações do estabelecimento.'],
                ['03', 'Receba agendamentos', 'O cliente consulta a agenda da unidade.'],
                ['04', 'Organize a operação', 'Acompanhe agenda, serviços e equipe.'],
              ].map(([step, title, description], index) => (
                <View key={step} style={styles.connectionItem}>
                  <View style={styles.connectionTop}><Text style={styles.connectionIndex}>{step}</Text>{index < 3 && <ArrowRight size={16} color={landingColors.borderStrong} />}</View>
                  <Text style={styles.connectionTitle}>{title}</Text>
                  <Text style={styles.connectionText}>{description}</Text>
                </View>
              ))}
            </View>
          </RevealOnScroll>

          <RevealOnScroll
            onLayout={(event) => { sandboxSectionY.current = contentY.current + event.nativeEvent.layout.y; }}
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
                      onPress={() => selectTab(capability.id)}
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

            <View style={[styles.sandboxStoryLayout, !isDesktop && styles.sandboxStoryLayoutStacked]}>
              <View style={[styles.storyRail, !isDesktop && styles.storyRailStacked]}>
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
                <Animated.View key={activeTab} entering={quality === 'off' ? undefined : FadeIn.duration(180)}>
                  <ActiveSandbox />
                </Animated.View>
              </CustomCursor>
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={[styles.roleSection, !isDesktop && styles.roleSectionStacked]}>
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
            <ProductPreview variant={preview} accessibilityLabel={`Prévia ilustrativa da ${preview === 'owner' ? 'visão do dono' : 'visão profissional'}`} style={[styles.rolePreview, !isDesktop && styles.fullWidth]} />
          </RevealOnScroll>

          <RevealOnScroll>
            <EditorialBand
              eyebrow="CONFIGURAÇÃO COM PROPÓSITO"
              title="Comece pelo que o cliente precisa ver. Organize o que a equipe precisa usar."
              description="Uma jornada baseada nas configurações disponíveis hoje no CutSync."
            >
              <View style={styles.onboardingGrid}>
                {[
                  ['01', 'Serviços', 'Nome, duração e preço do catálogo.'],
                  ['02', 'Vitrine', 'Informações públicas do estabelecimento.'],
                  ['03', 'Agenda', 'Horários da unidade e atendimentos.'],
                  ['04', 'Equipe', 'Convites, jornadas e responsabilidades.'],
                ].map(([step, title, description]) => (
                  <View key={step} style={styles.onboardingItem}>
                    <View style={styles.onboardingStep}><Text style={styles.onboardingStepText}>{step}</Text><Check size={15} color={landingColors.onBrandMuted} /></View>
                    <Text style={styles.onboardingTitle}>{title}</Text>
                    <Text style={styles.onboardingText}>{description}</Text>
                  </View>
                ))}
              </View>
            </EditorialBand>
          </RevealOnScroll>

          <RevealOnScroll style={styles.faqSection}>
            <SectionHeading eyebrow="PERGUNTAS FREQUENTES" title="Para avaliar com calma." description="Informações diretas sobre cadastro, demonstração e condições comerciais." />
            <View style={styles.faqGrid}>
              {[
                ['A demonstração usa dados reais?', 'Não. Os dados são fictícios, mas as ações representam fluxos disponíveis no produto.'],
                ['Os preços já estão definidos?', 'As condições comerciais ainda estão em validação e não representam uma oferta publicada.'],
                ['Posso começar com uma equipe pequena?', 'Sim. O cadastro contempla profissionais autônomos e estabelecimentos com equipe.'],
              ].map(([question, answer]) => <View key={question} style={styles.faqItem}><Text style={styles.faqQuestion}>{question}</Text><Text style={styles.faqAnswer}>{answer}</Text></View>)}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.finalCta}>
            <View style={styles.finalCtaIcon}><Store size={23} color={landingColors.brand} /></View>
            <Text style={styles.finalCtaEyebrow}>SUA VITRINE, SUA OPERAÇÃO</Text>
            <Text style={styles.finalCtaTitle}>Comece a organizar o negócio a partir do que você já oferece.</Text>
            <Text style={styles.finalCtaText}>Crie seu acesso e siga para a configuração do estabelecimento.</Text>
            <MagneticButton label="Criar meu estabelecimento" onPress={startRegistration} />
          </RevealOnScroll>

          <View style={styles.footer}>
            <Text style={styles.footerBrand}>CutSync</Text>
            <Text style={styles.footerText}>© {new Date().getFullYear()} · Demonstrações com dados fictícios.</Text>
            <Pressable testID="business-footer-client-link" accessibilityRole="link" onPress={() => router.push('/' as never)}><Text style={styles.footerLink}>Voltar para clientes</Text></Pressable>
          </View>
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
  heroGlow: { position: 'absolute', width: 560, height: 420, top: 80, right: -100, borderRadius: 80, backgroundColor: 'rgba(255,255,255,0.035)' },
  heroCopy: { flex: 1, minWidth: 280, gap: 22, zIndex: 2 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroBadgeText: { color: landingColors.onBrand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { maxWidth: 650, color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 68, lineHeight: 72, letterSpacing: -3.4 },
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
  footer: { minHeight: 130, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTopWidth: 1, borderTopColor: landingColors.border },
  footerBrand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  footerText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerLink: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
