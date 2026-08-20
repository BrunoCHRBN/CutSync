import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { AppointmentQueryRow, AppointmentRecord, mapAppointment, parseProfessionalDailyFocus } from '@cutsync/database';
import { appointmentFeedbackMessages } from '@cutsync/domain';
import { webExperienceFlags } from '../config/experience-flags';

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
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
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
      setAppointments([]);
      setError(null);
      setResolvedQueryKey(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      if (professionalId && webExperienceFlags.professional_daily_focus_v2) {
        const { data: focusData, error: focusError } = await supabase.rpc('get_professional_daily_focus', {
          target_establishment_id: establishmentId,
        });
        if (!focusError) {
          const focus = parseProfessionalDailyFocus(focusData);
          if (!focus) throw new Error('invalid_professional_focus_response');
          const mappedFocus: AppointmentRecord[] = focus.map((item) => ({
            id: item.appointmentId,
            establishmentId,
            clientName: item.clientDisplayName,
            professionalId,
            serviceId: item.serviceId,
            dateTime: new Date(item.startsAt),
            updatedAt: item.updatedAt,
            durationMinutes: item.durationMinutes,
            priceCharged: 0,
            status: item.status,
            rescheduleCount: 0,
            allowedActions: item.allowedActions,
            client: { id: '', name: item.clientDisplayName, phone: null },
            professional: null,
            service: { id: item.serviceId, name: item.serviceName, price: 0, durationMinutes: item.durationMinutes },
          }));
          if (currentRequest === requestId.current) {
            setAppointment(mappedFocus[0] ?? null);
            setAppointments(mappedFocus);
            setError(null);
            setResolvedQueryKey(queryKey);
          }
          return;
        }
        const focusErrorText = JSON.stringify(focusError).toLowerCase();
        if (!focusErrorText.includes('pgrst202') && !focusErrorText.includes('could not find the function')) {
          throw focusError;
        }
      }
      let query = supabase
        .from('appointments')
        .select(`
          id, establishment_id, client_id, client_name, professional_id, service_id,
          date_time, ends_at, duration_minutes, status, cancellation_reason,
          cancellation_reason_code, cancelled_by_role, reschedule_count,
          original_date_time, created_at, updated_at, deleted_at,
          service:services(id,name,price,duration_minutes),
          establishment:establishments(id,name,slug,address,phone,timezone,currency)
        `)
        .eq('establishment_id', establishmentId)
        .in('status', ['pending', 'confirmed'])
        .gte('date_time', new Date().toISOString());

      if (professionalId) query = query.eq('professional_id', professionalId);

      const { data, error: queryError } = await query
        .order('date_time', { ascending: true })
        .limit(2);
      if (queryError) throw queryError;

      if (!data?.length) {
        if (currentRequest === requestId.current) {
          setAppointment(null);
          setAppointments([]);
          setError(null);
          setResolvedQueryKey(queryKey);
        }
        return;
      }

      const typedSupabase = supabase as unknown as { rpc: ParticipantNamesRpc };
      const { data: participantNames, error: participantError } = await typedSupabase.rpc(
        'get_appointment_participant_names',
        { target_appointment_ids: data.map((item) => item.id) },
      );
      if (participantError) throw participantError;

      const namesByAppointmentId = new Map(
        (participantNames || []).map((item) => [item.appointment_id, item]),
      );
      const mapped = data.map((item) => {
        const names = namesByAppointmentId.get(item.id);
        return mapAppointment({
          ...item,
          client: {
            id: item.client_id,
            name: names?.client_name || item.client_name || 'Cliente',
            phone: null,
          },
          professional: {
            id: item.professional_id,
            name: names?.professional_name || 'Profissional',
            phone: null,
          },
        } as AppointmentQueryRow);
      });

      if (currentRequest === requestId.current) {
        setAppointment(mapped[0] ?? null);
        setAppointments(mapped);
        setError(null);
        setResolvedQueryKey(queryKey);
      }
    } catch (queryError) {
      console.error('[useNextAppointment] Falha ao consultar próximo atendimento:', queryError);
      if (currentRequest === requestId.current) {
        setAppointment(null);
        setAppointments([]);
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
    appointments: hasCurrentResult ? appointments : [],
    loading: loading || Boolean(queryKey && !hasCurrentResult),
    error: hasCurrentResult ? error : null,
    refresh,
  };
}
