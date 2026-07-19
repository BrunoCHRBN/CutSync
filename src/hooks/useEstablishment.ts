import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { Establishment, mapEstablishment } from '../types/database';

/**
 * Hook para buscar e observar um estabelecimento em tempo real via Supabase.
 *
 * @param identifier - O `id` ou `slug` do estabelecimento.
 * @param by - Campo a usar na busca ('id' | 'slug'). Default: 'id'.
 */
export function useEstablishment(identifier: string | null | undefined, by: 'id' | 'slug' = 'id') {
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!identifier) { setEstablishment(null); setLoading(false); return; }
    try {
      const { data, error: err } = await supabase
        .from('establishments')
        .select('*')
        .eq(by, identifier)
        .single();
      if (err) throw err;
      setEstablishment(mapEstablishment(data));
      setError(null);
    } catch (e: any) {
      console.error('[useEstablishment] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [identifier, by]);

  useEffect(() => {
    setLoading(true);
    fetch();

    if (!identifier) return;

    const filterValue = by === 'id' ? identifier : undefined;

    const channel = supabase
      .channel(`establishment-${identifier}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'establishments',
          ...(filterValue ? { filter: `id=eq.${filterValue}` } : {}),
        },
        () => fetch(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [identifier, by, fetch]);

  return { establishment, loading, error, refresh: fetch };
}
