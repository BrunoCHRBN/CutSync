import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { CalendarAppointment } from './operational-calendar';
import { supabase } from '../../services/supabase';

export type TransferCandidateStatus = 'available' | 'conflict' | 'outside_hours' | 'service_disabled';

export type TransferCandidate = {
  id: string;
  name: string;
  status: TransferCandidateStatus;
};

interface TransferProfessionalModalProps {
  visible: boolean;
  appointment: CalendarAppointment | null;
  serviceId?: string | null;
  establishmentId?: string | null;
  candidates: Array<{ id: string; name: string }>;
  loading?: boolean;
  onClose: () => void;
  onTransferSameSlot: (professionalId: string) => void;
  onPickOtherSlot: (professionalId: string) => void;
}

const statusLabel: Record<TransferCandidateStatus, string> = {
  available: 'Disponível',
  conflict: 'Conflito',
  outside_hours: 'Fora da jornada',
  service_disabled: 'Serviço não habilitado',
};

export const TransferProfessionalModal = ({
  visible,
  appointment,
  serviceId,
  establishmentId,
  candidates,
  loading = false,
  onClose,
  onTransferSameSlot,
  onPickOtherSlot,
}: TransferProfessionalModalProps) => {
  const [rows, setRows] = useState<TransferCandidate[]>([]);
  const [checking, setChecking] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const eligible = useMemo(
    () => candidates.filter((item) => item.id !== appointment?.professionalId),
    [appointment?.professionalId, candidates],
  );

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!visible || !appointment || !establishmentId || !serviceId) {
        setRows([]);
        return;
      }
      setChecking(true);
      setSelectedId(null);
      const next: TransferCandidate[] = [];
      for (const candidate of eligible) {
        const { data: serviceRows } = await supabase
          .from('professional_services')
          .select('is_active')
          .eq('establishment_id', establishmentId)
          .eq('professional_id', candidate.id)
          .eq('service_id', serviceId)
          .maybeSingle();

        if (serviceRows && serviceRows.is_active === false) {
          next.push({ id: candidate.id, name: candidate.name, status: 'service_disabled' });
          continue;
        }

        const { data: slots, error } = await supabase.rpc('get_available_slots', {
          target_establishment_id: establishmentId,
          target_professional_id: candidate.id,
          target_service_id: serviceId,
          target_local_date: appointment.startsAt.toISOString().slice(0, 10),
          target_appointment_id: appointment.id,
        });

        if (error || !Array.isArray(slots)) {
          next.push({ id: candidate.id, name: candidate.name, status: 'outside_hours' });
          continue;
        }

        const match = slots.find((slot: { starts_at: string; available: boolean; unavailable_reason?: string | null }) =>
          new Date(slot.starts_at).getTime() === appointment.startsAt.getTime());

        if (!match) {
          next.push({ id: candidate.id, name: candidate.name, status: 'outside_hours' });
        } else if (match.available) {
          next.push({ id: candidate.id, name: candidate.name, status: 'available' });
        } else {
          next.push({
            id: candidate.id,
            name: candidate.name,
            status: match.unavailable_reason === 'busy' ? 'conflict' : 'outside_hours',
          });
        }
      }
      if (!cancelled) {
        setRows(next);
        const firstAvailable = next.find((item) => item.status === 'available');
        setSelectedId(firstAvailable?.id || next[0]?.id || null);
        setChecking(false);
      }
    };
    void run();
    return () => { cancelled = true; };
  }, [appointment, eligible, establishmentId, serviceId, visible]);

  const selected = rows.find((item) => item.id === selectedId) || null;

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose} transparent visible={visible}>
      <Pressable accessibilityLabel="Fechar transferência" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={styles.sheet}
          testID="transfer-professional-modal"
        >
          <Text style={styles.eyebrow}>TRANSFERIR PROFISSIONAL</Text>
          <Text style={styles.title}>{appointment?.clientName || 'Atendimento'}</Text>
          <Text style={styles.description}>
            Escolha um colega para o mesmo horário. Em caso de conflito, você pode escolher outro horário na agenda dele.
          </Text>
          {checking ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={colors.brandPrimary} />
              <Text style={styles.description}>Consultando disponibilidade da equipe...</Text>
            </View>
          ) : (
            <ScrollView style={styles.list}>
              {rows.length === 0 ? (
                <Text style={styles.description}>Nenhum colega disponível neste estabelecimento.</Text>
              ) : rows.map((row) => {
                const active = selectedId === row.id;
                return (
                  <Pressable
                    key={row.id}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    onPress={() => setSelectedId(row.id)}
                    style={[styles.row, active && styles.rowSelected]}
                    testID={`transfer-candidate-${row.id}`}
                  >
                    <View style={styles.rowCopy}>
                      <Text style={styles.rowTitle}>{row.name}</Text>
                      <Text style={styles.rowStatus}>{statusLabel[row.status]}</Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
          <View style={styles.actions}>
            <AppButton disabled={loading} label="Voltar" onPress={onClose} testID="transfer-professional-close" variant="secondary" />
            {selected?.status === 'available' ? (
              <AppButton
                label="Transferir no mesmo horário"
                loading={loading}
                onPress={() => selectedId && onTransferSameSlot(selectedId)}
                testID="transfer-professional-confirm"
              />
            ) : (
              <AppButton
                disabled={!selectedId || selected?.status === 'service_disabled'}
                label="Escolher outro horário"
                loading={loading}
                onPress={() => selectedId && onPickOtherSlot(selectedId)}
                testID="transfer-professional-other-slot"
                variant="secondary"
              />
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(24,32,27,0.34)', flex: 1, justifyContent: 'center', padding: spacing.md },
  sheet: { alignSelf: 'center', backgroundColor: colors.surface, borderRadius: radii.xl, gap: spacing.sm, maxHeight: '88%', maxWidth: 520, padding: spacing.xl, width: '100%', ...elevations.overlay },
  eyebrow: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1.2 },
  title: { ...typeScale.cardTitle, color: colors.textPrimary },
  description: { ...typeScale.small, color: colors.textSecondary },
  loadingBox: { alignItems: 'center', gap: spacing.sm, minHeight: 120, justifyContent: 'center' },
  list: { maxHeight: 320 },
  row: { borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, marginBottom: spacing.sm, padding: spacing.md },
  rowSelected: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandPrimary },
  rowCopy: { gap: 2 },
  rowTitle: { ...typeScale.bodyStrong, color: colors.textPrimary },
  rowStatus: { ...typeScale.small, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', marginTop: spacing.sm },
});
