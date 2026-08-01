import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';

export function useClientFavorites(enabled = true) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setFavoriteIds([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)('list_client_favorite_establishments');
      if (rpcError) throw rpcError;
      const ids = (data ?? []).map((row: { establishment_id: string }) => row.establishment_id);
      setFavoriteIds(ids);
      setError(null);
    } catch {
      setError('Não foi possível carregar seus salvos.');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const isFavorite = useCallback((establishmentId: string) => favoriteSet.has(establishmentId), [favoriteSet]);

  const toggleFavorite = useCallback(async (establishmentId: string) => {
    const nextFavorited = !favoriteSet.has(establishmentId);
    setFavoriteIds((current) => (
      nextFavorited
        ? [establishmentId, ...current.filter((id) => id !== establishmentId)]
        : current.filter((id) => id !== establishmentId)
    ));

    try {
      const { data, error: rpcError } = await (supabase.rpc as any)('set_client_favorite_establishment', {
        target_establishment_id: establishmentId,
        target_favorited: nextFavorited,
      });
      if (rpcError) throw rpcError;
      const confirmed = Boolean(data);
      setFavoriteIds((current) => (
        confirmed
          ? [establishmentId, ...current.filter((id) => id !== establishmentId)]
          : current.filter((id) => id !== establishmentId)
      ));
      setError(null);
      return confirmed;
    } catch {
      setFavoriteIds((current) => (
        nextFavorited
          ? current.filter((id) => id !== establishmentId)
          : [establishmentId, ...current.filter((id) => id !== establishmentId)]
      ));
      setError('Não foi possível atualizar seus salvos.');
      return favoriteSet.has(establishmentId);
    }
  }, [favoriteSet]);

  return {
    favoriteIds,
    loading,
    error,
    isFavorite,
    toggleFavorite,
    refresh,
  };
}
