import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Check } from 'lucide-react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { StaggerGroup, StaggerItem } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';
import { LandingSectionShell } from './section-shell';

interface ServicesCapabilitiesProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
  children?: React.ReactNode;
}

export const ServicesCapabilities = ({ audience, onLayout, onReveal, children }: ServicesCapabilitiesProps) => {
  const content = LANDING_CONTENT[audience].services;
  const structural = audience === 'business';

  return (
    <LandingSectionShell
      id="services"
      testID={`landing-${audience}-services`}
      eyebrow={content.eyebrow}
      title={content.title}
      description={content.description}
      onLayout={onLayout as never}
      onReveal={onReveal}
    >
      <StaggerGroup style={[styles.grid, structural && styles.gridStructural]}>
        {content.items.map((item, index) => (
          <StaggerItem
            key={item.title}
            index={index % 6}
            style={[styles.item, structural ? styles.itemStructural : styles.itemEditorial]}
          >
            <View style={styles.badge}><Check size={13} color={landingColors.brand} /></View>
            <Text style={styles.itemTitle}>{item.title}</Text>
            <Text style={styles.itemText}>{item.description}</Text>
          </StaggerItem>
        ))}
      </StaggerGroup>
      <Text testID={`landing-${audience}-services-note`} style={styles.note}>{content.note}</Text>
      {children}
    </LandingSectionShell>
  );
};

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 1, backgroundColor: landingColors.border },
  gridStructural: { backgroundColor: landingColors.borderStrong },
  item: {
    flex: 1,
    minWidth: 260,
    minHeight: 180,
    padding: 28,
    gap: 12,
    backgroundColor: landingColors.canvas,
  },
  itemEditorial: { backgroundColor: landingColors.surface },
  itemStructural: { backgroundColor: landingColors.surface },
  badge: {
    width: 30,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: landingRadii.sm,
    backgroundColor: landingColors.brandSoft,
  },
  itemTitle: {
    color: landingColors.ink,
    fontFamily: landingTypography.displaySemiBold,
    fontSize: 20,
    letterSpacing: -0.4,
  },
  itemText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 14, lineHeight: 22 },
  note: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 19 },
});
