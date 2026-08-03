import React, { useEffect, useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';

export const PROFESSIONAL_CANCEL_REASONS = [
  { id: 'client_requested', label: 'Cliente solicitou' },
  { id: 'professional_unavailable', label: 'Falta do profissional' },
  { id: 'schedule_error', label: 'Erro de agenda' },
  { id: 'other', label: 'Outro' },
] as const;

interface CancelAppointmentModalProps {
  visible: boolean;
  clientName?: string;
  loading?: boolean;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

export const CancelAppointmentModal = ({
  visible,
  clientName,
  loading = false,
  onConfirm,
  onCancel,
}: CancelAppointmentModalProps) => {
  const [reasonId, setReasonId] = useState<string>(PROFESSIONAL_CANCEL_REASONS[0].id);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (visible) {
      setReasonId(PROFESSIONAL_CANCEL_REASONS[0].id);
      setNote('');
    }
  }, [visible]);

  const selected = PROFESSIONAL_CANCEL_REASONS.find((item) => item.id === reasonId);
  const reasonLabel = reasonId === 'other' && note.trim()
    ? note.trim()
    : selected?.label || 'Cliente solicitou';

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onCancel} transparent visible={visible}>
      <Pressable accessibilityLabel="Fechar cancelamento" onPress={onCancel} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.sheet}
          testID="cancel-appointment-modal"
        >
          <Text style={styles.eyebrow}>CANCELAR ATENDIMENTO</Text>
          <Text style={styles.title}>
            {clientName ? `Cancelar ${clientName}?` : 'Cancelar atendimento?'}
          </Text>
          <Text style={styles.description}>Escolha um motivo padronizado. A nota interna é opcional.</Text>
          <View style={styles.reasons}>
            {PROFESSIONAL_CANCEL_REASONS.map((reason) => {
              const selectedReason = reasonId === reason.id;
              return (
                <Pressable
                  key={reason.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected: selectedReason }}
                  onPress={() => setReasonId(reason.id)}
                  style={[styles.reasonChip, selectedReason && styles.reasonChipSelected]}
                  testID={`cancel-reason-${reason.id}`}
                >
                  <Text style={[styles.reasonText, selectedReason && styles.reasonTextSelected]}>{reason.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <AppInput
            label="Nota interna"
            onChangeText={setNote}
            placeholder="Opcional"
            testID="cancel-appointment-note"
            value={note}
          />
          <View style={styles.actions}>
            <AppButton disabled={loading} label="Voltar" onPress={onCancel} testID="cancel-appointment-back" variant="secondary" />
            <AppButton
              label="Confirmar cancelamento"
              loading={loading}
              onPress={() => onConfirm(reasonLabel)}
              testID="cancel-appointment-confirm"
              variant="danger"
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24,32,27,0.34)', flex: 1, justifyContent: 'center', padding: spacing.md },
  sheet: { alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, gap: spacing.sm, maxWidth: 480, padding: spacing.xl, width: '100%', ...elevations.overlay },
  eyebrow: { ...typeScale.label, color: colors.danger, letterSpacing: 1.2 },
  title: { ...typeScale.cardTitle, color: colors.textPrimary },
  description: { ...typeScale.small, color: colors.textSecondary, marginBottom: spacing.xs },
  reasons: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  reasonChip: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.md, paddingVertical: spacing.sm },
  reasonChipSelected: { backgroundColor: colors.dangerSoft, borderColor: colors.danger },
  reasonText: { ...typeScale.small, color: colors.textPrimary },
  reasonTextSelected: { color: colors.danger, fontWeight: '600' },
  actions: { flexDirection: 'row', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
});
