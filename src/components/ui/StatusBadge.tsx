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
  success: { backgroundColor: '#16A34A0D', color: colors.success },
  info: { backgroundColor: '#2563EB0D', color: colors.info },
  warning: { backgroundColor: '#D977060D', color: colors.warning },
  danger: { backgroundColor: '#DC26260D', color: colors.danger },
  neutral: { backgroundColor: colors.surfacePressed, color: colors.textSecondary },
};

export const StatusBadge = ({ label, tone = 'neutral', testID }: StatusBadgeProps) => (
  <View testID={testID} style={[styles.badge, { backgroundColor: toneMap[tone].backgroundColor }]}>
    <Text testID={`${testID}-label`} style={[styles.label, { color: toneMap[tone].color }]}>{label}</Text>
  </View>
);

const styles = StyleSheet.create({
  badge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: radii.pill,
  },
  label: {
    fontFamily: typography.bodyStrong,
    fontSize: 9,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});