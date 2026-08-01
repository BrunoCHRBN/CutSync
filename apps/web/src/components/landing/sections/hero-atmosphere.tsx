import React from 'react';
import { Image } from 'expo-image';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { landingColors } from '../../../theme/landing-tokens';

const HERO_SOURCES = {
  client: require('../../../../assets/images/landing/landing-client-hero.webp'),
  business: require('../../../../assets/images/landing/landing-business-hero.webp'),
} as const;

interface HeroAtmosphereProps {
  audience: 'client' | 'business';
  alternativeText: string;
  style?: StyleProp<ViewStyle>;
  /** Soft wash over the photo so typography stays readable (max ~40%). */
  wash?: 'light' | 'brand';
}

/**
 * Full-bleed photographic plane for landing heroes.
 * Original CutSync imagery — no stock from reference sites.
 */
export const HeroAtmosphere = ({
  audience,
  alternativeText,
  style,
  wash = audience === 'business' ? 'brand' : 'light',
}: HeroAtmosphereProps) => (
  <View pointerEvents="none" style={[styles.root, style]}>
    <Image
      accessible
      accessibilityLabel={alternativeText}
      alt={alternativeText}
      source={HERO_SOURCES[audience]}
      style={styles.image}
      contentFit="cover"
      contentPosition="center"
      cachePolicy="memory-disk"
      transition={280}
      priority="high"
    />
    <View style={[styles.wash, wash === 'brand' ? styles.washBrand : styles.washLight]} />
    <View style={styles.ambientGlow} />
    <View style={styles.grain} />
  </View>
);

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    overflow: 'hidden',
    backgroundColor: landingColors.brandSoft,
  },
  image: {
    ...StyleSheet.absoluteFill,
    width: '100%',
    height: '100%',
  },
  wash: {
    ...StyleSheet.absoluteFill,
  },
  washLight: {
    backgroundColor: 'rgba(248,247,242,0.38)',
  },
  washBrand: {
    backgroundColor: 'rgba(25,54,40,0.42)',
  },
  ambientGlow: {
    position: 'absolute',
    top: '-18%',
    left: '-8%',
    width: '58%',
    height: '70%',
    borderRadius: 999,
    backgroundColor: 'rgba(197,166,109,0.14)',
    ...Platform.select({
      web: { filter: 'blur(110px)' } as ViewStyle,
      default: { opacity: 0.55 },
    }),
  },
  grain: {
    ...StyleSheet.absoluteFill,
    opacity: 0.045,
    ...Platform.select({
      web: {
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
        backgroundSize: '180px 180px',
      } as ViewStyle,
      default: {},
    }),
  },
});
