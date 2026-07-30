import React from 'react';
import { LayoutChangeEvent, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { landingColors, landingLayout, landingTypography } from '../../../theme/landing-tokens';
import { RevealOnScroll } from '../motion/landing-effects';
import { LandingSectionId } from '../landing-content';

export const SectionHeading = ({ eyebrow, title, description }: { eyebrow: string; title: string; description: string }) => (
  <View style={styles.heading}>
    <Text style={styles.eyebrow}>{eyebrow}</Text>
    <Text accessibilityRole="header" style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </View>
);

interface LandingSectionShellProps {
  id: LandingSectionId;
  testID: string;
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
  onReveal?: () => void;
  style?: StyleProp<ViewStyle>;
}

export const LandingSectionShell = ({
  id,
  testID,
  eyebrow,
  title,
  description,
  children,
  onLayout,
  onReveal,
  style,
}: LandingSectionShellProps) => (
  <RevealOnScroll testID={testID} onLayout={onLayout} onReveal={onReveal} style={[styles.section, style]}>
    <View {...({ nativeID: `secao-${id}`, 'aria-label': title } as any)}>
      <SectionHeading eyebrow={eyebrow} title={title} description={description} />
    </View>
    {children}
  </RevealOnScroll>
);

const styles = StyleSheet.create({
  section: { gap: 40 },
  heading: { maxWidth: landingLayout.copyWidth, gap: 12 },
  eyebrow: { color: landingColors.brand, fontFamily: landingTypography.bodySemiBold, fontSize: 11, letterSpacing: 1.7 },
  title: { color: landingColors.ink, fontFamily: landingTypography.displaySemiBold, fontSize: 40, lineHeight: 46, letterSpacing: -1.5 },
  description: { maxWidth: 620, color: landingColors.inkSecondary, fontFamily: landingTypography.body, fontSize: 15, lineHeight: 25 },
});
