import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../../theme/tokens';
import { AppButton } from '../../ui/AppButton';
import { CalendarAppointment } from '../../calendar/operational-calendar';
import { AbsenceTransferAction, AbsenceBatchReport } from '../../../features/appointments/use-appointment-actions';

type ItemDecision = 'cancel' | 'keep';

type WizardItem = {
  appointment: CalendarAppointment;
  decision: ItemDecision;
};

interface AbsenceModeWizardProps {
  visible: boolean;
  professionalId: string;
  appointments: Array<CalendarAppointment & { serviceId: string }>;
  loading?: boolean;
  onClose: () => void;
  onConfirm: (input: {
    rangeStart: Date;
    rangeEnd: Date;
    transfers: AbsenceTransferAction[];
  }) => Promise<AbsenceBatchReport | null>;
}

export const AbsenceModeWizard = ({
  visible,
  professionalId,
  appointments,
  loading = false,
  onClose,
  onConfirm,
}: AbsenceModeWizardProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [items, setItems] = useState<WizardItem[]>([]);
  const [report, setReport] = useState<AbsenceBatchReport | null>(null);

  const range = useMemo(() => {
    const start = new Date();
    const end = new Date();
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [visible]);

  const affected = useMemo(
    () => appointments.filter((item) =>
      item.professionalId === professionalId
      && ['pending', 'confirmed'].includes(item.status)
      && item.startsAt >= range.start
      && item.startsAt <= range.end),
    [appointments, professionalId, range.end, range.start],
  );

  useEffect(() => {
    if (!visible) {
      setStep(1);
      setItems([]);
      setReport(null);
      return;
    }

    setItems(affected.map((appointment) => ({
      appointment,
      decision: 'keep',
    })));
  }, [affected, visible]);

  const submit = async () => {
    const transfers: AbsenceTransferAction[] = items.map((item) => {
      if (item.decision === 'keep') return { appointment_id: item.appointment.id, action: 'keep' };
      return {
        appointment_id: item.appointment.id,
        action: 'cancel',
        cancellation_note: 'Ausência do profissional',
      };
    });
    const result = await onConfirm({ rangeStart: range.start, rangeEnd: range.end, transfers });
    setReport(result);
    setStep(3);
  };

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Fechar modo ausência" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.sheet}
          testID="absence-mode-wizard"
        >
          <Text style={styles.eyebrow}>MODO AUSÊNCIA</Text>
          <Text style={styles.title}>
            {step === 1 ? 'Período da ausência' : step === 2 ? 'Revisar atendimentos' : 'Relatório'}
          </Text>

          {step === 1 ? (
            <View style={styles.block}>
              <Text style={styles.description}>
                Padrão: a partir de agora até o fim do dia. Por segurança, atendimentos ativos podem ser mantidos ou cancelados; a troca de profissional ficará disponível na futura Central de Decisões. Ao confirmar, um bloqueio de ausência será criado.
              </Text>
              <Text style={styles.meta}>
                {range.start.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                {' → '}
                {range.end.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <Text style={styles.meta}>{affected.length} atendimento(s) afetado(s)</Text>
              <View style={styles.actions}>
                <AppButton label="Cancelar" onPress={onClose} testID="absence-mode-cancel" variant="secondary" />
                <AppButton label="Continuar" onPress={() => setStep(2)} testID="absence-mode-continue" />
              </View>
            </View>
          ) : null}

          {step === 2 ? (
            <View style={styles.block}>
              <ScrollView style={styles.list}>
                  {items.length === 0 ? (
                    <Text style={styles.description}>Nenhum atendimento ativo no período. Você ainda pode bloquear a agenda.</Text>
                  ) : items.map((item) => (
                    <View key={item.appointment.id} style={styles.item} testID={`absence-item-${item.appointment.id}`}>
                      <Text style={styles.itemTitle}>
                        {item.appointment.startsAt.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        {' · '}
                        {item.appointment.clientName}
                      </Text>
                      <Text style={styles.description}>
                        {item.appointment.serviceName}
                        {' · escolha segura: manter ou cancelar'}
                      </Text>
                      <View style={styles.decisionRow}>
                        {(['keep', 'cancel'] as ItemDecision[]).map((decision) => (
                          <Pressable
                            key={decision}
                            onPress={() => setItems((current) => current.map((entry) =>
                              entry.appointment.id === item.appointment.id
                                ? { ...entry, decision }
                                : entry))}
                            style={[styles.chip, item.decision === decision && styles.chipSelected]}
                            testID={`absence-decision-${item.appointment.id}-${decision}`}
                          >
                            <Text style={styles.chipText}>
                              {decision === 'cancel' ? 'Cancelar' : 'Manter'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                    </View>
                  ))}
              </ScrollView>
              <View style={styles.actions}>
                <AppButton label="Voltar" onPress={() => setStep(1)} testID="absence-mode-back" variant="secondary" />
                <AppButton
                  label="Confirmar ausência"
                  loading={loading}
                  onPress={() => { void submit(); }}
                  testID="absence-mode-confirm"
                />
              </View>
            </View>
          ) : null}

          {step === 3 ? (
            <View style={styles.block}>
              <ScrollView style={styles.list}>
                {(report?.results || []).map((result) => (
                  <Text key={`${result.appointment_id}-${result.action}`} style={styles.description}>
                    {result.appointment_id.slice(0, 8)}… · {result.action} · {result.ok ? 'ok' : result.error}
                  </Text>
                ))}
                <Text style={styles.meta}>
                  Bloqueio: {report?.schedule_block_id ? 'criado' : report?.schedule_block_error || 'não criado'}
                </Text>
              </ScrollView>
              <View style={styles.actions}>
                <AppButton label="Fechar" onPress={onClose} testID="absence-mode-done" />
              </View>
            </View>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24,32,27,0.34)', flex: 1, justifyContent: 'center', padding: spacing.md },
  sheet: { alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, gap: spacing.sm, maxHeight: '90%', maxWidth: 640, padding: spacing.xl, width: '100%', ...elevations.overlay },
  eyebrow: { ...typeScale.label, color: colors.warning, letterSpacing: 1.2 },
  title: { ...typeScale.cardTitle, color: colors.textPrimary },
  description: { ...typeScale.small, color: colors.textSecondary },
  meta: { ...typeScale.bodyStrong, color: colors.textPrimary, marginTop: spacing.xs },
  block: { gap: spacing.sm },
  list: { maxHeight: 360 },
  item: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, gap: spacing.xs, marginBottom: spacing.sm, padding: spacing.md },
  itemTitle: { ...typeScale.bodyStrong, color: colors.textPrimary },
  decisionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, paddingHorizontal: spacing.sm, paddingVertical: 6 },
  chipSelected: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandPrimary },
  chipText: { ...typeScale.small, color: colors.textPrimary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
});
