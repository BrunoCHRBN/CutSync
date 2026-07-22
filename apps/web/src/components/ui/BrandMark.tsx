import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Scissors } from 'lucide-react-native';
import { colors, radii, typography } from '../../theme/tokens';

interface BrandMarkProps {
  compact?: boolean;
  monochrome?: boolean;
  variant?: 'default' | 'inverse' | 'monochrome';
  testID?: string;
}

export const BrandMark = ({ compact = false, monochrome = false, variant = 'default', testID = 'cutsync-brand' }: BrandMarkProps) => {
  const resolvedVariant = monochrome ? 'monochrome' : variant;

  return (
    <View testID={testID} style={styles.container}>
      <View style={[styles.iconBox, resolvedVariant === 'inverse' && styles.iconBoxInverse, compact && styles.iconBoxCompact]}>
        <Scissors color={resolvedVariant === 'inverse' ? colors.brandPrimary : colors.brandSecondary} size={compact ? 18 : 22} strokeWidth={2.4} />
      </View>
      <Text style={[styles.wordmark, resolvedVariant === 'inverse' && styles.wordmarkInverse, compact && styles.wordmarkCompact]}>CutSync</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandPrimary,
  },
  iconBoxCompact: { width: 34, height: 34, borderRadius: radii.sm },
  iconBoxInverse: { backgroundColor: colors.brandSecondary },
  wordmark: {
    color: colors.brandPrimary,
    fontFamily: typography.display,
    fontSize: 26,
    letterSpacing: -1.1,
  },
  wordmarkInverse: { color: colors.white },
  wordmarkCompact: { fontSize: 21 },
});
