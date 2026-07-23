import React from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  testID?: string;
  showDot?: boolean;
}

const toneMap = {
  success: { backgroundColor: 'rgba(22, 163, 74, 0.12)', color: colors.success, borderColor: 'rgba(22, 163, 74, 0.25)' },
  info: { backgroundColor: 'rgba(37, 99, 235, 0.12)', color: colors.info, borderColor: 'rgba(37, 99, 235, 0.25)' },
  warning: { backgroundColor: 'rgba(217, 119, 6, 0.12)', color: colors.warning, borderColor: 'rgba(217, 119, 6, 0.25)' },
  danger: { backgroundColor: 'rgba(220, 38, 38, 0.12)', color: colors.danger, borderColor: 'rgba(220, 38, 38, 0.25)' },
  neutral: { backgroundColor: colors.surfacePressed, color: colors.textSecondary, borderColor: colors.borderSubtle },
};

export const StatusBadge = ({ label, tone = 'neutral', testID = 'status-badge', showDot = false }: StatusBadgeProps) => (
  <View
    testID={testID}
    style={[
      styles.badge,
      {
        backgroundColor: toneMap[tone].backgroundColor,
        borderColor: toneMap[tone].borderColor,
      },
    ]}
  >
    {showDot && <View style={[styles.dot, { backgroundColor: toneMap[tone].color }]} />}
    <Text testID={`${testID}-label`} style={[styles.label, { color: toneMap[tone].color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radii.pill,
    borderWidth: 1,
    gap: 5,
    ...Platform.select({
      web: {
        backdropFilter: 'blur(10px)',
        WebkitBackdropFilter: 'blur(10px)',
      } as any,
      default: {},
    }),
  },
  label: {
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
});
