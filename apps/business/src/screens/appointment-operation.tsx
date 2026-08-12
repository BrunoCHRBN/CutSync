import type {
  AppointmentServiceOrderContext,
  BusinessAppointmentDetail,
  DecisionQueueItem,
  EstablishmentPaymentMethod,
  ServiceOrderPaymentSummary,
  ServiceOrderDetail,
} from '@cutsync/database';
import {
  AWAITING_PAYMENT_NOTICE,
  decimalAmountToCents,
  formatMoneyCents,
  getServiceOrderStatusLabel,
} from '@cutsync/domain';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, StyleSheet, Text, TextInput, View } from 'react-native';

import { createMobileRequestId } from '@/lib/mobile-request-id';

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
  canManageAppointmentOrder,
  resolveBusinessAppointmentOrderAction,
} from '@/features/service-orders/appointment-order-actions';
import {
  formatAgendaTime,
  getAgendaStatusLabel,
} from '@/features/agenda/business-agenda';
import {
  getAppointmentReassignmentAvailability,
  resolveReassignmentResponsibility,
} from '@/features/decisions/appointment-reassignment-request';
import { hasBusinessDecisionsNavigation } from '@/features/access/business-access';
import {
  enqueueBusinessReassignmentRequest,
  executeBusinessReassignmentRequest,
  markBusinessReassignmentRequest,
  removeBusinessReassignmentRequest,
  replayBusinessReassignmentRequest,
} from '@/features/decisions/business-reassignment-request-outbox';
import {
  classifyBusinessPosFailure,
  enqueueBusinessPosCommand,
  executeBusinessPosCommand,
  markBusinessPosCommand,
  removeBusinessPosCommand,
  replayBusinessPosCommand,
} from '@/features/payments/business-pos-outbox';
import { BusinessApiError, businessApi } from '@/services/business-api';
import { businessTheme } from '@/theme/business-theme';

type MutationKind = 'open_order' | 'start_order' | 'finish_order';

const formatCents = (cents: number) => formatMoneyCents(cents, 'BRL');

const paymentStatusLabel = (status: ServiceOrderPaymentSummary['paymentStatus']) => ({
  unpaid: 'Não pago',
  partially_paid: 'Parcialmente pago',
  paid: 'Pago',
  partially_refunded: 'Parcialmente estornado',
  refunded: 'Estornado',
}[status]);

