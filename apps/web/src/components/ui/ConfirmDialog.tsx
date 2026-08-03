import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, glassSurface, radii, typography } from '../../theme/tokens';
import { AppButton } from './AppButton';
import { AppCard } from './AppCard';

export interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  testID?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog = ({
  visible,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  destructive = false,
  loading = false,
  testID = 'confirm-dialog',
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => (
  <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
    <Pressable style={styles.overlay} testID={testID} onPress={onCancel}>
      <Pressable onPress={(event) => event.stopPropagation?.()} style={styles.cardPressable}>
        <AppCard style={styles.card} elevated>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          <View style={styles.actions}>
            <AppButton label={cancelLabel} testID={`${testID}-cancel`} variant="secondary" onPress={onCancel} disabled={loading} />
            <AppButton
              label={confirmLabel}
              testID={`${testID}-confirm`}
              variant={destructive ? 'secondary' : 'admin'}
              onPress={onConfirm}
              loading={loading}
            />
          </View>
        </AppCard>
      </Pressable>
    </Pressable>
  </Modal>
);

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
  cardPressable: { width: '100%', maxWidth: 420 },
  card: {
    width: '100%',
    padding: 22,
    gap: 12,
    ...glassSurface,
  },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 18 },
  message: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13, lineHeight: 20 },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 8 },
});
