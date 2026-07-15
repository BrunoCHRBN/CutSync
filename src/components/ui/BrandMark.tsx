import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Scissors } from 'lucide-react-native';
import { colors, radii, typography } from '../../theme/tokens';

interface BrandMarkProps {
  compact?: boolean;
  monochrome?: boolean;
  testID?: string;
}

export const BrandMark = ({ compact = false, monochrome = false, testID = 'cutsync-brand' }: BrandMarkProps) => (
  <View testID={testID} style={styles.container}>
    <View style={[styles.iconBox, monochrome && styles.iconBoxMonochrome, compact && styles.iconBoxCompact]}>
      <Scissors color={colors.ink} size={compact ? 18 : 22} strokeWidth={2.4} />
    </View>
    <Text style={[styles.wordmark, compact && styles.wordmarkCompact]}>CutSync</Text>
  </View>
);

const styles = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  iconBox: {
    width: 42,
    height: 42,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brand,
    transform: [{ rotate: '-8deg' }],
  },
  iconBoxCompact: { width: 34, height: 34, borderRadius: radii.sm },
  iconBoxMonochrome: { backgroundColor: colors.accent, transform: [{ rotate: '0deg' }] },
  wordmark: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 26,
    letterSpacing: -1.1,
  },
  wordmarkCompact: { fontSize: 21 },
});