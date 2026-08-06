import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  createServiceOrderApi,
  ServiceOrderApiError,
  type AppointmentServiceOrderContext,
  type ServiceOrderDetail,
} from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { supabase } from '../../services/supabase';

type ServiceOrderCommand = 'open' | 'start' | 'finish';

interface UseAppointmentServiceOrderOptions {
  establishmentId?: string | null;
  appointmentId?: string | null;
  enabled: boolean;
  onChanged?: () => Promise<void> | void;
}

const COMMAND_ERROR_MESSAGES: Record<string, string> = {
  financial_ops_disabled: 'As operações financeiras ainda não estão ativas nesta unidade.',
  service_order_already_exists: 'A comanda já foi aberta. Atualizando o atendimento.',
  service_order_version_conflict: 'A comanda foi atualizada em outro dispositivo. Revise e tente novamente.',
  service_order_invalid_transition: 'O estado desta comanda mudou. Atualizando os dados.',
  service_order_items_required: 'Adicione ao menos um item antes de finalizar.',
  network_error: 'Não foi possível conectar. Verifique sua internet e tente novamente.',
  unauthorized: 'Sua sessão expirou. Entre novamente para continuar.',
  forbidden: 'Você não possui permissão para esta operação.',
  backend_unavailable: 'O CutSync ainda precisa da atualização mais recente para comandas.',
  invalid_response: 'O CutSync retornou dados inválidos. Tente novamente.',
  invalid_request: 'Os dados da comanda são inválidos.',
};

const serviceOrderMessage = (error: unknown, fallback: string) => (
  error instanceof ServiceOrderApiError
    ? COMMAND_ERROR_MESSAGES[error.code] ?? fallback
    : fallback
);

export function useAppointmentServiceOrder({
  establishmentId,
  appointmentId,
  enabled,
  onChanged,
}: UseAppointmentServiceOrderOptions) {
  const api = useMemo(() => createServiceOrderApi(supabase), []);
  const [context, setContext] = useState<AppointmentServiceOrderContext | null>(null);
  const [serviceOrder, setServiceOrder] = useState<ServiceOrderDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [mutation, setMutation] = useState<ServiceOrderCommand | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryableCommand, setRetryableCommand] = useState<ServiceOrderCommand | null>(null);
  const requestIdRef = useRef<string | null>(null);
  const requestCommandRef = useRef<ServiceOrderCommand | null>(null);
  const inFlightRef = useRef(false);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const resetRequest = useCallback(() => {
    requestIdRef.current = null;
    requestCommandRef.current = null;
    setRetryableCommand(null);
  }, []);

  const ensureRequestId = useCallback((command: ServiceOrderCommand) => {
    if (!requestIdRef.current || requestCommandRef.current !== command) {
      requestIdRef.current = createMobileRequestId();
      requestCommandRef.current = command;
    }
    return requestIdRef.current;
  }, []);

  const refresh = useCallback(async () => {
    if (!enabled || !establishmentId || !appointmentId) {
      setContext(null);
      setServiceOrder(null);
      setLoading(false);
      return null;
    }

    setLoading(true);
    setError(null);
    try {
      const next = await api.getServiceOrderForAppointment(establishmentId, appointmentId);
      setContext(next);
      setServiceOrder(next.serviceOrder);
      return next;
    } catch (loadError) {
      setError(serviceOrderMessage(loadError, 'Não foi possível carregar a comanda.'));
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, appointmentId, enabled, establishmentId]);

  useEffect(() => {
    if (!enabled || !establishmentId || !appointmentId) {
      setContext(null);
      setServiceOrder(null);
      setLoading(false);
      setError(null);
      resetRequest();
      return;
    }
    void refresh();
  }, [appointmentId, enabled, establishmentId, refresh, resetRequest]);

  const runCommand = useCallback(async (command: ServiceOrderCommand) => {
    if (!enabled || !establishmentId || !appointmentId || inFlightRef.current) return false;
    if ((command === 'start' || command === 'finish') && !serviceOrder) return false;

    inFlightRef.current = true;
    setMutation(command);
    setError(null);
    setRetryableCommand(null);

    try {
      const requestId = ensureRequestId(command);
      if (command === 'open') {
        try {
          await api.openServiceOrder({ establishmentId, appointmentId, requestId });
        } catch (openError) {
          if (
            openError instanceof ServiceOrderApiError
            && openError.code === 'service_order_already_exists'
          ) {
            await refresh();
            resetRequest();
            await onChangedRef.current?.();
            return true;
          }
          throw openError;
        }
      } else if (command === 'start' && serviceOrder) {
        await api.startServiceOrder({
          establishmentId,
          serviceOrderId: serviceOrder.id,
          expectedVersion: serviceOrder.version,
          requestId,
        });
      } else if (command === 'finish' && serviceOrder) {
        await api.finishServiceOrder({
          establishmentId,
          serviceOrderId: serviceOrder.id,
          expectedVersion: serviceOrder.version,
          requestId,
        });
      }

      resetRequest();
      await refresh();
      await onChangedRef.current?.();
      return true;
    } catch (commandError) {
      if (commandError instanceof ServiceOrderApiError) {
        if (commandError.code === 'service_order_version_conflict') {
          await refresh();
          setError(COMMAND_ERROR_MESSAGES.service_order_version_conflict);
          return false;
        }
        if (commandError.code === 'service_order_invalid_transition') {
          await refresh();
          resetRequest();
          setError(COMMAND_ERROR_MESSAGES.service_order_invalid_transition);
          return false;
        }
        if (commandError.code === 'network_error') {
          setRetryableCommand(command);
          setError(COMMAND_ERROR_MESSAGES.network_error);
          return false;
        }
      }
      resetRequest();
      setError(serviceOrderMessage(commandError, 'Não foi possível atualizar a comanda.'));
      return false;
    } finally {
      inFlightRef.current = false;
      setMutation(null);
    }
  }, [
    api,
    appointmentId,
    enabled,
    ensureRequestId,
    establishmentId,
    refresh,
    resetRequest,
    serviceOrder,
  ]);

  const retry = useCallback(async () => {
    if (!retryableCommand) return false;
    return runCommand(retryableCommand);
  }, [retryableCommand, runCommand]);

  const clearError = useCallback(() => setError(null), []);

  return {
    context,
    serviceOrder,
    loading,
    mutation,
    error,
    retryableCommand,
    refresh,
    open: () => runCommand('open'),
    start: () => runCommand('start'),
    finish: () => runCommand('finish'),
    retry,
    clearError,
  };
}
