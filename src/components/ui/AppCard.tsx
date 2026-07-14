import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
    elevation: 8,
  },
});