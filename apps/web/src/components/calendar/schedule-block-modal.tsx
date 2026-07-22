import React, { useEffect, useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Check, X } from 'lucide-react-native';
import { colors, elevations, layout, radii, spacing, typeScale } from '../../theme/tokens';
import { AppButton } from '../ui/AppButton';
import { AppInput } from '../ui/AppInput';
import { InlineNotice } from '../ui/InlineNotice';
import { SegmentedControl } from '../ui/SegmentedControl';
import { CalendarResource, CalendarSlotSelection } from './operational-calendar';

export interface ScheduleBlockDraft {
  professionalIds: string[];
  startsAt: Date;
  endsAt: Date;
  kind: 'break' | 'time_off' | 'blocked';
  reason: string | null;
}

interface ScheduleBlockModalProps {
  selection: CalendarSlotSelection | null;
  professionals: CalendarResource[];
  allowMultiple?: boolean;
  loading?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (draft: ScheduleBlockDraft) => void;
}

const kindOptions = [
  { value: 'break', label: 'Pausa' },
  { value: 'time_off', label: 'Ausência' },
  { value: 'blocked', label: 'Bloqueado' },
] as const;

const formatClock = (date: Date) => date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

const withClock = (date: Date, clock: string) => {
  const [hour, minute] = clock.split(':').map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  const result = new Date(date);
  result.setHours(hour, minute, 0, 0);
  return result;
};

