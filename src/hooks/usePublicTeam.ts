import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { mapProfile, ProfileRecord } from '../types/database';

export function usePublicTeam(establishmentId?: string | null) {
  const [team, setTeam] = useState<ProfileRecord[]>([]);
  const [loading, setLoading] = useState(Boolean(establishmentId));
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!establishmentId) { setTeam([]); setLoading(false); return []; }
    setLoading(true);
    const { data, error: queryError } = await supabase.rpc('get_public_team', { target_establishment_id: establishmentId });
    setError(queryError?.message || null);
    const mapped = (data || []).map(mapProfile);
    setTeam(mapped);
    setLoading(false);
    return mapped;
  }, [establishmentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { team, loading, error, refresh };
}