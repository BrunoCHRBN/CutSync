import React, { useEffect, useState } from 'react';
import { LayoutChangeEvent, Pressable, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import Animated, { FadeInUp, interpolate, useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
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
  const glassVariantStyles = {
    header: styles.glass_header,
    search: styles.glass_search,
    preview: styles.glass_preview,
    control: styles.glass_control,
  };
  const composed = [styles.glass, landingGlassStyle(variant), glassVariantStyles[variant], style];
  if (process.env.EXPO_OS === 'ios' && isLiquidGlassAvailable()) {
    return <GlassView isInteractive={interactive} style={composed}>{children}</GlassView>;
  }
  return <View style={composed}>{children}</View>;
};

export const MagneticButton = ({ label, onPress, testID, secondary = false, inverse = false }: {
  label: string;
  onPress: () => void;
  testID?: string;
  secondary?: boolean;
  inverse?: boolean;
}) => {
  const { offset, handlers, onLayout } = useMagneticHover();
  const hover = useSharedValue(0);
  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: offset.x },
      { translateY: offset.y - interpolate(hover.value, [0, 1], [0, 2]) },
      { scale: interpolate(hover.value, [0, 1], [1, 1.018]) },
    ],
  }));
  return (
    <Animated.View style={animatedStyle}>
    <Pressable
      {...handlers as any}
      onHoverIn={() => { hover.value = withSpring(1, { damping: 18, stiffness: 220 }); }}
      onHoverOut={() => { hover.value = withSpring(0, { damping: 18, stiffness: 220 }); }}
      onLayout={onLayout}
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [
        styles.magneticButton,
        secondary && styles.magneticButtonSecondary,
        inverse && styles.magneticButtonInverse,
        pressed && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.magneticLabel, secondary && styles.magneticLabelSecondary, inverse && styles.magneticLabelInverse]}>{label}</Text>
    </Pressable>
    </Animated.View>
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
    ? `radial-gradient(420px circle at ${position.x}px ${position.y}px, rgba(197,166,109,0.18), transparent 65%)`
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

export const RevealOnScroll = ({ children, style, delay = 0, onLayout }: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  delay?: number;
  onLayout?: (event: LayoutChangeEvent) => void;
}) => {
  const { quality } = useLandingMotion();
  const { ref, revealed } = useRevealOnScroll();
  return (
    <Animated.View
      ref={ref as never}
      onLayout={onLayout}
      entering={quality === 'off' ? undefined : FadeInUp.duration(landingMotion.editorial).delay(delay)}
      style={[style, !revealed && quality !== 'off' && styles.revealPending]}
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
  glass_header: { boxShadow: '0 10px 40px rgba(20,33,25,0.05)' } as never,
  glass_search: { boxShadow: '0 22px 60px rgba(20,33,25,0.09)' } as never,
  glass_preview: { boxShadow: '0 34px 90px rgba(20,33,25,0.14)' } as never,
  glass_control: { boxShadow: '0 12px 34px rgba(20,33,25,0.06)' } as never,
  magneticButton: {
    minHeight: 54,
    paddingHorizontal: 22,
    flexDirection: 'row',
    borderRadius: landingRadii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: landingColors.brand,
    borderWidth: 1,
    borderColor: landingColors.brand,
  },
  buttonPressed: { opacity: 0.86, transform: [{ scale: 0.98 }] },
  magneticButtonSecondary: { backgroundColor: landingColors.surface, borderColor: landingColors.borderStrong },
  magneticButtonInverse: { backgroundColor: landingColors.white, borderColor: landingColors.white },
  magneticLabel: { color: landingColors.white, fontFamily: landingTypography.bodySemiBold, fontSize: 14 },
  magneticLabelSecondary: { color: landingColors.ink },
  magneticLabelInverse: { color: landingColors.brandStrong },
  spotlight: { position: 'relative', overflow: 'hidden' },
  metric: { color: landingColors.ink, fontFamily: landingTypography.mono, fontSize: 28, fontVariant: ['tabular-nums'] },
  revealPending: { opacity: 0.96, transform: [{ translateY: 6 }] },
  cursorRegion: { position: 'relative', overflow: 'hidden' },
  cursorHalo: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(197,166,109,0.65)',
    backgroundColor: 'rgba(197,166,109,0.11)',
  },
});
