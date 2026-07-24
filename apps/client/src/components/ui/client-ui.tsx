import { BlurTargetView, BlurView } from 'expo-blur';
import type { PropsWithChildren, ReactNode } from 'react';
import { useRef } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type ViewProps,
  View,
} from 'react-native';

import { clientTheme } from '@/theme/client-theme';

type ClientButtonTone = 'primary' | 'secondary' | 'danger' | 'quiet';
type ClientFeedbackTone = 'danger' | 'success' | 'neutral' | 'info';

export function ClientScreen({
  children,
  testID,
  keyboardShouldPersistTaps,
}: PropsWithChildren<{
  testID?: string;
  keyboardShouldPersistTaps?: 'always' | 'handled' | 'never';
}>) {
  return (
    <ScrollView
      testID={testID}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.screenContent}
      keyboardShouldPersistTaps={keyboardShouldPersistTaps}
      showsVerticalScrollIndicator={false}
      style={styles.screen}
    >
      {children}
    </ScrollView>
  );
}

export function ClientSurface({
  children,
  style,
  testID,
}: PropsWithChildren<Pick<ViewProps, 'style' | 'testID'>>) {
  return (
    <View testID={testID} style={[styles.surface, style]}>
      {children}
    </View>
  );
}

export function ClientSectionHeader({
  eyebrow,
  title,
  description,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.sectionTitle}>{title}</Text>
      {description ? <Text style={styles.sectionDescription}>{description}</Text> : null}
    </View>
  );
}

export function ClientButton({
  label,
  onPress,
  tone = 'primary',
  loading,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  tone?: ClientButtonTone;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  const isDisabled = Boolean(disabled || loading);
  const indicatorColor = tone === 'primary' ? clientTheme.colors.white : clientTheme.colors.forest;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: isDisabled, busy: Boolean(loading) }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        tone === 'secondary' && styles.buttonSecondary,
        tone === 'danger' && styles.buttonDanger,
        tone === 'quiet' && styles.buttonQuiet,
        isDisabled && styles.disabled,
        pressed && !isDisabled && styles.pressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={indicatorColor} />
      ) : (
        <Text
          style={[
            styles.buttonText,
            tone !== 'primary' && styles.buttonTextSecondary,
            tone === 'danger' && styles.buttonTextDanger,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function ClientFeedback({
  title,
  description,
  tone = 'neutral',
  action,
  testID,
}: {
  title?: string;
  description: string;
  tone?: ClientFeedbackTone;
  action?: ReactNode;
  testID?: string;
}) {
  return (
    <View
      testID={testID}
      accessibilityLiveRegion="polite"
      style={[
        styles.feedback,
        tone === 'danger' && styles.feedbackDanger,
        tone === 'success' && styles.feedbackSuccess,
        tone === 'info' && styles.feedbackInfo,
      ]}
    >
      <View style={styles.feedbackCopy}>
        {title ? <Text style={styles.feedbackTitle}>{title}</Text> : null}
        <Text selectable style={styles.feedbackDescription}>{description}</Text>
      </View>
      {action}
    </View>
  );
}

export function ClientSkeleton({ width = '100%', height = 16 }: {
  width?: number | `${number}%`;
  height?: number;
}) {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.skeleton, { width, height }]}
    />
  );
}

