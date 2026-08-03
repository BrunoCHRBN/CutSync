import { createMobileRequestId } from '@cutsync/domain';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import {
  businessQueryClient,
  createBusinessQueryKey,
} from '@/features/connectivity/business-query';
import { BusinessFeatureError } from '@/features/connectivity/business-rpc';
import {
  normalizeBusinessAppointmentRouteId,
  resolveBusinessAppointmentContext,
} from '@/features/links/business-deep-links';
import { supabase } from '@/lib/supabase';

import {
  businessAppointmentsApi,
  type BusinessAppointmentCommand,
} from './business-appointments-api';

interface PendingCommand {
  command: BusinessAppointmentCommand;
  requestId: string;
  reason?: string | null;
}

export function useBusinessAppointment(routeAppointmentId: string) {
  const { isLoading: isSessionLoading, user } = useBusinessSession();
  const {
    activeContext,
    contexts,
    isLoading: isOperationalLoading,
    selectEstablishment,
  } = useBusinessOperational();
  const appointmentId = normalizeBusinessAppointmentRouteId(routeAppointmentId) ?? '';
  const channelInstanceId = useId().replace(/:/g, '');
  const pendingRetry = useRef<PendingCommand | null>(null);
  const attemptedContextLookups = useRef(new Set<string>());
  const [isResolvingContext, setIsResolvingContext] = useState(false);
  const [contextResolutionError, setContextResolutionError] = useState<unknown>(null);
  const userId = user?.id ?? '';
  const establishmentId = activeContext?.establishmentId ?? '';
  const isBootstrapping = isSessionLoading || Boolean(user && isOperationalLoading);
  const invalidAppointmentError = !isBootstrapping && !appointmentId
    ? new BusinessFeatureError('invalid_request')
    : null;
  const canResolveWithoutActiveContext = Boolean(
    !isBootstrapping
    && user
    && !activeContext
    && appointmentId
    && !contextResolutionError
    && contexts.some((context) => context.accessMode !== 'blocked'),
  );
  const detailKey = user && activeContext
    ? createBusinessQueryKey(user.id, activeContext.establishmentId, 'appointments', appointmentId)
    : ['business', 'anonymous', 'none', 'appointments', appointmentId] as const;

  const query = useQuery({
    queryKey: detailKey,
    enabled: Boolean(user && activeContext && appointmentId.trim()),
    queryFn: () => businessAppointmentsApi.getDetail(establishmentId, appointmentId),
  });

  useEffect(() => {
    attemptedContextLookups.current.clear();
    setIsResolvingContext(false);
    setContextResolutionError(null);
  }, [appointmentId, userId]);

  useEffect(() => {
    const errorCode = query.error instanceof BusinessFeatureError
      ? query.error.code
      : null;
    const shouldResolveFromActiveContext = Boolean(
      activeContext && (errorCode === 'not_found' || errorCode === 'forbidden'),
    );
    if (
      !user
      || !appointmentId
      || isBootstrapping
      || (!canResolveWithoutActiveContext && !shouldResolveFromActiveContext)
    ) {
      return undefined;
    }

    const alternateContexts = contexts.filter((context) => (
      context.accessMode !== 'blocked'
      && context.establishmentId !== activeContext?.establishmentId
    ));
    if (alternateContexts.length === 0) {
      if (!activeContext) setContextResolutionError(new BusinessFeatureError('not_found'));
      return undefined;
    }

    const lookupKey = [
      user.id,
      appointmentId,
      ...contexts
        .filter((context) => context.accessMode !== 'blocked')
        .map((context) => context.establishmentId)
        .sort(),
    ].join(':');
    if (attemptedContextLookups.current.has(lookupKey)) return undefined;
    attemptedContextLookups.current.add(lookupKey);

    let effectActive = true;
    setIsResolvingContext(true);
    setContextResolutionError(null);
    void resolveBusinessAppointmentContext({
      appointmentId,
      activeEstablishmentId: null,
      contexts: alternateContexts,
      loadDetail: businessAppointmentsApi.getDetail,
    })
      .then(async (resolvedEstablishmentId) => {
        if (!effectActive) return;
        if (!resolvedEstablishmentId) {
          setContextResolutionError(new BusinessFeatureError('not_found'));
          return;
        }
        setIsResolvingContext(false);
        const selected = await selectEstablishment(resolvedEstablishmentId);
        if (effectActive && !selected) {
          setContextResolutionError(new BusinessFeatureError('forbidden'));
        }
      })
      .catch((error) => {
        if (effectActive) setContextResolutionError(error);
      })
      .finally(() => {
        if (effectActive) setIsResolvingContext(false);
      });

    return () => {
      effectActive = false;
    };
  }, [
    activeContext,
    appointmentId,
    canResolveWithoutActiveContext,
    contexts,
    isBootstrapping,
    query.error,
    selectEstablishment,
    user,
  ]);

  const invalidateOperationalData = async () => {
    if (!user || !activeContext) return;
    await Promise.all([
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'appointments', appointmentId),
      }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda'),
      }),
      businessQueryClient.invalidateQueries({
        queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'schedule-blocks'),
      }),
    ]);
  };

  const mutation = useMutation({
    retry: false,
    mutationFn: (input: PendingCommand) => businessAppointmentsApi.runCommand({
      establishmentId,
      appointmentId,
      requestId: input.requestId,
      command: input.command,
      reason: input.reason,
    }),
    onSuccess: async () => {
      pendingRetry.current = null;
      await invalidateOperationalData();
    },
  });

  const runCommand = async (
    command: BusinessAppointmentCommand,
    reason?: string | null,
  ) => {
    const normalizedReason = reason?.trim() || null;
    const previous = pendingRetry.current;
    const input = previous?.command === command && previous.reason === normalizedReason
      ? previous
      : { command, reason: normalizedReason, requestId: createMobileRequestId() };
    pendingRetry.current = input;
    return mutation.mutateAsync(input);
  };

  useEffect(() => {
    if (!supabase || !userId || !establishmentId || !appointmentId.trim()) return undefined;
    const channel = supabase
      .channel(`business-appointment-${appointmentId}-${channelInstanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `id=eq.${appointmentId}`,
      }, () => {
        void invalidateOperationalData();
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'appointment_events',
        filter: `appointment_id=eq.${appointmentId}`,
      }, () => {
        void invalidateOperationalData();
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [appointmentId, channelInstanceId, establishmentId, userId]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    appointment: query.data ?? null,
    isLoading: isBootstrapping
      || canResolveWithoutActiveContext
      || query.isLoading
      || isResolvingContext,
    isRefreshing: query.isFetching && !query.isLoading,
    error: isBootstrapping || isResolvingContext
      ? null
      : invalidAppointmentError ?? contextResolutionError ?? query.error,
    refresh: () => {
      attemptedContextLookups.current.clear();
      setContextResolutionError(null);
      if (!activeContext) return Promise.resolve();
      return query.refetch();
    },
    runCommand,
    commandPending: mutation.isPending,
    commandError: mutation.error,
    canRetryCommand: Boolean(pendingRetry.current && mutation.isError),
  };
}
