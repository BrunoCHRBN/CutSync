import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { formatCalendarDate } from '../utils/dateTime';

export interface AvailableSlot {
  startsAt: string;
  localTime: string;
  durationMinutes: number;
  available: boolean;
  unavailableReason: string | null;
}

interface UseAvailableSlotsOptions {
  establishmentId?: string | null;
  professionalId?: string | null;
  serviceId?: string | null;
  date?: Date | null;
  appointmentId?: string | null;
}

const reasonMessages: Record<string, string> = {
  closed: 'Sem expediente nesta data.',
  schedule_not_configured: 'Jornada não configurada para esta data.',
  service_exceeds_workday: 'O serviço não cabe no expediente desta data.',
};

const availabilityErrorMessage = (message: string) => {
  if (message.includes('professional_unavailable')) return 'Este profissional não está disponível nesta unidade.';
  if (message.includes('service_unavailable_for_professional')) return 'Este serviço não está disponível com o profissional selecionado.';
  if (message.includes('service_unavailable')) return 'Este serviço não está disponível.';
  if (message.includes('invalid_schedule_configuration')) return 'A jornada possui uma configuração inválida.';
  if (message.includes('invalid_establishment_timezone')) return 'O fuso horário da unidade precisa ser corrigido.';
  return 'Não foi possível consultar os horários. Tente novamente.';
};

export function useAvailableSlots({
  establishmentId,
  professionalId,
  serviceId,
  date,
  appointmentId,
}: UseAvailableSlotsOptions) {
  const [slots, setSlots] = useState<AvailableSlot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState('');
  const requestId = useRef(0);
  const localDate = date ? formatCalendarDate(date) : null;

  const refresh = useCallback(async (): Promise<AvailableSlot[] | null> => {
    const currentRequest = ++requestId.current;
    if (!establishmentId || !professionalId || !serviceId || !localDate) {
      setSlots([]);
      setError(null);
      setEmptyMessage('');
      setLoading(false);
      return [];
    }

    setLoading(true);
    setError(null);
    const { data, error: queryError } = await supabase.rpc('get_available_slots', {
      target_establishment_id: establishmentId,
      target_professional_id: professionalId,
      target_service_id: serviceId,
      target_local_date: localDate,
      target_appointment_id: appointmentId || null,
    });

    if (queryError) {
      if (currentRequest === requestId.current) {
        console.error('[useAvailableSlots] Falha ao consultar disponibilidade:', queryError);
        setSlots([]);
        setError(availabilityErrorMessage(queryError.message));
        setEmptyMessage('');
        setLoading(false);
      }
      return null;
    }

    const mapped = (data || [])
      .filter((slot) => slot.starts_at && slot.local_time)
      .map((slot) => ({
        startsAt: slot.starts_at as string,
        localTime: slot.local_time as string,
        durationMinutes: Number(slot.duration_minutes),
        available: Boolean(slot.available),
        unavailableReason: slot.unavailable_reason,
      }));
    const availableSlots = mapped.filter((slot) => slot.available);
    const stateReason = (data || []).find((slot) => !slot.starts_at)?.unavailable_reason;
    const allPast = mapped.length > 0 && mapped.every((slot) => slot.unavailableReason === 'past');
    const allUnavailable = mapped.length > 0 && mapped.every((slot) => !slot.available);
    const computedEmptyMessage = reasonMessages[stateReason || '']
      || (allPast ? 'O expediente desta data já encerrou.' : '')
      || (allUnavailable ? 'Agenda lotada nesta data.' : '')
      || 'Nenhum horário disponível nesta data.';

    if (currentRequest === requestId.current) {
      setSlots(mapped);
      setEmptyMessage(
        availableSlots.length > 0
          ? ''
          : computedEmptyMessage,
      );
      setLoading(false);
    }
    return mapped;
  }, [appointmentId, establishmentId, localDate, professionalId, serviceId]);

  useEffect(() => {
    void refresh();
    if (!establishmentId || !professionalId || !serviceId || !localDate) {
      return () => { requestId.current += 1; };
    }
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => {
      clearInterval(timer);
      requestId.current += 1;
    };
  }, [establishmentId, localDate, professionalId, refresh, serviceId]);

  return {
    slots,
    availableSlots: slots.filter((slot) => slot.available),
    loading,
    error,
    emptyMessage,
    refresh,
  };
}