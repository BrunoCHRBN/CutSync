import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';

const STORAGE_KEY = 'cutsync.client.favorites';
const isMissingRpc = (err: any) => err?.code === 'PGRST202' || /function .*does not exist|schema cache/i.test(err?.message || '');

const readLocal = (): string[] => {
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [];
  } catch {
    return [];
  }
};

const writeLocal = (ids: string[]) => {
  try {
    if (typeof localStorage !== 'undefined') localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // storage indisponível — mantém apenas em memória
  }
};

export function useClientFavorites(enabled = true) {
  const [favoriteIds, setFavoriteIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [localMode, setLocalMode] = useState(false);

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
    } catch (cause) {
      if (isMissingRpc(cause)) {
        setLocalMode(true);
        setFavoriteIds(readLocal());
        setError(null);
      } else {
        setError('Não foi possível carregar seus salvos.');
      }
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
    setFavoriteIds((current) => {
      const next = nextFavorited
        ? [establishmentId, ...current.filter((id) => id !== establishmentId)]
        : current.filter((id) => id !== establishmentId);
      if (localMode) writeLocal(next);
      return next;
    });

    if (localMode) {
      setError(null);
      return nextFavorited;
    }

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
    } catch (cause) {
      if (isMissingRpc(cause)) {
        setLocalMode(true);
        setFavoriteIds((current) => {
          const next = nextFavorited
            ? [establishmentId, ...current.filter((id) => id !== establishmentId)]
            : current.filter((id) => id !== establishmentId);
          writeLocal(next);
          return next;
        });
        setError(null);
        return nextFavorited;
      }
      setFavoriteIds((current) => (
        nextFavorited
          ? current.filter((id) => id !== establishmentId)
          : [establishmentId, ...current.filter((id) => id !== establishmentId)]
      ));
      setError('Não foi possível atualizar seus salvos.');
      return favoriteSet.has(establishmentId);
    }
  }, [favoriteSet, localMode]);

  return {
    favoriteIds,
    loading,
    error,
    isFavorite,
    toggleFavorite,
    refresh,
  };
}
