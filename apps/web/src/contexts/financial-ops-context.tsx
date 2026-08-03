import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  mapBusinessOperationalContext,
  type BusinessAccessMode,
  type BusinessCapability,
  type BusinessOperationalContext,
} from '@cutsync/database';
import { supabase } from '../services/supabase';
import { useOperationalContext } from './operational-context';

type FinancialOpsState = 'unknown' | 'disabled' | 'enabled';

interface FinancialOpsContextValue {
  context: BusinessOperationalContext | null;
  financialOpsEnabled: boolean;
  accessMode: BusinessAccessMode | null;
  hasCapability: (capability: BusinessCapability) => boolean;
  loading: boolean;
  state: FinancialOpsState;
  refresh: () => Promise<BusinessOperationalContext | null>;
  connectionError: boolean;
}

const Context = createContext<FinancialOpsContextValue | null>(null);

const errorText = (error: unknown) => {
  if (!error || typeof error !== 'object') return '';
  const record = error as Record<string, unknown>;
  return ['code', 'message', 'details', 'hint']
    .map((key) => record[key])
    .filter((value): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
};

const isMissingBusinessContextRpc = (error: unknown) => {
  const text = errorText(error);
  return text.includes('pgrst202') || text.includes('could not find the function');
};

const isNetworkError = (error: unknown) => {
  const text = errorText(error);
  if (text.includes('network') || text.includes('fetch') || text.includes('failed to fetch')) return true;
  return error instanceof TypeError;
};

const asRows = (data: unknown): unknown[] => (Array.isArray(data) ? data : []);

export function FinancialOpsProvider({ children }: React.PropsWithChildren) {
  const { activeEstablishmentId } = useOperationalContext();
  const [context, setContext] = useState<BusinessOperationalContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [state, setState] = useState<FinancialOpsState>('unknown');
  const [connectionError, setConnectionError] = useState(false);
  const lastValidContextRef = useRef<BusinessOperationalContext | null>(null);

  const refresh = useCallback(async () => {
    if (!activeEstablishmentId) {
      setContext(null);
      setState('disabled');
      setConnectionError(false);
      setLoading(false);
      lastValidContextRef.current = null;
      return null;
    }

    setLoading(true);
    if (!lastValidContextRef.current
      || lastValidContextRef.current.establishmentId !== activeEstablishmentId) {
      setState('unknown');
    }
    try {
      const { data, error } = await (supabase.rpc as any)('get_my_business_operational_contexts');
      if (error) throw error;

      const contexts = asRows(data).map(mapBusinessOperationalContext);
      if (contexts.some((item) => item === null)) {
        throw new Error('invalid_business_operational_context');
      }

      const next = (contexts as BusinessOperationalContext[])
        .find((item) => item.establishmentId === activeEstablishmentId) ?? null;
      lastValidContextRef.current = next;
      setContext(next);
      setState(next?.financialOpsEnabled ? 'enabled' : 'disabled');
      setConnectionError(false);
      return next;
    } catch (error) {
      if (isMissingBusinessContextRpc(error)) {
        lastValidContextRef.current = null;
        setContext(null);
        setState('disabled');
        setConnectionError(false);
        return null;
      }

      const lastValidForActive = lastValidContextRef.current?.establishmentId === activeEstablishmentId
        ? lastValidContextRef.current
        : null;
      setContext(lastValidForActive);
      setState(lastValidForActive ? (lastValidForActive.financialOpsEnabled ? 'enabled' : 'disabled') : 'unknown');
      setConnectionError(isNetworkError(error));
      return lastValidForActive;
    } finally {
      setLoading(false);
    }
  }, [activeEstablishmentId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const hasCapability = useCallback((capability: BusinessCapability) => (
    Boolean(context?.capabilities.includes(capability))
  ), [context]);

  const value = useMemo<FinancialOpsContextValue>(() => ({
    context,
    financialOpsEnabled: state === 'enabled' && Boolean(context?.financialOpsEnabled),
    accessMode: context?.accessMode ?? null,
    hasCapability,
    loading,
    state,
    refresh,
    connectionError,
  }), [connectionError, context, hasCapability, loading, refresh, state]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useFinancialOps() {
  const value = useContext(Context);
  if (!value) throw new Error('useFinancialOps deve ser usado dentro de FinancialOpsProvider');
  return value;
}
