import type {
  AppointmentServiceOrderContext,
  BusinessAppointmentDetail,
  ServiceOrderDetail,
} from '@cutsync/database';
import {
  AWAITING_PAYMENT_NOTICE,
  createMobileRequestId,
  formatMoneyCents,
  getServiceOrderStatusLabel,
} from '@cutsync/domain';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import {
  BusinessButton,
  BusinessHeader,
  BusinessNotice,
  BusinessPage,
  BusinessPill,
  BusinessSectionTitle,
} from '@/components/ui/business-ui';
import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import {
  getBusinessOrderActionLabel,
  resolveBusinessAppointmentOrderAction,
} from '@/features/service-orders/appointment-order-actions';
import {
  formatAgendaTime,
  getAgendaStatusLabel,
} from '@/features/agenda/business-agenda';
import { BusinessApiError, businessApi } from '@/services/business-api';
import { businessTheme } from '@/theme/business-theme';

type MutationKind = 'open_order' | 'start_order' | 'finish_order';

const formatCents = (cents: number) => formatMoneyCents(cents, 'BRL');

export function AppointmentOperationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ appointmentId?: string }>();
  const appointmentId = typeof params.appointmentId === 'string' ? params.appointmentId : '';
  const { activeContext } = useBusinessOperational();
  const { user } = useBusinessSession();
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';

  const [appointment, setAppointment] = useState<BusinessAppointmentDetail | null>(null);
  const [orderContext, setOrderContext] = useState<AppointmentServiceOrderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const mutationKindRef = useRef<MutationKind | null>(null);
  const inFlightRef = useRef(false);

  const financialOpsEnabled = Boolean(activeContext?.financialOpsEnabled);
  const serviceOrder: ServiceOrderDetail | null = orderContext?.serviceOrder ?? null;

  const load = useCallback(async () => {
    if (!activeContext || !appointmentId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const detailPromise = businessApi.getAppointmentDetail(
        activeContext.establishmentId,
        appointmentId,
      );
      const orderPromise = financialOpsEnabled
        ? businessApi.getServiceOrderForAppointment(
          activeContext.establishmentId,
          appointmentId,
        )
        : Promise.resolve(null);
      const [detail, order] = await Promise.all([detailPromise, orderPromise]);
      setAppointment(detail);
      setOrderContext(order);
    } catch (loadError) {
      const message = loadError instanceof BusinessApiError
        ? loadError.message
        : 'Não foi possível carregar o atendimento.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeContext, appointmentId, financialOpsEnabled]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  const primaryAction = resolveBusinessAppointmentOrderAction({
    context: activeContext,
    appointmentStatus: appointment?.status,
    serviceOrderStatus: serviceOrder?.status,
    appointmentProfessionalId: appointment?.professionalId,
    actorUserId: user?.id,
  });
  const actionLabel = getBusinessOrderActionLabel(primaryAction);

  const runMutation = async () => {
    if (!activeContext || !appointment || !actionLabel || inFlightRef.current) return;
    if (primaryAction === 'none') return;

    if (
      !requestIdRef.current
      || mutationKindRef.current !== primaryAction
    ) {
      requestIdRef.current = createMobileRequestId();
      mutationKindRef.current = primaryAction as MutationKind;
    }

    inFlightRef.current = true;
    setMutating(true);
    setError(null);
    setNotice(null);

    try {
      if (primaryAction === 'open_order') {
        try {
          await businessApi.openServiceOrder({
            establishmentId: activeContext.establishmentId,
            appointmentId: appointment.id,
            requestId: requestIdRef.current,
          });
        } catch (openError) {
          if (
            openError instanceof BusinessApiError
            && openError.code === 'service_order_already_exists'
          ) {
            setNotice(openError.message);
          } else {
            throw openError;
          }
        }
      } else if (primaryAction === 'start_order' && serviceOrder) {
        await businessApi.startServiceOrder({
          establishmentId: activeContext.establishmentId,
          serviceOrderId: serviceOrder.id,
          expectedVersion: serviceOrder.version,
          requestId: requestIdRef.current,
        });
      } else if (primaryAction === 'finish_order' && serviceOrder) {
        await businessApi.finishServiceOrder({
          establishmentId: activeContext.establishmentId,
          serviceOrderId: serviceOrder.id,
          expectedVersion: serviceOrder.version,
          requestId: requestIdRef.current,
        });
      }

      requestIdRef.current = null;
      mutationKindRef.current = null;
      await load();
    } catch (mutationError) {
      if (mutationError instanceof BusinessApiError) {
        if (
          mutationError.code === 'service_order_version_conflict'
          || mutationError.code === 'service_order_invalid_transition'
        ) {
          await load();
        }
        setError(mutationError.message);
      } else {
        setError('Não foi possível atualizar a comanda.');
      }
    } finally {
      inFlightRef.current = false;
      setMutating(false);
    }
  };

  return (
    <BusinessPage testID="business-appointment-operation-screen">
      <BusinessHeader
        eyebrow="ATENDIMENTO"
        title={appointment?.clientDisplayName ?? 'Detalhe'}
        description={activeContext?.establishmentName}
        trailing={(
          <BusinessButton
            label="Voltar"
            variant="ghost"
            onPress={() => router.back()}
            testID="business-appointment-back"
          />
        )}
      />

      {activeContext?.accessMode === 'read_only' ? (
        <BusinessNotice
          tone="warning"
          message="Modo somente leitura. Consulta liberada; mutações de comanda estão bloqueadas."
          testID="business-appointment-read-only"
        />
      ) : null}

      {loading ? (
        <ActivityIndicator color={businessTheme.colors.accent} />
      ) : error && !appointment ? (
        <>
          <BusinessNotice tone="danger" message={error} />
          <BusinessButton label="Tentar novamente" variant="secondary" onPress={() => void load()} />
        </>
      ) : appointment ? (
        <>
          <View style={styles.section}>
            <BusinessSectionTitle>Agendamento</BusinessSectionTitle>
            <View style={styles.detailBlock}>
              <Text selectable style={styles.label}>Cliente</Text>
              <Text selectable style={styles.value}>{appointment.clientDisplayName}</Text>
              <Text selectable style={styles.label}>Serviço</Text>
              <Text selectable style={styles.value}>{appointment.serviceName}</Text>
              <Text selectable style={styles.label}>Profissional</Text>
              <Text selectable style={styles.value}>{appointment.professionalName}</Text>
              <Text selectable style={styles.label}>Horário</Text>
              <Text selectable style={styles.value}>
                {new Intl.DateTimeFormat('pt-BR', {
                  timeZone,
                  weekday: 'long',
                  day: '2-digit',
                  month: 'long',
                }).format(new Date(appointment.startsAt))}
                {' · '}
                {formatAgendaTime(appointment.startsAt, timeZone)}
                {' – '}
                {formatAgendaTime(appointment.endsAt, timeZone)}
              </Text>
              <Text selectable style={styles.label}>Status</Text>
              <BusinessPill label={getAgendaStatusLabel(appointment.status)} tone="neutral" />
              {appointment.notes ? (
                <>
                  <Text selectable style={styles.label}>Observações</Text>
                  <Text selectable style={styles.value}>{appointment.notes}</Text>
                </>
              ) : null}
            </View>
          </View>

          {financialOpsEnabled ? (
            <View style={styles.section} testID="business-service-order-section">
              <BusinessSectionTitle>Comanda</BusinessSectionTitle>
              {!serviceOrder ? (
                <BusinessNotice
                  testID="business-service-order-empty"
                  message="Comanda ainda não aberta"
                />
              ) : (
                <View style={styles.detailBlock}>
                  <BusinessPill
                    testID="business-service-order-status"
                    label={getServiceOrderStatusLabel(serviceOrder.status)}
                    tone={serviceOrder.status === 'awaiting_payment' ? 'warning' : 'neutral'}
                  />
                  <Text selectable style={styles.meta}>
                    Versão {serviceOrder.version}
                    {' · aberta em '}
                    {formatAgendaTime(serviceOrder.openedAt, timeZone)}
                  </Text>
                  {serviceOrder.items.map((item) => (
                    <View key={item.id} style={styles.itemRow} testID="business-service-order-item">
                      <Text selectable style={styles.value}>
                        {item.quantity}× {item.descriptionSnapshot}
                      </Text>
                      <Text selectable style={styles.meta}>
                        {formatCents(item.unitPriceCents)}
                        {item.discountCents > 0 ? ` · desc. ${formatCents(item.discountCents)}` : ''}
                        {' · '}
                        {formatCents(item.totalCents)}
                      </Text>
                    </View>
                  ))}
                  <Text selectable style={styles.totals}>
                    Subtotal {formatCents(serviceOrder.subtotalCents)}
                  </Text>
                  <Text selectable style={styles.totals}>
                    Desconto {formatCents(serviceOrder.discountCents)}
                  </Text>
                  <Text selectable style={styles.totalStrong}>
                    Total {formatCents(serviceOrder.totalCents)}
                  </Text>
                  {serviceOrder.status === 'awaiting_payment' ? (
                    <BusinessNotice
                      testID="business-awaiting-payment-notice"
                      tone="warning"
                      message={AWAITING_PAYMENT_NOTICE}
                    />
                  ) : null}
                </View>
              )}
            </View>
          ) : null}

          {notice ? <BusinessNotice tone="warning" message={notice} /> : null}
          {error ? <BusinessNotice tone="danger" message={error} /> : null}

          {actionLabel ? (
            <BusinessButton
              testID="business-order-primary-action"
              label={actionLabel}
              loading={mutating}
              onPress={() => void runMutation()}
            />
          ) : null}
        </>
      ) : null}
    </BusinessPage>
  );
}

const styles = StyleSheet.create({
  section: { gap: businessTheme.spacing.sm },
  detailBlock: {
    gap: 6,
    padding: businessTheme.spacing.md,
    borderRadius: businessTheme.radii.md,
    backgroundColor: businessTheme.colors.surfaceMuted,
  },
  label: {
    color: businessTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  value: {
    color: businessTheme.colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  meta: {
    color: businessTheme.colors.textSoft,
    fontSize: 12,
  },
  itemRow: {
    gap: 2,
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: businessTheme.colors.border,
  },
  totals: {
    color: businessTheme.colors.textSoft,
    fontSize: 13,
    fontWeight: '600',
  },
  totalStrong: {
    color: businessTheme.colors.text,
    fontSize: 16,
    fontWeight: '900',
  },
});
