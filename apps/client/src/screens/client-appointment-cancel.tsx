import { sharedBrand } from '@cutsync/brand';
import {
  clientCancellationReasons,
  formatClientAppointmentDateTime,
  getClientAppointmentBlockMessage,
  type ClientCancellationReason,
} from '@cutsync/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppointmentStateCard, appointmentColors } from '@/components/appointments/client-appointment-ui';
import { useSession } from '@/contexts/session-context';
import { cancelClientAppointment } from '@/features/appointments/client-appointments-service';
import { useClientAppointment } from '@/features/appointments/use-client-appointments';

export function ClientAppointmentCancelScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const appointmentId = Array.isArray(params.id) ? params.id[0] : params.id;
  const router = useRouter();
  const { user } = useSession();
  const query = useClientAppointment(appointmentId ?? null, user?.id ?? null);
  const [reason, setReason] = useState<ClientCancellationReason | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const submit = async () => {
    if (!appointmentId || !reason || !query.appointment?.canCancel) return;
    setIsSubmitting(true);
    setActionError(null);
    try {
      await cancelClientAppointment(appointmentId, reason);
      router.replace({ pathname: '/appointments/[id]', params: { id: appointmentId } });
    } catch (error) {
      setActionError(error instanceof Error ? error.message : 'Não foi possível cancelar este atendimento.');
      setIsConfirming(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  if (query.isLoading && !query.appointment) {
    return (
      <View style={styles.centered}>
        <StatusBar style="dark" />
        <ActivityIndicator color={sharedBrand.colors.forest} />
      </View>
    );
  }

  const appointment = query.appointment;
  if (query.error || !appointment) {
    return (
      <View style={styles.centered}>
        <AppointmentStateCard
          title="Cancelamento indisponível"
          description={query.error || 'Este atendimento não foi encontrado na sua conta.'}
        />
      </View>
    );
  }

  const formatted = formatClientAppointmentDateTime(appointment.startsAt, appointment.establishment.timezone);
  const blockMessage = getClientAppointmentBlockMessage(
    appointment.cancelBlockReason,
    appointment.establishment.minCancellationHours,
  );

  return (
    <ScrollView
      testID="client-appointment-cancel-screen"
      contentInsetAdjustmentBehavior="automatic"
      contentContainerStyle={styles.content}
      style={styles.page}
    >
      <StatusBar style="dark" />
      <Text style={styles.eyebrow}>CANCELAR ATENDIMENTO</Text>
      <Text style={styles.title}>{isConfirming ? 'Confirme o cancelamento.' : 'O que aconteceu?'}</Text>
      <Text style={styles.description}>
        {appointment.establishment.name}, {formatted.dateLabel}, às {formatted.timeLabel}.
      </Text>

      {!appointment.canCancel ? (
        <AppointmentStateCard
          title="Ação bloqueada"
          description={blockMessage || 'Este atendimento não pode ser cancelado pelo aplicativo.'}
        />
      ) : isConfirming && reason ? (
        <View testID="client-appointment-cancel-confirmation" style={styles.confirmCard}>
          <Text style={styles.confirmTitle}>Esta ação não pode ser desfeita.</Text>
          <Text style={styles.confirmText}>Motivo selecionado: {reason}</Text>
          {!!actionError && <Text testID="client-appointment-cancel-error" style={styles.errorText}>{actionError}</Text>}
          <Pressable
            testID="client-appointment-cancel-submit"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => { void submit(); }}
            style={({ pressed }) => [styles.dangerButton, isSubmitting && styles.disabled, pressed && styles.pressed]}
          >
            {isSubmitting ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.dangerButtonText}>Sim, cancelar atendimento</Text>}
          </Pressable>
          <Pressable
            testID="client-appointment-cancel-keep"
            accessibilityRole="button"
            disabled={isSubmitting}
            onPress={() => setIsConfirming(false)}
            style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryButtonText}>Não, manter horário</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <View accessibilityRole="radiogroup" style={styles.reasonList}>
            {clientCancellationReasons.map((item) => {
              const selected = reason === item;
              return (
                <Pressable
                  key={item}
                  testID={`client-appointment-cancel-reason-${item}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  onPress={() => { setReason(item); setActionError(null); }}
                  style={({ pressed }) => [styles.reasonButton, selected && styles.reasonSelected, pressed && styles.pressed]}
                >
                  <View style={[styles.radio, selected && styles.radioSelected]} />
                  <Text style={[styles.reasonText, selected && styles.reasonTextSelected]}>{item}</Text>
                </Pressable>
              );
            })}
          </View>
          <Pressable
            testID="client-appointment-cancel-continue"
            accessibilityRole="button"
            accessibilityState={{ disabled: !reason }}
            disabled={!reason}
            onPress={() => setIsConfirming(true)}
            style={({ pressed }) => [styles.dangerButton, !reason && styles.disabled, pressed && styles.pressed]}
          >
            <Text style={styles.dangerButtonText}>Continuar</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: appointmentColors.background },
  content: { width: '100%', maxWidth: 580, alignSelf: 'center', paddingHorizontal: 20, paddingTop: 22, paddingBottom: 42, gap: 17 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: appointmentColors.background, padding: 20 },
  eyebrow: { color: appointmentColors.cancelled, fontSize: 10, fontWeight: '800', letterSpacing: 1.35 },
  title: { color: appointmentColors.text, fontSize: 30, lineHeight: 35, fontWeight: '700', letterSpacing: -0.7 },
  description: { color: appointmentColors.secondary, fontSize: 14, lineHeight: 21 },
  reasonList: { gap: 9 },
  reasonButton: { minHeight: 54, flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderColor: appointmentColors.border, borderRadius: 17, borderCurve: 'continuous', backgroundColor: '#FFFFFF', paddingHorizontal: 16 },
  reasonSelected: { borderColor: appointmentColors.cancelled, backgroundColor: appointmentColors.cancelledSoft },
  radio: { width: 18, height: 18, borderWidth: 2, borderColor: '#9A9D98', borderRadius: 9 },
  radioSelected: { borderWidth: 5, borderColor: appointmentColors.cancelled },
  reasonText: { flex: 1, color: appointmentColors.text, fontSize: 14, fontWeight: '600' },
  reasonTextSelected: { color: appointmentColors.cancelled },
  confirmCard: { gap: 14, borderWidth: 1, borderColor: '#EDC8C3', borderRadius: 22, borderCurve: 'continuous', backgroundColor: appointmentColors.cancelledSoft, padding: 18 },
  confirmTitle: { color: appointmentColors.cancelled, fontSize: 17, fontWeight: '800' },
  confirmText: { color: '#744740', fontSize: 13, lineHeight: 19 },
  errorText: { color: appointmentColors.cancelled, fontSize: 12, lineHeight: 18, fontWeight: '700' },
  dangerButton: { minHeight: 51, alignItems: 'center', justifyContent: 'center', borderRadius: 16, borderCurve: 'continuous', backgroundColor: appointmentColors.cancelled, paddingHorizontal: 18 },
  dangerButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  secondaryButton: { minHeight: 49, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: appointmentColors.border, borderRadius: 16, borderCurve: 'continuous', backgroundColor: '#FFFFFF', paddingHorizontal: 18 },
  secondaryButtonText: { color: appointmentColors.text, fontSize: 14, fontWeight: '700' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.72 },
});
