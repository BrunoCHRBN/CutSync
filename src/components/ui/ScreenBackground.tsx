import React, { ReactNode } from 'react';
import { SafeAreaView, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from '../../theme/tokens';

interface ScreenBackgroundProps {
  children: ReactNode;
  testID: string;
  style?: StyleProp<ViewStyle>;
}

export const ScreenBackground = ({ children, testID, style }: ScreenBackgroundProps) => (
  <SafeAreaView testID={testID} style={[styles.safeArea, style]}>
    <View style={[styles.glowTop, styles.noPointerEvents]} />
    <View style={[styles.gridLine, styles.noPointerEvents]} />
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
    backgroundColor: colors.brand,
    opacity: 0.08,
  },
  gridLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: '8%',
    width: 1,
    backgroundColor: colors.border,
    opacity: 0.26,
  },
  noPointerEvents: { pointerEvents: 'none' },
});