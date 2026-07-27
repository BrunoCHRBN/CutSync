import type {
  BusinessCapability,
  BusinessOperationalContext,
} from '@cutsync/database';
import {
  AppState,
} from 'react-native';
import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import { useBusinessSession } from '@/contexts/business-session';
import { resolveActiveEstablishmentId } from '@/features/access/business-access';
import { activeEstablishmentStorage } from '@/lib/active-establishment-storage';
import { businessApi, BusinessApiError } from '@/services/business-api';

interface BusinessOperationalValue {
  contexts: BusinessOperationalContext[];
  activeEstablishmentId: string | null;
  activeContext: BusinessOperationalContext | null;
  isLoading: boolean;
  isRefreshing: boolean;
  connectionError: boolean;
  error: string | null;
  selectionRequired: boolean;
  hasCapability: (capability: BusinessCapability) => boolean;
  selectEstablishment: (establishmentId: string) => Promise<boolean>;
  refreshContexts: (preferredEstablishmentId?: string) => Promise<BusinessOperationalContext[]>;
}

const BusinessOperationalContextValue = createContext<BusinessOperationalValue | null>(null);

export function BusinessOperationalProvider({ children }: PropsWithChildren) {
  const { user } = useBusinessSession();
  const [contexts, setContexts] = useState<BusinessOperationalContext[]>([]);
  const [activeEstablishmentId, setActiveEstablishmentId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(Boolean(user));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectionError, setConnectionError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextUserId, setContextUserId] = useState<string | null>(null);
  const requestVersion = useRef(0);

  const refreshContexts = useCallback(async (preferredEstablishmentId?: string) => {
    if (!user) {
      setContexts([]);
      setActiveEstablishmentId(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setConnectionError(false);
      setError(null);
      setContextUserId(null);
      return [];
    }

    const version = ++requestVersion.current;
    const hasConfirmedContexts = contexts.length > 0;
    if (hasConfirmedContexts) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const next = await businessApi.getOperationalContexts();
      if (version !== requestVersion.current) return next;

      const stored = await activeEstablishmentStorage.get(user.id);
      const nextActiveId = resolveActiveEstablishmentId(next, [
        preferredEstablishmentId,
        activeEstablishmentId,
        stored,
      ]);

      setContexts(next);
      setActiveEstablishmentId(nextActiveId);
      setConnectionError(false);
      setError(null);
      if (nextActiveId) await activeEstablishmentStorage.set(user.id, nextActiveId);
      else if (stored) await activeEstablishmentStorage.remove(user.id);
      return next;
    } catch (refreshError) {
      if (version === requestVersion.current) {
        setConnectionError(true);
        setError(
          refreshError instanceof BusinessApiError
            ? refreshError.message
            : 'Não foi possível confirmar seus estabelecimentos. Verifique sua conexão e tente novamente.',
        );
      }
      return contexts;
    } finally {
      if (version === requestVersion.current) {
        setIsLoading(false);
        setIsRefreshing(false);
        setContextUserId(user.id);
      }
    }
  }, [activeEstablishmentId, contexts, user]);

  useEffect(() => {
    if (!user) {
      requestVersion.current += 1;
      setContexts([]);
      setActiveEstablishmentId(null);
      setIsLoading(false);
      setIsRefreshing(false);
      setConnectionError(false);
      setError(null);
      setContextUserId(null);
      return;
    }
    if (contextUserId !== user.id) {
      setContexts([]);
      setActiveEstablishmentId(null);
      setConnectionError(false);
      setError(null);
    }
    void refreshContexts();
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    const appState = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshContexts();
    });
    return () => appState.remove();
  }, [refreshContexts, user]);

  const selectEstablishment = useCallback(async (establishmentId: string) => {
    if (!user || !contexts.some((context) => context.establishmentId === establishmentId)) {
      return false;
    }
    setActiveEstablishmentId(establishmentId);
    setError(null);
    await activeEstablishmentStorage.set(user.id, establishmentId);
    return true;
  }, [contexts, user]);

  const activeContext = useMemo(
    () => contexts.find((context) => context.establishmentId === activeEstablishmentId) ?? null,
    [activeEstablishmentId, contexts],
  );

  const hasCapability = useCallback(
    (capability: BusinessCapability) => activeContext?.capabilities.includes(capability) ?? false,
    [activeContext],
  );

  const value = useMemo<BusinessOperationalValue>(() => ({
    contexts,
    activeEstablishmentId,
    activeContext,
    isLoading: isLoading || Boolean(user && contextUserId !== user.id),
    isRefreshing,
    connectionError,
    error,
    selectionRequired: contexts.length > 1 && !activeContext,
    hasCapability,
    selectEstablishment,
    refreshContexts,
  }), [
    activeContext,
    activeEstablishmentId,
    connectionError,
    contexts,
    contextUserId,
    error,
    hasCapability,
    isLoading,
    isRefreshing,
    refreshContexts,
    selectEstablishment,
    user,
  ]);

  return (
    <BusinessOperationalContextValue.Provider value={value}>
      {children}
    </BusinessOperationalContextValue.Provider>
  );
}

export function useBusinessOperational() {
  const value = use(BusinessOperationalContextValue);
  if (!value) {
    throw new Error('useBusinessOperational requer BusinessOperationalProvider');
  }
  return value;
}
