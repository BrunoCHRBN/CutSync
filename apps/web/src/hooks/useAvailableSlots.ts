import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import {
  type AvailabilityRpcRow,
  fetchLegacyAvailableSlots,
  isAvailabilityRpcMissing,
} from '../services/legacyAvailability';
import { appointmentFeedbackMessages, formatCalendarDate } from '@cutsync/domain';

export interface AvailableSlot {
  startsAt: string;
  localTime: string;
  durationMinutes: number;
  available: boolean;
  unavailableReason: string | null;
  professionalId?: string;
}

interface UseAvailableSlotsOptions {
  establishmentId?: string | null;
  professionalId?: string | null;
  professionalIds?: string[] | null;
  serviceId?: string | null;
  date?: Date | null;
  appointmentId?: string | null;
}

const MERGED_PROFESSIONAL_LIMIT = 5;

const reasonMessages: Record<string, string> = {
  closed: 'Sem expediente nesta data.',
  blocked: 'Os horários desta data estão bloqueados.',
  schedule_not_configured: 'Jornada não configurada para esta data.',
  service_exceeds_workday: 'O serviço não cabe no expediente desta data.',
};

const availabilityErrorMessage = (message: string) => {
  if (message.includes('professional_unavailable')) return 'Este profissional não está disponível nesta unidade.';
  if (message.includes('service_unavailable_for_professional')) return 'Este serviço não está disponível com o profissional selecionado.';
  if (message.includes('service_unavailable')) return 'Este serviço não está disponível.';
  if (message.includes('invalid_schedule_configuration')) return 'A jornada possui uma configuração inválida.';
  if (message.includes('invalid_establishment_timezone')) return 'O fuso horário da unidade precisa ser corrigido.';
  return appointmentFeedbackMessages.availabilityLoadFailed;
};

const fetchSlotsForProfessional = async ({
  establishmentId,
  professionalId,
  serviceId,
  localDate,
  appointmentId,
}: {
  establishmentId: string;
  professionalId: string;
  serviceId: string;
  localDate: string;
  appointmentId?: string | null;
}) => {
  const availabilityResult = await supabase.rpc('get_available_slots', {
    target_establishment_id: establishmentId,
    target_professional_id: professionalId,
    target_service_id: serviceId,
    target_local_date: localDate,
    target_appointment_id: appointmentId ?? undefined,
  });
  let data: AvailabilityRpcRow[] | null = availabilityResult.data;
  let queryError: unknown = availabilityResult.error;

  if (isAvailabilityRpcMissing(availabilityResult.error)) {
    try {
      data = await fetchLegacyAvailableSlots({
        establishmentId,
        professionalId,
        serviceId,
        localDate,
        appointmentId: appointmentId ?? null,
      });
      queryError = null;
    } catch (fallbackError) {
      queryError = fallbackError;
    }
  }

  if (queryError) throw queryError;

  return (data || [])
    .filter((slot) => slot.starts_at && slot.local_time)
    .map((slot) => ({
      startsAt: slot.starts_at as string,
      localTime: slot.local_time as string,
      durationMinutes: Number(slot.duration_minutes),
      available: Boolean(slot.available),
      unavailableReason: slot.unavailable_reason,
      professionalId,
    }));
};

const mergeSlotRows = (rows: AvailableSlot[]) => {
  const byTime = new Map<string, AvailableSlot>();
  for (const slot of rows) {
    if (!slot.available) continue;
    if (!byTime.has(slot.localTime)) byTime.set(slot.localTime, slot);
  }
  return Array.from(byTime.values()).sort((a, b) => a.localTime.localeCompare(b.localTime));
};

export function useAvailableSlots({
  establishmentId,
  professionalId,
  professionalIds,
  serviceId,
  date,
  appointmentId,
}: UseAvailableSlotsOptions) {
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState('');
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const localDate = date ? formatCalendarDate(date) : null;
  const mergeTargets = (professionalIds ?? []).filter(Boolean).slice(0, MERGED_PROFESSIONAL_LIMIT);
  const targets = mergeTargets.length > 0
    ? mergeTargets
    : (professionalId ? [professionalId] : []);
  const targetKey = targets.join(',');
  const queryKey = establishmentId && targetKey && serviceId && localDate
    ? `${establishmentId}:${targetKey}:${serviceId}:${localDate}:${appointmentId || ''}`
    : null;

  const refresh = useCallback(async (appointmentIdOverride?: string | null): Promise<AvailableSlot[] | null> => {
    const currentRequest = ++requestId.current;
    if (!establishmentId || targets.length === 0 || !serviceId || !localDate) {
      setSlots([]);
      setError(null);
      setEmptyMessage('');
      setResolvedQueryKey(null);
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);

    try {
      const settled = await Promise.all(targets.map(async (targetProfessionalId) => {
        try {
          return await fetchSlotsForProfessional({
            establishmentId,
            professionalId: targetProfessionalId,
            serviceId,
            localDate,
            appointmentId: appointmentIdOverride ?? appointmentId ?? null,
          });
        } catch {
          return [] as AvailableSlot[];
        }
      }));

      const merged = targets.length === 1
        ? settled[0]
        : mergeSlotRows(settled.flat());
      const availableOnly = merged.filter((slot) => slot.available);
      const allPast = merged.length > 0 && merged.every((slot) => slot.unavailableReason === 'past');
      const allUnavailable = merged.length > 0 && merged.every((slot) => !slot.available);
      const computedEmptyMessage = (allPast ? 'O expediente desta data já encerrou.' : '')
        || (allUnavailable ? 'Agenda lotada nesta data.' : '')
        || 'Nenhum horário disponível nesta data.';

      if (currentRequest === requestId.current) {
        setSlots(merged);
        setEmptyMessage(availableOnly.length > 0 ? '' : computedEmptyMessage);
        setResolvedQueryKey(queryKey);
        setLoading(false);
      }
      return merged;
    } catch (queryError) {
      if (currentRequest === requestId.current) {
        console.error('[useAvailableSlots] Falha ao consultar disponibilidade:', queryError);
        setSlots([]);
        const queryErrorMessage = queryError instanceof Error
          ? queryError.message
          : String((queryError as { message?: string }).message || queryError);
        setError(availabilityErrorMessage(queryErrorMessage));
        setEmptyMessage('');
        setResolvedQueryKey(queryKey);
        setLoading(false);
      }
      return null;
    }
  }, [appointmentId, establishmentId, localDate, queryKey, serviceId, targetKey]);

  useEffect(() => {
    void refresh();
    if (!establishmentId || targets.length === 0 || !serviceId || !localDate) {
      return () => { requestId.current += 1; };
    }
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => {
      clearInterval(timer);
      requestId.current += 1;
    };
  }, [establishmentId, localDate, refresh, serviceId, targetKey]);

  const hasCurrentResult = Boolean(queryKey && resolvedQueryKey === queryKey);
  const currentSlots = hasCurrentResult ? slots : [];

  return {
    slots: currentSlots,
    availableSlots: currentSlots.filter((slot) => slot.available),
    loading: loading || Boolean(queryKey && !hasCurrentResult),
    error: hasCurrentResult ? error : null,
    emptyMessage: hasCurrentResult ? emptyMessage : '',
    refresh,
  };
}
