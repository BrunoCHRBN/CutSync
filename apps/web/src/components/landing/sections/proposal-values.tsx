import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { landingColors, landingTypography } from '../../../theme/landing-tokens';
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
  const structural = audience === 'business';

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
      <StaggerGroup style={[styles.grid, structural && styles.gridStructural]}>
        {content.values.map((value, index) => (
          <StaggerItem
            key={value.title}
            index={index}
            style={[styles.item, structural ? styles.itemStructural : styles.itemEditorial]}
          >
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
  statement: {
    flex: 1,
    maxWidth: 780,
    color: landingColors.ink,
    fontFamily: landingTypography.displaySemiBold,
    fontSize: 26,
    lineHeight: 38,
    letterSpacing: -0.8,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 0 },
  gridStructural: { borderWidth: 1, borderColor: landingColors.borderStrong },
  item: {
    flex: 1,
    minWidth: 230,
    minHeight: 200,
    paddingVertical: 28,
    paddingHorizontal: 24,
    gap: 12,
  },
  itemEditorial: {
    borderTopWidth: 1,
    borderTopColor: landingColors.border,
  },
  itemStructural: {
    borderRightWidth: 1,
    borderRightColor: landingColors.borderStrong,
    backgroundColor: landingColors.surface,
  },
  index: { color: landingColors.accent, fontFamily: landingTypography.mono, fontSize: 12, letterSpacing: 0.4 },
  itemTitle: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 24, letterSpacing: -0.6 },
  itemText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
});
