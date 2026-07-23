import { sharedBrand } from '@cutsync/brand';
import {
  clientAppointmentStatusLabels,
  formatClientAppointmentDateTime,
} from '@cutsync/domain';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { ClientAppointment } from '@/features/appointments/client-appointments-service';

export const appointmentColors = {
  background: '#F4F1E8',
  card: '#FFFFFF',
  text: sharedBrand.colors.forestDark,
  secondary: '#667068',
  muted: '#827C70',
  border: '#E4DED0',
  pending: '#8A6419',
  pendingSoft: '#F6ECD0',
  confirmed: '#315E99',
  confirmedSoft: '#E9F0FA',
  completed: '#2E6A41',
  completedSoft: '#E5F1E8',
  cancelled: '#99463D',
  cancelledSoft: '#F8E8E5',
};

export function AppointmentStatusBadge({ appointment }: { appointment: ClientAppointment }) {
  const tones = {
    pending: { background: appointmentColors.pendingSoft, text: appointmentColors.pending },
    confirmed: { background: appointmentColors.confirmedSoft, text: appointmentColors.confirmed },
    completed: { background: appointmentColors.completedSoft, text: appointmentColors.completed },
    cancelled: { background: appointmentColors.cancelledSoft, text: appointmentColors.cancelled },
  }[appointment.status];

  return (
    <View style={[styles.statusBadge, { backgroundColor: tones.background }]}>
      <Text style={[styles.statusText, { color: tones.text }]}>{clientAppointmentStatusLabels[appointment.status]}</Text>
    </View>
  );
}

export function ClientAppointmentCard({ appointment, onPress, featured = false }: {
  appointment: ClientAppointment;
  onPress: () => void;
  featured?: boolean;
}) {
  const formatted = formatClientAppointmentDateTime(appointment.startsAt, appointment.establishment.timezone);
  const month = new Intl.DateTimeFormat('pt-BR', {
    month: 'short',
    timeZone: appointment.establishment.timezone,
  }).format(new Date(appointment.startsAt)).replace('.', '').toUpperCase();
  const day = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    timeZone: appointment.establishment.timezone,
  }).format(new Date(appointment.startsAt));

  return (
    <Pressable
      testID={'client-appointment-card-' + appointment.id}
      accessibilityRole="button"
      accessibilityLabel={`Abrir atendimento em ${appointment.establishment.name}`}
      onPress={onPress}
      style={({ pressed }) => [styles.card, featured && styles.featuredCard, pressed && styles.pressed]}
    >
      <View style={styles.dateBlock}>
        <Text style={styles.month}>{month}</Text>
        <Text style={styles.day}>{day}</Text>
        <Text style={styles.time}>{formatted.timeLabel}</Text>
      </View>
      <View style={styles.cardCopy}>
        <View style={styles.cardTopline}>
          <Text numberOfLines={1} style={styles.establishmentName}>{appointment.establishment.name}</Text>
          <AppointmentStatusBadge appointment={appointment} />
        </View>
        <Text numberOfLines={1} style={styles.serviceName}>{appointment.service.name}</Text>
        <Text numberOfLines={1} style={styles.professionalName}>{appointment.professional.name}</Text>
        <Text numberOfLines={1} style={styles.dateLabel}>{formatted.dateLabel}</Text>
        {appointment.rescheduleCount > 0 && (
          <Text style={styles.rescheduleLabel}>Reagendado {appointment.rescheduleCount}x</Text>
        )}
      </View>
      <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
    </Pressable>
  );
}

export function AppointmentDetailRow({ label, value, last = false }: {
  label: string;
  value: string;
  last?: boolean;
}) {
  return (
    <View style={[styles.detailRow, !last && styles.detailRowBorder]}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text selectable style={styles.detailValue}>{value}</Text>
    </View>
  );
}

export function AppointmentStateCard({ title, description, action }: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.stateCard}>
      <View style={styles.stateCopy}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text selectable style={styles.stateDescription}>{description}</Text>
      </View>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  statusBadge: { borderRadius: 999, paddingHorizontal: 9, paddingVertical: 6 },
  statusText: { fontSize: 9, lineHeight: 12, fontWeight: '800', letterSpacing: 0.35 },
  card: {
    minHeight: 154,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    borderWidth: 1,
    borderColor: appointmentColors.border,
    borderRadius: 24,
    borderCurve: 'continuous',
    backgroundColor: appointmentColors.card,
    padding: 16,
    boxShadow: '0 8px 24px rgba(44, 67, 52, 0.06)',
  },
  featuredCard: { borderColor: '#CFC4A6' },
  pressed: { opacity: 0.68, transform: [{ scale: 0.995 }] },
  dateBlock: { width: 52, alignItems: 'center', justifyContent: 'center', gap: 2, borderRightWidth: 1, borderRightColor: appointmentColors.border, paddingRight: 14 },
  month: { color: appointmentColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1 },
  day: { color: appointmentColors.text, fontSize: 28, lineHeight: 32, fontWeight: '700', fontVariant: ['tabular-nums'] },
  time: { color: sharedBrand.colors.forest, fontSize: 12, fontWeight: '700', fontVariant: ['tabular-nums'] },
  cardCopy: { flex: 1, justifyContent: 'center', gap: 5 },
  cardTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  establishmentName: { flex: 1, color: appointmentColors.text, fontSize: 16, fontWeight: '700' },
  serviceName: { color: '#47544B', fontSize: 13, fontWeight: '600' },
  professionalName: { color: appointmentColors.secondary, fontSize: 12 },
  dateLabel: { color: appointmentColors.muted, fontSize: 10, textTransform: 'capitalize' },
  rescheduleLabel: { alignSelf: 'flex-start', color: appointmentColors.confirmed, fontSize: 9, fontWeight: '700', backgroundColor: appointmentColors.confirmedSoft, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 4 },
  chevron: { alignSelf: 'center', color: '#918A7B', fontSize: 28, fontWeight: '300' },
  detailRow: { gap: 5, paddingVertical: 14 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: appointmentColors.border },
  detailLabel: { color: appointmentColors.muted, fontSize: 9, fontWeight: '800', letterSpacing: 1.15, textTransform: 'uppercase' },
  detailValue: { color: appointmentColors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  stateCard: { alignItems: 'center', gap: 18, borderRadius: 24, borderCurve: 'continuous', backgroundColor: appointmentColors.card, padding: 26 },
  stateCopy: { alignItems: 'center', gap: 7 },
  stateTitle: { color: appointmentColors.text, fontSize: 17, fontWeight: '700', textAlign: 'center' },
  stateDescription: { color: appointmentColors.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
