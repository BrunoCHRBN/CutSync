import { sharedBrand } from '@cutsync/brand';
import { formatClientAppointmentDateTime } from '@cutsync/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  AppointmentDetailRow,
  AppointmentStateCard,
  AppointmentStatusBadge,
  appointmentColors,
} from '@/components/appointments/client-appointment-ui';
import { useSession } from '@/contexts/session-context';
import { useClientAppointment } from '@/features/appointments/use-client-appointments';

export function ClientAppointmentDetailScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const appointmentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useSession();
  const query = useClientAppointment(appointmentId ?? null, user?.id ?? null);

  if (query.isLoading && !query.appointment) {
    return (
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered} style={styles.page}>
        <StatusBar style="dark" />
        <ActivityIndicator color={sharedBrand.colors.forest} />
        <Text style={styles.loadingText}>Carregando atendimento…</Text>
      </ScrollView>
    );
  }

  if (query.error || !query.appointment) {
    return (
      <ScrollView testID="client-appointment-detail-error" contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.centered} style={styles.page}>
        <StatusBar style="dark" />
        <AppointmentStateCard
          title="Atendimento indisponível"
          description={query.error || 'Este atendimento não foi encontrado na sua conta.'}
          action={(
            <Pressable accessibilityRole="button" onPress={() => router.replace('/appointments')} style={styles.primaryButton}>
              <Text style={styles.primaryButtonText}>Voltar para a agenda</Text>
            </Pressable>
          )}
        />
      </ScrollView>
    );
  }

  const appointment = query.appointment;
  const formatted = formatClientAppointmentDateTime(appointment.startsAt, appointment.establishment.timezone);
  const original = appointment.originalStartsAt
    ? formatClientAppointmentDateTime(appointment.originalStartsAt, appointment.establishment.timezone)
    : null;

  return (
    <ScrollView
      testID="client-appointment-detail-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <View style={styles.hero}>
        <AppointmentStatusBadge appointment={appointment} />
        <Text style={styles.eyebrow}>DETALHES DO ATENDIMENTO</Text>
        <Text testID="client-appointment-detail-establishment" style={styles.title}>{appointment.establishment.name}</Text>
        <Text style={styles.description}>{appointment.service.name} com {appointment.professional.name}</Text>
      </View>

      <View style={styles.timeCard}>
        <Text style={styles.time}>{formatted.timeLabel}</Text>
        <Text style={styles.date}>{formatted.dateLabel}</Text>
        <Text style={styles.duration}>{appointment.durationMinutes} minutos</Text>
      </View>

      <View style={styles.detailCard}>
        <AppointmentDetailRow label="Serviço" value={appointment.service.name} />
        <AppointmentDetailRow label="Profissional" value={appointment.professional.name} />
        <AppointmentDetailRow label="Endereço" value={appointment.establishment.address || 'Endereço não informado'} />
        <AppointmentDetailRow label="Fuso do local" value={appointment.establishment.timezone} />
        <AppointmentDetailRow label="Protocolo" value={appointment.id} last />
      </View>

      {appointment.rescheduleCount > 0 && (
        <View testID="client-appointment-reschedule-history" style={styles.infoCard}>
          <Text style={styles.infoTitle}>Reagendado {appointment.rescheduleCount}x</Text>
          {original && <Text style={styles.infoText}>Horário original: {original.dateLabel}, {original.timeLabel}</Text>}
        </View>
      )}

      {appointment.status === 'cancelled' && appointment.cancellationReason && (
        <View testID="client-appointment-cancellation-reason" style={styles.cancelledCard}>
          <Text style={styles.cancelledTitle}>Motivo do cancelamento</Text>
          <Text selectable style={styles.cancelledText}>{appointment.cancellationReason}</Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: appointmentColors.background },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 24, paddingBottom: 52, gap: 18 },
  centered: { flexGrow: 1, width: '100%', maxWidth: 620, alignSelf: 'center', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20 },
  loadingText: { color: appointmentColors.secondary, fontSize: 13 },
  hero: { alignItems: 'flex-start', gap: 9, paddingTop: 8 },
  eyebrow: { color: sharedBrand.colors.forest, fontSize: 10, fontWeight: '800', letterSpacing: 1.35, paddingTop: 8 },
  title: { color: appointmentColors.text, fontSize: 32, lineHeight: 37, fontWeight: '700', letterSpacing: -0.9 },
  description: { color: appointmentColors.secondary, fontSize: 14, lineHeight: 21 },
  timeCard: { gap: 5, borderRadius: 25, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, padding: 22 },
  time: { color: '#FFFFFF', fontSize: 42, lineHeight: 47, fontWeight: '700', fontVariant: ['tabular-nums'] },
  date: { color: '#E9EEE9', fontSize: 15, lineHeight: 21, textTransform: 'capitalize' },
  duration: { color: '#C8D3CA', fontSize: 11, fontWeight: '700' },
  detailCard: { borderRadius: 24, borderCurve: 'continuous', backgroundColor: '#FFFFFF', paddingHorizontal: 18, paddingVertical: 4, boxShadow: '0 8px 24px rgba(44, 67, 52, 0.06)' },
  infoCard: { gap: 6, borderWidth: 1, borderColor: '#C9D6EA', borderRadius: 18, borderCurve: 'continuous', backgroundColor: appointmentColors.confirmedSoft, padding: 16 },
  infoTitle: { color: appointmentColors.confirmed, fontSize: 13, fontWeight: '800' },
  infoText: { color: '#526987', fontSize: 12, lineHeight: 18 },
  cancelledCard: { gap: 6, borderWidth: 1, borderColor: '#EDC8C3', borderRadius: 18, borderCurve: 'continuous', backgroundColor: appointmentColors.cancelledSoft, padding: 16 },
  cancelledTitle: { color: appointmentColors.cancelled, fontSize: 12, fontWeight: '800' },
  cancelledText: { color: '#744740', fontSize: 13, lineHeight: 19 },
  primaryButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderRadius: 15, borderCurve: 'continuous', backgroundColor: sharedBrand.colors.forest, paddingHorizontal: 20 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '700' },
});
