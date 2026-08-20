import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, elevations, radii, spacing, typeScale } from '../../../theme/tokens';
import { AppButton } from '../../ui/AppButton';
import { AppointmentRecord } from '@cutsync/database';

interface NextAppointmentStripProps {
  appointments: AppointmentRecord[];
  loading?: boolean;
  onConfirm?: (appointment: AppointmentRecord) => void;
  onDetails?: (appointment: AppointmentRecord) => void;
}

export const NextAppointmentStrip = ({
  appointments,
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

  if (!appointments.length) {
    return (
      <View style={styles.strip} testID="next-appointment-strip-empty">
        <Text style={styles.muted}>Nenhum próximo atendimento na fila.</Text>
      </View>
    );
  }

  return (
    <View style={styles.group} testID="next-appointment-strip">
      <Text style={styles.groupLabel}>PRÓXIMOS ATENDIMENTOS</Text>
      {appointments.slice(0, 2).map((appointment, index) => {
        const time = appointment.dateTime.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
        const client = appointment.client?.name || appointment.clientName || 'Cliente';
        const service = appointment.service?.name || 'Serviço';
        return (
          <View key={appointment.id} style={styles.strip} testID={`next-appointment-${index + 1}`}>
            <View style={styles.copy}>
              <Text style={styles.label}>{index === 0 ? 'AGORA' : 'DEPOIS'}</Text>
              <Text style={styles.title} numberOfLines={1}>
                {time} · {client} · {service}
              </Text>
            </View>
            <View style={styles.actions}>
              {appointment.allowedActions?.includes('confirm') && onConfirm ? (
                <AppButton
                  label="Confirmar"
                  onPress={() => onConfirm(appointment)}
                  testID={`next-appointment-${index + 1}-confirm`}
                />
              ) : null}
              {onDetails ? (
                <AppButton
                  label="Detalhes"
                  onPress={() => onDetails(appointment)}
                  testID={`next-appointment-${index + 1}-details`}
                  variant="secondary"
                />
              ) : null}
            </View>
          </View>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  group: { gap: spacing.xs, marginBottom: spacing.md },
  groupLabel: { ...typeScale.label, color: colors.textSecondary, letterSpacing: 1.1 },
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
