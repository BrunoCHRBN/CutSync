import React from 'react';
import { ActivityIndicator, StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { CalendarCheck2, CalendarClock, TriangleAlert } from 'lucide-react-native';
import { AppointmentRecord } from '@cutsync/database';
import { colors, radii, typography } from '../../theme/tokens';
import { AppCard } from '../ui/AppCard';
import { StatusBadge } from '../ui/StatusBadge';

interface NextAppointmentCardProps {
  appointment: AppointmentRecord | null;
  loading: boolean;
  error: string | null;
  accentColor?: string;
  testID?: string;
  title?: string;
  description?: string;
  showProfessional?: boolean;
  style?: StyleProp<ViewStyle>;
  testIDPrefix?: string;
  compact?: boolean;
}

const formatAppointmentDate = (date: Date) => {
  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const sameDay = (left: Date, right: Date) => left.toDateString() === right.toDateString();
  const dayLabel = sameDay(date, today)
    ? 'Hoje'
    : sameDay(date, tomorrow)
      ? 'Amanhã'
      : date.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
  return `${dayLabel}, ${date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
};

export const NextAppointmentCard = ({
  appointment,
  loading,
  error,
  accentColor = colors.brand,
  testID = 'next-appointment-card',
  title = 'Próximo atendimento',
  description = 'Seu próximo compromisso ativo',
  showProfessional = false,
  style,
  testIDPrefix = 'next-appointment',
  compact = false,
}: NextAppointmentCardProps) => {
  const status = appointment?.status === 'pending'
    ? { label: 'Pendente', tone: 'warning' as const }
    : { label: 'Confirmado', tone: 'info' as const };

  return (
    <AppCard testID={testID} style={[styles.card, compact && styles.cardCompact, style]} elevated>
      <View testID={`${testIDPrefix}-header`} style={styles.header}>
        <View testID={`${testIDPrefix}-heading`} style={styles.heading}>
          <View testID={`${testIDPrefix}-icon`} style={[styles.icon, { backgroundColor: `${accentColor}1A` }]}>
            <CalendarClock color={accentColor} size={19} />
          </View>
          <View style={styles.headingCopy}>
            <Text testID={`${testIDPrefix}-title`} style={styles.title}>{title}</Text>
            <Text testID={`${testIDPrefix}-description`} style={styles.description}>{description}</Text>
          </View>
        </View>
        {appointment && !loading && !error ? (
          <StatusBadge testID={`${testIDPrefix}-status`} label={status.label} tone={status.tone} />
        ) : null}
      </View>

      {loading ? (
        <View testID={`${testIDPrefix}-loading`} style={styles.stateRow}>
          <ActivityIndicator color={accentColor} />
          <Text testID={`${testIDPrefix}-loading-label`} style={styles.stateText}>Consultando a agenda...</Text>
        </View>
      ) : error ? (
        <View testID={`${testIDPrefix}-error`} style={[styles.stateRow, styles.errorState]}>
          <TriangleAlert color={colors.danger} size={20} />
          <View style={styles.stateCopy}>
            <Text testID={`${testIDPrefix}-error-title`} style={styles.errorTitle}>Agenda indisponível</Text>
            <Text testID={`${testIDPrefix}-error-message`} style={styles.errorText}>{error}</Text>
          </View>
        </View>
      ) : !appointment ? (
        <View testID={`${testIDPrefix}-free`} style={[styles.stateRow, styles.freeState]}>
          <CalendarCheck2 color={colors.success} size={21} />
          <View style={styles.stateCopy}>
            <Text testID={`${testIDPrefix}-free-title`} style={styles.freeTitle}>Agenda livre</Text>
            <Text testID={`${testIDPrefix}-free-message`} style={styles.stateText}>Nenhum atendimento futuro pendente ou confirmado.</Text>
          </View>
        </View>
      ) : (
        <View testID={`${testIDPrefix}-content`} style={[styles.content, compact && styles.contentCompact]}>
          <Text testID={`${testIDPrefix}-time`} style={[styles.time, compact && styles.timeCompact, { color: accentColor }]}>{formatAppointmentDate(appointment.dateTime)}</Text>
          <View testID={`${testIDPrefix}-details`} style={styles.details}>
            <Text testID={`${testIDPrefix}-client`} style={styles.client}>{appointment.client?.name || appointment.clientName || 'Cliente'}</Text>
            <Text testID={`${testIDPrefix}-service`} style={styles.meta}>{appointment.service?.name || 'Serviço indisponível'}</Text>
            {showProfessional ? <Text testID={`${testIDPrefix}-professional`} style={styles.professional}>{appointment.professional?.name || 'Profissional'}</Text> : null}
          </View>
        </View>
      )}
    </AppCard>
  );
};

const styles = StyleSheet.create({
  card: { padding: 22, borderRadius: radii.lg },
  cardCompact: { paddingVertical: 16, paddingHorizontal: 18 },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 },
  heading: { flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  icon: { width: 40, height: 40, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center' },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  description: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  content: { marginTop: 24, flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-end', justifyContent: 'space-between', gap: 18 },
  contentCompact: { marginTop: 12, alignItems: 'center' },
  time: { fontFamily: typography.display, fontSize: 28, letterSpacing: -1.1 },
  timeCompact: { fontSize: 22, letterSpacing: -0.7 },
  details: { minWidth: 180, flex: 1, alignItems: 'flex-end' },
  client: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 13, textAlign: 'right' },
  meta: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 11, marginTop: 4, textAlign: 'right' },
  professional: { color: colors.info, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 5, textAlign: 'right' },
  stateRow: { minHeight: 76, marginTop: 18, flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16, borderRadius: radii.md, backgroundColor: colors.canvasSoft },
  stateCopy: { flex: 1, minWidth: 0 },
  stateText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 11, lineHeight: 15 },
  errorState: { backgroundColor: colors.dangerSoft },
  errorTitle: { color: colors.danger, fontFamily: typography.bodyStrong, fontSize: 12 },
  errorText: { color: colors.danger, fontFamily: typography.body, fontSize: 11, marginTop: 3 },
  freeState: { backgroundColor: colors.successSoft },
  freeTitle: { color: colors.success, fontFamily: typography.bodyStrong, fontSize: 12 },
});
