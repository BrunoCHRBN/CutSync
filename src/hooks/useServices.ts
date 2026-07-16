import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { mapService, ServiceRecord } from '../types/database';

export function useServices(establishmentId?: string | null, activeOnly = false) {
  const [services, setServices] = useState<ServiceRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(establishmentId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!establishmentId) { setServices([]); setLoading(false); return []; }
    setLoading(true);
    let query = supabase.from('services').select('*').eq('establishment_id', establishmentId).is('deleted_at', null).order('name');
    if (activeOnly) query = query.eq('is_active', true);
    const { data, error: queryError } = await query;
    setError(queryError?.message || null);
    const mapped = (data || []).map(mapService);
    setServices(mapped);
    setLoading(false);
    return mapped;
  }, [activeOnly, establishmentId]);

  useEffect(() => {
    void refresh();
    if (!establishmentId) return;
    const channel = supabase.channel(`services-${establishmentId}-${activeOnly}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services', filter: `establishment_id=eq.${establishmentId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [activeOnly, establishmentId, refresh]);

  return { services, loading, error, refresh };
}