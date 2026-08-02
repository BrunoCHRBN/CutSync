import React from 'react';
import { Image } from 'expo-image';
import { Platform, StyleProp, StyleSheet, View, ViewStyle, useWindowDimensions } from 'react-native';
import { landingColors, landingLayout } from '../../../theme/landing-tokens';

const HERO_SOURCES = {
  client: require('../../../../assets/images/landing/landing-client-hero.webp'),
  business: require('../../../../assets/images/landing/landing-business-hero.webp'),
} as const;

interface HeroAtmosphereProps {
  audience: 'client' | 'business';
  alternativeText: string;
  style?: StyleProp<ViewStyle>;
  /** Soft wash over the photo so typography stays readable. */
  wash?: 'light' | 'brand';
}

/**
 * Full-bleed photographic plane for landing heroes.
 * Original CutSync imagery — no stock from reference sites.
 *
 * The light wash is directional: denser where copy sits, softer where the
 * product preview breathes, so dark ink never competes with plants or wood.
 */
export const HeroAtmosphere = ({
  audience,
  alternativeText,
  style,
  wash = audience === 'business' ? 'brand' : 'light',
}: HeroAtmosphereProps) => {
  const { width } = useWindowDimensions();
  const compact = width < landingLayout.desktopBreakpoint;

  return (
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
      <View
        style={[
          styles.wash,
          wash === 'brand' ? styles.washBrand : styles.washLight,
          wash === 'light' && compact && styles.washLightCompact,
        ]}
      />
      {wash === 'light' && <View style={[styles.copyScrim, compact && styles.copyScrimCompact]} />}
      {wash === 'brand' && <View style={styles.ambientGlow} />}
      <View style={styles.grain} />
    </View>
  );
};

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
  // Desktop: strong veil on the copy column, photo still visible behind the preview.
  washLight: Platform.select({
    web: {
      backgroundImage:
        'linear-gradient(105deg, rgba(248,247,242,0.94) 0%, rgba(248,247,242,0.88) 34%, rgba(248,247,242,0.55) 58%, rgba(248,247,242,0.28) 100%)',
    } as ViewStyle,
    default: {
      backgroundColor: 'rgba(248,247,242,0.86)',
    },
  }) ?? { backgroundColor: 'rgba(248,247,242,0.86)' },
  // Stacked hero: copy spans the full width, so the veil stays denser overall.
  washLightCompact: Platform.select({
    web: {
      backgroundImage:
        'linear-gradient(180deg, rgba(248,247,242,0.94) 0%, rgba(248,247,242,0.9) 48%, rgba(248,247,242,0.72) 100%)',
    } as ViewStyle,
    default: {
      backgroundColor: 'rgba(248,247,242,0.9)',
    },
  }) ?? { backgroundColor: 'rgba(248,247,242,0.9)' },
  washBrand: {
    backgroundColor: 'rgba(25,54,40,0.52)',
  },
  // Extra soft panel under the headline so foliage and wood never punch through the letters.
  copyScrim: Platform.select({
    web: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      width: '58%',
      backgroundImage:
        'linear-gradient(90deg, rgba(248,247,242,0.55) 0%, rgba(248,247,242,0.28) 55%, rgba(248,247,242,0) 100%)',
    } as ViewStyle,
    default: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(248,247,242,0.2)',
    },
  }) ?? { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(248,247,242,0.2)' },
  copyScrimCompact: Platform.select({
    web: {
      width: '100%',
      backgroundImage:
        'linear-gradient(180deg, rgba(248,247,242,0.4) 0%, rgba(248,247,242,0.22) 60%, rgba(248,247,242,0) 100%)',
    } as ViewStyle,
    default: {
      backgroundColor: 'rgba(248,247,242,0.28)',
    },
  }) ?? { backgroundColor: 'rgba(248,247,242,0.28)' },
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
    opacity: 0.04,
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
