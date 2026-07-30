import React from 'react';
import { StyleSheet, Text } from 'react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { MaskedReveal, RevealOnScroll } from '../motion/landing-effects';
import { LANDING_CONTENT, LandingPageAudience } from '../landing-content';

interface FutureVisionProps {
  audience: LandingPageAudience;
  onLayout?: (event: never) => void;
  onReveal?: () => void;
}

export const FutureVision = ({ audience, onLayout, onReveal }: FutureVisionProps) => {
  const content = LANDING_CONTENT[audience].future;

  return (
    <RevealOnScroll
      testID={`landing-${audience}-future`}
      onLayout={onLayout as never}
      onReveal={onReveal}
      style={styles.band}
    >
      <Text style={styles.eyebrow}>{content.eyebrow}</Text>
      <MaskedReveal><Text accessibilityRole="header" style={styles.title}>{content.title}</Text></MaskedReveal>
      {content.paragraphs.map((paragraph) => (
        <Text key={paragraph} style={styles.paragraph}>{paragraph}</Text>
      ))}
      <Text style={styles.disclaimer}>Manifesto institucional. Não descreve funcionalidades futuras nem prazos de entrega.</Text>
    </RevealOnScroll>
  );
};

const styles = StyleSheet.create({
  band: {
    paddingVertical: 84,
    paddingHorizontal: 48,
    gap: 18,
    borderRadius: landingRadii.xl,
    backgroundColor: landingColors.brandStrong,
  },
  eyebrow: { color: landingColors.onBrandMuted, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.8 },
  title: { maxWidth: 760, color: landingColors.white, fontFamily: landingTypography.displaySemiBold, fontSize: 40, lineHeight: 47, letterSpacing: -1.7 },
  paragraph: { maxWidth: 660, color: landingColors.onBrand, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25 },
  disclaimer: { color: landingColors.onBrandSubtle, fontFamily: landingTypography.body, fontSize: 12, lineHeight: 18 },
});
