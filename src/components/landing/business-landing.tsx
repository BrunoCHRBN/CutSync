import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import {
  ArrowRight,
  BarChart3,
  CalendarRange,
  Check,
  LogIn,
  RefreshCcw,
  Scissors,
  ShieldCheck,
  Sparkles,
  UsersRound,
} from 'lucide-react-native';
import { AgendaSandbox } from './sandbox/AgendaSandbox';
import { CommissionsSandbox } from './sandbox/CommissionsSandbox';
import { EmergencySwapSandbox } from './sandbox/EmergencySwapSandbox';
import { GspValidationSandbox } from './sandbox/GspValidationSandbox';
import { trackLandingEvent } from './landing-analytics';
import { ProductPreview } from './product-preview';
import {
  AnimatedNumber,
  CustomCursor,
  GlassSurface,
  MagneticButton,
  RevealOnScroll,
  SpotlightSection,
} from './motion/landing-effects';
import { LandingMotionProvider, useLandingMotion } from './motion/landing-motion';
import {
  landingColors,
  landingLayout,
  landingRadii,
  landingShadows,
  landingTypography,
} from '../../theme/landing-tokens';

const sandboxTabs = [
  { id: 'agenda', label: 'Agenda', component: AgendaSandbox },
  { id: 'commissions', label: 'Comissões', component: CommissionsSandbox },
  { id: 'coverage', label: 'Contingência', component: EmergencySwapSandbox },
  { id: 'validation', label: 'Validação', component: GspValidationSandbox },
] as const;

