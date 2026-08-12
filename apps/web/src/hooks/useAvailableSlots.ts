import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import {
  type AvailabilityRpcRow,
  fetchLegacyAvailableSlots,
  isAvailabilityRpcMissing,
} from '../services/legacyAvailability';
import {
  type AvailabilityRecovery,
  appointmentFeedbackMessages,
  formatCalendarDate,
} from '@cutsync/domain';
import { webExperienceFlags } from '../config/experience-flags';
import { parseAvailabilityRecoveryRows } from '@cutsync/database';

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
  const [recovery, setRecovery] = useState<AvailabilityRecovery | null>(null);
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const localDate = date ? formatCalendarDate(date) : null;
  const requestedProfessionalKey = (professionalIds ?? [])
    .filter(Boolean)
    .slice(0, MERGED_PROFESSIONAL_LIMIT)
    .join(',');
  const targets = useMemo(
    () => requestedProfessionalKey
      ? requestedProfessionalKey.split(',')
      : (professionalId ? [professionalId] : []),
    [professionalId, requestedProfessionalKey],
  );
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
      setRecovery(null);
      setRecoveryLoading(false);
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
        setRecovery(null);
        setResolvedQueryKey(queryKey);
        setLoading(false);
      }
      if (
        availableOnly.length === 0
        && currentRequest === requestId.current
        && webExperienceFlags.client_availability_recovery_v2
      ) {
        setRecoveryLoading(true);
        void Promise.resolve(supabase.rpc('get_booking_availability_recovery', {
          target_establishment_id: establishmentId,
          target_professional_ids: targets,
          target_service_id: serviceId,
          target_local_date: localDate,
          target_appointment_id: appointmentIdOverride ?? appointmentId ?? undefined,
          search_days: 14,
        })).then(({ data, error: recoveryError }) => {
          if (recoveryError || currentRequest !== requestId.current) return;
          const rows = parseAvailabilityRecoveryRows(data);
          if (!rows) return;
          const nearbyDates = [...new Set(rows.map((row) => row.localDate))];
          const recoverySlots = rows.map((row) => ({
            startsAt: row.startsAt,
            localDate: row.localDate,
            localTime: row.localTime,
            durationMinutes: row.durationMinutes,
            professionalId: row.professionalId,
          }));
          const nextAvailableDate = nearbyDates.find((value) => value !== localDate) ?? nearbyDates[0] ?? null;
          setRecovery({
            requestedDate: localDate,
            requestedProfessionalIds: targets,
            slots: recoverySlots,
            nextAvailableDate,
            nearbyDates,
            alternativeProfessionalIds: [...new Set(recoverySlots.map((slot) => slot.professionalId))],
            strategy: recoverySlots.length === 0 ? 'none' : nextAvailableDate === localDate ? 'same_date' : 'next_date',
            emptyReason: recoverySlots.length === 0 ? 'no_availability_in_search_window' : null,
          });
        }).finally(() => {
          if (currentRequest === requestId.current) setRecoveryLoading(false);
        });
      } else if (currentRequest === requestId.current) {
        setRecoveryLoading(false);
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
        setRecovery(null);
        setRecoveryLoading(false);
        setResolvedQueryKey(queryKey);
        setLoading(false);
      }
      return null;
    }
  }, [appointmentId, establishmentId, localDate, queryKey, serviceId, targets]);

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
  }, [establishmentId, localDate, refresh, serviceId, targetKey, targets.length]);

  const hasCurrentResult = Boolean(queryKey && resolvedQueryKey === queryKey);
  const currentSlots = hasCurrentResult ? slots : [];

  return {
    slots: currentSlots,
    availableSlots: currentSlots.filter((slot) => slot.available),
    loading: loading || Boolean(queryKey && !hasCurrentResult),
    error: hasCurrentResult ? error : null,
    emptyMessage: hasCurrentResult ? emptyMessage : '',
    recovery: hasCurrentResult ? recovery : null,
    recoveryLoading: hasCurrentResult ? recoveryLoading : false,
    refresh,
  };
}
