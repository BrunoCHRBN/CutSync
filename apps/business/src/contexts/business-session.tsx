import type { Session } from '@supabase/supabase-js';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { shouldAutoRefresh, supabase } from '@/lib/supabase';

export interface BusinessAccess {
  establishment_id: string;
  membership_role: 'admin' | 'professional';
  billing_owner: boolean;
  billing_status: string;
  access_mode: 'full' | 'read_only' | 'blocked';
  trial_ends_at: string | null;
  grace_ends_at: string | null;
  current_period_ends_at: string | null;
}

interface Value {
  session: Session | null;
  access: BusinessAccess | null;
  loading: boolean;
  checking: boolean;
  connectionError: boolean;
  signIn: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  verifyAgain: () => Promise<void>;
}

const Context = createContext<Value | null>(null);

export function BusinessSessionProvider({ children }: React.PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [access, setAccess] = useState<BusinessAccess | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [connectionError, setConnectionError] = useState(false);

  const fetchAccess = useCallback(async (nextSession = session) => {
    if (!supabase || !nextSession) {
      setAccess(null);
      return;
    }
    setChecking(true);
    try {
      const { data: contexts, error: contextsError } = await (supabase.rpc as any)('get_my_operational_contexts');
      if (contextsError) throw contextsError;
      const membership = (contexts as Record<string, unknown>[] | null)?.[0];
      if (!membership?.establishment_id) throw new Error('business_membership_required');
      const { data, error } = await (supabase.rpc as any)('get_my_business_access_context', {
        target_establishment_id: membership.establishment_id,
      });
      if (error) throw error;
      const next = (Array.isArray(data) ? data[0] : data) as BusinessAccess | null;
      if (next) setAccess(next);
      setConnectionError(false);
    } catch {
      // Keep the last server-confirmed rights during connectivity failures.
      setConnectionError(true);
    } finally {
      setChecking(false);
    }
  }, [session]);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      if (!next) setAccess(null);
    });
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      return fetchAccess(data.session);
    }).finally(() => setLoading(false));

    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        if (shouldAutoRefresh) supabase?.auth.startAutoRefresh();
        void fetchAccess();
      } else if (shouldAutoRefresh) supabase?.auth.stopAutoRefresh();
    });
    return () => {
      subscription.unsubscribe();
      appState.remove();
      if (shouldAutoRefresh) supabase?.auth.stopAutoRefresh();
    };
  }, [fetchAccess]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) return 'Ambiente não configurado.';
    const { data, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error) return 'E-mail ou senha inválidos.';
    setSession(data.session);
    await fetchAccess(data.session);
    return null;
  }, [fetchAccess]);

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut();
    setSession(null);
    setAccess(null);
  }, []);
  const verifyAgain = useCallback(async () => { await fetchAccess(); }, [fetchAccess]);

  const value = useMemo(() => ({
    session, access, loading, checking, connectionError, signIn, signOut, verifyAgain,
  }), [access, checking, connectionError, loading, session, signIn, signOut, verifyAgain]);
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useBusinessSession() {
  const value = useContext(Context);
  if (!value) throw new Error('useBusinessSession requer BusinessSessionProvider');
  return value;
}
