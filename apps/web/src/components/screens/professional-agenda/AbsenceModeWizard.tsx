import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../../theme/tokens';
import { AppButton } from '../../ui/AppButton';
import { CalendarAppointment } from '../../calendar/operational-calendar';
import { AbsenceTransferAction, AbsenceBatchReport } from '../../../features/appointments/use-appointment-actions';
import { supabase } from '../../../services/supabase';

type ItemDecision = 'transfer' | 'cancel' | 'keep';

type WizardItem = {
  appointment: CalendarAppointment;
  serviceId: string;
  decision: ItemDecision;
  substituteId: string | null;
  suggestedName: string | null;
};

interface AbsenceModeWizardProps {
  visible: boolean;
  professionalId: string;
  establishmentId: string;
  appointments: Array<CalendarAppointment & { serviceId: string }>;
  team: Array<{ id: string; name: string }>;
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
  establishmentId,
  appointments,
  team,
  loading = false,
  onClose,
  onConfirm,
}: AbsenceModeWizardProps) => {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [items, setItems] = useState<WizardItem[]>([]);
  const [report, setReport] = useState<AbsenceBatchReport | null>(null);
  const [preparing, setPreparing] = useState(false);

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

    let cancelled = false;
    const prepare = async () => {
      setPreparing(true);
      const colleagues = team.filter((member) => member.id !== professionalId);
      const next: WizardItem[] = [];
      for (const appointment of affected) {
        let substituteId: string | null = null;
        let suggestedName: string | null = null;
        for (const colleague of colleagues) {
          const { data: serviceRow } = await supabase
            .from('professional_services')
            .select('is_active')
            .eq('establishment_id', establishmentId)
            .eq('professional_id', colleague.id)
            .eq('service_id', appointment.serviceId)
            .maybeSingle();
          if (serviceRow && serviceRow.is_active === false) continue;

          const { data: slots } = await supabase.rpc('get_available_slots', {
            target_establishment_id: establishmentId,
            target_professional_id: colleague.id,
            target_service_id: appointment.serviceId,
            target_local_date: appointment.startsAt.toISOString().slice(0, 10),
            target_appointment_id: appointment.id,
          });
          const match = Array.isArray(slots)
            ? slots.find((slot: { starts_at: string; available: boolean }) =>
              new Date(slot.starts_at).getTime() === appointment.startsAt.getTime() && slot.available)
            : null;
          if (match) {
            substituteId = colleague.id;
            suggestedName = colleague.name;
            break;
          }
        }
        next.push({
          appointment,
          serviceId: appointment.serviceId,
          decision: substituteId ? 'transfer' : 'cancel',
          substituteId,
          suggestedName,
        });
      }
      if (!cancelled) {
        setItems(next);
        setPreparing(false);
      }
    };
    void prepare();
    return () => { cancelled = true; };
  }, [affected, establishmentId, professionalId, team, visible]);

  const submit = async () => {
    const transfers: AbsenceTransferAction[] = items.map((item) => {
      if (item.decision === 'keep') return { appointment_id: item.appointment.id, action: 'keep' };
      if (item.decision === 'cancel' || !item.substituteId) {
        return {
          appointment_id: item.appointment.id,
          action: 'cancel',
          cancellation_note: 'Ausência do profissional',
        };
      }
      return {
        appointment_id: item.appointment.id,
        action: 'transfer',
        to_professional_id: item.substituteId,
        transfer_reason: 'absence_mode',
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
            {step === 1 ? 'Período da ausência' : step === 2 ? 'Redistribuir atendimentos' : 'Relatório'}
          </Text>

          {step === 1 ? (
            <View style={styles.block}>
              <Text style={styles.description}>
                Padrão: a partir de agora até o fim do dia. Os atendimentos ativos no período serão listados para transferência ou cancelamento. Ao confirmar, um bloqueio de ausência será criado.
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
              {preparing ? (
                <Text style={styles.description}>Calculando melhores substitutos...</Text>
              ) : (
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
                        {item.suggestedName ? ` · sugestão: ${item.suggestedName}` : ' · sem substituto no horário'}
                      </Text>
                      <View style={styles.decisionRow}>
                        {(['transfer', 'cancel', 'keep'] as ItemDecision[]).map((decision) => (
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
                              {decision === 'transfer' ? 'Transferir' : decision === 'cancel' ? 'Cancelar' : 'Manter'}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      {item.decision === 'transfer' ? (
                        <View style={styles.decisionRow}>
                          {team.filter((member) => member.id !== professionalId).map((member) => (
                            <Pressable
                              key={member.id}
                              onPress={() => setItems((current) => current.map((entry) =>
                                entry.appointment.id === item.appointment.id
                                  ? { ...entry, substituteId: member.id, suggestedName: member.name }
                                  : entry))}
                              style={[styles.chip, item.substituteId === member.id && styles.chipSelected]}
                              testID={`absence-sub-${item.appointment.id}-${member.id}`}
                            >
                              <Text style={styles.chipText}>{member.name}</Text>
                            </Pressable>
                          ))}
                        </View>
                      ) : null}
                    </View>
                  ))}
                </ScrollView>
              )}
              <View style={styles.actions}>
                <AppButton label="Voltar" onPress={() => setStep(1)} testID="absence-mode-back" variant="secondary" />
                <AppButton
                  label="Confirmar ausência"
                  loading={loading || preparing}
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
