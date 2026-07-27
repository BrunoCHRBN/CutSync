import type { PropsWithChildren, ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { businessTheme } from '@/theme/business-theme';

type NoticeTone = 'neutral' | 'success' | 'warning' | 'danger';

export function BusinessPage({
  children,
  testID,
  contentStyle,
}: PropsWithChildren<{
  testID: string;
  contentStyle?: StyleProp<ViewStyle>;
}>) {
  return (
    <ScrollView
      testID={testID}
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={[styles.page, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

export function BusinessHeader({
  eyebrow,
  title,
  description,
  trailing,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  trailing?: ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerCopy}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text selectable style={styles.title}>{title}</Text>
        {description ? <Text selectable style={styles.description}>{description}</Text> : null}
      </View>
      {trailing}
    </View>
  );
}

export function BusinessCard({
  children,
  style,
  testID,
}: PropsWithChildren<{ style?: StyleProp<ViewStyle>; testID?: string }>) {
  return <View testID={testID} style={[styles.card, style]}>{children}</View>;
}

export function BusinessNotice({
  message,
  tone = 'neutral',
  testID,
}: {
  message: string;
  tone?: NoticeTone;
  testID?: string;
}) {
  const toneStyle = {
    neutral: styles.noticeNeutral,
    success: styles.noticeSuccess,
    warning: styles.noticeWarning,
    danger: styles.noticeDanger,
  }[tone];
  const textStyle = {
    neutral: styles.noticeTextNeutral,
    success: styles.noticeTextSuccess,
    warning: styles.noticeTextWarning,
    danger: styles.noticeTextDanger,
  }[tone];
  return (
    <View testID={testID} accessibilityLiveRegion="polite" style={[styles.notice, toneStyle]}>
      <Text selectable style={[styles.noticeText, textStyle]}>{message}</Text>
    </View>
  );
}

export function BusinessButton({
  label,
  onPress,
  loading,
  disabled,
  variant = 'primary',
  testID,
}: {
  label: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  testID?: string;
}) {
  const isDisabled = Boolean(disabled || loading);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        variant === 'secondary' && styles.buttonSecondary,
        variant === 'ghost' && styles.buttonGhost,
        variant === 'danger' && styles.buttonDanger,
        isDisabled && styles.buttonDisabled,
        pressed && !isDisabled && styles.buttonPressed,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' ? businessTheme.colors.canvas : businessTheme.colors.text} />
      ) : (
        <Text style={[
          styles.buttonText,
          variant === 'primary' ? styles.buttonTextPrimary : styles.buttonTextSecondary,
        ]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

export function BusinessPill({
  label,
  tone = 'neutral',
  testID,
}: {
  label: string;
  tone?: NoticeTone;
  testID?: string;
}) {
  const backgroundColor = {
    neutral: businessTheme.colors.surfaceMuted,
    success: businessTheme.colors.successSoft,
    warning: businessTheme.colors.warningSoft,
    danger: businessTheme.colors.dangerSoft,
  }[tone];
  const color = {
    neutral: businessTheme.colors.textSoft,
    success: businessTheme.colors.success,
    warning: businessTheme.colors.warning,
    danger: businessTheme.colors.danger,
  }[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor }]}>
      <Text style={[styles.pillText, { color }]}>{label}</Text>
    </View>
  );
}

export function BusinessMetric({
  label,
  value,
  emphasis,
  testID,
}: {
  label: string;
  value: string;
  emphasis?: 'accent' | 'warning';
  testID?: string;
}) {
  const valueColor = emphasis === 'warning'
    ? businessTheme.colors.warning
    : emphasis === 'accent'
      ? businessTheme.colors.accentStrong
      : businessTheme.colors.text;
  return (
    <BusinessCard testID={testID} style={styles.metric}>
      <Text selectable style={[styles.metricValue, { color: valueColor }]}>{value}</Text>
      <Text selectable style={styles.metricLabel}>{label}</Text>
    </BusinessCard>
  );
}

export function BusinessSectionTitle({
  children,
  style,
}: PropsWithChildren<{ style?: StyleProp<TextStyle> }>) {
  return <Text selectable style={[styles.sectionTitle, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  page: {
    flexGrow: 1,
    width: '100%',
    maxWidth: businessTheme.sizing.contentMaxWidth,
    alignSelf: 'center',
    gap: businessTheme.spacing.lg,
    paddingHorizontal: businessTheme.spacing.lg,
    paddingTop: businessTheme.spacing.xl,
    paddingBottom: businessTheme.spacing.xxl,
    backgroundColor: businessTheme.colors.canvas,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: businessTheme.spacing.md,
  },
  headerCopy: { flex: 1, gap: businessTheme.spacing.xs },
  eyebrow: { ...businessTheme.typography.eyebrow, color: businessTheme.colors.accent },
  title: { ...businessTheme.typography.display, color: businessTheme.colors.text },
  description: { ...businessTheme.typography.body, color: businessTheme.colors.textSoft, maxWidth: 560 },
  card: {
    gap: businessTheme.spacing.sm,
    borderWidth: 1,
    borderColor: businessTheme.colors.border,
    borderRadius: businessTheme.radii.lg,
    borderCurve: 'continuous',
    padding: businessTheme.spacing.md,
    backgroundColor: businessTheme.colors.surface,
  },
  notice: {
    borderWidth: 1,
    borderRadius: businessTheme.radii.md,
    borderCurve: 'continuous',
    paddingHorizontal: businessTheme.spacing.md,
    paddingVertical: businessTheme.spacing.sm,
  },
  noticeNeutral: { backgroundColor: businessTheme.colors.infoSoft, borderColor: '#28445E' },
  noticeSuccess: { backgroundColor: businessTheme.colors.successSoft, borderColor: '#295336' },
  noticeWarning: { backgroundColor: businessTheme.colors.warningSoft, borderColor: '#5B4721' },
  noticeDanger: { backgroundColor: businessTheme.colors.dangerSoft, borderColor: '#63312D' },
  noticeText: { ...businessTheme.typography.caption },
  noticeTextNeutral: { color: businessTheme.colors.info },
  noticeTextSuccess: { color: businessTheme.colors.success },
  noticeTextWarning: { color: businessTheme.colors.warning },
  noticeTextDanger: { color: businessTheme.colors.danger },
  button: {
    minHeight: businessTheme.sizing.control,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: businessTheme.radii.md,
    borderCurve: 'continuous',
    paddingHorizontal: businessTheme.spacing.md,
    backgroundColor: businessTheme.colors.accentStrong,
  },
  buttonSecondary: {
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    backgroundColor: businessTheme.colors.surfaceRaised,
  },
  buttonGhost: { backgroundColor: 'transparent' },
  buttonDanger: {
    borderWidth: 1,
    borderColor: '#63312D',
    backgroundColor: businessTheme.colors.dangerSoft,
  },
  buttonDisabled: { opacity: businessTheme.opacity.disabled },
  buttonPressed: { opacity: businessTheme.opacity.pressed },
  buttonText: { ...businessTheme.typography.bodyStrong },
  buttonTextPrimary: { color: businessTheme.colors.canvas },
  buttonTextSecondary: { color: businessTheme.colors.text },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: businessTheme.radii.pill,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  pillText: { ...businessTheme.typography.eyebrow, letterSpacing: 0.8 },
  metric: { flex: 1, minWidth: 96 },
  metricValue: {
    fontSize: 26,
    lineHeight: 30,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  metricLabel: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  sectionTitle: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
});
