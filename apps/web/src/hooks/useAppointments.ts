import { useEffect, useState, useCallback, useId } from 'react';
import { supabase } from '../services/supabase';
import { AppointmentRecord, mapAppointment } from '@cutsync/database';

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
  const channelInstanceId = useId().replace(/:/g, '');
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

      if (clientId && !establishmentId && !professionalId) {
        const { data, error: rpcError } = await (supabase.rpc as any)('get_client_appointments_v2');
        const requestedStatuses = statusFilter ? statusFilter.split(',') : [];
        if (rpcError) {
          // Compatibilidade de uma versão: consulta somente campos públicos enquanto
          // a RPC v2 ainda não foi aplicada no ambiente conectado.
          let legacyQuery = supabase.from('appointments').select(`
            id, establishment_id, client_id, professional_id, service_id, date_time,
            ends_at, duration_minutes, status, cancellation_reason, cancelled_by_role,
            reschedule_count, original_date_time, created_at, updated_at, deleted_at,
            service:services(id,name,price,duration_minutes),
            establishment:establishments(id,name,slug,address,phone,timezone,currency,min_cancellation_hours)
          `).eq('client_id', clientId);
          if (requestedStatuses.length > 0) legacyQuery = legacyQuery.in('status', requestedStatuses);
          const { data: legacyData, error: legacyError } = await legacyQuery.order('date_time', { ascending });
          if (legacyError) throw legacyError;
          const appointmentIds = (legacyData ?? []).map((row: any) => row.id);
          const { data: participantNames, error: participantError } = appointmentIds.length
            ? await supabase.rpc('get_appointment_participant_names', { target_appointment_ids: appointmentIds })
            : { data: [], error: null };
          if (participantError) throw participantError;
          const names = new Map((participantNames ?? []).map((item: any) => [item.appointment_id, item]));
          setAppointments((legacyData ?? []).map((row: any) => mapAppointment({
            ...row,
            professional: {
              id: row.professional_id,
              name: (names.get(row.id) as any)?.professional_name || 'Profissional',
            },
          })));
          setError(null);
          return;
        }
        const rows = (data ?? []).filter((row: any) => (
          requestedStatuses.length === 0 || requestedStatuses.includes(row.appointment_status)
        ));
        setAppointments(rows.map((row: any) => mapAppointment({
          id: row.appointment_id,
          establishment_id: row.establishment_id,
          client_id: clientId,
          client_name: null,
          professional_id: row.professional_id,
          service_id: row.service_id,
          date_time: row.starts_at,
          ends_at: row.starts_at,
          duration_minutes: row.service_duration_minutes || 0,
          status: row.appointment_status,
          cancellation_reason: null,
          cancellation_reason_code: row.cancellation_reason_code,
          cancelled_by_role: row.cancelled_by_role,
          reschedule_count: row.reschedule_count,
          original_date_time: null,
          created_at: row.starts_at,
          updated_at: row.starts_at,
          deleted_at: null,
          client: null,
          professional: { id: row.professional_id, name: row.professional_name, phone: null },
          service: { id: row.service_id, name: row.service_name, price: row.service_price, duration_minutes: row.service_duration_minutes },
          establishment: {
            id: row.establishment_id,
            name: row.establishment_name,
            slug: row.establishment_slug,
            address: row.establishment_address,
            phone: row.establishment_phone,
            timezone: row.establishment_timezone,
            currency: row.establishment_currency,
            min_cancellation_hours: row.min_cancellation_hours,
          },
        } as any)));
        setError(null);
        return;
      }

      let query = supabase.from('appointments').select(`
        id, establishment_id, client_id, client_name, professional_id, service_id,
        date_time, ends_at, duration_minutes, status, cancellation_reason,
        cancellation_reason_code, cancelled_by_role, reschedule_count,
        original_date_time, created_at, updated_at, deleted_at,
        service:services(id,name,price,duration_minutes),
        establishment:establishments(id,name,slug,address,phone,timezone,currency,min_cancellation_hours)
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

    const rangeKey = `${dateFrom ? Date.parse(dateFrom) : 'open'}-${dateTo ? Date.parse(dateTo) : 'open'}`;
    const channelName = `appointments-${establishmentId || professionalId || clientId || 'all'}-${rangeKey}-${channelInstanceId}`;

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
  }, [fetch, enabled, establishmentId, professionalId, clientId, dateFrom, dateTo, channelInstanceId]);

  return { appointments, loading, error, refresh: fetch };
}