export function ClientGlassStage({
  backdrop,
  children,
  testID,
}: PropsWithChildren<{
  backdrop: ReactNode;
  testID?: string;
}>) {
  const targetRef = useRef<View | null>(null);

  if (Platform.OS === 'android') {
    return (
      <View testID={testID} style={styles.glassStage}>
        <BlurTargetView ref={targetRef} style={StyleSheet.absoluteFill}>
          {backdrop}
        </BlurTargetView>
        <BlurView
          blurMethod="dimezisBlurViewSdk31Plus"
          blurTarget={targetRef}
          intensity={54}
          tint="light"
          style={styles.glassSurface}
        >
          {children}
        </BlurView>
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.glassStage}>
      <View style={StyleSheet.absoluteFill}>{backdrop}</View>
      <BlurView intensity={62} tint="systemThinMaterialLight" style={styles.glassSurface}>
        {children}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: clientTheme.colors.canvas,
  },
  screenContent: {
    width: '100%',
    maxWidth: clientTheme.sizing.contentMaxWidth,
    alignSelf: 'center',
    paddingHorizontal: clientTheme.spacing.lg,
    paddingTop: clientTheme.spacing.lg,
    paddingBottom: clientTheme.spacing.page,
    gap: clientTheme.spacing.md,
  },
  surface: {
    borderRadius: clientTheme.radii.card,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.lg,
    gap: clientTheme.spacing.md,
    backgroundColor: clientTheme.colors.surface,
    boxShadow: clientTheme.shadows.card,
  },
  sectionHeader: {
    gap: clientTheme.spacing.xs,
  },
  eyebrow: {
    ...clientTheme.typography.eyebrow,
    color: clientTheme.colors.forest,
  },
  sectionTitle: {
    ...clientTheme.typography.title,
    color: clientTheme.colors.ink,
  },
  sectionDescription: {
    ...clientTheme.typography.body,
    color: clientTheme.colors.inkSoft,
  },
  button: {
    minHeight: clientTheme.sizing.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: clientTheme.radii.pill,
    borderCurve: 'continuous',
    paddingHorizontal: clientTheme.spacing.lg,
    backgroundColor: clientTheme.colors.forest,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: clientTheme.colors.border,
    backgroundColor: clientTheme.colors.surface,
  },
  buttonDanger: {
    borderWidth: 1,
    borderColor: clientTheme.colors.dangerBorder,
    backgroundColor: clientTheme.colors.dangerSoft,
  },
  buttonQuiet: {
    backgroundColor: 'transparent',
  },
  disabled: {
    opacity: clientTheme.opacity.disabled,
  },
  pressed: {
    opacity: clientTheme.opacity.pressed,
    transform: [{ scale: 0.99 }],
  },
  buttonText: {
    color: clientTheme.colors.white,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  buttonTextSecondary: {
    color: clientTheme.colors.forest,
  },
  buttonTextDanger: {
    color: clientTheme.colors.danger,
  },
  feedback: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: clientTheme.spacing.md,
    borderWidth: 1,
    borderColor: clientTheme.colors.warningBorder,
    borderRadius: clientTheme.radii.md,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.md,
    backgroundColor: clientTheme.colors.warningSoft,
  },
  feedbackDanger: {
    borderColor: clientTheme.colors.dangerBorder,
    backgroundColor: clientTheme.colors.dangerSoft,
  },
  feedbackSuccess: {
    borderColor: clientTheme.colors.successBorder,
    backgroundColor: clientTheme.colors.successSoft,
  },
  feedbackInfo: {
    borderColor: clientTheme.colors.infoBorder,
    backgroundColor: clientTheme.colors.infoSoft,
  },
  feedbackCopy: {
    flex: 1,
    gap: clientTheme.spacing.xxs,
  },
  feedbackTitle: {
    color: clientTheme.colors.ink,
    fontSize: 13,
    fontWeight: '800',
  },
  feedbackDescription: {
    color: clientTheme.colors.inkSoft,
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
  },
  skeleton: {
    overflow: 'hidden',
    borderRadius: clientTheme.radii.sm,
    backgroundColor: clientTheme.colors.border,
  },
  glassStage: {
    minHeight: 260,
    overflow: 'hidden',
    borderRadius: clientTheme.radii.hero,
    borderCurve: 'continuous',
    backgroundColor: clientTheme.colors.sandSoft,
    boxShadow: clientTheme.shadows.elevated,
  },
  glassSurface: {
    flex: 1,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: clientTheme.colors.glassBorder,
    borderRadius: clientTheme.radii.hero,
    borderCurve: 'continuous',
    padding: clientTheme.spacing.xl,
    backgroundColor: clientTheme.colors.glass,
  },
});
