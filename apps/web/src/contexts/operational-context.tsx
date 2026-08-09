import {
  mapActiveContextReceipt,
  mapAuthorizedContext,
  type AuthorizedContext,
} from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { useAuth } from './AuthContext';
import { supabase } from '../services/supabase';
export {
  resolveWebOperationalSurface,
  type WebOperationalSurface,
} from '../features/access/web-operational-surface';

export type WebEstablishmentContext = AuthorizedContext & {
  contextKind: 'establishment';
  establishmentId: string;
  establishmentName: string;
  membershipId: string;
  membershipRole: 'admin' | 'professional';
  membershipStatus: 'active';
};

interface OperationalContextValue {
  contexts: WebEstablishmentContext[];
  authorizedContexts: AuthorizedContext[];
  activeEstablishmentId: string | null;
  activeContext: WebEstablishmentContext | null;
  activeAuthorizedContext: AuthorizedContext | null;
  loading: boolean;
  initialized: boolean;
  error: string | null;
  selectionRequired: boolean;
  selectEstablishment: (establishmentId: string) => Promise<boolean>;
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

const isEstablishmentContext = (
  context: AuthorizedContext,
): context is WebEstablishmentContext => (
  context.contextKind === 'establishment'
  && context.establishmentId !== null
  && context.establishmentName !== null
  && context.membershipId !== null
  && context.membershipRole !== null
  && context.membershipStatus === 'active'
);

export const OperationalContextProvider = ({ children }: { children: React.ReactNode }) => {
  const { user } = useAuth();
  const [authorizedContexts, setAuthorizedContexts] = useState<AuthorizedContext[]>([]);
  const [activeEstablishmentId, setActiveEstablishmentId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const refreshVersion = useRef(0);

  const refreshOperationalContexts = useCallback(async () => {
    if (!user) {
      setAuthorizedContexts([]);
      setActiveEstablishmentId(null);
      setLoading(false);
      setInitialized(true);
      setError(null);
      return;
    }
    const version = ++refreshVersion.current;
    setLoading(true);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)(
        'get_my_authorized_contexts',
        { target_app_id: 'web' },
      );
      if (rpcError) throw rpcError;
      const rows = Array.isArray(data) ? data : [];
      const nextAuthorized = rows.map(mapAuthorizedContext);
      if (nextAuthorized.some((context) => context === null)) {
        throw new Error('invalid_authorized_context_response');
      }
      const confirmed = nextAuthorized as AuthorizedContext[];
      const establishments = confirmed.filter(isEstablishmentContext);
      const serverActive = confirmed.find((context) => context.active) ?? null;
      const stored = readStoredContext(user.id);
      const suggested = serverActive
        ? serverActive.contextKind === 'establishment' ? serverActive.establishmentId : null
        : establishments.find((context) => context.establishmentId === stored)?.establishmentId
          ?? establishments[0]?.establishmentId
          ?? null;

      if (!serverActive && suggested) {
        const { data: receiptData, error: selectionError } = await (supabase.rpc as any)(
          'set_my_active_context',
          {
            target_app_id: 'web',
            target_context_kind: 'establishment',
            target_establishment_id: suggested,
            target_organization_id: null,
            target_request_id: createMobileRequestId(),
          },
        );
        if (selectionError || !mapActiveContextReceipt(receiptData)) {
          throw selectionError ?? new Error('invalid_active_context_receipt');
        }
      }
      if (version !== refreshVersion.current) return;
      setAuthorizedContexts(confirmed);
      setActiveEstablishmentId(suggested);
      if (suggested) storeContext(user.id, suggested);
      setError(null);
    } catch (cause) {
      if (version !== refreshVersion.current) return;
      setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar os contextos autorizados.');
      setAuthorizedContexts([]);
      setActiveEstablishmentId(null);
    } finally {
      if (version === refreshVersion.current) {
        setLoading(false);
        setInitialized(true);
      }
    }
  }, [user]);

  useEffect(() => {
    setInitialized(false);
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
  }, [refreshOperationalContexts, user]);

  const contexts = useMemo(
    () => authorizedContexts.filter(isEstablishmentContext),
    [authorizedContexts],
  );

  const selectEstablishment = useCallback(async (establishmentId: string) => {
    if (!user || !contexts.some((item) => item.establishmentId === establishmentId)) return false;
    setLoading(true);
    try {
      const { data, error: rpcError } = await (supabase.rpc as any)(
        'set_my_active_context',
        {
          target_app_id: 'web',
          target_context_kind: 'establishment',
          target_establishment_id: establishmentId,
          target_organization_id: null,
          target_request_id: createMobileRequestId(),
        },
      );
      if (rpcError || !mapActiveContextReceipt(data)) throw rpcError ?? new Error('invalid_active_context_receipt');
      setActiveEstablishmentId(establishmentId);
      setAuthorizedContexts((current) => current.map((context) => ({
        ...context,
        active: context.contextKind === 'establishment'
          && context.establishmentId === establishmentId,
      })));
      storeContext(user.id, establishmentId);
      setError(null);
      return true;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível alterar o contexto ativo.');
      await refreshOperationalContexts();
      return false;
    } finally {
      setLoading(false);
    }
  }, [contexts, refreshOperationalContexts, user]);

  const activeContext = useMemo(
    () => contexts.find((item) => item.establishmentId === activeEstablishmentId) ?? null,
    [activeEstablishmentId, contexts],
  );
  const activeAuthorizedContext = useMemo(
    () => authorizedContexts.find((context) => context.active)
      ?? activeContext,
    [activeContext, authorizedContexts],
  );

  const value = useMemo<OperationalContextValue>(() => ({
    contexts,
    authorizedContexts,
    activeEstablishmentId,
    activeContext,
    activeAuthorizedContext,
    loading,
    initialized,
    error,
    selectionRequired: contexts.length > 1 && !activeAuthorizedContext,
    selectEstablishment,
    refreshOperationalContexts,
  }), [
    activeAuthorizedContext,
    activeContext,
    activeEstablishmentId,
    authorizedContexts,
    contexts,
    error,
    initialized,
    loading,
    refreshOperationalContexts,
    selectEstablishment,
  ]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
};

export const useOperationalContext = () => {
  const value = useContext(Context);
  if (!value) throw new Error('useOperationalContext deve ser usado dentro de OperationalContextProvider');
  return value;
};
