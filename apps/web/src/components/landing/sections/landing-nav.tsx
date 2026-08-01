import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';
import { landingColors, landingRadii, landingTypography } from '../../../theme/landing-tokens';
import { LANDING_NAV_ITEMS, LandingPageAudience, LandingSectionId } from '../landing-content';

interface LandingNavProps {
  audience: LandingPageAudience;
  onNavigate: (section: LandingSectionId) => void;
  inverse?: boolean;
  compact?: boolean;
}

export const LandingNav = ({ audience, onNavigate, inverse = false, compact = false }: LandingNavProps) => (
  <ScrollView
    testID={`landing-nav-${audience}`}
    horizontal
    showsHorizontalScrollIndicator={false}
    contentContainerStyle={[styles.nav, compact && styles.navCompact]}
    {...({ role: 'navigation', 'aria-label': 'Seções da página' } as any)}
  >
    {LANDING_NAV_ITEMS[audience].map((item) => (
      <Pressable
        key={item.id}
        testID={`landing-nav-${item.id}`}
        accessibilityRole="link"
        accessibilityLabel={`Ir para ${item.label}`}
        onPress={() => onNavigate(item.id)}
        style={({ hovered }: any) => [styles.item, hovered && styles.itemHovered]}
      >
        <Text style={[styles.label, inverse && styles.labelInverse]}>{item.label}</Text>
      </Pressable>
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  nav: { alignItems: 'center', gap: 2 },
  navCompact: { paddingHorizontal: 4 },
  item: {
    minHeight: 44,
    paddingHorizontal: 12,
    justifyContent: 'center',
    borderRadius: landingRadii.pill,
  },
  itemHovered: { backgroundColor: 'rgba(41,75,58,0.07)' },
  label: { color: landingColors.inkSecondary, fontFamily: landingTypography.bodyMedium, fontSize: 13 },
  labelInverse: { color: landingColors.onBrand },
});
