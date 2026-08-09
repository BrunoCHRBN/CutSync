import type {
  BusinessCapability,
  BusinessOperationalContext,
} from '@cutsync/database';
import { createMobileRequestId } from '@cutsync/domain';
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

type BusinessContextFailureStep =
  | 'rpc'
  | 'storage_read'
  | 'storage_write'
  | 'unknown';

class BusinessContextRefreshError extends Error {
  readonly step: BusinessContextFailureStep;
  readonly originalError: unknown;

  constructor(step: BusinessContextFailureStep, originalError: unknown) {
    super('business_context_refresh_failed');
    this.name = 'BusinessContextRefreshError';
    this.step = step;
    this.originalError = originalError;
  }
}

const operationalContextFallbackError =
  'Não foi possível confirmar seus estabelecimentos. Código: BUS_CTX_UNKNOWN.';

const diagnosticMessage = (message: string, code: string) => `${message} Código: ${code}.`;

const getOperationalContextErrorMessage = (error: unknown): string => {
  const targetError = error instanceof BusinessContextRefreshError
    ? error.originalError
    : error;
  const step = error instanceof BusinessContextRefreshError ? error.step : 'unknown';

  if (targetError instanceof BusinessApiError) {
    return diagnosticMessage(targetError.message, `BUS_CTX_${targetError.code.toUpperCase()}`);
  }
  if (
    targetError
    && typeof targetError === 'object'
    && (targetError as { name?: unknown }).name === 'BusinessApiError'
    && typeof (targetError as { message?: unknown }).message === 'string'
  ) {
    const code = typeof (targetError as { code?: unknown }).code === 'string'
      ? (targetError as { code: string }).code.toUpperCase()
      : step.toUpperCase();
    return diagnosticMessage((targetError as { message: string }).message, `BUS_CTX_${code}`);
  }
  if (error instanceof BusinessContextRefreshError) {
    return diagnosticMessage(
      'Não foi possível finalizar o contexto operacional neste aparelho.',
      `BUS_CTX_${step.toUpperCase()}`,
    );
  }
  return operationalContextFallbackError;
};

const getStoredActiveEstablishmentId = async (userId: string) => {
  try {
    return await activeEstablishmentStorage.get(userId);
  } catch (error) {
    throw new BusinessContextRefreshError('storage_read', error);
  }
};

const persistActiveEstablishmentId = async (
  userId: string,
  establishmentId: string | null,
  shouldRemoveStoredId: boolean,
) => {
  try {
    if (establishmentId) {
      await activeEstablishmentStorage.set(userId, establishmentId);
    } else if (shouldRemoveStoredId) {
      await activeEstablishmentStorage.remove(userId);
    }
  } catch (error) {
    throw new BusinessContextRefreshError('storage_write', error);
  }
};

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
      let next: BusinessOperationalContext[];
      let serverActiveEstablishmentId: string | null;
      try {
        const [authorizedContexts, operationalContexts] = await Promise.all([
          businessApi.getAuthorizedContexts(),
          businessApi.getOperationalContexts(),
        ]);
        const authorizedEstablishmentIds = new Set(
          authorizedContexts.flatMap((context) => (
            context.contextKind === 'establishment' && context.establishmentId
              ? [context.establishmentId]
              : []
          )),
        );
        next = operationalContexts.filter((context) => (
          authorizedEstablishmentIds.has(context.establishmentId)
        ));
        serverActiveEstablishmentId = authorizedContexts.find((context) => (
          context.contextKind === 'establishment' && context.active
        ))?.establishmentId ?? null;
      } catch (error) {
        throw new BusinessContextRefreshError('rpc', error);
      }
      if (version !== requestVersion.current) return next;

      let stored: string | null = null;
      try {
        stored = await getStoredActiveEstablishmentId(user.id);
      } catch {
        stored = null;
      }
      const nextActiveId = resolveActiveEstablishmentId(next, [
        serverActiveEstablishmentId,
        preferredEstablishmentId,
        activeEstablishmentId,
        stored,
      ]);

      if (nextActiveId && nextActiveId !== serverActiveEstablishmentId) {
        try {
          await businessApi.setActiveEstablishmentContext({
            establishmentId: nextActiveId,
            requestId: createMobileRequestId(),
          });
        } catch (error) {
          throw new BusinessContextRefreshError('rpc', error);
        }
      }

      setContexts(next);
      setActiveEstablishmentId(nextActiveId);
      setConnectionError(false);
      setError(null);
      try {
        await persistActiveEstablishmentId(user.id, nextActiveId, Boolean(stored));
      } catch {
        // Persistence is best-effort. Backend-confirmed contexts still control
        // access for the active session.
      }
      return next;
    } catch (refreshError) {
      if (version === requestVersion.current) {
        setConnectionError(true);
        setError(getOperationalContextErrorMessage(refreshError));
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
    try {
      await businessApi.setActiveEstablishmentContext({
        establishmentId,
        requestId: createMobileRequestId(),
      });
      setActiveEstablishmentId(establishmentId);
      setError(null);
      await persistActiveEstablishmentId(user.id, establishmentId, false);
      return true;
    } catch (selectionError) {
      setConnectionError(true);
      setError(getOperationalContextErrorMessage(
        new BusinessContextRefreshError('rpc', selectionError),
      ));
      return false;
    }
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
