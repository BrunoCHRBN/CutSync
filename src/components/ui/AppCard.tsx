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
    backgroundColor: colors.surface,
    ...Platform.select({
      web: { boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)' } as any,
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3, elevation: 2 },
    }),
  },
});