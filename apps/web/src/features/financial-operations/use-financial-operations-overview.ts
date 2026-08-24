import {
  createFinancialOperationsApi,
  type FinancialOperationsOverview,
} from '@cutsync/database';
import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../../services/supabase';

const financialOperationsApi = createFinancialOperationsApi(supabase);

export function useFinancialOperationsOverview(input: {
  establishmentId: string | null;
  localDate: string;
  enabled: boolean;
}) {
  const [data, setData] = useState<FinancialOperationsOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!input.enabled || !input.establishmentId) {
      setData(null);
      setError(null);
      setLoading(false);
      return null;
    }
    setLoading(true);
    setError(null);
    try {
      const next = await financialOperationsApi.getOverview(
        input.establishmentId,
        input.localDate,
      );
      if (requestVersion.current === version) setData(next);
      return next;
    } catch {
      if (requestVersion.current === version) {
        setData(null);
        setError('Não foi possível carregar recebimentos e caixa.');
      }
      return null;
    } finally {
      if (requestVersion.current === version) setLoading(false);
    }
  }, [input.enabled, input.establishmentId, input.localDate]);

  useEffect(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]);

  return { data, loading, error, refresh };
}
