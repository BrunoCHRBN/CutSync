import {
  createManualPosApi,
  ManualPosApiError,
  type EstablishmentPaymentMethod,
  type ServiceOrderPaymentSummary,
} from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { supabase } from '../../services/supabase';

interface UseServiceOrderPaymentsOptions {
  establishmentId?: string | null;
  serviceOrderId?: string | null;
  enabled: boolean;
  onChanged?: () => Promise<void> | void;
}

const messageFor = (error: unknown) => {
  if (!(error instanceof ManualPosApiError)) return 'Não foi possível atualizar o pagamento.';
  return ({
    network_error: 'Sem confirmação do servidor. Tente novamente para reenviar o mesmo protocolo.',
    payment_method_unavailable: 'Este meio de pagamento não está mais disponível.',
    payment_method_version_conflict: 'A configuração dos meios mudou. Os dados foram atualizados.',
    payment_reference_required: 'Informe a referência desta operação.',
    payment_exceeds_order_balance: 'O valor informado ultrapassa o saldo da comanda.',
    service_order_version_conflict: 'A comanda mudou em outro dispositivo. Os dados foram atualizados.',
    payment_entry_not_voidable: 'Este lançamento não pode mais ser estornado.',
    payment_entry_already_voided: 'Este lançamento já possui estorno confirmado.',
    aal2_required: 'Confirme a autenticação em duas etapas na área Segurança e tente novamente.',
    forbidden: 'Você não possui permissão para registrar pagamentos.',
    unauthorized: 'Sua sessão expirou. Entre novamente para continuar.',
  } as Partial<Record<ManualPosApiError['code'], string>>)[error.code]
    ?? 'Não foi possível atualizar o pagamento.';
};

export function useServiceOrderPayments({
  establishmentId,
  serviceOrderId,
  enabled,
  onChanged,
}: UseServiceOrderPaymentsOptions) {
  const api = useMemo(() => createManualPosApi(supabase), []);
  const [summary, setSummary] = useState<ServiceOrderPaymentSummary | null>(null);
  const [methods, setMethods] = useState<EstablishmentPaymentMethod[]>([]);
  const [loading, setLoading] = useState(false);
  const [mutating, setMutating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commandRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const voidCommandRef = useRef<{ fingerprint: string; requestId: string } | null>(null);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const refresh = useCallback(async () => {
    if (!enabled || !establishmentId || !serviceOrderId) {
      setSummary(null);
      setMethods([]);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const [nextSummary, nextMethods] = await Promise.all([
        api.getPaymentSummary(establishmentId, serviceOrderId),
        api.listPaymentMethods(establishmentId),
      ]);
      setSummary(nextSummary);
      setMethods(nextMethods.methods.filter((method) => method.active));
      return nextSummary;
    } catch (loadError) {
      setError(messageFor(loadError));
      return null;
    } finally {
      setLoading(false);
    }
  }, [api, enabled, establishmentId, serviceOrderId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const record = useCallback(async (input: {
    paymentMethodId: string;
    amountCents: number;
    externalReference?: string | null;
  }) => {
    if (!establishmentId || !serviceOrderId || !summary || mutating) return false;
    const fingerprint = JSON.stringify({ establishmentId, serviceOrderId, ...input, version: summary.version });
    if (!commandRef.current || commandRef.current.fingerprint !== fingerprint) {
      commandRef.current = { fingerprint, requestId: createMobileRequestId() };
    }
    setMutating(true);
    setError(null);
    try {
      await api.recordPayment({
        establishmentId,
        serviceOrderId,
        paymentMethodId: input.paymentMethodId,
        amountCents: input.amountCents,
        externalReference: input.externalReference,
        expectedVersion: summary.version,
        requestId: commandRef.current.requestId,
      });
      commandRef.current = null;
      await refresh();
      await onChangedRef.current?.();
      return true;
    } catch (recordError) {
      setError(messageFor(recordError));
      if (!(recordError instanceof ManualPosApiError) || recordError.code !== 'network_error') {
        commandRef.current = null;
        await refresh();
      }
      return false;
    } finally {
      setMutating(false);
    }
  }, [api, establishmentId, mutating, refresh, serviceOrderId, summary]);

  const voidPayment = useCallback(async (input: {
    paymentEntryId: string;
    reason: string;
  }) => {
    if (!establishmentId || !serviceOrderId || !summary || mutating) return false;
    const fingerprint = JSON.stringify({ establishmentId, serviceOrderId, ...input, version: summary.version });
    if (!voidCommandRef.current || voidCommandRef.current.fingerprint !== fingerprint) {
      voidCommandRef.current = { fingerprint, requestId: createMobileRequestId() };
    }
    setMutating(true);
    setError(null);
    try {
      await api.voidPayment({
        establishmentId,
        serviceOrderId,
        paymentEntryId: input.paymentEntryId,
        reason: input.reason,
        expectedVersion: summary.version,
        requestId: voidCommandRef.current.requestId,
      });
      voidCommandRef.current = null;
      await refresh();
      await onChangedRef.current?.();
      return true;
    } catch (voidError) {
      setError(messageFor(voidError));
      if (!(voidError instanceof ManualPosApiError) || voidError.code !== 'network_error') {
        voidCommandRef.current = null;
        await refresh();
      }
      return false;
    } finally {
      setMutating(false);
    }
  }, [api, establishmentId, mutating, refresh, serviceOrderId, summary]);

  return { summary, methods, loading, mutating, error, refresh, record, voidPayment };
}
