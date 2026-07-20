import React, { ReactNode } from 'react';
import { Pressable, StyleProp, StyleSheet, ViewStyle } from 'react-native';
import { colors, radii } from '../../theme/tokens';

interface IconButtonProps {
  icon: ReactNode;
  label: string;
  testID: string;
  onPress: () => void;
  disabled?: boolean;
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
}

export const IconButton = ({ icon, label, testID, onPress, disabled = false, selected = false, style }: IconButtonProps) => (
  <Pressable
    testID={testID}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ disabled, selected }}
    disabled={disabled}
    onPress={onPress}
    style={({ pressed }) => [styles.button, selected && styles.selected, pressed && styles.pressed, disabled && styles.disabled, style]}
  >
    {icon}
  </Pressable>
);

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radii.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    backgroundColor: colors.surface,
  },
  selected: { borderColor: colors.brandPrimary, backgroundColor: colors.brandSecondarySoft },
  pressed: { opacity: 0.78, transform: [{ scale: 0.97 }] },
  disabled: { opacity: 0.45 },
});
