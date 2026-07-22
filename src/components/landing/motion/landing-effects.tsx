import React, { useEffect, useState } from 'react';
import { Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, { FadeInUp } from 'react-native-reanimated';
import {
  LandingGlassVariant,
  landingColors,
  landingGlassStyle,
  landingMotion,
  landingRadii,
  landingTypography,
} from '../../../theme/landing-tokens';
import { useLandingMotion, useMagneticHover, useMousePosition, useRevealOnScroll, useSpotlight, useTilt } from './landing-motion';

export const GlassSurface = ({
  children,
  variant,
  style,
  interactive = false,
}: {
  children: React.ReactNode;
  variant: LandingGlassVariant;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
}) => {
  const composed = [styles.glass, landingGlassStyle(variant), style];
  if (process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable()) {
    return <GlassView isInteractive={interactive} style={composed}>{children}</GlassView>;
  }
  return <View style={composed}>{children}</View>;
};

export const MagneticButton = ({ label, onPress, testID, secondary = false }: {
  label: string;
  onPress: () => void;
  testID?: string;
  secondary?: boolean;
}) => {
  const { offset, handlers, onLayout } = useMagneticHover();
  return (
    <Pressable
      {...handlers as any}
      onLayout={onLayout}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.magneticButton,
        secondary && styles.magneticButtonSecondary,
        { transform: [{ translateX: offset.x }, { translateY: offset.y }, { scale: pressed ? 0.98 : 1 }] },
      ]}
    >
      <Text style={[styles.magneticLabel, secondary && styles.magneticLabelSecondary]}>{label}</Text>
    </Pressable>
  );
};

export const TiltCard = ({ children, style, testID }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; testID?: string }) => {
  const { rotateX, rotateY, active, handlers, onLayout } = useTilt();
  return (
    <Animated.View
      {...handlers as any}
      onLayout={onLayout}
      testID={testID}
      style={[
        style,
        active && { transform: [{ perspective: 900 }, { rotateX: `${rotateX}deg` }, { rotateY: `${rotateY}deg` }] },
      ]}
    >
      {children}
    </Animated.View>
  );
};

export const SpotlightSection = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { position, handlers } = useSpotlight();
  const backgroundImage = process.env.EXPO_OS === 'web' && position.active
    ? `radial-gradient(420px circle at ${position.x}px ${position.y}px, rgba(199,169,107,0.18), transparent 65%)`
    : undefined;
  return (
    <View {...handlers as any} style={[styles.spotlight, style, backgroundImage ? ({ backgroundImage } as never) : null]}>
      {children}
    </View>
  );
};

export const AnimatedNumber = ({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) => {
  const { quality } = useLandingMotion();
  const [displayed, setDisplayed] = useState(quality === 'off' ? value : 0);
  useEffect(() => {
    if (quality === 'off') {
      setDisplayed(value);
      return;
    }
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const progress = Math.min(1, (Date.now() - startedAt) / 520);
      setDisplayed(Math.round(value * (1 - (1 - progress) ** 3)));
      if (progress === 1) clearInterval(timer);
    }, 24);
    return () => clearInterval(timer);
  }, [quality, value]);
  return <Text style={styles.metric}>{prefix}{displayed.toLocaleString('pt-BR')}{suffix}</Text>;
};

export const RevealOnScroll = ({ children, style, delay = 0 }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
}) => {
  const { quality } = useLandingMotion();
  const { ref, revealed } = useRevealOnScroll();
  if (!revealed) return <View ref={ref as never} style={[style, styles.revealPlaceholder]}>{children}</View>;
  return (
    <Animated.View
      ref={ref as never}
      entering={quality === 'off' ? undefined : FadeInUp.duration(landingMotion.editorial).delay(delay)}
      style={style}
    >
      {children}
    </Animated.View>
  );
};

export const CustomCursor = ({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) => {
  const { quality } = useLandingMotion();
  const { position, handlers } = useMousePosition();
  if (quality !== 'high') return <View style={style}>{children}</View>;
  return (
    <View {...handlers as any} style={[styles.cursorRegion, style]}>
      {children}
      <View
        pointerEvents="none"
        style={[
          styles.cursorHalo,
          {
            opacity: position.active ? 1 : 0,
            transform: [{ translateX: position.x - 28 }, { translateY: position.y - 28 }],
          },
        ]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  glass: { borderWidth: 1, overflow: 'hidden' },
  magneticButton: {
    minHeight: 48,
    paddingHorizontal: 20,
    borderRadius: landingRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: landingColors.brand,
    borderWidth: 1,
    borderColor: landingColors.brand,
  },
  magneticButtonSecondary: { backgroundColor: landingColors.surface, borderColor: landingColors.borderStrong },
  magneticLabel: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  magneticLabelSecondary: { color: landingColors.ink },
  spotlight: { position: 'relative', overflow: 'hidden' },
  metric: { color: landingColors.ink, fontFamily: landingTypography.mono, fontSize: 28, fontVariant: ['tabular-nums'] },
  revealPlaceholder: { opacity: 0.01 },
  cursorRegion: { position: 'relative', overflow: 'hidden' },
  cursorHalo: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(199,169,107,0.65)',
    backgroundColor: 'rgba(199,169,107,0.11)',
  },
});
