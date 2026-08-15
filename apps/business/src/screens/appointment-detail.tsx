import type { BusinessAppointmentAction } from '@cutsync/database';
import { encodeOpaqueAppointmentIdPathSegment, formatMoneyCents, getServiceOrderStatusLabel } from '@cutsync/domain';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppointmentContactActions } from '@/components/appointments/appointment-contact-actions';
import { AppointmentStatusStepper } from '@/components/appointments/appointment-status-stepper';
import { ServiceOrderCheckout } from '@/components/checkout/service-order-checkout';
import { BusinessButton, BusinessCard, BusinessHeader, BusinessNotice, BusinessPage, BusinessPill, BusinessSectionTitle } from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { formatAgendaTime, getAgendaStatusLabel } from '@/features/agenda/business-agenda';
import { useBusinessAppointment } from '@/features/appointments/use-business-appointment';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import { normalizeBusinessAppointmentRouteId } from '@/features/links/business-deep-links';
import { type AppointmentServiceOrderAction, useAppointmentServiceOrder } from '@/features/service-orders/use-appointment-service-order';
import { BusinessApiError } from '@/services/business-api';
import { businessTheme } from '@/theme/business-theme';

const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const actionLabels: Record<BusinessAppointmentAction, string> = {
  confirm: 'Confirmar atendimento',
  complete: 'Concluir atendimento',
  cancel: 'Cancelar atendimento',
  reschedule: 'Reagendar',
  no_show: 'Marcar ausência',
};
const eventLabels: Record<string, string> = {
  created: 'Atendimento criado', confirmed: 'Atendimento confirmado', completed: 'Atendimento concluído',
  cancelled: 'Atendimento cancelado', rescheduled: 'Atendimento reagendado', no_show: 'Ausência registrada',
};
const errorMessage = (error: unknown) => error instanceof BusinessFeatureError
  ? error.message
  : error instanceof BusinessApiError
    ? error.message
    : 'Não foi possível concluir a operação.';