export function AppointmentOperationScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ appointmentId?: string }>();
  const appointmentId = typeof params.appointmentId === 'string' ? params.appointmentId : '';
  const { activeContext, hasCapability } = useBusinessOperational();
  const { user } = useBusinessSession();
  const timeZone = activeContext?.timezone ?? 'America/Sao_Paulo';

  const [appointment, setAppointment] = useState<BusinessAppointmentDetail | null>(null);
  const [activeReassignment, setActiveReassignment] = useState<DecisionQueueItem | null>(null);
  const [orderContext, setOrderContext] = useState<AppointmentServiceOrderContext | null>(null);
  const [loading, setLoading] = useState(true);
  const [mutating, setMutating] = useState(false);
  const [reassignmentMutating, setReassignmentMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [paymentSummary, setPaymentSummary] = useState<ServiceOrderPaymentSummary | null>(null);
  const [paymentMethods, setPaymentMethods] = useState<EstablishmentPaymentMethod[]>([]);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [paymentMutating, setPaymentMutating] = useState(false);
  const [posCommandBlocked, setPosCommandBlocked] = useState(false);
  const [selectedPaymentMethodId, setSelectedPaymentMethodId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [voidTargetId, setVoidTargetId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const requestIdRef = useRef<string | null>(null);
  const mutationKindRef = useRef<MutationKind | null>(null);
  const inFlightRef = useRef(false);
  const paymentCommandRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const voidCommandRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const closeRequestIdRef = useRef<string | null>(null);

  const financialOpsEnabled = Boolean(activeContext?.financialOpsEnabled);
  const canViewDecisions = hasBusinessDecisionsNavigation(activeContext?.capabilities);
  const canViewPayments = hasCapability('view_payments');
  const canTakePayments = hasCapability('take_payments');
  const canVoidPayments = hasCapability('void_payments');
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
      const decisionsPromise = canViewDecisions
        ? businessApi.listDecisionQueue(activeContext.establishmentId).catch(() => [])
        : Promise.resolve([]);
      const [detail, order, decisions] = await Promise.all([
        detailPromise,
        orderPromise,
        decisionsPromise,
      ]);
      setAppointment(detail);
      setOrderContext(order);
      setActiveReassignment(
        decisions.find((decision) => decision.appointmentId === appointmentId) ?? null,
      );
      const nextServiceOrder = order?.serviceOrder ?? null;
      if (
        nextServiceOrder
        && canViewPayments
        && ['awaiting_payment', 'closed'].includes(nextServiceOrder.status)
      ) {
        try {
          const [summary, methodsModel] = await Promise.all([
            businessApi.getPaymentSummary(activeContext.establishmentId, nextServiceOrder.id),
            businessApi.listPaymentMethods(activeContext.establishmentId),
          ]);
          const activeMethods = methodsModel.methods.filter((method) => method.active);
          setPaymentSummary(summary);
          setPaymentMethods(activeMethods);
          setSelectedPaymentMethodId((current) => (
            activeMethods.some((method) => method.id === current)
              ? current
              : activeMethods[0]?.id ?? null
          ));
          setPaymentAmount((current) => current || (
            summary.balanceCents > 0
              ? (summary.balanceCents / 100).toFixed(2).replace('.', ',')
              : ''
          ));
          setPaymentError(null);
        } catch (summaryError) {
          setPaymentSummary(null);
          setPaymentMethods([]);
          setPaymentError(summaryError instanceof BusinessApiError
            ? summaryError.message
            : 'Não foi possível carregar os pagamentos desta comanda.');
        }
      } else {
        setPaymentSummary(null);
        setPaymentMethods([]);
        setPaymentError(null);
      }
    } catch (loadError) {
      const message = loadError instanceof BusinessApiError
        ? loadError.message
        : 'Não foi possível carregar o atendimento.';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [activeContext, appointmentId, canViewDecisions, canViewPayments, financialOpsEnabled]);

  useFocusEffect(useCallback(() => {
    void load();
  }, [load]));

  useEffect(() => {
    setPaymentSummary(null);
    setPaymentMethods([]);
    setSelectedPaymentMethodId(null);
    setPaymentAmount('');
    setPaymentReference('');
    setVoidTargetId(null);
    setVoidReason('');
    paymentCommandRef.current = null;
    voidCommandRef.current = null;
    closeRequestIdRef.current = null;
    setPosCommandBlocked(false);
  }, [appointmentId]);

  const primaryAction = resolveBusinessAppointmentOrderAction({
    context: activeContext,
    appointmentStatus: appointment?.status,
    serviceOrderStatus: serviceOrder?.status,
    appointmentProfessionalId: appointment?.professionalId,
    actorUserId: user?.id,
  });
  const actionLabel = getBusinessOrderActionLabel(primaryAction);
  const canManageOrder = canManageAppointmentOrder({
    context: activeContext,
    appointmentProfessionalId: appointment?.professionalId,
    actorUserId: user?.id,
  });
  const selectedPaymentMethod = paymentMethods.find(
    (method) => method.id === selectedPaymentMethodId,
  ) ?? null;
  const voidedOriginalEntryIds = new Set(paymentSummary?.entries
    .filter((entry) => entry.entryType === 'void' && entry.originalPaymentEntryId)
    .map((entry) => entry.originalPaymentEntryId as string) ?? []);
  const reassignmentResponsibility = activeContext
    ? resolveReassignmentResponsibility(activeContext.operationalRole)
    : null;
  const reassignmentAvailability = activeContext && appointment
    ? getAppointmentReassignmentAvailability({
      status: appointment.status,
      startsAt: appointment.startsAt,
      accessMode: activeContext.accessMode,
      hasCapability: hasCapability('request_appointment_reassignment'),
      responsibility: reassignmentResponsibility,
    })
    : null;

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

  const runReassignmentRequest = async (
    reasonCode: 'professional_absence' | 'operational_change',
  ) => {
    if (
      !activeContext
      || !appointment
      || !reassignmentResponsibility
      || !user
      || reassignmentMutating
    ) return;

    const dueAt = reassignmentAvailability?.dueAt ?? null;
    if (!dueAt) {
      setError('Este atendimento está próximo demais para iniciar uma reatribuição pelo aplicativo.');
      return;
    }

    const entry = await enqueueBusinessReassignmentRequest({
      userId: user.id,
      establishmentId: activeContext.establishmentId,
      appointmentId: appointment.id,
      reasonCode,
      responsibility: reassignmentResponsibility,
      dueAt,
      expectedAppointmentUpdatedAt: appointment.updatedAt,
      requestId: createMobileRequestId(),
      correlationId: createMobileRequestId(),
    });

    setReassignmentMutating(true);
    setError(null);
    setNotice(null);
    try {
      const receipt = await executeBusinessReassignmentRequest(entry);
      await removeBusinessReassignmentRequest(user.id, entry.requestId);
      router.push(`/(app)/decisions/${receipt.reassignmentRequestId}` as never);
    } catch (requestError) {
      const message = requestError instanceof Error
        ? requestError.message
        : 'Não foi possível criar a solicitação de reatribuição.';
      if (requestError instanceof BusinessApiError && requestError.code === 'network_error') {
        await markBusinessReassignmentRequest(
          user.id, entry.requestId, 'offline_pending', entry.attempts + 1, message,
        );
        setNotice('Solicitação salva neste aparelho. O mesmo protocolo será reenviado quando a conexão voltar.');
      } else if (requestError instanceof BusinessApiError && [
        'decision_conflict', 'decision_disabled', 'decision_invalid_transition',
        'decision_idempotency_conflict',
      ].includes(requestError.code)) {
        await removeBusinessReassignmentRequest(user.id, entry.requestId);
        await load();
        setError(requestError.message);
      } else {
        await markBusinessReassignmentRequest(
          user.id, entry.requestId, 'manual_review', entry.attempts + 1, message,
        );
        setError(message);
      }
    } finally {
      setReassignmentMutating(false);
    }
  };

  const replayPendingReassignmentRequest = useCallback(async () => {
    if (!user || !activeContext || !appointmentId) return;
    const result = await replayBusinessReassignmentRequest(
      user.id,
      activeContext.establishmentId,
      appointmentId,
    );
    if (result.confirmedReceipt) {
      router.push(`/(app)/decisions/${result.confirmedReceipt.reassignmentRequestId}` as never);
    } else if (result.status === 'offline_pending') {
      setNotice('Solicitação ainda pendente de conexão; o protocolo foi preservado.');
    } else if (result.status === 'conflict') {
      setError('O atendimento mudou no servidor. Recarregue os dados antes de solicitar novamente.');
      await load();
    } else if (result.status === 'manual_review') {
      setError('A solicitação pendente precisa de revisão manual.');
    }
  }, [activeContext, appointmentId, load, router, user]);

  useFocusEffect(useCallback(() => {
    void replayPendingReassignmentRequest();
  }, [replayPendingReassignmentRequest]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void replayPendingReassignmentRequest();
    });
    return () => subscription.remove();
  }, [replayPendingReassignmentRequest]);

  const replayPendingPosCommand = useCallback(async () => {
    if (!user || !activeContext || !serviceOrder) return;
    setPaymentMutating(true);
    try {
      const result = await replayBusinessPosCommand(
        user.id,
        activeContext.establishmentId,
        serviceOrder.id,
      );
      if (result.status === 'server_confirmed') {
        setPosCommandBlocked(false);
        setNotice('Operação financeira pendente confirmada pelo servidor.');
        await load();
      } else if (result.status === 'offline_pending') {
        setPosCommandBlocked(true);
        setNotice('Operação financeira salva neste aparelho e ainda pendente de conexão.');
      } else if (result.status === 'conflict') {
        setPosCommandBlocked(false);
        await load();
        setPaymentError('A comanda mudou no servidor. Os dados foram atualizados antes de uma nova ação.');
      } else if (result.status === 'manual_review') {
        setPosCommandBlocked(true);
        setPaymentError('A operação financeira pendente exige revisão manual. Nenhuma nova ação foi liberada.');
      } else {
        setPosCommandBlocked(false);
      }
    } finally {
      setPaymentMutating(false);
    }
  }, [activeContext, load, serviceOrder, user]);

  useFocusEffect(useCallback(() => {
    void replayPendingPosCommand();
  }, [replayPendingPosCommand]));

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void replayPendingPosCommand();
    });
    return () => subscription.remove();
  }, [replayPendingPosCommand]);

  const confirmReassignmentRequest = () => {
    Alert.alert(
      'Solicitar reatribuição',
      'A troca não será aplicada agora. A solicitação seguirá para validação e, quando necessário, decisão do cliente.',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Ausência do profissional',
          onPress: () => void runReassignmentRequest('professional_absence'),
        },
        {
          text: 'Imprevisto operacional',
          onPress: () => void runReassignmentRequest('operational_change'),
        },
      ],
    );
  };

  const updatePaymentAmount = (value: string) => {
    setPaymentAmount(value.replace(/[^0-9,.]/g, ''));
    paymentCommandRef.current = null;
  };

  const updatePaymentReference = (value: string) => {
    setPaymentReference(value);
    paymentCommandRef.current = null;
  };

  const recordPayment = async () => {
    if (
      !user || !activeContext || !serviceOrder || !paymentSummary
      || !selectedPaymentMethod || posCommandBlocked
    ) return;
    let amountCents: number;
    try {
      amountCents = decimalAmountToCents(paymentAmount);
    } catch {
      setPaymentError('Informe um valor válido em reais.');
      return;
    }
    if (amountCents <= 0 || amountCents > paymentSummary.balanceCents) {
      setPaymentError('Informe um valor positivo que não ultrapasse o saldo da comanda.');
      return;
    }
    if (selectedPaymentMethod.requiresReference && !paymentReference.trim()) {
      setPaymentError('Informe a referência desta operação.');
      return;
    }

    const fingerprint = [
      serviceOrder.id, selectedPaymentMethod.id, amountCents,
      paymentReference.trim(), paymentSummary.version,
    ].join(':');
    if (!paymentCommandRef.current || paymentCommandRef.current.fingerprint !== fingerprint) {
      paymentCommandRef.current = { fingerprint, requestId: createMobileRequestId() };
    }

    setPaymentMutating(true);
    setPaymentError(null);
    setNotice(null);
    let queuedRequestId: string | null = null;
    try {
      const entry = await enqueueBusinessPosCommand({
        kind: 'record_payment',
        userId: user.id,
        establishmentId: activeContext.establishmentId,
        serviceOrderId: serviceOrder.id,
        paymentMethodId: selectedPaymentMethod.id,
        amountCents,
        externalReference: paymentReference.trim() || null,
        expectedVersion: paymentSummary.version,
        requestId: paymentCommandRef.current.requestId,
      });
      queuedRequestId = entry.requestId;
      if (entry.requestId !== paymentCommandRef.current.requestId) {
        setPosCommandBlocked(true);
        setNotice('Já existe uma operação financeira pendente para esta comanda.');
        return;
      }
      await executeBusinessPosCommand(entry);
      await removeBusinessPosCommand(user.id, entry.requestId);
      paymentCommandRef.current = null;
      setPosCommandBlocked(false);
      setPaymentReference('');
      setPaymentAmount('');
      setNotice('Pagamento confirmado pelo servidor.');
      await load();
    } catch (paymentFailure) {
      const apiError = paymentFailure instanceof BusinessApiError ? paymentFailure : null;
      const status = classifyBusinessPosFailure(paymentFailure);
      if (queuedRequestId) {
        if (status === 'offline_pending') {
          await markBusinessPosCommand(user.id, queuedRequestId, 'offline_pending', 1, apiError?.message ?? null);
        } else if (status === 'conflict') {
          await removeBusinessPosCommand(user.id, queuedRequestId);
        } else {
          await markBusinessPosCommand(user.id, queuedRequestId, 'manual_review', 1, apiError?.message ?? null);
        }
      }
      if (status === 'offline_pending') {
        setPosCommandBlocked(true);
        setNotice('Pagamento salvo neste aparelho. O mesmo protocolo será reenviado quando a conexão voltar.');
      } else if (status === 'conflict') {
        paymentCommandRef.current = null;
        setPosCommandBlocked(false);
        await load();
        setPaymentError(apiError?.message ?? 'A comanda mudou no servidor.');
      } else {
        setPosCommandBlocked(true);
        setPaymentError('A operação não foi confirmada e exige revisão manual.');
      }
    } finally {
      setPaymentMutating(false);
    }
  };

  const voidPayment = async () => {
    if (!user || !activeContext || !serviceOrder || !paymentSummary || !voidTargetId || posCommandBlocked) return;
    if (voidReason.trim().length < 3) {
      setPaymentError('Informe o motivo do estorno.');
      return;
    }
    const fingerprint = [
      serviceOrder.id, voidTargetId, voidReason.trim(), paymentSummary.version,
    ].join(':');
    if (!voidCommandRef.current || voidCommandRef.current.fingerprint !== fingerprint) {
      voidCommandRef.current = { fingerprint, requestId: createMobileRequestId() };
    }
    setPaymentMutating(true);
    setPaymentError(null);
    let queuedRequestId: string | null = null;
    try {
      const entry = await enqueueBusinessPosCommand({
        kind: 'void_payment',
        userId: user.id,
        establishmentId: activeContext.establishmentId,
        serviceOrderId: serviceOrder.id,
        paymentEntryId: voidTargetId,
        reason: voidReason.trim(),
        expectedVersion: paymentSummary.version,
        requestId: voidCommandRef.current.requestId,
      });
      queuedRequestId = entry.requestId;
      if (entry.requestId !== voidCommandRef.current.requestId) {
        setPosCommandBlocked(true);
        setNotice('Já existe uma operação financeira pendente para esta comanda.');
        return;
      }
      await executeBusinessPosCommand(entry);
      await removeBusinessPosCommand(user.id, entry.requestId);
      voidCommandRef.current = null;
      setPosCommandBlocked(false);
      setVoidTargetId(null);
      setVoidReason('');
      setNotice('Estorno confirmado pelo servidor por lançamento compensatório.');
      await load();
    } catch (voidFailure) {
      const apiError = voidFailure instanceof BusinessApiError ? voidFailure : null;
      const status = classifyBusinessPosFailure(voidFailure);
      if (queuedRequestId) {
        if (status === 'offline_pending') {
          await markBusinessPosCommand(user.id, queuedRequestId, 'offline_pending', 1, apiError?.message ?? null);
        } else if (status === 'conflict') {
          await removeBusinessPosCommand(user.id, queuedRequestId);
        } else {
          await markBusinessPosCommand(user.id, queuedRequestId, 'manual_review', 1, apiError?.message ?? null);
        }
      }
      if (status === 'offline_pending') {
        setPosCommandBlocked(true);
        setNotice('Estorno salvo neste aparelho. O mesmo protocolo será reenviado quando a conexão voltar.');
      } else if (status === 'conflict') {
        voidCommandRef.current = null;
        setPosCommandBlocked(false);
        await load();
        setPaymentError(apiError?.message ?? 'A comanda mudou no servidor.');
      } else {
        setPosCommandBlocked(true);
        setPaymentError('O estorno não foi confirmado e exige revisão manual.');
      }
    } finally {
      setPaymentMutating(false);
    }
  };

  const closePaidOrder = async () => {
    if (
      !user || !activeContext || !serviceOrder || !paymentSummary
      || paymentSummary.balanceCents !== 0 || posCommandBlocked
    ) return;
    closeRequestIdRef.current ??= createMobileRequestId();
    setPaymentMutating(true);
    setPaymentError(null);
    let queuedRequestId: string | null = null;
    try {
      const entry = await enqueueBusinessPosCommand({
        kind: 'close_service_order',
        userId: user.id,
        establishmentId: activeContext.establishmentId,
        serviceOrderId: serviceOrder.id,
        expectedVersion: paymentSummary.version,
        requestId: closeRequestIdRef.current,
      });
      queuedRequestId = entry.requestId;
      if (entry.requestId !== closeRequestIdRef.current) {
        setPosCommandBlocked(true);
        setNotice('Já existe uma operação financeira pendente para esta comanda.');
        return;
      }
      await executeBusinessPosCommand(entry);
      await removeBusinessPosCommand(user.id, entry.requestId);
      closeRequestIdRef.current = null;
      setPosCommandBlocked(false);
      setNotice('Comanda encerrada após confirmação do saldo pelo servidor.');
      await load();
    } catch (closeFailure) {
      const apiError = closeFailure instanceof BusinessApiError ? closeFailure : null;
      const status = classifyBusinessPosFailure(closeFailure);
      if (queuedRequestId) {
        if (status === 'offline_pending') {
          await markBusinessPosCommand(user.id, queuedRequestId, 'offline_pending', 1, apiError?.message ?? null);
        } else if (status === 'conflict') {
          await removeBusinessPosCommand(user.id, queuedRequestId);
        } else {
          await markBusinessPosCommand(user.id, queuedRequestId, 'manual_review', 1, apiError?.message ?? null);
        }
      }
      if (status === 'conflict') {
        closeRequestIdRef.current = null;
        setPosCommandBlocked(false);
        await load();
        setPaymentError(apiError?.message ?? 'A comanda mudou no servidor.');
      } else if (status === 'offline_pending') {
        setPosCommandBlocked(true);
        setNotice('Fechamento salvo neste aparelho. O mesmo protocolo será reenviado quando a conexão voltar.');
      } else {
        setPosCommandBlocked(true);
        setPaymentError('O fechamento não foi confirmado e exige revisão manual.');
      }
    } finally {
      setPaymentMutating(false);
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

          <View style={styles.section} testID="business-service-order-section">
            <BusinessSectionTitle>Comanda</BusinessSectionTitle>
            {!financialOpsEnabled ? (
              <BusinessNotice
                testID="business-financial-ops-disabled"
                tone="warning"
                message="O POS manual está presente nesta build, mas ainda não foi habilitado para este estabelecimento. Nenhum pagamento pode ser lançado até a ativação governada da unidade."
              />
            ) : (
              <>
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
                  {paymentError ? (
                    <BusinessNotice
                      testID="business-payment-error"
                      tone="danger"
                      message={paymentError}
                    />
                  ) : null}
                  {paymentSummary ? (
                    <View style={styles.paymentBlock} testID="business-payment-summary">
                      <View style={styles.paymentHeading}>
                        <Text selectable style={styles.value}>Pagamento</Text>
                        <BusinessPill
                          testID="business-payment-status"
                          label={paymentStatusLabel(paymentSummary.paymentStatus)}
                          tone={paymentSummary.paymentStatus === 'paid' ? 'success' : 'warning'}
                        />
                      </View>
                      <Text selectable style={styles.totals}>
                        Recebido {formatCents(paymentSummary.paidCents)}
                      </Text>
                      <Text selectable style={styles.totalStrong}>
                        Saldo {formatCents(paymentSummary.balanceCents)}
                      </Text>

                      {posCommandBlocked ? (
                        <BusinessNotice
                          tone="warning"
                          message="Há uma operação financeira pendente. Novas ações ficam bloqueadas até confirmação ou revisão."
                        />
                      ) : null}

                      {paymentSummary.entries.map((entry) => (
                        <View key={entry.id} style={styles.paymentEntry} testID="business-payment-entry">
                          <View style={styles.paymentHeading}>
                            <Text selectable style={styles.value}>
                              {entry.entryType === 'void' ? 'Estorno' : entry.methodName}
                            </Text>
                            <Text selectable style={styles.value}>
                              {entry.entryType === 'void' ? '−' : '+'}{formatCents(entry.amountCents)}
                            </Text>
                          </View>
                          <Text selectable style={styles.meta}>
                            {new Intl.DateTimeFormat('pt-BR', {
                              timeZone,
                              dateStyle: 'short',
                              timeStyle: 'short',
                            }).format(new Date(entry.createdAt))}
                            {entry.externalReference ? ` · ref. ${entry.externalReference}` : ''}
                            {entry.reason ? ` · ${entry.reason}` : ''}
                          </Text>
                          {canVoidPayments
                            && serviceOrder.status === 'awaiting_payment'
                            && entry.entryType === 'payment'
                            && entry.status === 'succeeded'
                            && !voidedOriginalEntryIds.has(entry.id) ? (
                              <BusinessButton
                                testID={`business-void-payment-${entry.id}`}
                                label="Estornar lançamento"
                                variant="danger"
                                disabled={paymentMutating || posCommandBlocked}
                                onPress={() => {
                                  setVoidTargetId(entry.id);
                                  setVoidReason('');
                                  voidCommandRef.current = null;
                                }}
                              />
                            ) : null}
                        </View>
                      ))}

                      {voidTargetId ? (
                        <View style={styles.paymentForm} testID="business-void-payment-form">
                          <Text selectable style={styles.label}>Motivo do estorno</Text>
                          <TextInput
                            testID="business-void-payment-reason"
                            accessibilityLabel="Motivo do estorno"
                            value={voidReason}
                            onChangeText={(value) => {
                              setVoidReason(value);
                              voidCommandRef.current = null;
                            }}
                            placeholder="Descreva a correção"
                            placeholderTextColor={businessTheme.colors.textMuted}
                            multiline
                            style={[styles.input, styles.reasonInput]}
                          />
                          <BusinessButton
                            testID="business-confirm-void-payment"
                            label="Confirmar estorno"
                            variant="danger"
                            loading={paymentMutating}
                            disabled={posCommandBlocked || voidReason.trim().length < 3}
                            onPress={() => void voidPayment()}
                          />
                          <BusinessButton
                            label="Cancelar"
                            variant="ghost"
                            disabled={paymentMutating || posCommandBlocked}
                            onPress={() => {
                              setVoidTargetId(null);
                              setVoidReason('');
                              voidCommandRef.current = null;
                            }}
                          />
                        </View>
                      ) : null}

                      {canTakePayments
                        && activeContext?.accessMode === 'full'
                        && serviceOrder.status === 'awaiting_payment'
                        && paymentSummary.balanceCents > 0 ? (
                          <View style={styles.paymentForm} testID="business-record-payment-form">
                            <Text selectable style={styles.label}>Meio de pagamento</Text>
                            {paymentMethods.length === 0 ? (
                              <View style={styles.paymentMethods}>
                                <BusinessNotice
                                  tone="warning"
                                  message="Nenhum meio de pagamento ativo. Configure dinheiro, PIX ou maquininha no Business."
                                />
                                {hasCapability('manage_operational_settings') ? (
                                  <BusinessButton
                                    testID="business-open-payment-method-settings"
                                    label="Configurar meios de pagamento"
                                    variant="secondary"
                                    onPress={() => router.push('/(app)/payment-methods' as never)}
                                  />
                                ) : null}
                              </View>
                            ) : (
                              <View style={styles.paymentMethods}>
                                {paymentMethods.map((method) => (
                                  <BusinessButton
                                    key={method.id}
                                    testID={`business-payment-method-${method.methodType}`}
                                    label={method.displayName}
                                    variant={selectedPaymentMethodId === method.id ? 'primary' : 'secondary'}
                                    disabled={paymentMutating || posCommandBlocked}
                                    onPress={() => {
                                      setSelectedPaymentMethodId(method.id);
                                      setPaymentReference('');
                                      paymentCommandRef.current = null;
                                    }}
                                  />
                                ))}
                              </View>
                            )}
                            <Text selectable style={styles.label}>Valor em reais</Text>
                            <TextInput
                              testID="business-payment-amount"
                              accessibilityLabel="Valor do pagamento em reais"
                              value={paymentAmount}
                              onChangeText={updatePaymentAmount}
                              placeholder="0,00"
                              placeholderTextColor={businessTheme.colors.textMuted}
                              keyboardType="decimal-pad"
                              style={styles.input}
                            />
                            {selectedPaymentMethod?.requiresReference ? (
                              <>
                                <Text selectable style={styles.label}>Referência da operação</Text>
                                <TextInput
                                  testID="business-payment-reference"
                                  accessibilityLabel="Referência da operação"
                                  value={paymentReference}
                                  onChangeText={updatePaymentReference}
                                  placeholder="Identificador informado pelo operador"
                                  placeholderTextColor={businessTheme.colors.textMuted}
                                  autoCapitalize="characters"
                                  maxLength={120}
                                  style={styles.input}
                                />
                              </>
                            ) : null}
                            <BusinessButton
                              testID="business-record-payment"
                              label="Registrar pagamento"
                              loading={paymentMutating}
                              disabled={posCommandBlocked || !selectedPaymentMethod || !paymentAmount.trim()}
                              onPress={() => void recordPayment()}
                            />
                          </View>
                        ) : null}

                      {canManageOrder
                        && activeContext?.accessMode === 'full'
                        && serviceOrder.status === 'awaiting_payment'
                        && paymentSummary.balanceCents === 0 ? (
                          <BusinessButton
                            testID="business-close-paid-order"
                            label="Encerrar comanda paga"
                            loading={paymentMutating}
                            disabled={posCommandBlocked}
                            onPress={() => void closePaidOrder()}
                          />
                        ) : null}
                    </View>
                  ) : null}
                </View>
              )}
              </>
            )}
          </View>

          {notice ? <BusinessNotice tone="warning" message={notice} /> : null}
          {error ? <BusinessNotice tone="danger" message={error} /> : null}

          {activeReassignment ? (
            <View style={styles.section} testID="business-active-reassignment-section">
              <BusinessSectionTitle>Reatribuição em andamento</BusinessSectionTitle>
              <View style={styles.detailBlock}>
                <BusinessPill
                  label={activeReassignment.status.replaceAll('_', ' ')}
                  tone={activeReassignment.status === 'ready_to_apply' ? 'warning' : 'neutral'}
                />
                <Text selectable style={styles.value}>
                  {activeReassignment.currentProfessionalName}
                  {' → '}
                  {activeReassignment.proposedProfessionalName ?? 'substituto em definição'}
                </Text>
                <Text selectable style={styles.meta}>
                  {activeReassignment.status === 'ready_to_apply'
                    ? 'O cliente aceitou a proposta. O profissional atual permanece na agenda até a aplicação server-side.'
                    : 'A agenda continua exibindo o profissional atual enquanto a solicitação estiver em andamento.'}
                </Text>
              </View>
              <BusinessButton
                testID="business-open-active-reassignment"
                label={activeReassignment.allowedActions.includes('apply')
                  ? 'Revisar e aplicar troca aceita'
                  : 'Acompanhar solicitação'}
                onPress={() => router.push(
                  `/(app)/decisions/${activeReassignment.reassignmentRequestId}` as never,
                )}
              />
            </View>
          ) : reassignmentResponsibility && reassignmentAvailability ? (
            <View style={styles.section} testID="business-reassignment-section">
              <BusinessSectionTitle>Reatribuição profissional</BusinessSectionTitle>
              <Text selectable style={styles.meta}>
                Solicite a substituição deste atendimento. A troca só será aplicada pelo fluxo
                server-side e, quando necessário, após a decisão do cliente.
              </Text>
              {!reassignmentAvailability.available ? (
                <BusinessNotice
                  testID="business-reassignment-unavailable"
                  tone="warning"
                  message={reassignmentAvailability.message}
                />
              ) : null}
              <BusinessButton
                testID="business-request-reassignment"
                label="Solicitar troca de profissional"
                variant="secondary"
                loading={reassignmentMutating}
                disabled={!reassignmentAvailability.available}
                onPress={confirmReassignmentRequest}
              />
            </View>
          ) : null}

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
  paymentBlock: {
    gap: businessTheme.spacing.sm,
    paddingTop: businessTheme.spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: businessTheme.colors.border,
  },
  paymentHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: businessTheme.spacing.sm,
  },
  paymentEntry: {
    gap: 5,
    padding: businessTheme.spacing.sm,
    borderWidth: 1,
    borderColor: businessTheme.colors.border,
    borderRadius: businessTheme.radii.md,
    backgroundColor: businessTheme.colors.surface,
  },
  paymentForm: {
    gap: businessTheme.spacing.sm,
    paddingTop: businessTheme.spacing.sm,
  },
  paymentMethods: { gap: businessTheme.spacing.xs },
  input: {
    minHeight: businessTheme.sizing.control,
    paddingHorizontal: businessTheme.spacing.md,
    borderWidth: 1,
    borderColor: businessTheme.colors.borderStrong,
    borderRadius: businessTheme.radii.md,
    color: businessTheme.colors.text,
    backgroundColor: businessTheme.colors.surface,
    fontSize: 15,
  },
  reasonInput: { minHeight: 88, paddingTop: businessTheme.spacing.sm },
});
