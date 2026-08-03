import React, { useEffect, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View } from 'react-native';
import { colors, glassSurface, typography } from '../../theme/tokens';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';
import { AppInput } from './AppInput';

export interface PromptDialogProps {
  visible: boolean;
  title: string;
  message?: string;
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  testID?: string;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

export const PromptDialog = ({
  visible,
  title,
  message,
  defaultValue = '',
  placeholder,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  testID = 'prompt-dialog',
  onConfirm,
  onCancel,
}: PromptDialogProps) => {
  const [value, setValue] = useState(defaultValue);
  useEffect(() => {
    if (visible) setValue(defaultValue);
  }, [defaultValue, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.overlay} testID={testID}>
        <AppCard style={styles.card} elevated>
          <Text style={styles.title}>{title}</Text>
          {message ? <Text style={styles.message}>{message}</Text> : null}
          <AppInput testID={`${testID}-input`} value={value} onChangeText={setValue} placeholder={placeholder} />
          <View style={styles.actions}>
            <AppButton label={cancelLabel} testID={`${testID}-cancel`} variant="secondary" onPress={onCancel} />
            <AppButton label={confirmLabel} testID={`${testID}-confirm`} variant="admin" onPress={() => onConfirm(value)} />
          </View>
        </AppCard>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 15, 18, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    ...Platform.select({
      web: { backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' } as object,
      default: {},
    }),
  },
  card: { width: '100%', maxWidth: 420, padding: 22, gap: 12, ...glassSurface },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  message: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 },
});
