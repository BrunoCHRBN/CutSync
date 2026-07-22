import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { CalendarRange, Check, ClipboardCheck, LogIn, Scissors, Sparkles, UsersRound } from 'lucide-react-native';
import { AgendaSandbox } from './sandbox/AgendaSandbox';
import { ServicesSandbox } from './sandbox/services-sandbox';
import { TeamSandbox } from './sandbox/team-sandbox';
import { LANDING_CAPABILITIES, LandingCapabilityId } from './landing-capabilities';
import { trackLandingEvent } from './landing-analytics';
import { ProductPreview } from './product-preview';
import { CustomCursor, GlassSurface, MagneticButton, RevealOnScroll, SpotlightSection } from './motion/landing-effects';
import { LandingMotionProvider, useLandingMotion, useReducedMotion } from './motion/landing-motion';
import { landingColors, landingLayout, landingRadii, landingShadows, landingTypography } from '../../theme/landing-tokens';

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
          <Pressable accessibilityRole="link" onPress={() => router.push('/' as never)} style={styles.brandRow}>
            <View style={styles.brandMark}><Scissors size={18} color={landingColors.white} /></View>
            <View><Text style={styles.brand}>CutSync</Text><Text style={styles.brandCaption}>PARA NEGÓCIOS</Text></View>
          </Pressable>
          <View style={styles.headerActions}>
            {isDesktop && <Pressable accessibilityRole="link" onPress={() => router.push('/' as never)} style={styles.headerLink}><Text style={styles.headerLinkText}>Sou cliente</Text></Pressable>}
            <Pressable testID="business-login-button" accessibilityRole="button" onPress={() => router.push('/login' as never)} style={styles.accountButton}>
              <LogIn size={16} color={landingColors.brand} /><Text style={styles.accountButtonText}>Acessar painel</Text>
            </Pressable>
          </View>
        </View>
      </GlassSurface>

      <ScrollView ref={scrollRef} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SpotlightSection style={[styles.hero, !isDesktop && styles.heroStacked]}>
          <View style={styles.heroGlow} />
          <View style={[styles.heroCopy, !isDesktop && styles.fullWidth]}>
            <View style={styles.heroBadge}><Sparkles size={14} color={landingColors.brand} /><Text style={styles.heroBadgeText}>OPERAÇÃO CONECTADA À AGENDA</Text></View>
            <Text style={styles.heroTitle}>Menos ruído na recepção.{`\n`}Mais clareza na operação.</Text>
            <Text style={styles.heroDescription}>Organize agenda, serviços e equipe em uma experiência alinhada ao que o CutSync já entrega hoje.</Text>
            <View style={styles.heroActions}>
              <MagneticButton label="Cadastrar estabelecimento" onPress={startRegistration} testID="business-primary-cta" />
              <MagneticButton label="Experimentar demonstração" secondary onPress={scrollToSandbox} testID="business-demo-cta" />
            </View>
            <Text style={styles.heroNote}>As demonstrações usam dados fictícios e reproduzem funcionalidades disponíveis no produto.</Text>
          </View>
          {isDesktop && <ProductPreview variant="owner" accessibilityLabel="Prévia ilustrativa da visão operacional do dono" style={styles.heroPreview} />}
        </SpotlightSection>

        <View style={styles.content}>
          <RevealOnScroll style={styles.capabilitiesSection}>
            <SectionHeading eyebrow="PRODUTO DISPONÍVEL" title="O essencial da operação, sem promessas futuras." description="Cada demonstração abaixo corresponde a um fluxo presente na área administrativa." centered />
            <View style={styles.capabilityGrid}>
              {LANDING_CAPABILITIES.map((capability) => {
                const Icon = capabilityIcons[capability.id];
                return (
                  <View key={capability.id} style={styles.capabilityCard}>
                    <View style={styles.capabilityIcon}><Icon size={21} color={landingColors.brand} /></View>
                    <Text style={styles.capabilityTitle}>{capability.title}</Text>
                    <Text style={styles.capabilityText}>{capability.description}</Text>
                  </View>
                );
              })}
            </View>
          </RevealOnScroll>

          <RevealOnScroll onLayout={(event) => { sandboxSectionY.current = event.nativeEvent.layout.y; }} style={styles.sandboxSection}>
            <SectionHeading eyebrow="DEMONSTRAÇÃO INTERATIVA" title="Toque na operação antes de começar." description="Demonstração baseada em funcionalidades disponíveis, com dados fictícios." />
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
            <CustomCursor style={[styles.sandboxFrame, landingShadows.raised]}><ActiveSandbox /></CustomCursor>
          </RevealOnScroll>

          <RevealOnScroll style={[styles.roleSection, !isDesktop && styles.roleSectionStacked]}>
            <View style={[styles.roleCopy, !isDesktop && styles.fullWidth]}>
              <Text style={styles.eyebrow}>DUAS ROTINAS, UMA OPERAÇÃO</Text>
              <Text style={styles.sectionTitle}>A informação certa para cada papel.</Text>
              <Text style={styles.sectionDescription}>A visão do dono acompanha a unidade; a visão profissional mantém o foco na agenda e na própria produção.</Text>
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

          <RevealOnScroll style={styles.onboardingSection}>
            <SectionHeading eyebrow="PRIMEIROS PASSOS" title="Da configuração à vitrine publicada." description="Uma jornada direta, baseada nas configurações que já existem no CutSync." centered />
            <View style={styles.onboardingGrid}>
              {[
                ['01', 'Cadastre os serviços', 'Defina nome, duração e preço do catálogo.'],
                ['02', 'Configure os horários', 'Informe os horários da unidade e as jornadas.'],
                ['03', 'Convide a equipe', 'Vincule profissionais e ajuste suas responsabilidades.'],
                ['04', 'Publique a vitrine', 'Revise o perfil que será apresentado aos clientes.'],
              ].map(([step, title, description]) => (
                <View key={step} style={styles.onboardingCard}>
                  <View style={styles.onboardingStep}><Text style={styles.onboardingStepText}>{step}</Text><Check size={15} color={landingColors.success} /></View>
                  <Text style={styles.onboardingTitle}>{title}</Text>
                  <Text style={styles.onboardingText}>{description}</Text>
                </View>
              ))}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.faqSection}>
            <SectionHeading eyebrow="PERGUNTAS FREQUENTES" title="Para avaliar com calma." description="Informações diretas sobre demonstração, cadastro e condições comerciais." />
            <View style={styles.faqGrid}>
              {[
                ['A demonstração usa dados reais?', 'Não. Os dados são fictícios, mas as ações representam fluxos disponíveis no produto.'],
                ['Os preços já estão definidos?', 'As condições comerciais ainda estão em validação e não representam uma oferta publicada.'],
                ['Posso começar com uma equipe pequena?', 'Sim. O cadastro contempla profissionais autônomos e estabelecimentos com equipe.'],
              ].map(([question, answer]) => <View key={question} style={styles.faqCard}><Text style={styles.faqQuestion}>{question}</Text><Text style={styles.faqAnswer}>{answer}</Text></View>)}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.finalCta}>
            <ClipboardCheck size={24} color={landingColors.accent} />
            <Text style={styles.finalCtaEyebrow}>CONHEÇA O CUTSYNC</Text>
            <Text style={styles.finalCtaTitle}>Organize a operação a partir da agenda.</Text>
            <Text style={styles.finalCtaText}>Crie seu acesso e siga para a configuração assistida do estabelecimento.</Text>
            <MagneticButton label="Iniciar cadastro" onPress={startRegistration} />
          </RevealOnScroll>

          <View style={styles.footer}>
            <Text style={styles.footerBrand}>CutSync</Text>
            <Text style={styles.footerText}>© {new Date().getFullYear()} · Demonstrações com dados fictícios.</Text>
            <Pressable accessibilityRole="link" onPress={() => router.push('/' as never)}><Text style={styles.footerLink}>Voltar para clientes</Text></Pressable>
          </View>
        </View>
      </ScrollView>
    </View>
  );
};

