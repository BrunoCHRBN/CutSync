import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import type { Service } from '../types/database';

/**
 * Hook para buscar e observar serviços de um estabelecimento em tempo real via Supabase.
 *
 * @param establishmentId - O id do estabelecimento.
 * @param activeOnly - Se true, retorna apenas serviços ativos (is_active = true). Default: false.
 */
export function useServices(establishmentId: string | null | undefined, activeOnly = false) {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!establishmentId) { setServices([]); setLoading(false); return; }
    try {
      let query = supabase
        .from('services')
        .select('*')
        .eq('establishment_id', establishmentId);
      if (activeOnly) query = query.eq('is_active', true);
      query = query.order('name', { ascending: true });

      const { data, error: err } = await query;
      if (err) throw err;
      setServices(data ?? []);
      setError(null);
    } catch (e: any) {
      console.error('[useServices] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [establishmentId, activeOnly]);

  useEffect(() => {
    setLoading(true);
    fetch();

    if (!establishmentId) return;

    const channel = supabase
      .channel(`services-${establishmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'services',
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => fetch(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [establishmentId, fetch]);

  return { services, loading, error, refresh: fetch };
}
