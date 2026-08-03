import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../../theme/tokens';
import { AppButton } from '../../ui/AppButton';
import { AppointmentRecord } from '@cutsync/database';

interface NextAppointmentStripProps {
  appointment: AppointmentRecord | null;
  loading?: boolean;
  onConfirm?: () => void;
  onDetails?: () => void;
}

export const NextAppointmentStrip = ({
  appointment,
  loading = false,
  onConfirm,
  onDetails,
}: NextAppointmentStripProps) => {
  if (loading) {
    return (
      <View style={styles.strip} testID="next-appointment-strip-loading">
        <Text style={styles.muted}>Carregando próximo atendimento...</Text>
      </View>
    );
  }

  if (!appointment) {
    return (
      <View style={styles.strip} testID="next-appointment-strip-empty">
        <Text style={styles.muted}>Nenhum próximo atendimento na fila.</Text>
      </View>
    );
  }

  const time = appointment.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const client = appointment.client?.name || appointment.clientName || 'Cliente';
  const service = appointment.service?.name || 'Serviço';

  return (
    <View style={styles.strip} testID="next-appointment-strip">
      <View style={styles.copy}>
        <Text style={styles.label}>PRÓXIMO</Text>
        <Text style={styles.title} numberOfLines={1}>
          {time} · {client} · {service}
        </Text>
      </View>
      <View style={styles.actions}>
        {appointment.status === 'pending' && onConfirm ? (
          <AppButton label="Confirmar" onPress={onConfirm} testID="next-appointment-confirm" />
        ) : null}
        {onDetails ? (
          <AppButton label="Detalhes" onPress={onDetails} testID="next-appointment-details" variant="secondary" />
        ) : null}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  strip: {
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
    borderWidth: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    justifyContent: 'space-between',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    ...elevations.panel,
  },
  copy: { flex: 1, gap: 2, minWidth: 180 },
  label: { ...typeScale.label, color: colors.brandPrimary, letterSpacing: 1.1 },
  title: { ...typeScale.bodyStrong, color: colors.textPrimary },
  muted: { ...typeScale.small, color: colors.textSecondary },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
});
