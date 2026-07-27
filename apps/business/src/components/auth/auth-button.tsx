import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type PressableProps,
} from 'react-native';

interface AuthButtonProps extends Omit<PressableProps, 'children' | 'style'> {
  label: string;
  busy?: boolean;
  variant?: 'primary' | 'secondary' | 'text';
}

export function AuthButton({
  label,
  busy = false,
  variant = 'primary',
  disabled,
  ...props
}: AuthButtonProps) {
  const isDisabled = disabled || busy;

  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        styles[variant],
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
      ]}
      {...props}
    >
      {busy ? (
        <ActivityIndicator color={variant === 'primary' ? '#102019' : '#DDE7E0'} />
      ) : (
        <Text style={[styles.label, styles[`${variant}Label`]]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 52,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  primary: {
    backgroundColor: '#C7E36F',
  },
  secondary: {
    backgroundColor: '#1B2B24',
    borderWidth: 1,
    borderColor: '#365044',
  },
  text: {
    minHeight: 44,
    backgroundColor: 'transparent',
  },
  label: {
    fontSize: 15,
    fontWeight: '800',
  },
  primaryLabel: {
    color: '#102019',
  },
  secondaryLabel: {
    color: '#F5F8F6',
  },
  textLabel: {
    color: '#C7E36F',
  },
  pressed: {
    opacity: 0.76,
  },
  disabled: {
    opacity: 0.48,
  },
});
