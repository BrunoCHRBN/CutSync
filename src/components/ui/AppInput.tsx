import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, TextInput, TextInputProps, View, ViewStyle } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

interface AppInputProps extends TextInputProps {
  label: string;
  testID: string;
  icon?: ReactNode;
  hint?: string;
  error?: string;
  containerStyle?: StyleProp<ViewStyle>;
}

export const AppInput = ({
  label,
  testID,
  icon,
  hint,
  error,
  containerStyle,
  style,
  ...props
}: AppInputProps) => (
  <View style={[styles.group, containerStyle]}>
    <Text testID={`${testID}-label`} style={styles.label}>{label}</Text>
    <View style={[styles.field, error && styles.fieldError]}>
      {icon}
      <TextInput
        {...props}
        testID={testID}
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.brand}
        style={[styles.input, style]}
      />
    </View>
    {!!error && <Text testID={`${testID}-error`} style={styles.error}>{error}</Text>}
    {!error && !!hint && <Text testID={`${testID}-hint`} style={styles.hint}>{hint}</Text>}
  </View>
);

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
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingHorizontal: 14,
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
    fontSize: 11,
    lineHeight: 16,
  },
  error: {
    color: colors.danger,
    fontFamily: typography.body,
    fontSize: 11,
  },
});