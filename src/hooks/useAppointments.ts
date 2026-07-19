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
  /** Carrega telefone de clientes por RPC exclusiva de admin/superadmin. */
  includeClientContacts?: boolean;
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
    includeClientContacts = false,
  } = options;

  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const statusFilter = statuses?.join(',') ?? '';

  const fetch = useCallback(async () => {
    if (!enabled) { setAppointments([]); setLoading(false); return; }
    try {
      if (dateFrom && Number.isNaN(Date.parse(dateFrom))) {
        throw new Error('Intervalo inicial de agendamentos inválido.');
      }
      if (dateTo && Number.isNaN(Date.parse(dateTo))) {
        throw new Error('Intervalo final de agendamentos inválido.');
      }
      if (dateFrom && dateTo && Date.parse(dateTo) < Date.parse(dateFrom)) {
        throw new Error('O fim do intervalo não pode ser anterior ao início.');
      }

      let query = supabase.from('appointments').select(`
        *,
        service:services(id,name,price,duration_minutes),
        establishment:establishments(id,name,slug,address,phone,timezone,currency)
      `);
      if (establishmentId) query = query.eq('establishment_id', establishmentId);
      if (professionalId) query = query.eq('professional_id', professionalId);
      if (clientId) query = query.eq('client_id', clientId);
      const requestedStatuses = statusFilter
        ? statusFilter.split(',') as AppointmentRecord['status'][]
        : [];
      if (requestedStatuses.length > 0) query = query.in('status', requestedStatuses);
      if (dateFrom) query = query.gte('date_time', dateFrom);
      if (dateTo) query = query.lte('date_time', dateTo);
      query = query.order(orderBy, { ascending });

      const { data, error: err } = await query;
      if (err) throw err;
      const appointmentIds = (data ?? []).map((row: any) => row.id);
      const { data: participantNames, error: participantError } = appointmentIds.length
        ? await supabase.rpc('get_appointment_participant_names', { target_appointment_ids: appointmentIds })
        : { data: [], error: null };
      if (participantError) throw participantError;
      const namesByAppointment = new Map((participantNames ?? []).map((item: any) => [item.appointment_id, item]));
      let clientPhones = new Map<string, string>();
      if (includeClientContacts && establishmentId) {
        const { data: contacts, error: contactsError } = await supabase.rpc('get_establishment_client_contacts', {
          target_establishment_id: establishmentId,
        });
        if (contactsError) throw contactsError;
        clientPhones = new Map((contacts ?? []).map((contact: any) => [contact.id, contact.phone || '']));
      }
      setAppointments((data ?? []).map((row: any) => mapAppointment({
        ...row,
        client: {
          id: row.client_id,
          name: (namesByAppointment.get(row.id) as any)?.client_name || 'Cliente',
          phone: clientPhones.get(row.client_id) || null,
        },
        professional: {
          id: row.professional_id,
          name: (namesByAppointment.get(row.id) as any)?.professional_name || 'Profissional',
        },
      })));
      setError(null);
    } catch (e: any) {
      console.error('[useAppointments] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [establishmentId, professionalId, clientId, statusFilter, dateFrom, dateTo, orderBy, ascending, enabled, includeClientContacts]);

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
  }, [fetch, enabled, establishmentId, professionalId, clientId]);

  return { appointments, loading, error, refresh: fetch };
}
