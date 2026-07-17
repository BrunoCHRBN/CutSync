import React, { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Eye, EyeOff, LockKeyhole } from 'lucide-react-native';
import { AppInput, AppInputProps } from './AppInput';
import { colors } from '../../theme/tokens';

type PasswordInputProps = Omit<AppInputProps, 'secureTextEntry' | 'rightAccessory' | 'icon' | 'testID'> & { testID: string };

export const PasswordInput = ({ testID, ...props }: PasswordInputProps) => {
  const [visible, setVisible] = useState(false);

  return (
    <AppInput
      {...props}
      testID={testID}
      icon={<LockKeyhole color={colors.textMuted} size={17} />}
      secureTextEntry={!visible}
      autoCapitalize="none"
      rightAccessory={(
        <Pressable
          testID={`${testID}-visibility-button`}
          accessibilityRole="button"
          accessibilityLabel={visible ? 'Ocultar senha' : 'Mostrar senha'}
          hitSlop={10}
          onPress={() => setVisible((current) => !current)}
          style={({ pressed }) => [styles.toggle, pressed && styles.pressed]}
        >
          {visible ? <EyeOff color={colors.textSecondary} size={18} /> : <Eye color={colors.textSecondary} size={18} />}
        </Pressable>
      )}
    />
  );
};

const styles = StyleSheet.create({
  toggle: { padding: 4 },
  pressed: { opacity: 0.55, transform: [{ scale: 0.96 }] },
});