import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { AppointmentRecord, mapAppointment } from '../types/database';

interface AppointmentFilters {
  establishmentId?: string | null;
  clientId?: string | null;
  professionalId?: string | null;
  start?: Date | null;
  end?: Date | null;
  excludeCancelled?: boolean;
}

const relations = `*, client:profiles!appointments_client_id_fkey(id,name,phone), professional:profiles!appointments_professional_id_fkey(id,name,phone), service:services!appointments_service_id_fkey(id,establishment_id,name,price,duration_minutes,is_active), establishment:establishments!appointments_establishment_id_fkey(id,name,slug,address,phone,timezone,currency)`;

export function useAppointments(filters: AppointmentFilters) {
  const [appointments, setAppointments] = useState<AppointmentRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const startIso = filters.start?.toISOString();
  const endIso = filters.end?.toISOString();

  const refresh = useCallback(async () => {
    if (!filters.establishmentId && !filters.clientId && !filters.professionalId) {
      setAppointments([]); setLoading(false); return [];
    }
    setLoading(true);
    let query = supabase.from('appointments').select(relations).is('deleted_at', null).order('date_time');
    if (filters.establishmentId) query = query.eq('establishment_id', filters.establishmentId);
    if (filters.clientId) query = query.eq('client_id', filters.clientId);
    if (filters.professionalId) query = query.eq('professional_id', filters.professionalId);
    if (startIso) query = query.gte('date_time', startIso);
    if (endIso) query = query.lte('date_time', endIso);
    if (filters.excludeCancelled) query = query.neq('status', 'cancelled');
    const { data, error: queryError } = await query;
    setError(queryError?.message || null);
    const mapped = (data || []).map(mapAppointment);
    setAppointments(mapped);
    setLoading(false);
    return mapped;
  }, [filters.clientId, filters.establishmentId, filters.excludeCancelled, filters.professionalId, startIso, endIso]);

  useEffect(() => {
    void refresh();
    const filter = filters.establishmentId ? `establishment_id=eq.${filters.establishmentId}`
      : filters.clientId ? `client_id=eq.${filters.clientId}`
      : filters.professionalId ? `professional_id=eq.${filters.professionalId}` : undefined;
    if (!filter) return;
    const channel = supabase.channel(`appointments-${filter}-${startIso || 'all'}-${endIso || 'all'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [endIso, filters.clientId, filters.establishmentId, filters.professionalId, refresh, startIso]);

  return { appointments, loading, error, refresh };
}