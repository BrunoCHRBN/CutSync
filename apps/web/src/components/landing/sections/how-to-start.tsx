import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { landingColors, landingTypography } from '../../../theme/landing-tokens';
import { StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

interface HowToStartProps {
  audience: LandingPageAudience;
  testID?: string;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
  children?: React.ReactNode;
}

export const HowToStart = ({ audience, testID, onLayout, onReveal, children }: HowToStartProps) => {
  const content = LANDING_CONTENT[audience].howToStart;

  return (
    <LandingSectionShell
      id="how_to_start"
      testID={testID ?? `landing-${audience}-how-to-start`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <StaggerGroup style={styles.grid}>
        {content.steps.map((step, index) => (
          <StaggerItem key={step.title} index={index} style={styles.item}>
            <Text style={styles.step}>0{index + 1}</Text>
            <Text style={styles.itemTitle}>{step.title}</Text>
            <Text style={styles.itemText}>{step.description}</Text>
          </StaggerItem>
        ))}
      </StaggerGroup>
      {children ? <View style={styles.actions}>{children}</View> : null}
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', borderTopWidth: 1, borderBottomWidth: 1, borderColor: landingColors.border },
  item: { flex: 1, minWidth: 240, minHeight: 200, paddingVertical: 34, paddingHorizontal: 24, gap: 12, borderRightWidth: 1, borderRightColor: landingColors.border },
  step: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 13 },
  itemTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 23 },
  itemText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
});