export const ScheduleBlockModal = ({
  selection,
  professionals,
  allowMultiple = false,
  loading = false,
  error,
  onClose,
  onSubmit,
}: ScheduleBlockModalProps) => {
  const { width } = useWindowDimensions();
  const desktop = width >= layout.desktopBreakpoint;
  const [professionalIds, setProfessionalIds] = useState<string[]>([]);
  const [startClock, setStartClock] = useState('');
  const [endClock, setEndClock] = useState('');
  const [kind, setKind] = useState<ScheduleBlockDraft['kind']>('blocked');
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (!selection) return;
    setProfessionalIds([selection.professionalId]);
    setStartClock(formatClock(selection.startsAt));
    setEndClock(formatClock(new Date(selection.startsAt.getTime() + 30 * 60_000)));
    setKind('blocked');
    setReason('');
  }, [selection]);

  const validation = useMemo(() => {
    if (!selection) return 'Selecione um horário.';
    if (!professionalIds.length) return 'Selecione pelo menos um profissional.';
    const startsAt = withClock(selection.startsAt, startClock);
    const endsAt = withClock(selection.startsAt, endClock);
    if (!startsAt || !endsAt) return 'Informe horários válidos no formato HH:mm.';
    if (startsAt <= new Date()) return 'O bloqueio precisa começar no futuro.';
    if (endsAt <= startsAt) return 'O término precisa ser posterior ao início.';
    if (reason.length > 160) return 'O motivo pode ter no máximo 160 caracteres.';
    return null;
  }, [endClock, professionalIds.length, reason.length, selection, startClock]);

  if (!selection) return null;

  const toggleProfessional = (id: string) => {
    if (!allowMultiple) {
      setProfessionalIds([id]);
      return;
    }
    setProfessionalIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const submit = () => {
    const startsAt = withClock(selection.startsAt, startClock);
    const endsAt = withClock(selection.startsAt, endClock);
    if (validation || !startsAt || !endsAt) return;
    onSubmit({ professionalIds, startsAt, endsAt, kind, reason: reason.trim() || null });
  };

  return (
    <Modal animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose} transparent visible>
      <Pressable accessibilityLabel="Fechar bloqueio" onPress={onClose} style={styles.backdrop}>
        <Pressable
          accessibilityViewIsModal
          onPress={(event) => event.stopPropagation()}
          style={[styles.modal, desktop && styles.desktopModal]}
          testID="schedule-block-modal"
        >
          <View style={styles.header}>
            <View style={styles.headerCopy}><Text style={styles.eyebrow}>AGENDA</Text><Text style={styles.title}>Bloquear horário</Text><Text style={styles.description}>O bloqueio remove este período da disponibilidade pública.</Text></View>
            <Pressable accessibilityLabel="Fechar" onPress={onClose} style={styles.close}><X color={colors.textPrimary} size={20} /></Pressable>
          </View>
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={styles.field}>
              <Text style={styles.label}>Profissionais</Text>
              <View style={styles.professionals}>
                {professionals.map((professional) => {
                  const selected = professionalIds.includes(professional.id);
                  return (
                    <Pressable
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      key={professional.id}
                      onPress={() => toggleProfessional(professional.id)}
                      style={[styles.professional, selected && styles.professionalSelected]}
                      testID={`schedule-block-professional-${professional.id}`}
                    >
                      <View style={[styles.check, selected && styles.checkSelected]}>{selected ? <Check color={colors.white} size={14} /> : null}</View>
                      <Text numberOfLines={1} style={styles.professionalName}>{professional.name}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
            <View style={styles.field}>
              <Text style={styles.label}>Tipo</Text>
              <SegmentedControl onChange={(value) => setKind(value as ScheduleBlockDraft['kind'])} options={[...kindOptions]} testID="schedule-block-kind" value={kind} />
            </View>
            <View style={styles.timeRow}>
              <AppInput containerStyle={styles.timeInput} label="Início" onChangeText={setStartClock} placeholder="09:00" testID="schedule-block-start" value={startClock} />
              <AppInput containerStyle={styles.timeInput} label="Término" onChangeText={setEndClock} placeholder="09:30" testID="schedule-block-end" value={endClock} />
            </View>
            <AppInput
              hint={`${reason.length}/160 caracteres`}
              label="Motivo (opcional)"
              maxLength={160}
              onChangeText={setReason}
              placeholder="Ex.: almoço, reunião ou compromisso"
              testID="schedule-block-reason"
              value={reason}
            />
            {error ? <InlineNotice message={error} testID="schedule-block-error" tone="danger" /> : null}
            {validation ? <InlineNotice message={validation} testID="schedule-block-validation" tone="warning" /> : null}
          </ScrollView>
          <View style={styles.actions}>
            <AppButton label="Cancelar" onPress={onClose} testID="schedule-block-cancel" variant="secondary" />
            <AppButton disabled={Boolean(validation)} label={professionalIds.length > 1 ? `Bloquear para ${professionalIds.length}` : 'Bloquear horário'} loading={loading} onPress={submit} testID="schedule-block-submit" />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { alignItems: 'center', backgroundColor: 'rgba(24,32,27,0.36)', flex: 1, justifyContent: 'center', padding: spacing.md },
  modal: { backgroundColor: colors.surface, borderRadius: radii.xl, maxHeight: '92%', maxWidth: 640, padding: spacing.xl, width: '100%', ...elevations.overlay },
  desktopModal: { maxHeight: 760 },
  header: { alignItems: 'flex-start', flexDirection: 'row', gap: spacing.md },
  headerCopy: { flex: 1, gap: spacing.xs },
  eyebrow: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1.2 },
  title: { ...typeScale.sectionTitle, color: colors.textPrimary },
  description: { ...typeScale.small, color: colors.textSecondary },
  close: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, height: 44, justifyContent: 'center', width: 44 },
  content: { gap: spacing.lg, paddingVertical: spacing.xl },
  field: { gap: spacing.sm },
  label: { ...typeScale.label, color: colors.textSecondary, textTransform: 'uppercase' },
  professionals: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  professional: { alignItems: 'center', borderColor: colors.borderSubtle, borderRadius: radii.md, borderWidth: 1, flexDirection: 'row', gap: spacing.sm, minHeight: 44, minWidth: 150, paddingHorizontal: spacing.md },
  professionalSelected: { backgroundColor: colors.brandSecondarySoft, borderColor: colors.brandPrimary },
  check: { alignItems: 'center', borderColor: colors.borderStrong, borderRadius: 5, borderWidth: 1, height: 20, justifyContent: 'center', width: 20 },
  checkSelected: { backgroundColor: colors.brandPrimary, borderColor: colors.brandPrimary },
  professionalName: { ...typeScale.small, color: colors.textPrimary, flexShrink: 1 },
  timeRow: { flexDirection: 'row', gap: spacing.md },
  timeInput: { flex: 1 },
  actions: { borderTopColor: colors.borderSubtle, borderTopWidth: 1, flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, justifyContent: 'flex-end', paddingTop: spacing.lg },
});
