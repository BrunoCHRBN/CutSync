import type { PropsWithChildren, ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { colors, radii, typography } from '../../theme/tokens';

export function PublicComplianceShell({
  eyebrow,
  title,
  description,
  children,
  footer,
  testID,
}: PropsWithChildren<{
  eyebrow: string;
  title: string;
  description: string;
  footer?: ReactNode;
  testID: string;
}>) {
  return (
    <ScrollView testID={testID} contentContainerStyle={styles.page} showsVerticalScrollIndicator={false}>
      <View style={styles.header}>
        <View style={styles.brandRow}>
          <View style={styles.brandMark} />
          <Text style={styles.brand}>CutSync</Text>
        </View>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      <View style={styles.card}>{children}</View>
      {footer}
    </ScrollView>
  );
}

export function ComplianceSection({ title, children }: PropsWithChildren<{ title: string }>) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <Text style={styles.sectionBody}>{children}</Text>
    </View>
  );
}

export function ComplianceButton({
  label,
  onPress,
  disabled,
  danger,
  testID,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  danger?: boolean;
  testID: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        danger && styles.dangerButton,
        disabled && styles.buttonDisabled,
        pressed && !disabled && styles.buttonPressed,
      ]}
    >
      <Text style={[styles.buttonText, danger && styles.dangerButtonText]}>{label}</Text>
    </Pressable>
  );
}

export const publicComplianceStyles = StyleSheet.create({
  actions: { gap: 12, marginTop: 8 },
  backLink: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 13, textAlign: 'center' },
  confirmation: {
    gap: 14,
    borderWidth: 1,
    borderColor: colors.warning,
    backgroundColor: colors.warningSoft,
    borderRadius: radii.lg,
    padding: 18,
  },
  confirmationTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 16 },
  confirmationText: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  notice: {
    borderRadius: radii.md,
    padding: 16,
    backgroundColor: colors.brandSecondarySoft,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
  },
  success: { backgroundColor: colors.successSoft, color: colors.success },
  error: { backgroundColor: colors.dangerSoft, color: colors.danger },
});

const styles = StyleSheet.create({
  page: {
    minHeight: '100%',
    width: '100%',
    maxWidth: 820,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 48,
    gap: 24,
    backgroundColor: colors.canvas,
  },
  header: { gap: 12 },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 18 },
  brandMark: { width: 28, height: 28, borderRadius: 9, backgroundColor: colors.brand },
  brand: { color: colors.text, fontFamily: typography.display, fontSize: 19 },
  eyebrow: { color: colors.brand, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 1.4 },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 34, lineHeight: 41, letterSpacing: -1.2 },
  description: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 16, lineHeight: 25, maxWidth: 680 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    padding: 24,
    gap: 22,
  },
  section: { gap: 7 },
  sectionTitle: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 16 },
  sectionBody: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 14, lineHeight: 22 },
  button: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.pill,
    backgroundColor: colors.brand,
    paddingHorizontal: 22,
  },
  dangerButton: { backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.danger },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.78 },
  buttonText: { color: colors.white, fontFamily: typography.bodyStrong, fontSize: 14 },
  dangerButtonText: { color: colors.danger },
});