export const BusinessLanding = () => <LandingMotionProvider><BusinessLandingContent /></LandingMotionProvider>;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: landingColors.canvas },
  header: { borderWidth: 0, borderBottomWidth: 1, borderColor: 'rgba(41,75,58,0.10)', zIndex: 20 },
  headerInner: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 72, alignSelf: 'center', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brand },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  brandCaption: { color: landingColors.inkMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerLink: { minHeight: 44, paddingHorizontal: 12, alignItems: 'center', justifyContent: 'center' },
  headerLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  accountButton: { minHeight: 44, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  accountButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  scroll: { paddingBottom: 36 },
  hero: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 520, paddingHorizontal: 20, paddingVertical: 52, alignSelf: 'center', flexDirection: 'row', alignItems: 'center', gap: 42 },
  heroStacked: { minHeight: 0, paddingVertical: 40, flexDirection: 'column', alignItems: 'stretch' },
  heroGlow: { position: 'absolute', width: 430, height: 430, top: 40, right: 0, borderRadius: 215, backgroundColor: 'rgba(199,169,107,0.13)' },
  heroCopy: { flex: 1, minWidth: 280, gap: 17 },
  heroBadge: { alignSelf: 'flex-start', paddingHorizontal: 11, paddingVertical: 7, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: landingRadii.pill, backgroundColor: landingColors.brandSoft },
  heroBadgeText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 54, lineHeight: 59, letterSpacing: -2.1 },
  heroDescription: { maxWidth: 560, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 17, lineHeight: 27 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  heroNote: { maxWidth: 530, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },
  heroPreview: { width: '46%', maxWidth: 550 },
  fullWidth: { width: '100%', maxWidth: '100%' },
  content: { width: '100%', maxWidth: landingLayout.maxWidth, paddingHorizontal: 20, alignSelf: 'center', gap: 68 },
  sectionHeading: { maxWidth: landingLayout.copyWidth, gap: 9 },
  centered: { alignSelf: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  sectionTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 38, lineHeight: 43, letterSpacing: -1.2 },
  sectionDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 23 },
  capabilitiesSection: { gap: 25 },
  capabilityGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  capabilityCard: { flex: 1, minWidth: 230, padding: 22, gap: 10, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface },
  capabilityIcon: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: landingColors.brandSoft },
  capabilityTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  capabilityText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 21 },
  sandboxSection: { gap: 20 },
  tabsFrame: { borderRadius: landingRadii.md },
  tabs: { position: 'relative', flexDirection: 'row' },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center' },
  tabText: { color: landingColors.inkMuted, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  tabTextSelected: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 3, backgroundColor: landingColors.border },
  trackThumb: { height: 3, backgroundColor: landingColors.brand },
  sandboxFrame: { borderRadius: landingRadii.xl },
  roleSection: { padding: 34, flexDirection: 'row', alignItems: 'center', gap: 38, borderRadius: landingRadii.xl, backgroundColor: landingColors.canvasWarm },
  roleSectionStacked: { flexDirection: 'column', alignItems: 'stretch' },
  roleCopy: { flex: 1, minWidth: 280, gap: 13 },
  roleToggle: { alignSelf: 'flex-start', padding: 4, flexDirection: 'row', gap: 4, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  roleButton: { minHeight: 44, paddingHorizontal: 15, alignItems: 'center', justifyContent: 'center', borderRadius: landingRadii.pill },
  roleButtonSelected: { backgroundColor: landingColors.brand },
  roleButtonText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
  roleButtonTextSelected: { color: landingColors.white },
  rolePreview: { flex: 1, minWidth: 320 },
  onboardingSection: { padding: 36, gap: 26, borderRadius: landingRadii.xl, backgroundColor: landingColors.surface },
  onboardingGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  onboardingCard: { flex: 1, minWidth: 210, padding: 18, gap: 9, borderTopWidth: 2, borderTopColor: landingColors.accent, backgroundColor: landingColors.surfaceSoft },
  onboardingStep: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  onboardingStepText: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 13 },
  onboardingTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  onboardingText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  faqSection: { gap: 23 },
  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  faqCard: { flex: 1, minWidth: 250, padding: 22, gap: 8, borderTopWidth: 1, borderTopColor: landingColors.border },
  faqQuestion: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  faqAnswer: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  finalCta: { padding: 44, alignItems: 'center', gap: 12, borderRadius: landingRadii.xl, backgroundColor: landingColors.brand },
  finalCtaEyebrow: { color: '#BFD5C8', fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  finalCtaTitle: { color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 39, lineHeight: 44, textAlign: 'center' },
  finalCtaText: { maxWidth: 570, color: '#DCE8E0', fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  footer: { minHeight: 92, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 16, borderTopWidth: 1, borderTopColor: landingColors.border },
  footerBrand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  footerText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerLink: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
