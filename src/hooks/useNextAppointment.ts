import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { AppointmentQueryRow, AppointmentRecord, mapAppointment } from '../types/database';
import { appointmentFeedbackMessages } from '../utils/appointmentErrors';

interface UseNextAppointmentOptions {
  establishmentId?: string | null;
  professionalId?: string | null;
  enabled?: boolean;
}

interface ParticipantName {
  appointment_id: string;
  client_name: string | null;
  professional_name: string | null;
}

type ParticipantNamesRpc = (
  functionName: 'get_appointment_participant_names',
  args: { target_appointment_ids: string[] },
) => Promise<{ data: ParticipantName[] | null; error: unknown | null }>;

export function useNextAppointment({
  establishmentId,
  professionalId,
  enabled = true,
}: UseNextAppointmentOptions) {
  const [appointment, setAppointment] = useState<AppointmentRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedQueryKey, setResolvedQueryKey] = useState<string | null>(null);
  const requestId = useRef(0);
  const channelInstanceId = useId().replace(/:/g, '');
  const queryKey = establishmentId
    ? `${establishmentId}:${professionalId || 'all'}`
    : null;

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!enabled || !establishmentId) {
      setAppointment(null);
      setError(null);
      setResolvedQueryKey(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      let query = supabase
        .from('appointments')
        .select(`
          *,
          service:services(id,name,price,duration_minutes),
          establishment:establishments(id,name,slug,address,phone,timezone,currency)
        `)
        .eq('establishment_id', establishmentId)
        .in('status', ['pending', 'confirmed'])
        .gte('date_time', new Date().toISOString());

      if (professionalId) query = query.eq('professional_id', professionalId);

      const { data, error: queryError } = await query
        .order('date_time', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (queryError) throw queryError;

      if (!data) {
        if (currentRequest === requestId.current) {
          setAppointment(null);
          setError(null);
          setResolvedQueryKey(queryKey);
        }
        return;
      }

      const typedSupabase = supabase as unknown as { rpc: ParticipantNamesRpc };
      const { data: participantNames, error: participantError } = await typedSupabase.rpc(
        'get_appointment_participant_names',
        { target_appointment_ids: [data.id] },
      );
      if (participantError) throw participantError;

      const names = participantNames?.[0];
      const mapped = mapAppointment({
        ...data,
        client: {
          id: data.client_id,
          name: names?.client_name || data.client_name || 'Cliente',
          phone: null,
        },
        professional: {
          id: data.professional_id,
          name: names?.professional_name || 'Profissional',
          phone: null,
        },
      } as AppointmentQueryRow);

      if (currentRequest === requestId.current) {
        setAppointment(mapped);
        setError(null);
        setResolvedQueryKey(queryKey);
      }
    } catch (queryError) {
      console.error('[useNextAppointment] Falha ao consultar próximo atendimento:', queryError);
      if (currentRequest === requestId.current) {
        setAppointment(null);
        setError(appointmentFeedbackMessages.nextAppointmentLoadFailed);
        setResolvedQueryKey(queryKey);
      }
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }, [enabled, establishmentId, professionalId, queryKey]);

  useEffect(() => {
    void refresh();
    if (!enabled || !establishmentId) return () => { requestId.current += 1; };

    const realtimeFilter = professionalId
      ? `professional_id=eq.${professionalId}`
      : `establishment_id=eq.${establishmentId}`;
    const channel = supabase
      .channel(`next-appointment-${professionalId || establishmentId}-${channelInstanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'appointments', filter: realtimeFilter },
        () => { void refresh(); },
      )
      .subscribe();

    return () => {
      requestId.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [channelInstanceId, enabled, establishmentId, professionalId, refresh]);

  const hasCurrentResult = Boolean(queryKey && resolvedQueryKey === queryKey);

  return {
    appointment: hasCurrentResult ? appointment : null,
    loading: loading || Boolean(queryKey && !hasCurrentResult),
    error: hasCurrentResult ? error : null,
    refresh,
  };
}
