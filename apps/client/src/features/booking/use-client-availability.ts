import { useCallback, useEffect, useRef, useState } from 'react';

import {
  type ClientAvailableSlot,
  loadClientAvailableSlots,
} from '@/features/booking/client-booking-service';

interface ClientAvailabilitySelection {
  establishmentId: string | null;
  professionalId: string | null;
  serviceId: string | null;
  localDate: string | null;
}

export function useClientAvailability(selection: ClientAvailabilitySelection) {
  const { establishmentId, professionalId, serviceId, localDate } = selection;
  const requestSequence = useRef(0);
  const [slots, setSlots] = useState<ClientAvailableSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState('');

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!establishmentId || !professionalId || !serviceId || !localDate) {
      setSlots([]);
      setError(null);
      setEmptyMessage('');
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await loadClientAvailableSlots({ establishmentId, professionalId, serviceId, localDate });
      if (sequence !== requestSequence.current) return null;
      setSlots(result.slots);
      setEmptyMessage(result.emptyMessage);
      return result.slots;
    } catch (nextError) {
      if (sequence !== requestSequence.current) return null;
      setSlots([]);
      setEmptyMessage('');
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível consultar os horários.');
      return null;
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [establishmentId, localDate, professionalId, serviceId]);

  useEffect(() => {
    void refresh();
    const hasSelection = Boolean(
      establishmentId
      && professionalId
      && serviceId
      && localDate,
    );
    if (!hasSelection) return () => { requestSequence.current += 1; };
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => {
      clearInterval(timer);
      requestSequence.current += 1;
    };
  }, [establishmentId, localDate, professionalId, refresh, serviceId]);

  return { slots, isLoading, error, emptyMessage, refresh };
}
