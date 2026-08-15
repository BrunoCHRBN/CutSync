import type { BusinessPaymentMethod } from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo, useRef } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { businessApi } from '@/services/business-api';

import { businessCheckoutApi } from './business-checkout-api';

interface PendingPayment { method: BusinessPaymentMethod; amountCents: number; requestId: string }

export function useBusinessCheckout(serviceOrderId: string | null, appointmentId?: string) {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const pending = useRef<PendingPayment | null>(null);
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const userId = user?.id ?? 'signed-out';
  const visible = Boolean(activeContext?.financialOpsEnabled && hasCapability('view_payments') && serviceOrderId);
  const canTakePayments = Boolean(
    activeContext?.financialOpsEnabled
    && activeContext.accessMode === 'full'
    && hasCapability('take_payments'),
  );
  const queryKey = useMemo(() => createBusinessQueryKey(
    userId,
    establishmentId,
    'service-orders',
    serviceOrderId ?? 'none',
    'checkout',
  ), [establishmentId, serviceOrderId, userId]);
  const query = useQuery({
    queryKey,
    enabled: Boolean(user && activeContext && visible),
    queryFn: () => businessCheckoutApi.getSummary(establishmentId, serviceOrderId!),
  });

  const invalidate = async () => {
    await Promise.all([
      businessQueryClient.invalidateQueries({ queryKey }),
      businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(userId, establishmentId, 'service-orders') }),
      businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(userId, establishmentId, 'agenda') }),
      ...(appointmentId ? [
        businessQueryClient.invalidateQueries({ queryKey: createBusinessQueryKey(userId, establishmentId, 'appointments', appointmentId) }),
      ] : []),
    ]);
  };
  const payment = useMutation({
    retry: false,
    mutationFn: async (input: { method: BusinessPaymentMethod; amountCents: number }) => {
      if (!activeContext || !serviceOrderId || !query.data) throw new Error('invalid_checkout');
      const previous = pending.current;
      const command = previous?.method === input.method && previous.amountCents === input.amountCents
        ? previous
        : { ...input, requestId: createMobileRequestId() };
      pending.current = command;
      return businessCheckoutApi.recordPayment({
        establishmentId: activeContext.establishmentId,
        serviceOrderId,
        expectedVersion: query.data.version,
        ...command,
      });
    },
    onSuccess: async () => { pending.current = null; await invalidate(); },
  });
  const closeZeroBalance = useMutation({
    retry: false,
    mutationFn: async () => {
      if (!activeContext || !serviceOrderId || !query.data) throw new Error('invalid_checkout');
      return businessApi.closeServiceOrder({
        establishmentId: activeContext.establishmentId,
        serviceOrderId,
        expectedVersion: query.data.version,
        requestId: createMobileRequestId(),
      });
    },
    onSuccess: invalidate,
  });

  return {
    ...query,
    visible,
    canTakePayments,
    recordPayment: payment.mutateAsync,
    closeZeroBalance: closeZeroBalance.mutateAsync,
    isPending: payment.isPending || closeZeroBalance.isPending,
    mutationError: payment.error ?? closeZeroBalance.error,
  };
}