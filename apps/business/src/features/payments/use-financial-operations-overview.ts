import type { FinancialOperationsOverview } from '@cutsync/database';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { businessApi } from '@/services/business-api';

export function useFinancialOperationsOverview(localDate: string) {
  const { activeContext, hasCapability } = useBusinessOperational();
  const canView = hasCapability('view_payments') || hasCapability('view_cash');
  const [data, setData] = useState<FinancialOperationsOverview | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    setData(null);
    setError(null);
  }, [activeContext?.establishmentId, localDate]);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    if (!activeContext || !canView) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return null;
    }
    setIsLoading(true);
    setError(null);
    try {
      const next = await businessApi.getFinancialOperationsOverview(
        activeContext.establishmentId,
        localDate,
      );
      if (requestVersion.current === version) setData(next);
      return next;
    } catch {
      if (requestVersion.current === version) {
        setData(null);
        setError('Não foi possível carregar o resumo de recebimentos e caixa.');
      }
      return null;
    } finally {
      if (requestVersion.current === version) setIsLoading(false);
    }
  }, [activeContext, canView, localDate]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => { requestVersion.current += 1; };
  }, [refresh]));

  return { data, isLoading, error, canView, refresh };
}