export function BusinessAppointmentDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const appointmentId = normalizeBusinessAppointmentRouteId(id) ?? '';
  const pathId = encodeOpaqueAppointmentIdPathSegment(appointmentId) ?? '';
  const { activeContext } = useBusinessOperational();
  const appointment = useBusinessAppointment(appointmentId);
  const [notice, setNotice] = useState<string | null>(null);
  const [orderNotice, setOrderNotice] = useState<string | null>(null);
  const [orderReason, setOrderReason] = useState('');
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';
  const order = useAppointmentServiceOrder({
    appointmentId,
    appointmentStatus: appointment.appointment?.status,
    appointmentProfessionalId: appointment.appointment?.professionalId,
  });
  const actions = appointment.appointment?.allowedActions.filter(
    (action) => !(order.financialOpsEnabled && action === 'complete'),
  ) ?? [];

  const executeAppointment = async (action: Exclude<BusinessAppointmentAction, 'reschedule'>) => {
    setNotice(null);
    try {
      await appointment.runCommand(action);
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setNotice('Atendimento atualizado.');
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setNotice(errorMessage(error));
    }
  };
  const confirmAppointment = (action: Exclude<BusinessAppointmentAction, 'reschedule'>) => {
    if (action !== 'cancel' && action !== 'no_show') return void executeAppointment(action);
    Alert.alert(
      action === 'cancel' ? 'Cancelar atendimento?' : 'Registrar ausência?',
      'Confirme para atualizar o histórico deste atendimento.',
      [
        { text: 'Voltar', style: 'cancel' },
        { text: action === 'cancel' ? 'Cancelar' : 'Registrar', style: 'destructive', onPress: () => void executeAppointment(action) },
      ],
    );
  };
  const executeOrder = async (action: AppointmentServiceOrderAction) => {
    const needsReason = action === 'void_order' || action === 'reopen_order';
    if (needsReason && !orderReason.trim()) return setOrderNotice('Informe um motivo antes de continuar.');
    setOrderNotice(null);
    try {
      await order.runAction(action, needsReason ? orderReason : null);
      setOrderReason('');
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
      setOrderNotice('Comanda atualizada.');
    } catch (error) {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => undefined);
      setOrderNotice(errorMessage(error));
    }
  };
  const confirmOrder = (action: AppointmentServiceOrderAction) => {
    if (action !== 'void_order' && action !== 'reopen_order') return void executeOrder(action);
    Alert.alert(
      action === 'void_order' ? 'Anular comanda?' : 'Reabrir comanda?',
      'O motivo ficará registrado no histórico da comanda.',
      [
        { text: 'Voltar', style: 'cancel' },
        { text: action === 'void_order' ? 'Anular' : 'Reabrir', style: action === 'void_order' ? 'destructive' : 'default', onPress: () => void executeOrder(action) },
      ],
    );
  };

  return (
    <BusinessPage testID="business-appointment-detail-screen" contentStyle={styles.pageContent}>
      <BusinessHeader testID="business-appointment-detail-header" eyebrow={(activeContext?.establishmentName ?? 'ATENDIMENTO').toUpperCase()} title={appointment.appointment?.clientDisplayName ?? 'Detalhes do atendimento'} description={appointment.appointment?.serviceName ?? 'Carregando detalhes'} />
      <BusinessButton testID="business-appointment-close" label="Fechar" variant="ghost" onPress={() => router.back()} />

      {appointment.isLoading ? (
        <View testID="business-appointment-loading" style={styles.centerState}><ActivityIndicator color={businessTheme.colors.accent} /><Text style={styles.muted}>Carregando atendimento…</Text></View>
      ) : appointment.error || !appointment.appointment ? (
        <><BusinessNotice testID="business-appointment-error" tone="danger" message={errorMessage(appointment.error)} /><BusinessButton testID="business-appointment-retry" label="Tentar novamente" variant="secondary" onPress={() => void appointment.refresh()} /></>
      ) : (
        <>
          <BusinessCard testID="business-appointment-summary">
            <View style={styles.rowBetween}>
              <View style={styles.copy}><Text testID="business-appointment-service" selectable style={styles.title}>{appointment.appointment.serviceName}</Text><Text testID="business-appointment-professional" selectable style={styles.muted}>{appointment.appointment.professionalName}</Text></View>
              <BusinessPill testID="business-appointment-status" label={getAgendaStatusLabel(appointment.appointment.status)} />
            </View>
            <Text testID="business-appointment-time" selectable style={styles.schedule}>{formatAgendaTime(appointment.appointment.startsAt, timeZone)}–{formatAgendaTime(appointment.appointment.endsAt, timeZone)}</Text>
            <Text selectable style={styles.muted}>Preço de tabela: {currency.format(appointment.appointment.serviceListPrice)}</Text>
          </BusinessCard>

          <AppointmentStatusStepper appointmentStatus={appointment.appointment.status} orderStatus={order.serviceOrder?.status} />

          {order.financialOpsEnabled ? (
            <View testID="business-service-order-section" style={styles.section}>
              <BusinessSectionTitle testID="business-service-order-title">Comanda e checkout</BusinessSectionTitle>
              {order.isLoading ? <ActivityIndicator testID="business-service-order-loading" color={businessTheme.colors.accent} /> : order.error ? (
                <><BusinessNotice testID="business-service-order-error" tone="danger" message={errorMessage(order.error)} /><BusinessButton testID="business-service-order-retry" label="Recarregar comanda" variant="secondary" onPress={() => void order.refresh()} /></>
              ) : !order.serviceOrder ? <BusinessNotice testID="business-service-order-empty" message="A comanda será aberta no check-in." /> : (
                <BusinessCard testID="business-service-order-summary">
                  <BusinessPill testID="business-service-order-status" label={getServiceOrderStatusLabel(order.serviceOrder.status)} tone={order.serviceOrder.status === 'awaiting_payment' ? 'warning' : order.serviceOrder.status === 'closed' ? 'success' : 'neutral'} />
                  {order.serviceOrder.items.map((item) => <View key={item.id} testID={`business-service-order-item-${item.id}`} style={styles.orderItem}><Text selectable style={styles.body}>{item.quantity}× {item.descriptionSnapshot}</Text><Text selectable style={styles.muted}>{formatMoneyCents(item.totalCents, 'BRL')}</Text></View>)}
                  <Text testID="business-service-order-total" selectable style={styles.orderTotal}>Total {formatMoneyCents(order.serviceOrder.totalCents, 'BRL')}</Text>
                </BusinessCard>
              )}

              {order.serviceOrder ? <ServiceOrderCheckout serviceOrderId={order.serviceOrder.id} appointmentId={appointmentId} /> : null}
              {order.primaryAction !== 'none' && order.primaryActionLabel ? <BusinessButton testID="business-order-primary-action" label={order.primaryActionLabel} loading={order.isPending} disabled={order.isPending || activeContext?.accessMode !== 'full'} onPress={() => order.primaryAction !== 'none' && confirmOrder(order.primaryAction)} /> : null}
              {order.canVoid || order.canReopen ? (
                <><TextInput testID="business-order-reason" value={orderReason} onChangeText={setOrderReason} editable={!order.isPending} placeholder={order.canVoid ? 'Motivo da anulação' : 'Motivo da reabertura'} placeholderTextColor={businessTheme.colors.textMuted} style={styles.input} /><BusinessButton testID="business-order-secondary-action" label={order.canVoid ? 'Anular comanda' : 'Reabrir comanda'} variant={order.canVoid ? 'danger' : 'secondary'} loading={order.isPending} disabled={order.isPending || activeContext?.accessMode !== 'full'} onPress={() => confirmOrder(order.canVoid ? 'void_order' : 'reopen_order')} /></>
              ) : null}
              {orderNotice ? <BusinessNotice testID="business-order-notice" tone={orderNotice.startsWith('Comanda atualizada') ? 'success' : 'danger'} message={orderNotice} /> : null}
            </View>
          ) : null}

          <AppointmentContactActions clientName={appointment.appointment.clientDisplayName} phone={appointment.appointment.clientPhone} email={appointment.appointment.clientEmail} establishmentName={activeContext?.establishmentName ?? 'CutSync'} />
          {appointment.appointment.notes ? <View testID="business-appointment-notes" style={styles.section}><BusinessSectionTitle>Observações</BusinessSectionTitle><BusinessCard><Text selectable style={styles.body}>{appointment.appointment.notes}</Text></BusinessCard></View> : null}
          {notice ? <BusinessNotice testID="business-appointment-action-notice" tone={notice.startsWith('Atendimento atualizado') ? 'success' : 'danger'} message={notice} /> : null}

          {actions.length > 0 ? (
            <View style={styles.section}><BusinessSectionTitle testID="business-appointment-actions-title">Ações disponíveis</BusinessSectionTitle>{actions.map((action) => <BusinessButton key={action} testID={`business-appointment-action-${action}`} label={actionLabels[action]} loading={appointment.commandPending} disabled={appointment.commandPending || activeContext?.accessMode !== 'full'} variant={action === 'cancel' || action === 'no_show' ? 'danger' : action === 'reschedule' ? 'secondary' : 'primary'} onPress={() => action === 'reschedule' ? router.push(`/(app)/appointments/${pathId}/reschedule` as never) : confirmAppointment(action)} />)}</View>
          ) : <BusinessNotice testID="business-appointment-no-actions" message="Nenhuma ação está disponível no estado atual." />}

          <View testID="business-appointment-history" style={styles.section}>
            <BusinessSectionTitle testID="business-appointment-history-title">Histórico</BusinessSectionTitle>
            {appointment.appointment.history.length === 0 ? <BusinessNotice testID="business-appointment-history-empty" message="Nenhuma atualização adicional." /> : appointment.appointment.history.map((event) => <BusinessCard key={event.id} testID={`business-appointment-history-${event.id}`} style={styles.eventCard}><Text selectable style={styles.body}>{eventLabels[event.eventType] ?? 'Atendimento atualizado'}</Text><Text selectable style={styles.muted}>{new Date(event.createdAt).toLocaleString('pt-BR', { timeZone })}</Text></BusinessCard>)}
          </View>
        </>
      )}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  pageContent: { paddingBottom: businessTheme.spacing.xxl },
  centerState: { gap: businessTheme.spacing.md, paddingVertical: businessTheme.spacing.xl },
  section: { gap: businessTheme.spacing.sm },
  rowBetween: { flexDirection: 'row', alignItems: 'flex-start', gap: businessTheme.spacing.md },
  copy: { flex: 1, gap: businessTheme.spacing.xxs },
  title: { ...businessTheme.typography.heading, color: businessTheme.colors.text },
  body: { ...businessTheme.typography.body, color: businessTheme.colors.text },
  muted: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  schedule: { color: businessTheme.colors.accentStrong, fontSize: 22, fontWeight: '900' },
  eventCard: { paddingVertical: businessTheme.spacing.sm },
  orderItem: { gap: businessTheme.spacing.xxs, paddingVertical: businessTheme.spacing.xs, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: businessTheme.colors.border },
  orderTotal: { color: businessTheme.colors.text, fontSize: 17, fontWeight: '900' },
  input: { minHeight: 48, paddingHorizontal: businessTheme.spacing.md, borderWidth: 1, borderColor: businessTheme.colors.border, borderRadius: businessTheme.radii.md, color: businessTheme.colors.text, backgroundColor: businessTheme.colors.surface },
});