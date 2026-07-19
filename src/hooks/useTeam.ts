import { useEffect, useState, useCallback } from 'react';
import { supabase } from '../services/supabase';
import { mapProfile, ProfileRecord } from '../types/database';

/**
 * Hook para buscar e observar a equipe de um estabelecimento em tempo real via Supabase.
 *
 * @param establishmentId - O id do estabelecimento.
 * @param roles - Array de roles a filtrar (ex: ['professional', 'admin']). Se omitido, busca todos.
 */
export function useTeam(establishmentId?: string | null, rolesOrIncludeAdmin: ProfileRecord['role'][] | boolean = true) {
  const [team, setTeam] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const includeAdministrators = Array.isArray(rolesOrIncludeAdmin)
    ? rolesOrIncludeAdmin.includes('admin')
    : rolesOrIncludeAdmin;
  const requestedRolesKey = Array.isArray(rolesOrIncludeAdmin)
    ? rolesOrIncludeAdmin.join(',')
    : null;

  const fetch = useCallback(async () => {
    if (!establishmentId) { setTeam([]); setLoading(false); return; }
    try {
      const { data, error: err } = await supabase.rpc('get_establishment_team', {
        target_establishment_id: establishmentId,
        include_administrators: includeAdministrators,
      });
      if (err) throw err;
      const requestedRoles = requestedRolesKey === null
        ? null
        : requestedRolesKey.split(',') as ProfileRecord['role'][];
      const mapped: ProfileRecord[] = (data ?? []).map(mapProfile)
        .filter((member: ProfileRecord) => !requestedRoles || requestedRoles.includes(member.role));
      setTeam(mapped);
      setError(null);
    } catch (e: any) {
      console.error('[useTeam] Erro:', e);
      setError(e.message ?? 'Erro desconhecido');
    } finally {
      setLoading(false);
    }
  }, [establishmentId, includeAdministrators, requestedRolesKey]);

  useEffect(() => {
    setLoading(true);
    fetch();

    if (!establishmentId) return;

    const channel = supabase
      .channel(`team-${establishmentId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
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
