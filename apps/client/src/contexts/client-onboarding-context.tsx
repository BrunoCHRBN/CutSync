import React, {
  createContext,
  type PropsWithChildren,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { clientObservability } from '@/features/observability/client-observability';
import {
  persistClientOnboardingCompletion,
  readClientOnboardingState,
} from '@/features/onboarding/client-onboarding-storage';

interface ClientOnboardingContextValue {
  isLoading: boolean;
  isComplete: boolean;
  complete: () => Promise<void>;
}

const ClientOnboardingContext = createContext<ClientOnboardingContextValue | null>(null);

export function ClientOnboardingProvider({ children }: PropsWithChildren) {
  const [isLoading, setIsLoading] = useState(true);
  const [isComplete, setIsComplete] = useState(false);

  useEffect(() => {
    let active = true;

    void readClientOnboardingState()
      .then((state) => {
        if (active) setIsComplete(state.isComplete);
      })
      .catch((error) => {
        clientObservability.captureError(
          error,
          'client_onboarding_read_failed',
          '/onboarding',
        );
        if (active) setIsComplete(true);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const complete = useCallback(async () => {
    setIsComplete(true);

    try {
      await persistClientOnboardingCompletion();
    } catch (error) {
      clientObservability.captureError(
        error,
        'client_onboarding_write_failed',
        '/onboarding',
      );
    }
  }, []);

  const value = useMemo<ClientOnboardingContextValue>(() => ({
    isLoading,
    isComplete,
    complete,
  }), [complete, isComplete, isLoading]);

  return (
    <ClientOnboardingContext.Provider value={value}>
      {children}
    </ClientOnboardingContext.Provider>
  );
}

export function useClientOnboarding() {
  const context = React.use(ClientOnboardingContext);
  if (!context) {
    throw new Error('useClientOnboarding deve ser usado dentro de ClientOnboardingProvider.');
  }
  return context;
}
