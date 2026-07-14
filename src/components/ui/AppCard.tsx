import React, { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, radii } from '../../theme/tokens';

interface AppCardProps {
  children: ReactNode;
  testID: string;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
}

export const AppCard = ({ children, testID, style, elevated = false }: AppCardProps) => (
  <View testID={testID} style={[styles.card, elevated && styles.elevated, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 20,
  },
  elevated: {
    backgroundColor: colors.surfaceRaised,
    ...Platform.select({
      web: { boxShadow: '0 12px 24px rgba(0,0,0,0.22)' } as any,
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.22, shadowRadius: 24, elevation: 8 },
    }),
  },
});