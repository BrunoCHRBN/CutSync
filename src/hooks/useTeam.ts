import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { mapProfile, ProfileRecord } from '../types/database';

export function useTeam(establishmentId?: string | null, includeAdmin = true) {
  const [team, setTeam] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(establishmentId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!establishmentId) { setTeam([]); setLoading(false); return []; }
    setLoading(true);
    const { data, error: queryError } = await supabase.rpc('get_establishment_team', {
      target_establishment_id: establishmentId,
      include_administrators: includeAdmin,
    });
    setError(queryError?.message || null);
    const mapped = (data || []).map(mapProfile);
    setTeam(mapped);
    setLoading(false);
    return mapped;
  }, [establishmentId, includeAdmin]);

  useEffect(() => {
    void refresh();
    if (!establishmentId) return;
    const channel = supabase.channel(`team-${establishmentId}-${includeAdmin}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `establishment_id=eq.${establishmentId}` }, refresh)
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [establishmentId, includeAdmin, refresh]);

  return { team, loading, error, refresh };
}