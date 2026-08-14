import type { AppointmentServiceOrderContext } from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useMemo, useRef } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import {
  businessQueryClient,
  createBusinessQueryKey,
} from '@/features/connectivity/business-query';
import { supabase } from '@/lib/supabase';
import { BusinessApiError, businessApi } from '@/services/business-api';

import {
  canManageAppointmentOrder,
  getBusinessOrderActionLabel,
  resolveBusinessAppointmentOrderAction,
} from './appointment-order-actions';

export type AppointmentServiceOrderAction =
  | 'open_order'
  | 'start_order'
  | 'finish_order'
  | 'void_order'
  | 'reopen_order';

interface PendingOrderCommand {
  action: AppointmentServiceOrderAction;
  requestId: string;
  reason: string | null;
  serviceOrderId: string | null;
  expectedVersion: number | null;
}

export function useAppointmentServiceOrder(input: {
  appointmentId: string;
  appointmentStatus: string | null | undefined;
  appointmentProfessionalId: string | null | undefined;
}) {
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const channelInstanceId = useId().replace(/:/g, '');
  const pendingRetry = useRef<PendingOrderCommand | null>(null);
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const financialOpsEnabled = Boolean(activeContext?.financialOpsEnabled);
  const queryKey = useMemo(() => createBusinessQueryKey(
    userId,
    establishmentId,
    'appointments',
    input.appointmentId,
    'service-order',
  ), [establishmentId, input.appointmentId, userId]);

  const query = useQuery({
    queryKey,
    enabled: Boolean(user && activeContext && financialOpsEnabled && input.appointmentId),
    queryFn: () => businessApi.getServiceOrderForAppointment(
      establishmentId,
      input.appointmentId,
    ),
  });

  const context: AppointmentServiceOrderContext | null = query.data ?? null;
  const serviceOrder = context?.serviceOrder ?? null;
  const canManage = canManageAppointmentOrder({
    context: activeContext,
    appointmentProfessionalId: input.appointmentProfessionalId,
    actorUserId: user?.id,
  });
  const primaryAction = resolveBusinessAppointmentOrderAction({
    context: activeContext,
    appointmentStatus: input.appointmentStatus,
    serviceOrderStatus: serviceOrder?.status,
    appointmentProfessionalId: input.appointmentProfessionalId,
    actorUserId: user?.id,
  });

  const invalidateOperationalData = useCallback(async () => {
    if (userId === 'signed-out' || establishmentId === 'none') return;
    await Promise.all([
      businessQueryClient.invalidateQueries({ queryKey }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(
          userId,
          establishmentId,
          'appointments',
          input.appointmentId,
        ),
      }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(userId, establishmentId, 'agenda'),
      }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(userId, establishmentId, 'service-orders'),
      }),
    ]);
  }, [establishmentId, input.appointmentId, queryKey, userId]);

  const mutation = useMutation({
    retry: false,
    mutationFn: async (command: PendingOrderCommand) => {
      if (!activeContext) throw new BusinessApiError('invalid_request');
      const base = {
        establishmentId: activeContext.establishmentId,
        requestId: command.requestId,
      };
      if (command.action === 'open_order') {
        return businessApi.openServiceOrder({
          ...base,
          appointmentId: input.appointmentId,
        });
      }
      if (!command.serviceOrderId || command.expectedVersion === null) {
        throw new BusinessApiError('invalid_request');
      }
      const versioned = {
        ...base,
        serviceOrderId: command.serviceOrderId,
        expectedVersion: command.expectedVersion,
      };
      if (command.action === 'start_order') return businessApi.startServiceOrder(versioned);
      if (command.action === 'finish_order') return businessApi.finishServiceOrder(versioned);
      if (!command.reason) throw new BusinessApiError('invalid_request');
      if (command.action === 'void_order') {
        return businessApi.voidServiceOrder({ ...versioned, reason: command.reason });
      }
      return businessApi.reopenVoidedServiceOrder({ ...versioned, reason: command.reason });
    },
    onSuccess: async () => {
      pendingRetry.current = null;
      await invalidateOperationalData();
    },
    onError: async (error) => {
      if (
        error instanceof BusinessApiError
        && (error.code === 'service_order_version_conflict'
          || error.code === 'service_order_invalid_transition')
      ) {
        pendingRetry.current = null;
        await invalidateOperationalData();
      }
    },
  });

  const runAction = async (action: AppointmentServiceOrderAction, reason?: string | null) => {
    const normalizedReason = reason?.trim() || null;
    const previous = pendingRetry.current;
    const command = previous?.action === action && previous.reason === normalizedReason
      ? previous
      : {
        action,
        reason: normalizedReason,
        requestId: createMobileRequestId(),
        serviceOrderId: serviceOrder?.id ?? null,
        expectedVersion: serviceOrder?.version ?? null,
      };
    pendingRetry.current = command;
    return mutation.mutateAsync(command);
  };

  useEffect(() => {
    if (
      !supabase
      || userId === 'signed-out'
      || establishmentId === 'none'
      || !financialOpsEnabled
      || !input.appointmentId
    ) {
      return undefined;
    }
    const channel = supabase
      .channel(`business-service-order-${input.appointmentId}-${channelInstanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_orders',
        filter: `appointment_id=eq.${input.appointmentId}`,
      }, () => {
        void invalidateOperationalData();
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [
    channelInstanceId,
    establishmentId,
    financialOpsEnabled,
    invalidateOperationalData,
    input.appointmentId,
    userId,
  ]);

  return {
    financialOpsEnabled,
    context,
    serviceOrder,
    isLoading: query.isLoading,
    error: query.error,
    refresh: query.refetch,
    primaryAction,
    primaryActionLabel: getBusinessOrderActionLabel(primaryAction),
    canVoid: Boolean(canManage && serviceOrder && ['open', 'in_service', 'awaiting_payment'].includes(serviceOrder.status)),
    canReopen: Boolean(canManage && serviceOrder?.status === 'voided'),
    runAction,
    isPending: mutation.isPending,
    mutationError: mutation.error,
  };
}
