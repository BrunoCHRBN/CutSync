import React, { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { atmosphericShadow, colors, radii } from '../../theme/tokens';

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
    borderWidth: Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radii.lg,
    padding: 20,
    ...atmosphericShadow,
  },
  elevated: {
    ...Platform.select({
      web: { boxShadow: '0 12px 40px rgba(0,0,0,0.06)' } as any,
      default: { shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.06, shadowRadius: 24, elevation: 3 },
    }),
  },
});
