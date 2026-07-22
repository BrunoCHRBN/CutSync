import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, elevations, typeScale } from '../../theme/tokens';

interface StickyActionBarProps {
  message?: string;
  actions: ReactNode;
  testID: string;
}

export const StickyActionBar = ({ message, actions, testID }: StickyActionBarProps) => {
  const insets = useSafeAreaInsets();

  return (
    <View testID={testID} style={[styles.container, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {!!message && <Text accessibilityLiveRegion="polite" style={styles.message}>{message}</Text>}
      <View style={styles.actions}>{actions}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 20,
    paddingTop: 12,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 1,
    borderTopColor: colors.borderSubtle,
    ...elevations.panel,
  },
  message: { ...typeScale.small, flex: 1, minWidth: 180, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'flex-end', gap: 8 },
});
