import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colors } from '../../theme/tokens';

interface ScreenBackgroundProps {
  children: ReactNode;
  testID: string;
  style?: StyleProp<ViewStyle>;
}

export const ScreenBackground = ({ children, testID, style }: ScreenBackgroundProps) => (
  <SafeAreaView testID={testID} style={[styles.safeArea, style]}>
    <View style={[styles.glowTop, styles.noPointerEvents]} />
    {children}
  </SafeAreaView>
);

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.canvas,
    overflow: 'hidden',
  },
  glowTop: {
    position: 'absolute',
    width: 460,
    height: 460,
    borderRadius: 230,
    top: -320,
    right: -120,
    backgroundColor: colors.brandSecondary,
    opacity: 0.04,
  },
  noPointerEvents: { pointerEvents: 'none' },
});
