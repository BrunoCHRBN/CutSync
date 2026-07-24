import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../services/supabase';
import { useOperationalContext } from './operational-context';

export interface BusinessAccessContext {
  establishment_id: string;
  membership_role: 'admin' | 'professional';
  billing_owner: boolean;
  account_status: string;
  billing_status: string;
  access_mode: 'full' | 'read_only' | 'blocked';
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  current_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  entitlements: string[];
}

interface BillingAccessValue {
  access: BusinessAccessContext | null;
  loading: boolean;
  connectionError: boolean;
  refresh: () => Promise<BusinessAccessContext | null>;
}

const Context = createContext<BillingAccessValue | null>(null);

export function BillingAccessProvider({ children }: React.PropsWithChildren) {
  const { activeContext, activeEstablishmentId } = useOperationalContext();
  const [access, setAccess] = useState<BusinessAccessContext | null>(null);
  const [loading, setLoading] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const refresh = useCallback(async () => {
    if (!activeEstablishmentId || !activeContext) {
      setAccess(null);
      setConnectionError(false);
      return null;
    }
    setLoading(true);
    try {
      const { data, error } = await (supabase.rpc as any)('get_my_business_access_context', {
        target_establishment_id: activeEstablishmentId,
      });
      if (error) throw error;
      const next = (Array.isArray(data) ? data[0] : data) as BusinessAccessContext | null;
      if (next) setAccess(next);
      setConnectionError(false);
      return next;
    } catch {
      // A network error never converts a previously active account into a local restriction.
      setConnectionError(true);
      return null;
    } finally {
      setLoading(false);
    }
  }, [activeContext, activeEstablishmentId]);

  useEffect(() => { void refresh(); }, [refresh]);

  const value = useMemo(
    () => ({ access, loading, connectionError, refresh }),
    [access, loading, connectionError, refresh],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBillingAccess() {
  const value = useContext(Context);
  if (!value) throw new Error('useBillingAccess deve ser usado dentro de BillingAccessProvider');
  return value;
}
