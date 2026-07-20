import React, { ReactNode } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors, elevations, radii } from '../../theme/tokens';

type AppCardVariant = 'flat' | 'outlined' | 'raised';

interface AppCardProps {
  children: ReactNode;
  testID: string;
  style?: StyleProp<ViewStyle>;
  elevated?: boolean;
  variant?: AppCardVariant;
}

export const AppCard = ({ children, testID, style, elevated = false, variant = 'outlined' }: AppCardProps) => (
  <View testID={testID} style={[styles.card, styles[variant], elevated && styles.raised, style]}>
    {children}
  </View>
);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: 20,
  },
  flat: { borderWidth: 0 },
  outlined: { borderWidth: Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth, borderColor: colors.borderSubtle },
  raised: { borderWidth: 1, borderColor: colors.borderSubtle, ...elevations.overlay },
});
