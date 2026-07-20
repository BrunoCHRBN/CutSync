import React, { ReactNode, useState } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

export interface AppInputProps extends TextInputProps {
  label: string;
  testID: string;
  icon?: ReactNode;
  hint?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
  rightAccessory?: ReactNode;
}

export const AppInput = ({
  label,
  testID,
  icon,
  hint,
  error,
  containerStyle,
  rightAccessory,
  style,
  ...props
}: AppInputProps) => {
  const [isFocused, setIsFocused] = useState(false);

  return (
    <View style={[styles.group, containerStyle]}>
      <Text testID={`${testID}-label`} style={styles.label}>{label}</Text>
      <View style={[styles.field, isFocused && styles.fieldFocused, error && styles.fieldError]}>
        {icon}
        <TextInput
          {...props}
          testID={testID}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.brand}
          onFocus={(e) => {
            setIsFocused(true);
            props.onFocus?.(e);
          }}
          onBlur={(e) => {
            setIsFocused(false);
            props.onBlur?.(e);
          }}
          style={[styles.input, style]}
        />
        {rightAccessory}
      </View>
      {!!error && <Text testID={`${testID}-error`} accessibilityLiveRegion="polite" style={styles.error}>{error}</Text>}
      {!error && !!hint && <Text testID={`${testID}-hint`} style={styles.hint}>{hint}</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  group: { gap: 8 },
  label: {
    color: colors.textSecondary,
    fontFamily: typography.bodyStrong,
    fontSize: 12,
    letterSpacing: 0.4,
  },
  field: {
    minHeight: 50,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
  },
  fieldFocused: {
    borderColor: colors.brandPrimary,
    boxShadow: '0 0 0 4px rgba(218,210,182,0.55)',
  },
  fieldError: { borderColor: colors.danger },
  input: {
    flex: 1,
    minHeight: 48,
    color: colors.text,
    fontFamily: typography.body,
    fontSize: 15,
    outlineStyle: 'none',
  } as any,
  hint: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 12,
    lineHeight: 16,
  },
  error: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 12,
  },
});
