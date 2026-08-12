import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  type ClientAvailableSlot,
  loadClientAvailability,
  loadClientAvailabilityRecovery,
} from '@/features/booking/client-booking-service';
import type { AvailabilityRecovery } from '@cutsync/domain';
import { clientExperienceFlags } from '@/config/experience-flags';

interface ClientAvailabilitySelection {
  establishmentId: string | null;
  professionalIds: string[];
  serviceId: string | null;
  localDate: string | null;
  appointmentId?: string | null;
}

export function useClientAvailability(selection: ClientAvailabilitySelection) {
  const { establishmentId, professionalIds, serviceId, localDate, appointmentId } = selection;
  const requestSequence = useRef(0);
  const [slots, setSlots] = useState<ClientAvailableSlot[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emptyMessage, setEmptyMessage] = useState('');
  const [recovery, setRecovery] = useState<AvailabilityRecovery | null>(null);
  const [isRecoveryLoading, setIsRecoveryLoading] = useState(false);

  // Identity of the array changes on every render, so the effect keys off the
  // ids themselves instead of the array reference.
  const professionalKey = professionalIds.join(',');

  const targets = useMemo(
    () => professionalKey ? professionalKey.split(',') : [],
    [professionalKey],
  );

  const refresh = useCallback(async () => {
    const sequence = ++requestSequence.current;
    if (!establishmentId || targets.length === 0 || !serviceId || !localDate) {
      setSlots([]);
      setError(null);
      setEmptyMessage('');
      setRecovery(null);
      setIsRecoveryLoading(false);
      setIsLoading(false);
      return [];
    }

    setIsLoading(true);
    setError(null);
    try {
      const result = await loadClientAvailability({
        establishmentId,
        professionalIds: targets,
        serviceId,
        localDate,
        appointmentId,
      });
      if (sequence !== requestSequence.current) return null;
      setSlots(result.slots);
      setEmptyMessage(result.emptyMessage);
      setRecovery(null);
      if (result.slots.length === 0 && clientExperienceFlags.client_availability_recovery_v2) {
        setIsRecoveryLoading(true);
        void loadClientAvailabilityRecovery({
          establishmentId,
          professionalIds: targets,
          serviceId,
          localDate,
          appointmentId,
        }).then((nextRecovery) => {
          if (sequence === requestSequence.current) setRecovery(nextRecovery);
        }).catch(() => {
          if (sequence === requestSequence.current) setRecovery(null);
        }).finally(() => {
          if (sequence === requestSequence.current) setIsRecoveryLoading(false);
        });
      } else {
        setIsRecoveryLoading(false);
      }
      return result.slots;
    } catch (nextError) {
      if (sequence !== requestSequence.current) return null;
      setSlots([]);
      setEmptyMessage('');
      setRecovery(null);
      setIsRecoveryLoading(false);
      setError(nextError instanceof Error ? nextError.message : 'Não foi possível consultar os horários.');
      return null;
    } finally {
      if (sequence === requestSequence.current) setIsLoading(false);
    }
  }, [appointmentId, establishmentId, localDate, serviceId, targets]);

  useEffect(() => {
    void refresh();
    const hasSelection = Boolean(
      establishmentId
      && targets.length > 0
      && serviceId
      && localDate,
    );
    if (!hasSelection) return () => { requestSequence.current += 1; };
    const timer = setInterval(() => { void refresh(); }, 15_000);
    return () => {
      clearInterval(timer);
      requestSequence.current += 1;
    };
  }, [establishmentId, localDate, refresh, serviceId, targets]);

  return { slots, isLoading, error, emptyMessage, recovery, isRecoveryLoading, refresh };
}
