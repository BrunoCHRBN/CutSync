import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

interface AudienceSectionProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const ProposalValues = ({ audience, onLayout, onReveal }: AudienceSectionProps) => {
  const content = LANDING_CONTENT[audience].proposal;

  return (
    <LandingSectionShell
      id="proposal_values"
      testID={`landing-${audience}-proposal`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <View style={styles.statementShell}>
        <View style={styles.statementRule} />
        <Text testID={`landing-${audience}-proposal-statement`} style={styles.statement}>{content.statement}</Text>
      </View>
      <StaggerGroup style={styles.grid}>
        {content.values.map((value, index) => (
          <StaggerItem key={value.title} index={index} style={styles.item}>
            <Text style={styles.index}>0{index + 1}</Text>
            <Text style={styles.itemTitle}>{value.title}</Text>
            <Text style={styles.itemText}>{value.description}</Text>
          </StaggerItem>
        ))}
      </StaggerGroup>
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  statementShell: { flexDirection: 'row', gap: 20, alignItems: 'stretch' },
  statementRule: { width: 3, borderRadius: 2, backgroundColor: landingColors.accent },
  statement: { flex: 1, maxWidth: 780, color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 22, lineHeight: 34, letterSpacing: -0.6 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 14 },
  item: {
    flex: 1,
    minWidth: 230,
    minHeight: 190,
    padding: 22,
    gap: 10,
    borderRadius: landingRadii.lg,
    borderWidth: 1,
    borderColor: landingColors.border,
    backgroundColor: landingColors.surface,
  },
  index: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 12 },
  itemTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 20 },
  itemText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
});
