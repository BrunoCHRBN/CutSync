import type { BusinessAppointmentAction } from '@cutsync/database';
import { encodeOpaqueAppointmentIdPathSegment } from '@cutsync/domain';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';

import {
  BusinessButton,
  BusinessCard,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import {
  formatAgendaTime,
  getAgendaStatusLabel,
} from '@/features/agenda/business-agenda';
import { useBusinessAppointment } from '@/features/appointments/use-business-appointment';
import { normalizeBusinessAppointmentRouteId } from '@/features/links/business-deep-links';
import { businessTheme } from '@/theme/business-theme';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

const actionLabels: Record<BusinessAppointmentAction, string> = {
  confirm: 'Confirmar atendimento',
  complete: 'Concluir atendimento',
  cancel: 'Cancelar atendimento',
  reschedule: 'Reagendar',
  no_show: 'Marcar não comparecimento',
};

const eventLabels: Record<string, string> = {
  created: 'Atendimento criado',
  confirmed: 'Atendimento confirmado',
  completed: 'Atendimento concluído',
  cancelled: 'Atendimento cancelado',
  rescheduled: 'Atendimento reagendado',
  no_show: 'Não comparecimento registrado',
};

const errorMessage = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : 'Não foi possível concluir a operação.';

export function BusinessAppointmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const appointmentId = normalizeBusinessAppointmentRouteId(id) ?? '';
  const appointmentPathSegment = encodeOpaqueAppointmentIdPathSegment(appointmentId) ?? '';
  const { activeContext } = useBusinessOperational();
  const appointment = useBusinessAppointment(appointmentId);
  const [notice, setNotice] = useState<string | null>(null);
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';

  const execute = async (action: Exclude<BusinessAppointmentAction, 'reschedule'>) => {
    setNotice(null);
    try {
      await appointment.runCommand(action);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setNotice('Atendimento atualizado com segurança.');
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setNotice(errorMessage(error));
    }
  };

  const confirmAction = (action: Exclude<BusinessAppointmentAction, 'reschedule'>) => {
    if (action !== 'cancel' && action !== 'no_show') {
      void execute(action);
      return;
    }
    Alert.alert(
      action === 'cancel' ? 'Cancelar atendimento?' : 'Registrar não comparecimento?',
      'O backend validará novamente sua permissão e o estado atual.',
      [
        { text: 'Voltar', style: 'cancel' },
        {
          text: action === 'cancel' ? 'Cancelar atendimento' : 'Registrar',
          style: 'destructive',
          onPress: () => void execute(action),
        },
      ],
    );
  };

  return (
    <BusinessPage testID="business-appointment-detail-screen">
      <BusinessHeader
        eyebrow="ATENDIMENTO"
        title={appointment.appointment?.clientDisplayName ?? 'Detalhe protegido'}
        description={activeContext?.establishmentName}
      />
      <BusinessButton label="Voltar" variant="ghost" onPress={() => router.back()} />

      {appointment.isLoading ? (
        <View style={styles.centerState}>
          <ActivityIndicator color={businessTheme.colors.accent} />
          <Text style={styles.muted}>Validando acesso e carregando atendimento…</Text>
        </View>
      ) : appointment.error || !appointment.appointment ? (
        <>
          <BusinessNotice tone="danger" message={errorMessage(appointment.error)} />
          <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void appointment.refresh()} />
        </>
      ) : (
        <>
          <BusinessCard>
            <View style={styles.rowBetween}>
              <View style={styles.copy}>
                <Text selectable style={styles.title}>{appointment.appointment.serviceName}</Text>
                <Text selectable style={styles.muted}>{appointment.appointment.professionalName}</Text>
              </View>
              <BusinessPill label={getAgendaStatusLabel(appointment.appointment.status)} />
            </View>
            <Text selectable style={styles.schedule}>
              {formatAgendaTime(appointment.appointment.startsAt, timeZone)}–{formatAgendaTime(appointment.appointment.endsAt, timeZone)}
            </Text>
            <Text selectable style={styles.muted}>
              Preço de tabela: {currency.format(appointment.appointment.serviceListPrice)}
            </Text>
          </BusinessCard>

          {(appointment.appointment.clientPhone || appointment.appointment.clientEmail) ? (
            <View style={styles.section}>
              <BusinessSectionTitle>Contato autorizado</BusinessSectionTitle>
              <BusinessCard>
                {appointment.appointment.clientPhone ? <Text selectable style={styles.body}>{appointment.appointment.clientPhone}</Text> : null}
                {appointment.appointment.clientEmail ? <Text selectable style={styles.body}>{appointment.appointment.clientEmail}</Text> : null}
              </BusinessCard>
            </View>
          ) : null}

          {appointment.appointment.notes ? (
            <View style={styles.section}>
              <BusinessSectionTitle>Observações autorizadas</BusinessSectionTitle>
              <BusinessCard><Text selectable style={styles.body}>{appointment.appointment.notes}</Text></BusinessCard>
            </View>
          ) : null}

          {notice ? (
            <BusinessNotice
              tone={notice.startsWith('Atendimento atualizado') ? 'success' : 'danger'}
              message={notice}
            />
          ) : null}

          {appointment.appointment.allowedActions.length > 0 ? (
            <View style={styles.section}>
              <BusinessSectionTitle>Ações permitidas agora</BusinessSectionTitle>
              {appointment.appointment.allowedActions.map((action) => (
                <BusinessButton
                  key={action}
                  label={actionLabels[action]}
                  loading={appointment.commandPending}
                  disabled={appointment.commandPending || activeContext?.accessMode !== 'full'}
                  variant={action === 'cancel' || action === 'no_show' ? 'danger' : action === 'reschedule' ? 'secondary' : 'primary'}
                  onPress={() => {
                    if (action === 'reschedule') {
                      router.push(`/(app)/appointments/${appointmentPathSegment}/reschedule` as never);
                    } else {
                      confirmAction(action);
                    }
                  }}
                />
              ))}
            </View>
          ) : (
            <BusinessNotice message="Nenhuma ação está disponível no estado atual." />
          )}

          <View style={styles.section}>
            <BusinessSectionTitle>Histórico operacional</BusinessSectionTitle>
            {appointment.appointment.history.length === 0 ? (
              <BusinessNotice message="Nenhum evento operacional adicional." />
            ) : appointment.appointment.history.map((event) => (
              <BusinessCard key={event.id} style={styles.eventCard}>
                <Text selectable style={styles.body}>{eventLabels[event.eventType] ?? 'Atendimento atualizado'}</Text>
                <Text selectable style={styles.muted}>{new Date(event.createdAt).toLocaleString('pt-BR', { timeZone })}</Text>
              </BusinessCard>
            ))}
          </View>
        </>
      )}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  centerState: { gap: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.xl },
  section: { gap: businessTheme.spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: businessTheme.spacing.md },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  body: { ...businessTheme.typography.body, color: businessTheme.colors.text },
  muted: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  schedule: { color: businessTheme.colors.accentStrong, fontSize: 22, fontWeight: '900' },
  eventCard: { paddingVertical: businessTheme.spacing.sm },
});
