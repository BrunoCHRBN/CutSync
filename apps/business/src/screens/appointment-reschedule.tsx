import {
  createMobileRequestId,
  encodeOpaqueAppointmentIdPathSegment,
} from '@cutsync/domain';
import { useMutation } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { localDateTimeToIso } from '@/features/agenda/business-agenda';
import { businessAppointmentsApi } from '@/features/appointments/business-appointments-api';
import { useBusinessAppointment } from '@/features/appointments/use-business-appointment';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import {
  businessQueryClient,
  createBusinessQueryKey,
} from '@/features/connectivity/business-query';
import { normalizeBusinessAppointmentRouteId } from '@/features/links/business-deep-links';
import { businessTheme } from '@/theme/business-theme';

const messageFor = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível reagendar este atendimento.';

export function BusinessAppointmentRescheduleScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const appointmentId = normalizeBusinessAppointmentRouteId(id) ?? '';
  const appointmentPathSegment = encodeOpaqueAppointmentIdPathSegment(appointmentId) ?? '';
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const appointment = useBusinessAppointment(appointmentId);
  const [localDate, setLocalDate] = useState('');
  const [localTime, setLocalTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef<string | null>(null);

  const mutation = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext || !appointment.appointment) throw new BusinessFeatureError('invalid_request');
      const startsAt = localDateTimeToIso(localDate, localTime, activeContext.timezone);
      if (!startsAt) throw new BusinessFeatureError('invalid_request');
      requestId.current ??= createMobileRequestId();
      return businessAppointmentsApi.reschedule({
        establishmentId: activeContext.establishmentId,
        appointmentId,
        startsAt,
        professionalId: appointment.appointment.professionalId,
        serviceId: appointment.appointment.serviceId,
        requestId: requestId.current,
      });
    },
    onSuccess: async () => {
      if (user && activeContext) {
        await Promise.all([
          businessQueryClient.invalidateQueries({
            queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'appointments', appointmentId),
          }),
          businessQueryClient.invalidateQueries({
            queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda'),
          }),
        ]);
      }
      requestId.current = null;
      router.replace(`/(app)/appointments/${appointmentPathSegment}` as never);
    },
    onError: (mutationError) => setError(messageFor(mutationError)),
  });

  return (
    <BusinessPage testID="business-appointment-reschedule-screen">
      <BusinessHeader
        eyebrow="REAGENDAMENTO"
        title="Novo horário"
        description="A disponibilidade e sua permissão serão validadas novamente pelo servidor."
      />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />
      <BusinessCard style={styles.form}>
        <View style={styles.field}>
          <Text style={styles.label}>Data local da unidade</Text>
          <TextInput
            testID="business-reschedule-date"
            accessibilityLabel="Data no formato ano mês dia"
            value={localDate}
            onChangeText={(value) => { setLocalDate(value); setError(null); requestId.current = null; }}
            placeholder="AAAA-MM-DD"
            placeholderTextColor={businessTheme.colors.textMuted}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>
        <View style={styles.field}>
          <Text style={styles.label}>Horário local</Text>
          <TextInput
            testID="business-reschedule-time"
            accessibilityLabel="Horário no formato horas e minutos"
            value={localTime}
            onChangeText={(value) => { setLocalTime(value); setError(null); requestId.current = null; }}
            placeholder="HH:mm"
            placeholderTextColor={businessTheme.colors.textMuted}
            keyboardType="numbers-and-punctuation"
            style={styles.input}
          />
        </View>
        <Text style={styles.hint}>Fuso: {activeContext?.timezone ?? 'não confirmado'}</Text>
      </BusinessCard>
      {error ? <BusinessNotice tone="danger" message={error} /> : null}
      <BusinessButton
        testID="business-reschedule-confirm"
        label={mutation.isError && requestId.current ? 'Tentar novamente com o mesmo comando' : 'Confirmar reagendamento'}
        loading={mutation.isPending}
        disabled={!appointment.appointment?.allowedActions.includes('reschedule') || activeContext?.accessMode !== 'full'}
        onPress={() => { setError(null); mutation.mutate(); }}
      />
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  form: { gap: businessTheme.spacing.md },
  field: { gap: businessTheme.spacing.xs },
  label: { ...businessTheme.typography.bodyStrong, color: businessTheme.colors.text },
  input: {
    minHeight: businessTheme.sizing.control,
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: businessTheme.radii.md,
    paddingHorizontal: businessTheme.spacing.md,
    backgroundColor: businessTheme.colors.canvasRaised,
    color: businessTheme.colors.text,
    fontSize: 16,
  },
  hint: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
});
