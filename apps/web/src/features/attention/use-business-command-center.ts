import type { AttentionItem } from '@cutsync/domain';
import { parseBusinessCommandCenter } from '@cutsync/database';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../services/supabase';

const parseItems = (value: unknown): AttentionItem[] | null => {
  const parsed = parseBusinessCommandCenter(value);
  return parsed?.items.map((item) => ({ ...item, destination: item.route })) ?? null;
};

export function useBusinessCommandCenter(input: {
  establishmentId: string | null;
  localDate: string;
  enabled: boolean;
}) {
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!input.enabled || !input.establishmentId) {
      setItems([]);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_business_command_center', {
        target_establishment_id: input.establishmentId,
        target_local_date: input.localDate,
      });
      if (rpcError) throw rpcError;
      const parsed = parseItems(data);
      if (!parsed) throw new Error('invalid_business_command_center_response');
      if (requestVersion.current !== version) return;
      setItems(parsed);
      setError(null);
    } catch (cause) {
      if (requestVersion.current !== version) return;
      setItems([]);
      setError(cause instanceof Error ? cause.message : 'command_center_unavailable');
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [input.enabled, input.establishmentId, input.localDate]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  return { items, loading, error, refresh };
}
