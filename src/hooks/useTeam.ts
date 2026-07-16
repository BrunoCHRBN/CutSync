import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import type { Profile } from '../types/database';

/**
 * Hook para buscar e observar a equipe de um estabelecimento em tempo real via Supabase.
 *
 * @param establishmentId - O id do estabelecimento.
 * @param roles - Array de roles a filtrar (ex: ['professional', 'admin']). Se omitido, busca todos.
 */
export function useTeam(establishmentId: string | null | undefined, roles?: Profile['role'][]) {
  const [team, setTeam] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!establishmentId) { setTeam([]); setLoading(false); return; }
    try {
      let query = supabase
        .from('profiles')
        .select('*')
        .eq('establishment_id', establishmentId);
      if (roles && roles.length > 0) query = query.in('role', roles);
      query = query.order('name', { ascending: true });

      const { data, error: err } = await query;
      if (err) throw err;
      setTeam(data ?? []);
      setError(null);
    } catch (e: any) {
      console.error('[useTeam] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [establishmentId, JSON.stringify(roles)]);

  useEffect(() => {
    setLoading(true);
    fetch();

    if (!establishmentId) return;

    const channel = supabase
      .channel(`team-${establishmentId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'profiles',
          filter: `establishment_id=eq.${establishmentId}`,
        },
        () => fetch(),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [establishmentId, fetch]);

  return { team, loading, error, refresh: fetch };
}