type SandboxTab = (typeof sandboxTabs)[number]['id'];

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
  const isDesktop = width >= landingLayout.desktopBreakpoint;
  const [activeTab, setActiveTab] = useState<SandboxTab>('agenda');
  const [trackWidth, setTrackWidth] = useState(0);
  const [preview, setPreview] = useState<'owner' | 'professional'>('owner');
  const [teamSize, setTeamSize] = useState(4);
  const progress = useSharedValue(0);

  const activeIndex = sandboxTabs.findIndex((tab) => tab.id === activeTab);
  const ActiveSandbox = sandboxTabs[activeIndex]?.component ?? AgendaSandbox;

  useEffect(() => {
    trackLandingEvent({ name: 'landing_viewed', page: 'business' });
  }, []);

  useEffect(() => {
    progress.value = withTiming(trackWidth * ((activeIndex + 1) / sandboxTabs.length), {
      duration: quality === 'off' ? 0 : 180,
    });
  }, [activeIndex, progress, quality, trackWidth]);

  const progressStyle = useAnimatedStyle(() => ({ width: progress.value }));

  const selectTab = (id: SandboxTab) => {
    setActiveTab(id);
    trackLandingEvent({ name: 'sandbox_tab_changed', tab: id });
  };

  const handleTabKey = (event: any, index: number) => {
    const key = event?.nativeEvent?.key ?? event?.key;
    if (key !== 'ArrowRight' && key !== 'ArrowLeft') return;
    event.preventDefault?.();
    const direction = key === 'ArrowRight' ? 1 : -1;
    const next = (index + direction + sandboxTabs.length) % sandboxTabs.length;
    selectTab(sandboxTabs[next].id);
  };

  const startRegistration = (source: 'business' | 'pricing' = 'business') => {
    trackLandingEvent({ name: 'registration_started', source });
    router.push('/register' as never);
  };

  const benefits = useMemo(() => [
    { Icon: CalendarRange, title: 'Agenda operacional', text: 'Uma leitura única da unidade, dos profissionais e dos próximos horários.' },
    { Icon: UsersRound, title: 'Equipe conectada', text: 'Escalas, serviços e responsabilidades organizados no mesmo fluxo.' },
    { Icon: BarChart3, title: 'Decisões com contexto', text: 'Indicadores de ocupação e produção sem confundir agenda com pagamento.' },
    { Icon: ShieldCheck, title: 'Permissões claras', text: 'Cada pessoa acessa somente o necessário para executar seu trabalho.' },
  ], []);

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

      <ScrollView contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <SpotlightSection style={[styles.hero, !isDesktop && styles.heroStacked]}>
          <View style={styles.heroGlow} />
          <View style={[styles.heroCopy, !isDesktop && styles.fullWidth]}>
            <View style={styles.heroBadge}><Sparkles size={14} color={landingColors.brand} /><Text style={styles.heroBadgeText}>OPERAÇÃO QUE RESPIRA COM A EQUIPE</Text></View>
            <Text style={styles.heroTitle}>Menos ruído na recepção.{`\n`}Mais clareza na operação.</Text>
            <Text style={styles.heroDescription}>Organize agenda, equipe e indicadores em uma experiência desenhada para o ritmo real do estabelecimento.</Text>
            <View style={styles.heroActions}>
              <MagneticButton label="Cadastrar estabelecimento" onPress={() => startRegistration()} testID="business-primary-cta" />
              <MagneticButton label="Experimentar demonstração" secondary onPress={() => selectTab('agenda')} />
            </View>
            <Text style={styles.heroNote}>Demonstrações abaixo usam dados fictícios e não representam resultado financeiro garantido.</Text>
          </View>
          <ProductPreview variant="owner" accessibilityLabel="Demonstração ilustrativa da visão do dono no CutSync" style={[styles.heroPreview, !isDesktop && styles.fullWidth]} />
        </SpotlightSection>

        <View style={styles.content}>
          <RevealOnScroll style={styles.benefitsSection}>
            <SectionHeading eyebrow="DO BALCÃO À GESTÃO" title="Tudo conversa com a mesma agenda." description="A interface acompanha o trabalho da equipe sem transformar a rotina em uma planilha." centered />
            <View style={styles.benefitGrid}>
              {benefits.map(({ Icon, title, text }) => (
                <View key={title} style={styles.benefitCard}>
                  <View style={styles.benefitIcon}><Icon size={22} color={landingColors.brand} /></View>
                  <Text style={styles.benefitTitle}>{title}</Text>
                  <Text style={styles.benefitText}>{text}</Text>
                </View>
              ))}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.sandboxSection}>
            <SectionHeading eyebrow="DEMONSTRAÇÃO INTERATIVA" title="Toque na operação antes de começar." description="Componentes reais do produto com um conjunto seguro de dados fictícios." />
            <GlassSurface variant="control" style={styles.tabsFrame}>
              <View
                accessibilityRole="tablist"
                onLayout={(event) => setTrackWidth(event.nativeEvent.layout.width)}
                style={styles.tabs}
              >
                {sandboxTabs.map((tab, index) => {
                  const selected = tab.id === activeTab;
                  return (
                    <Pressable
                      key={tab.id}
                      testID={`business-sandbox-tab-${tab.id}`}
                      accessibilityRole="tab"
                      accessibilityState={{ selected }}
                      onPress={() => selectTab(tab.id)}
                      {...({
                        'aria-selected': selected,
                        onKeyDown: (event: unknown) => handleTabKey(event, index),
                      } as any)}
                      style={styles.tab}
                    >
                      <Text style={[styles.tabText, selected && styles.tabTextSelected]}>{tab.label}</Text>
                    </Pressable>
                  );
                })}
                <View style={styles.track}><Animated.View style={[styles.trackProgress, progressStyle]} /></View>
              </View>
            </GlassSurface>
            <CustomCursor style={[styles.sandboxFrame, landingShadows.raised]}>
              <ActiveSandbox />
            </CustomCursor>
          </RevealOnScroll>

          <RevealOnScroll style={[styles.roleSection, !isDesktop && styles.roleSectionStacked]}>
            <View style={[styles.roleCopy, !isDesktop && styles.fullWidth]}>
              <Text style={styles.eyebrow}>DUAS ROTINAS, UMA OPERAÇÃO</Text>
              <Text style={styles.sectionTitle}>A informação certa para cada papel.</Text>
              <Text style={styles.sectionDescription}>Alterne a prévia para entender como dono e profissional enxergam o mesmo dia sem compartilhar acessos indevidos.</Text>
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
            <ProductPreview
              variant={preview}
              accessibilityLabel={`Demonstração ilustrativa da ${preview === 'owner' ? 'visão do dono' : 'visão profissional'} no CutSync`}
              style={[styles.rolePreview, !isDesktop && styles.fullWidth]}
            />
          </RevealOnScroll>

          <RevealOnScroll style={styles.pricingSection}>
            <SectionHeading eyebrow="MODELO COMERCIAL EM VALIDAÇÃO" title="Estrutura simples para crescer." description="As faixas e os valores ainda estão sendo validados. Nenhuma condição abaixo representa oferta comercial definitiva." centered />
            <View style={styles.planGrid}>
              {[
                { id: 'solo', name: 'Profissional Solo', description: 'Agenda, serviços e clientes para uma operação individual.', features: ['Agenda individual', 'Vitrine pública', 'Indicadores essenciais'] },
                { id: 'establishment', name: 'Estabelecimento', description: 'Equipe, agenda consolidada e permissões de gestão.', features: ['Equipe conectada', 'Escalas e bloqueios', 'Relatórios operacionais'] },
                { id: 'network', name: 'Rede', description: 'Estrutura para múltiplas unidades e necessidades avançadas.', features: ['Múltiplas unidades', 'Governança central', 'Implantação assistida'] },
              ].map((plan, index) => (
                <View key={plan.id} style={[styles.planCard, index === 1 && styles.planCardFeatured]}>
                  <Text style={styles.planStatus}>PREÇO EM VALIDAÇÃO</Text>
                  <Text style={styles.planName}>{plan.name}</Text>
                  <Text style={styles.planDescription}>{plan.description}</Text>
                  <View style={styles.planFeatures}>{plan.features.map((feature) => <View key={feature} style={styles.featureRow}><Check size={15} color={landingColors.success} /><Text style={styles.planFeature}>{feature}</Text></View>)}</View>
                  <Pressable
                    testID={`business-plan-${plan.id}`}
                    accessibilityRole="button"
                    onPress={() => {
                      trackLandingEvent({ name: 'pricing_cta_clicked', plan: plan.id });
                      startRegistration('pricing');
                    }}
                    style={styles.planButton}
                  >
                    <Text style={styles.planButtonText}>Quero acompanhar</Text><ArrowRight size={16} color={landingColors.brand} />
                  </Pressable>
                </View>
              ))}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={[styles.roiSection, !isDesktop && styles.roiSectionStacked]}>
            <View style={[styles.roiCopy, !isDesktop && styles.fullWidth]}>
              <Text style={styles.eyebrow}>SIMULAÇÃO ILUSTRATIVA</Text>
              <Text style={styles.sectionTitle}>Comece pelas premissas, não por uma promessa.</Text>
              <Text style={styles.sectionDescription}>Monte o tamanho do cenário para visualizar como uma análise poderá funcionar. Economia de tempo e retorno financeiro só serão exibidos após validação metodológica.</Text>
            </View>
            <View style={[styles.roiCard, !isDesktop && styles.fullWidth]}>
              <Text style={styles.roiLabel}>Profissionais no cenário</Text>
              <AnimatedNumber value={teamSize} />
              <View style={styles.teamOptions}>
                {[1, 2, 4, 6, 8, 10].map((size) => (
                  <Pressable key={size} accessibilityRole="radio" accessibilityState={{ selected: teamSize === size }} onPress={() => setTeamSize(size)} style={[styles.teamOption, teamSize === size && styles.teamOptionSelected]}>
                    <Text style={[styles.teamOptionText, teamSize === size && styles.teamOptionTextSelected]}>{size}</Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.methodNote}><RefreshCcw size={16} color={landingColors.warning} /><Text style={styles.methodText}>Sem valor monetário ou horas economizadas até a metodologia ser aprovada.</Text></View>
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.faqSection}>
            <SectionHeading eyebrow="PERGUNTAS FREQUENTES" title="Para avaliar com calma." description="O que já é produto e o que ainda está em validação." />
            <View style={styles.faqGrid}>
              {[
                ['A demonstração usa dados reais?', 'Não. Todos os nomes, indicadores e atendimentos são fictícios.'],
                ['Os preços já estão definidos?', 'Ainda não. As faixas comerciais estão em validação e serão publicadas com transparência.'],
                ['Posso usar com uma equipe pequena?', 'Sim. A experiência foi desenhada para acompanhar operações individuais e equipes.'],
              ].map(([question, answer]) => <View key={question} style={styles.faqCard}><Text style={styles.faqQuestion}>{question}</Text><Text style={styles.faqAnswer}>{answer}</Text></View>)}
            </View>
          </RevealOnScroll>

          <RevealOnScroll style={styles.finalCta}>
            <Text style={styles.finalCtaEyebrow}>CONHEÇA O CUTSYNC</Text>
            <Text style={styles.finalCtaTitle}>Organize a operação a partir da agenda.</Text>
            <Text style={styles.finalCtaText}>Crie seu acesso pessoal e siga para o cadastro assistido do estabelecimento.</Text>
            <MagneticButton label="Iniciar cadastro" onPress={() => startRegistration()} />
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

export const BusinessLanding = () => (
  <LandingMotionProvider>
    <BusinessLandingContent />
  </LandingMotionProvider>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: landingColors.canvas },
  header: { borderWidth: 0, borderBottomWidth: 1, borderColor: 'rgba(41,75,58,0.10)', zIndex: 20 },
  headerInner: { width: '100%', maxWidth: landingLayout.maxWidth, minHeight: 72, alignSelf: 'center', paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandMark: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brand },
  brand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 21 },
  brandCaption: { color: landingColors.inkMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerLink: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
  headerLinkText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  accountButton: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 15, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  accountButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  scroll: { paddingBottom: 36 },
  hero: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', minHeight: 600, paddingHorizontal: 20, paddingVertical: 72, flexDirection: 'row', alignItems: 'center', gap: 46 },
  heroStacked: { flexDirection: 'column', alignItems: 'stretch', paddingVertical: 52 },
  heroGlow: { position: 'absolute', width: 460, height: 460, borderRadius: 230, right: 0, top: 54, backgroundColor: 'rgba(199,169,107,0.14)' },
  heroCopy: { flex: 1, minWidth: 280, gap: 18 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 7, paddingHorizontal: 11, paddingVertical: 7, borderRadius: landingRadii.pill, backgroundColor: landingColors.brandSoft },
  heroBadgeText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 0.8 },
  heroTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 56, lineHeight: 61, letterSpacing: -2.2 },
  heroDescription: { maxWidth: 570, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 17, lineHeight: 27 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  heroNote: { maxWidth: 560, color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 11, lineHeight: 17 },
  heroPreview: { width: '48%', maxWidth: 570 },
  fullWidth: { width: '100%', maxWidth: '100%' },
  content: { width: '100%', maxWidth: landingLayout.maxWidth, alignSelf: 'center', paddingHorizontal: 20, gap: 96 },
  sectionHeading: { maxWidth: 720, gap: 9 },
  centered: { alignSelf: 'center', alignItems: 'center' },
  centerText: { textAlign: 'center' },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  sectionTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 39, lineHeight: 44, letterSpacing: -1.2 },
  sectionDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 23 },
  benefitsSection: { gap: 28 },
  benefitGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  benefitCard: { flex: 1, minWidth: 230, padding: 22, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, gap: 10 },
  benefitIcon: { width: 46, height: 46, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: landingColors.brandSoft },
  benefitTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  benefitText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  sandboxSection: { gap: 20 },
  tabsFrame: { borderRadius: landingRadii.lg, paddingHorizontal: 10, paddingTop: 8 },
  tabs: { position: 'relative', flexDirection: 'row', minHeight: 58 },
  tab: { flex: 1, minHeight: 52, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  tabText: { color: landingColors.inkMuted, fontFamily: landingTypography.bodyMedium, fontSize: 12 },
  tabTextSelected: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 2, backgroundColor: landingColors.border },
  trackProgress: { height: 2, backgroundColor: landingColors.brand },
  sandboxFrame: { borderRadius: landingRadii.xl },
  roleSection: { flexDirection: 'row', alignItems: 'center', gap: 38, padding: 36, borderRadius: landingRadii.xl, backgroundColor: landingColors.canvasWarm },
  roleSectionStacked: { flexDirection: 'column', alignItems: 'stretch' },
  roleCopy: { flex: 1, minWidth: 280, gap: 14 },
  roleToggle: { alignSelf: 'flex-start', flexDirection: 'row', gap: 7, padding: 5, borderRadius: landingRadii.pill, backgroundColor: landingColors.surface },
  roleButton: { minHeight: 42, justifyContent: 'center', paddingHorizontal: 16, borderRadius: landingRadii.pill },
  roleButtonSelected: { backgroundColor: landingColors.brand },
  roleButtonText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 12 },
  roleButtonTextSelected: { color: landingColors.white },
  rolePreview: { flex: 1, minWidth: 320 },
  pricingSection: { gap: 28 },
  planGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  planCard: { flex: 1, minWidth: 250, padding: 24, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.lg, backgroundColor: landingColors.surface, gap: 12 },
  planCardFeatured: { borderColor: landingColors.brand, backgroundColor: '#FBFCFA' },
  planStatus: { color: landingColors.warning, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.1 },
  planName: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 27 },
  planDescription: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  planFeatures: { gap: 9, paddingVertical: 8 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  planFeature: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13 },
  planButton: { minHeight: 46, marginTop: 'auto', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 15, borderRadius: landingRadii.md, backgroundColor: landingColors.brandSoft },
  planButtonText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  roiSection: { flexDirection: 'row', alignItems: 'center', gap: 36, padding: 36, borderRadius: landingRadii.xl, backgroundColor: landingColors.surface, borderWidth: 1, borderColor: landingColors.border },
  roiSectionStacked: { flexDirection: 'column', alignItems: 'stretch' },
  roiCopy: { flex: 1, gap: 11 },
  roiCard: { width: '42%', padding: 24, borderRadius: landingRadii.lg, backgroundColor: landingColors.surfaceSoft, gap: 14 },
  roiLabel: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  teamOptions: { flexDirection: 'row', gap: 7 },
  teamOption: { flex: 1, minHeight: 40, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.sm, backgroundColor: landingColors.surface },
  teamOptionSelected: { backgroundColor: landingColors.brand, borderColor: landingColors.brand },
  teamOptionText: { color: landingColors.inkSecondary, fontFamily: landingTypography.mono, fontSize: 12 },
  teamOptionTextSelected: { color: landingColors.white },
  methodNote: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, padding: 12, borderRadius: landingRadii.md, backgroundColor: landingColors.warningSoft },
  methodText: { flex: 1, color: landingColors.warning, fontFamily: landingTypography.body, fontSize: 11, lineHeight: 16 },
  faqSection: { gap: 24 },
  faqGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  faqCard: { flex: 1, minWidth: 250, padding: 22, borderTopWidth: 1, borderTopColor: landingColors.border, gap: 8 },
  faqQuestion: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 15 },
  faqAnswer: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  finalCta: { alignItems: 'center', padding: 46, borderRadius: landingRadii.xl, backgroundColor: landingColors.brand, gap: 13, boxShadow: '0 24px 70px rgba(19,32,25,0.13)' },
  finalCtaEyebrow: { color: '#BFD5C8', fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  finalCtaTitle: { color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 39, lineHeight: 44, textAlign: 'center' },
  finalCtaText: { maxWidth: 590, color: '#DCE8E0', fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22, textAlign: 'center' },
  footer: { minHeight: 92, borderTopWidth: 1, borderTopColor: landingColors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between' },
  footerBrand: { color: landingColors.ink, fontFamily: landingTypography.displayBold, fontSize: 20 },
  footerText: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12 },
  footerLink: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12 },
});
