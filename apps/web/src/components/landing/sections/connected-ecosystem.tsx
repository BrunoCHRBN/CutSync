import React from 'react';
import { StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { ArrowDown, ArrowRight, CalendarClock, Store, UserRound } from 'lucide-react-native';
import { landingColors, landingLayout, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingEcosystemStep, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

const ROLE_ICONS = {
  Cliente: UserRound,
  Estabelecimento: Store,
  Profissional: CalendarClock,
} as const;

interface ConnectedEcosystemProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const ConnectedEcosystem = ({ audience, onLayout, onReveal }: ConnectedEcosystemProps) => {
  const content = LANDING_CONTENT[audience].ecosystem;
  const { width } = useWindowDimensions();
  const isRow = width >= landingLayout.mobileBreakpoint;

  return (
    <LandingSectionShell
      id="ecosystem"
      testID={`landing-${audience}-ecosystem`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <StaggerGroup style={[styles.flow, !isRow && styles.flowStacked]}>
        {content.steps.map((step: LandingEcosystemStep, index) => {
          const Icon = ROLE_ICONS[step.role];
          const Chevron = isRow ? ArrowRight : ArrowDown;
          return (
            <StaggerItem key={step.role} index={index} style={[styles.step, !isRow && styles.stepStacked]}>
              <View style={styles.stepHead}>
                <View style={styles.stepIcon}><Icon size={18} color={landingColors.brand} /></View>
                <Text style={styles.role}>{step.role}</Text>
              </View>
              <Text style={styles.stepTitle}>{step.title}</Text>
              <Text style={styles.stepText}>{step.description}</Text>
              {index < content.steps.length - 1 && (
                <View style={[styles.connector, !isRow && styles.connectorStacked]}>
                  <Chevron size={16} color={landingColors.accent} />
                </View>
              )}
            </StaggerItem>
          );
        })}
      </StaggerGroup>
      <Text style={styles.note}>{content.note}</Text>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  flow: { flexDirection: 'row', flexWrap: 'wrap', gap: 30 },
  flowStacked: { flexDirection: 'column', gap: 34 },
  step: {
    flex: 1,
    minWidth: 240,
    minHeight: 210,
    paddingTop: 24,
    paddingRight: 26,
    gap: 12,
    borderTopWidth: 2,
    borderTopColor: landingColors.brand,
  },
  stepStacked: { paddingRight: 0, minHeight: 0, paddingBottom: 8 },
  stepHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepIcon: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: landingColors.brandSoft },
  role: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 12, letterSpacing: 1.3 },
  stepTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 22 },
  stepText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 21 },
  connector: {
    position: 'absolute',
    top: -17,
    right: -6,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: landingRadii.pill,
    borderWidth: 1,
    borderColor: landingColors.border,
    backgroundColor: landingColors.surface,
  },
  connectorStacked: { top: undefined, bottom: -25, right: undefined, left: 0 },
  note: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 19 },
});
