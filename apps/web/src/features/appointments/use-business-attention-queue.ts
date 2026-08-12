import type { DecisionQueueItem } from '@cutsync/database';
import { useCallback, useEffect, useRef, useState } from 'react';

import { webReassignmentApi } from './reassignment-api';

export function useBusinessAttentionQueue(
  establishmentId: string | null,
  enabled: boolean,
) {
  const [items, setItems] = useState<DecisionQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!enabled || !establishmentId) {
      setItems([]);
      setLoading(false);
      setError(null);
      return;
    }
    setLoading(true);
    try {
      const next = await webReassignmentApi.listQueue(establishmentId);
      if (requestVersion.current !== version) return;
      setItems(next);
      setError(null);
    } catch (cause) {
      if (requestVersion.current !== version) return;
      setItems([]);
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as pendências.');
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [enabled, establishmentId]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  return { items, loading, error, refresh };
}
