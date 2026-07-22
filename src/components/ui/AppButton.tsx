import React, { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleProp,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

type ButtonVariant = 'primary' | 'admin' | 'secondary' | 'ghost' | 'success' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface AppButtonProps {
  label: string;
  onPress: () => void;
  testID?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  shortcutLabel?: string;
  size?: ButtonSize;
  fullWidth?: boolean;
  style?: StyleProp<ViewStyle>;
  foregroundColor?: string;
}

export const AppButton = ({
  label,
  onPress,
  testID,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  leadingIcon,
  trailingIcon,
  shortcutLabel,
  size = 'md',
  fullWidth = false,
  style,
  foregroundColor,
}: AppButtonProps) => {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        styles[`${size}Size`],
        fullWidth && styles.fullWidth,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={variant === 'primary' || variant === 'admin' ? colors.ink : colors.text} />
      ) : (
        <View style={styles.content}>
          {leadingIcon ?? icon}
          <Text style={[styles.label, styles[`${variant}Label`], foregroundColor ? { color: foregroundColor } : null]}>{label}</Text>
          {!!shortcutLabel && <Text style={[styles.shortcut, styles[`${variant}Label`]]}>{shortcutLabel}</Text>}
          {trailingIcon}
        </View>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  base: {
    minHeight: 44,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    transform: [{ scale: 1 }],
  },
  smSize: { minHeight: 44, paddingHorizontal: 14, paddingVertical: 9 },
  mdSize: { minHeight: 48, paddingHorizontal: 18, paddingVertical: 12 },
  lgSize: { minHeight: 54, paddingHorizontal: 22, paddingVertical: 14 },
  primary: {
    backgroundColor: colors.brand,
    borderColor: colors.brand,
  },
  admin: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  secondary: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
  },
  ghost: {
    backgroundColor: 'transparent',
    borderColor: 'transparent',
  },
  danger: {
    backgroundColor: colors.dangerSoft,
    borderColor: '#DC262644',
  },
  success: {
    backgroundColor: colors.successSoft,
    borderColor: colors.success,
  },
  primaryLabel: { color: colors.ink },
  adminLabel: { color: colors.ink },
  secondaryLabel: { color: colors.text },
  ghostLabel: { color: colors.textSecondary },
  successLabel: { color: colors.success },
  dangerLabel: { color: colors.danger },
  fullWidth: { width: '100%' },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  label: {
    fontFamily: typography.bodyStrong,
    fontSize: 14,
  },
  shortcut: {
    minWidth: 24,
    borderRadius: radii.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(255,255,255,0.14)',
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    textAlign: 'center',
    opacity: 0.82,
  },
  hovered: {
    borderColor: colors.brand,
    transform: [{ translateY: -2 }],
  },
  focused: {
    borderColor: colors.brand,
    borderWidth: 2,
  },
  pressed: {
    transform: [{ scale: 0.97 }],
  },
  disabled: { opacity: 0.5 },
});
