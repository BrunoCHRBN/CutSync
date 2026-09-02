import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import {
  ArrowRight,
  BarChart3,
  Bell,
  CalendarCheck,
  CalendarOff,
  CalendarPlus,
  Check,
  MessageSquareText,
  NotebookPen,
  Scissors,
  Settings,
  Sparkles,
  Store,
  Tags,
  User,
  UsersRound,
} from 'lucide-react-native';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { trackLandingEvent } from '../landing-analytics';
import { LandingSectionId, LANDING_BUSINESS_EVALUATION, LANDING_CONTENT } from '../landing-content';
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
} from './landing-v2-shared';

type IconComponent = React.ComponentType<{ size?: number; color?: string; strokeWidth?: number }>;

const { hero, comparison, roles } = LANDING_BUSINESS_EVALUATION;
const CONTENT = LANDING_CONTENT.business;

const comparisonIcons = { messages: MessageSquareText, notes: NotebookPen, catalog: Tags } as const;

const BUSINESS_FEATURE_ICONS: IconComponent[] = [
  Store,
  CalendarCheck,
  CalendarPlus,
  CalendarOff,
  Scissors,
  UsersRound,
  User,
  BarChart3,
  Bell,
  Settings,
];

const BusinessLandingContent = () => {
  const router = useRouter();
  const layout = useLandingLayout();
  const { breakpoint, contentWidth, gutter } = layout;
  const reducedMotion = useReducedMotion();
  const scrollRef = useRef<ScrollView>(null);
  const reportedDepths = useRef(new Set<50 | 100>());
  const [preview, setPreview] = useState<'owner' | 'professional'>('owner');
  const { setBaseline, registerSection, scrollToSection } = useSectionAnchors(scrollRef, reducedMotion);
  const heroTitleSize = resolveTypeSize('display', breakpoint);

  useEffect(() => {
    trackLandingEvent({ name: 'landing_viewed', page: 'business' });
  }, []);

  const navigateToSection = useCallback((section: LandingSectionId) => {
    trackLandingEvent({ name: 'section_navigated', page: 'business', section });
    scrollToSection(section);
  }, [scrollToSection]);

  const startRegistration = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'business', position: 'hero_primary', destination: 'registration' });
    trackLandingEvent({ name: 'registration_started', source: 'business' });
    router.push({ pathname: '/(auth)/register', params: { intent: 'establishment', redirect: '/(client)/request-establishment' } } as never);
  };

  const scrollToDemo = () => {
    trackLandingEvent({ name: 'cta_clicked', page: 'business', position: 'hero_secondary', destination: 'demo' });
    scrollToSection('services');
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

  const activeRole = roles.options.find((option) => option.id === preview) ?? roles.options[0];
  const businessFeatures = CONTENT.services.items.map((item, index) => ({
    ...item,
    icon: BUSINESS_FEATURE_ICONS[index % BUSINESS_FEATURE_ICONS.length],
  }));

  return (
    <View testID="business-public-landing-v2" style={styles.root}>
      <V2Header audience="business" navItems={[{ id: 'proposal_values', label: 'Solução' }, { id: 'services', label: 'Demonstração' }, { id: 'security', label: 'Confiança' }, { id: 'contact', label: 'Contato' }]} onNavigate={navigateToSection} />

      <ScrollView ref={scrollRef} onScroll={trackScrollDepth} scrollEventThrottle={32} contentInsetAdjustmentBehavior="automatic" showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>
        <V2Container>
          <View style={[styles.hero, { gap: gutter * 2 }]}>
            <View style={styles.heroCopy}>
              <SectionReveal style={styles.heroBadge}>
                <Sparkles size={14} color={landingColors.accent} />
                <Text style={styles.heroBadgeText}>{hero.badge}</Text>
              </SectionReveal>
              <MaskedReveal>
                <Text accessibilityRole="header" style={[styles.heroTitle, { fontSize: heroTitleSize, lineHeight: heroTitleSize * 1.1, letterSpacing: heroTitleSize * -0.042 }]}>
                  {hero.title}
                </Text>
              </MaskedReveal>
              <Text style={styles.heroDescription}>{hero.description}</Text>
              <View style={styles.heroActions}>
                <MagneticButton label={hero.primaryCta} onPress={startRegistration} testID="business-primary-cta" />
                <Pressable testID="business-demo-cta" accessibilityRole="button" onPress={scrollToDemo} style={styles.heroSecondaryButton}>
                  <Text style={styles.heroSecondaryLabel}>{hero.secondaryCta}</Text>
                  <ArrowRight size={16} color={landingColors.brand} />
                </Pressable>
              </View>
              <View testID="business-hero-capabilities" style={styles.heroCapabilities}>
                {hero.capabilities.map((capability) => (
                  <View key={capability} style={styles.heroCapability}>
                    <Check size={14} color={landingColors.brand} />
                    <Text style={styles.heroCapabilityText}>{capability}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        </V2Container>

        <V2Container>
          <V2Section
            id="proposal_values"
            onLayout={registerSection('proposal_values') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'proposal_values' })}
            eyebrow={CONTENT.proposal.eyebrow}
            title={CONTENT.proposal.title}
            description={CONTENT.proposal.statement}
          >
            <V2FeatureGrid items={CONTENT.proposal.values.map((value) => ({ title: value.title, description: value.description }))} />
          </V2Section>

          <V2Section
            id="comparison"
            onLayout={registerSection('comparison') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'comparison' })}
            eyebrow={comparison.eyebrow}
            title={comparison.title}
            description={comparison.description}
          >
            <StaggerGroup style={[styles.comparisonGrid, { gap: gutter }]}>
              {comparison.pairs.map(({ id, before, after, fragments }, index) => {
                const Icon = comparisonIcons[id];
                return (
                  <StaggerItem key={id} index={index} style={styles.comparisonItem}>
                    <View style={styles.comparisonBeforePanel}>
                      <View style={styles.comparisonLabelRow}>
                        <Icon size={16} color={landingColors.inkMuted} />
                        <Text style={styles.comparisonBefore}>{before}</Text>
                      </View>
                      {fragments.map((fragment) => (
                        <View key={fragment} style={styles.comparisonFragment}>
                          <View style={styles.comparisonFragmentDot} />
                          <Text style={styles.comparisonFragmentText}>{fragment}</Text>
                        </View>
                      ))}
                    </View>
                    <View style={styles.comparisonArrowRow}>
                      <ArrowRight size={16} color={landingColors.accent} />
                    </View>
                    <View style={styles.comparisonAfterPanel}>
                      <Check size={14} color={landingColors.white} />
                      <Text style={styles.comparisonAfter}>{after}</Text>
                    </View>
                  </StaggerItem>
                );
              })}
            </StaggerGroup>
          </V2Section>

          <V2Section
            id="roles"
            onLayout={registerSection('roles') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'roles' })}
            eyebrow={roles.eyebrow}
            title={roles.title}
            description={roles.description}
          >
            <View style={[styles.roleToggle]}>
              {roles.options.map((option) => {
                const selected = preview === option.id;
                return (
                  <Pressable
                    key={option.id}
                    testID={`business-role-${option.id}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => { setPreview(option.id); trackLandingEvent({ name: 'business_preview_interacted', preview: option.id }); }}
                    style={[styles.roleButton, selected && styles.roleButtonSelected]}
                  >
                    <Text style={[styles.roleButtonText, selected && styles.roleButtonTextSelected]}>{option.label}</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={styles.roleSummaryPanel}>
              <Text style={styles.roleSummaryTitle}>{activeRole.label}</Text>
              <Text style={styles.roleSummaryText}>{activeRole.summary}</Text>
            </View>
          </V2Section>

          <V2Section
            id="services"
            onLayout={registerSection('services') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'services' })}
            eyebrow={CONTENT.services.eyebrow}
            title={CONTENT.services.title}
            description={CONTENT.services.description}
          >
            <V2FeatureGrid items={businessFeatures} />
            <Text style={styles.resultsNote}>{CONTENT.services.note}</Text>
          </V2Section>

          <V2Section
            id="ecosystem"
            onLayout={registerSection('ecosystem') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'ecosystem' })}
            eyebrow={CONTENT.ecosystem.eyebrow}
            title={CONTENT.ecosystem.title}
            description={CONTENT.ecosystem.description}
          >
            <V2Ecosystem steps={CONTENT.ecosystem.steps} note={CONTENT.ecosystem.note} />
          </V2Section>

          <V2Section
            id="security"
            onLayout={registerSection('security') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'security' })}
            eyebrow={CONTENT.security.eyebrow}
            title={CONTENT.security.title}
            description={CONTENT.security.description}
          >
            <V2SecurityList items={CONTENT.security.items} />
          </V2Section>

          <V2Section
            id="how_to_start"
            onLayout={registerSection('how_to_start') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'how_to_start' })}
            eyebrow={CONTENT.howToStart.eyebrow}
            title={CONTENT.howToStart.title}
            description={CONTENT.howToStart.description}
          >
            <V2StepList steps={CONTENT.howToStart.steps} />
            <V2CtaBand
              variant="brand"
              title="Vamos entender sua operação."
              description="Envie seus dados e a equipe do CutSync responde pelo e-mail informado."
              primaryLabel="Falar com a equipe"
              onPrimary={() => navigateToSection('contact')}
              secondaryLabel={hero.primaryCta}
              onSecondary={startRegistration}
            />
          </V2Section>

          <V2Section
            id="faq"
            onLayout={registerSection('faq') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'faq' })}
            eyebrow={CONTENT.faq.eyebrow}
            title={CONTENT.faq.title}
            description={CONTENT.faq.description}
          >
            <V2Faq entries={CONTENT.faq.entries} />
          </V2Section>

          <V2Section
            id="contact"
            onLayout={registerSection('contact') as never}
            onReveal={() => trackLandingEvent({ name: 'section_viewed', page: 'business', section: 'contact' })}
            eyebrow={CONTENT.contact.eyebrow}
            title={CONTENT.contact.title}
            description={CONTENT.contact.description}
          >
            <V2CtaBand
              title="Pronto para conectar vitrine e agenda?"
              description="Comece pelo cadastro do estabelecimento ou fale com a equipe para uma demonstração."
              primaryLabel={hero.primaryCta}
              onPrimary={startRegistration}
              secondaryLabel="Falar com a equipe"
              onSecondary={() => navigateToSection('contact')}
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

          <V2Footer audience="business" onNavigate={navigateToSection} />
        </V2Container>
      </ScrollView>
    </View>
  );
};

export const BusinessLandingV2 = () => (
  <LandingMotionProvider>
    <BusinessLandingContent />
  </LandingMotionProvider>
);

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: landingColors.canvas, overflow: 'hidden' },
  scroll: { paddingTop: 28, paddingBottom: 36 },

  hero: { width: '100%', maxWidth: 860, paddingTop: 56, paddingBottom: 64, gap: 18 },
  heroCopy: { width: '100%', gap: 18 },
  heroBadge: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroBadgeText: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12, letterSpacing: 1.6 },
  heroTitle: { maxWidth: 680, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold },
  heroDescription: { maxWidth: 560, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 16, lineHeight: 27 },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12 },
  heroSecondaryButton: { minHeight: 54, paddingHorizontal: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: landingRadii.pill, borderWidth: 1, borderColor: landingColors.borderStrong, backgroundColor: landingColors.surface },
  heroSecondaryLabel: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  heroCapabilities: { marginTop: 8, paddingTop: 20, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 20, rowGap: 10, borderTopWidth: 1, borderTopColor: landingColors.border },
  heroCapability: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  heroCapabilityText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },

  comparisonGrid: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  comparisonItem: { flex: 1, minWidth: 260, padding: 18, gap: 12, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.md, backgroundColor: landingColors.surface },
  comparisonBeforePanel: { minHeight: 104, padding: 14, gap: 9, borderWidth: 1, borderColor: landingColors.border, borderRadius: landingRadii.sm, backgroundColor: landingColors.surfaceSoft },
  comparisonLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  comparisonBefore: { flex: 1, color: landingColors.inkMuted, fontFamily: landingTypography.bodyMedium, fontSize: 12, lineHeight: 18 },
  comparisonFragment: { maxWidth: '88%', paddingVertical: 6, paddingHorizontal: 9, flexDirection: 'row', alignItems: 'center', gap: 7, borderRadius: landingRadii.sm, backgroundColor: landingColors.canvasWarm },
  comparisonFragmentDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: landingColors.borderStrong },
  comparisonFragmentText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 12 },
  comparisonArrowRow: { alignItems: 'center', paddingLeft: 4 },
  comparisonAfterPanel: { minHeight: 64, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 9, borderRadius: landingRadii.sm, backgroundColor: landingColors.brand },
  comparisonAfter: { flex: 1, color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 13, lineHeight: 19 },

  roleToggle: { alignSelf: 'flex-start', padding: 4, flexDirection: 'row', gap: 4, borderRadius: landingRadii.pill, borderWidth: 1, borderColor: landingColors.border, backgroundColor: landingColors.surface },
  roleButton: { minHeight: 40, paddingHorizontal: 18, alignItems: 'center', justifyContent: 'center', borderRadius: landingRadii.pill },
  roleButtonSelected: { backgroundColor: landingColors.brand },
  roleButtonText: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodySemiBold, fontSize: 13 },
  roleButtonTextSelected: { color: landingColors.white },
  roleSummaryPanel: { marginTop: 20, paddingLeft: 14, borderLeftWidth: 2, borderLeftColor: landingColors.accent, gap: 8 },
  roleSummaryTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 18 },
  roleSummaryText: { maxWidth: 640, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14.5, lineHeight: 23 },

  resultsNote: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },
  futureParagraph: { maxWidth: 720, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25, marginTop: 8 },
});
