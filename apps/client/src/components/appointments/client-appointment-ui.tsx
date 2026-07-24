import {
  clientAppointmentStatusLabels,
  formatClientAppointmentDateTime,
} from '@cutsync/domain';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';

import type { ClientAppointment } from '@/features/appointments/client-appointments-service';
import { performClientHaptic } from '@/features/experience/client-haptics';
import { clientTheme } from '@/theme/client-theme';

export const appointmentColors = {
  background: clientTheme.colors.canvas,
  card: clientTheme.colors.surface,
  text: clientTheme.colors.ink,
  secondary: clientTheme.colors.inkSoft,
  muted: clientTheme.colors.inkMuted,
  border: clientTheme.colors.border,
  accent: clientTheme.colors.forest,
  accentSoft: clientTheme.colors.forestSoft,
  pending: '#8A6419',
  pendingSoft: '#F7EBD1',
  confirmed: '#315E99',
  confirmedSoft: '#E9F0FA',
  completed: '#2E6A41',
  completedSoft: '#E4F0E7',
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
      <View style={[styles.statusDot, { backgroundColor: tones.text }]} />
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
    <Animated.View
      entering={FadeInUp.duration(clientTheme.motion.standard)}
      style={styles.animatedCard}
    >
      <Pressable
        testID={'client-appointment-card-' + appointment.id}
        accessibilityRole="button"
        accessibilityLabel={`Abrir atendimento em ${appointment.establishment.name}`}
        onPress={() => {
          void performClientHaptic('selection');
          onPress();
        }}
        style={({ pressed }) => [styles.card, featured && styles.featuredCard, pressed && styles.pressed]}
      >
        <View style={[styles.dateBlock, featured && styles.dateBlockFeatured]}>
          <Text style={[styles.month, featured && styles.monthFeatured]}>{month}</Text>
          <Text style={[styles.day, featured && styles.dayFeatured]}>{day}</Text>
          <Text style={[styles.time, featured && styles.timeFeatured]}>{formatted.timeLabel}</Text>
        </View>
        <View style={styles.cardCopy}>
          <View style={styles.cardTopline}>
            <Text numberOfLines={1} style={styles.establishmentName}>{appointment.establishment.name}</Text>
            <AppointmentStatusBadge appointment={appointment} />
          </View>
          <Text numberOfLines={1} style={styles.serviceName}>{appointment.service.name}</Text>
          <Text numberOfLines={1} style={styles.professionalName}>com {appointment.professional.name}</Text>
          <Text numberOfLines={1} style={styles.dateLabel}>{formatted.dateLabel}</Text>
          {appointment.rescheduleCount > 0 && (
            <Text style={styles.rescheduleLabel}>Reagendado {appointment.rescheduleCount}x</Text>
          )}
        </View>
        <Text accessibilityElementsHidden style={styles.chevron}>›</Text>
      </Pressable>
    </Animated.View>
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
    <Animated.View
      entering={FadeIn.duration(clientTheme.motion.standard)}
      style={styles.stateCard}
    >
      <View style={styles.stateCopy}>
        <Text style={styles.stateTitle}>{title}</Text>
        <Text selectable style={styles.stateDescription}>{description}</Text>
      </View>
      {action}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  statusBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 999 },
  statusText: { fontSize: 9, lineHeight: 12, fontWeight: '900', letterSpacing: 0.5 },
  animatedCard: { width: '100%' },
  card: {
    minHeight: 156,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 14,
    borderWidth: 1,
    borderColor: appointmentColors.border,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: appointmentColors.card,
    padding: 16,
    boxShadow: clientTheme.shadows.card,
  },
  featuredCard: { borderColor: 'transparent', backgroundColor: appointmentColors.accent },
  pressed: { opacity: clientTheme.opacity.pressed, transform: [{ scale: 0.994 }] },
  dateBlock: { width: 62, alignItems: 'center', justifyContent: 'center', gap: 2, borderRightWidth: 1, borderRightColor: appointmentColors.border, paddingRight: 14 },
  dateBlockFeatured: { borderRightColor: 'rgba(255, 255, 255, 0.2)' },
  month: { color: appointmentColors.muted, fontSize: 10, fontWeight: '900', letterSpacing: 1.1 },
  monthFeatured: { color: 'rgba(255, 255, 255, 0.75)' },
  day: { color: appointmentColors.text, fontSize: 30, lineHeight: 34, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dayFeatured: { color: '#FFFFFF' },
  time: { color: appointmentColors.accent, fontSize: 13, fontWeight: '800', fontVariant: ['tabular-nums'] },
  timeFeatured: { color: '#FFFFFF' },
  cardCopy: { flex: 1, justifyContent: 'center', gap: 5 },
  cardTopline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  establishmentName: { flex: 1, color: appointmentColors.text, fontSize: 16, fontWeight: '700', letterSpacing: -0.2 },
  serviceName: { color: appointmentColors.text, fontSize: 13, fontWeight: '700' },
  professionalName: { color: appointmentColors.secondary, fontSize: 12 },
  dateLabel: { color: appointmentColors.muted, fontSize: 11, textTransform: 'capitalize' },
  rescheduleLabel: { alignSelf: 'flex-start', color: appointmentColors.confirmed, fontSize: 9, fontWeight: '800', backgroundColor: appointmentColors.confirmedSoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 4 },
  chevron: { alignSelf: 'center', color: appointmentColors.muted, fontSize: 28, fontWeight: '300' },
  detailRow: { gap: 5, paddingVertical: 14 },
  detailRowBorder: { borderBottomWidth: 1, borderBottomColor: appointmentColors.border },
  detailLabel: { color: appointmentColors.muted, fontSize: 9, fontWeight: '900', letterSpacing: 1.15, textTransform: 'uppercase' },
  detailValue: { color: appointmentColors.text, fontSize: 15, lineHeight: 21, fontWeight: '600' },
  stateCard: { alignItems: 'center', gap: 18, borderRadius: 26, borderCurve: 'continuous', backgroundColor: appointmentColors.card, padding: 28, boxShadow: clientTheme.shadows.card },
  stateCopy: { alignItems: 'center', gap: 8 },
  stateTitle: { color: appointmentColors.text, fontSize: 18, fontWeight: '700', textAlign: 'center', letterSpacing: -0.3 },
  stateDescription: { color: appointmentColors.secondary, fontSize: 13, lineHeight: 20, textAlign: 'center' },
});
