import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../services/supabase';
import { mapPublicTeamMember, PublicTeamMember } from '@cutsync/database';

export function usePublicTeam(establishmentId?: string | null) {
  const [team, setTeam] = useState<PublicTeamMember[]>([]);
  const [loading, setLoading] = useState(Boolean(establishmentId));
  const [error, setError] = useState<string | null>(null);
  const [loadedEstablishmentId, setLoadedEstablishmentId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!establishmentId) {
      setTeam([]);
      setLoadedEstablishmentId(null);
      setLoading(false);
      return [];
    }
    setLoading(true);
    const { data, error: queryError } = await supabase.rpc('get_public_team', { target_establishment_id: establishmentId });
    setError(queryError?.message || null);
    const mapped = (data || []).map(mapPublicTeamMember);
    setTeam(mapped);
    setLoadedEstablishmentId(establishmentId);
    setLoading(false);
    return mapped;
  }, [establishmentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const changingEstablishment = Boolean(
    establishmentId && loadedEstablishmentId !== establishmentId,
  );

  return {
    team: changingEstablishment ? [] : team,
    loading: loading || changingEstablishment,
    error,
    refresh,
  };
}
