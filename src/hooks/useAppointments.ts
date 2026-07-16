import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { AppointmentRecord, mapAppointment } from '../types/database';

interface UseAppointmentsOptions {
  /** Filtrar por establishment_id */
  establishmentId?: string | null;
  /** Filtrar por professional_id */
  professionalId?: string | null;
  /** Filtrar por client_id */
  clientId?: string | null;
  /** Filtrar por status (array) */
  statuses?: AppointmentRecord['status'][];
  /** Filtrar por data mínima (ISO string) */
  dateFrom?: string;
  /** Filtrar por data máxima (ISO string) */
  dateTo?: string;
  /** Ordenar por campo */
  orderBy?: string;
  /** Direção da ordenação */
  ascending?: boolean;
  /** Desabilitar o hook (sem busca) */
  enabled?: boolean;
}

/**
 * Hook para buscar e observar agendamentos em tempo real via Supabase.
 */
export function useAppointments(options: UseAppointmentsOptions = {}) {
  const {
    establishmentId,
    professionalId,
    clientId,
    statuses,
    dateFrom,
    dateTo,
    orderBy = 'date_time',
    ascending = true,
    enabled = true,
  } = options;

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!enabled) { setAppointments([]); setLoading(false); return; }
    try {
      let query = supabase.from('appointments').select(`
        *,
        client:profiles!client_id(id,name,phone,avatar_url),
        professional:profiles!professional_id(id,name,phone,avatar_url),
        service:services(id,name,price,duration_minutes),
        establishment:establishments(id,name,slug,address,phone,timezone,currency)
      `);
      if (establishmentId) query = query.eq('establishment_id', establishmentId);
      if (professionalId) query = query.eq('professional_id', professionalId);
      if (clientId) query = query.eq('client_id', clientId);
      if (statuses && statuses.length > 0) query = query.in('status', statuses);
      if (dateFrom) query = query.gte('date_time', dateFrom);
      if (dateTo) query = query.lte('date_time', dateTo);
      query = query.order(orderBy, { ascending });

      const { data, error: err } = await query;
      if (err) throw err;
      setAppointments((data ?? []).map(mapAppointment));
      setError(null);
    } catch (e: any) {
      console.error('[useAppointments] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [establishmentId, professionalId, clientId, JSON.stringify(statuses), dateFrom, dateTo, orderBy, ascending, enabled]);

  useEffect(() => {
    setLoading(true);
    fetch();

    if (!enabled) return;

    // Decidir o filtro do canal Realtime — usamos o filtro mais restritivo disponível
    const realtimeFilter = establishmentId
      ? `establishment_id=eq.${establishmentId}`
      : professionalId
        ? `professional_id=eq.${professionalId}`
        : clientId
          ? `client_id=eq.${clientId}`
          : undefined;

    const channelName = `appointments-${establishmentId || professionalId || clientId || 'all'}-${Date.now()}`;

    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'appointments',
          ...(realtimeFilter ? { filter: realtimeFilter } : {}),
        },
        () => fetch(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [fetch, enabled]);

  return { appointments, loading, error, refresh: fetch };
}
