import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { Platform } from 'react-native';
import { OperationalContext } from '@cutsync/database';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';

interface OperationalContextValue {
  contexts: OperationalContext[];
  activeEstablishmentId: string | null;
  activeContext: OperationalContext | null;
  loading: boolean;
  error: string | null;
  selectionRequired: boolean;
  selectEstablishment: (establishmentId: string) => void;
  refreshOperationalContexts: () => Promise<void>;
}

const Context = createContext<OperationalContextValue | null>(null);

const storageKey = (userId: string) => `cutsync:operational-context:${userId}`;

const readStoredContext = (userId: string) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;
  return window.localStorage.getItem(storageKey(userId));
};

const storeContext = (userId: string, establishmentId: string) => {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  window.localStorage.setItem(storageKey(userId), establishmentId);
};

const mapContext = (row: Record<string, unknown>): OperationalContext => ({
  membershipId: String(row.membership_id),
  establishmentId: String(row.establishment_id),
  establishmentName: String(row.establishment_name),
  establishmentSlug: String(row.establishment_slug),
  membershipRole: row.membership_role === 'admin' ? 'admin' : 'professional',
  membershipStatus: row.membership_status === 'revoked' ? 'revoked' : 'active',
  commissionRate: Number(row.commission_rate ?? 0),
  establishmentStatus: String(row.establishment_status ?? 'pending_verification'),
});

export const OperationalContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [contexts, setContexts] = useState<OperationalContext[]>([]);
  const [activeEstablishmentId, setActiveEstablishmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refreshOperationalContexts = useCallback(async () => {
    if (!user) {
      setContexts([]);
      setActiveEstablishmentId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('get_my_operational_contexts');
      if (rpcError) throw rpcError;
      const next = ((data ?? []) as Record<string, unknown>[]).map(mapContext);
      const stored = readStoredContext(user.id);
      const currentIsValid = activeEstablishmentId
        ? next.some((item) => item.establishmentId === activeEstablishmentId)
        : false;
      const storedIsValid = stored ? next.some((item) => item.establishmentId === stored) : false;
      setContexts(next);
      setActiveEstablishmentId(
        currentIsValid ? activeEstablishmentId : storedIsValid ? stored : next.length === 1 ? next[0].establishmentId : null,
      );
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os estabelecimentos.');
    } finally {
      setLoading(false);
    }
  }, [activeEstablishmentId, user]);

  useEffect(() => {
    void refreshOperationalContexts();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`operational-memberships-${user.id}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'memberships',
        filter: `profile_id=eq.${user.id}`,
      }, () => { void refreshOperationalContexts(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectEstablishment = useCallback((establishmentId: string) => {
    if (!user || !contexts.some((item) => item.establishmentId === establishmentId)) return;
    setActiveEstablishmentId(establishmentId);
    storeContext(user.id, establishmentId);
  }, [contexts, user]);

  const activeContext = useMemo(
    () => contexts.find((item) => item.establishmentId === activeEstablishmentId) ?? null,
    [activeEstablishmentId, contexts],
  );

  const value = useMemo<OperationalContextValue>(() => ({
    contexts,
    activeEstablishmentId,
    activeContext,
    loading,
    error,
    selectionRequired: contexts.length > 1 && !activeContext,
    selectEstablishment,
    refreshOperationalContexts,
  }), [activeContext, activeEstablishmentId, contexts, error, loading, refreshOperationalContexts, selectEstablishment]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const useOperationalContext = () => {
  const value = useContext(Context);
  if (!value) throw new Error('useOperationalContext deve ser usado dentro de OperationalContextProvider');
  return value;
};
