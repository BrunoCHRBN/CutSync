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
      <StaggerGroup style={styles.grid}>
        {content.items.map((item, index) => (
          <StaggerItem key={item.title} index={index % 6} style={styles.item}>
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
  item: {
    flex: 1,
    minWidth: 260,
    minHeight: 170,
    padding: 24,
    gap: 10,
    backgroundColor: landingColors.canvas,
  },
  badge: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center', borderRadius: landingRadii.sm, backgroundColor: landingColors.brandSoft },
  itemTitle: { color: landingColors.ink, fontFamily: landingTypography.bodySemiBold, fontSize: 16 },
  itemText: { color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 13, lineHeight: 20 },
  note: { color: landingColors.inkMuted, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 19 },
});
