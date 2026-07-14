import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

type StatusTone = 'success' | 'info' | 'warning' | 'danger' | 'neutral';

interface StatusBadgeProps {
  label: string;
  tone?: StatusTone;
  testID: string;
}

const toneMap = {
  success: { backgroundColor: colors.successSoft, color: colors.success },
  info: { backgroundColor: colors.infoSoft, color: colors.info },
  warning: { backgroundColor: colors.warningSoft, color: colors.warning },
  danger: { backgroundColor: colors.dangerSoft, color: colors.danger },
  neutral: { backgroundColor: colors.surfacePressed, color: colors.textSecondary },
};

export const StatusBadge = ({ label, tone = 'neutral', testID }: StatusBadgeProps) => (
  <View testID={testID} style={[styles.badge, { backgroundColor: toneMap[tone].backgroundColor }]}>
    <View style={[styles.dot, { backgroundColor: toneMap[tone].color }]} />
    <Text style={[styles.label, { color: toneMap[tone].color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  dot: { width: 5, height: 5, borderRadius: 3 },
  label: {
    fontFamily: typography.bodyStrong,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});