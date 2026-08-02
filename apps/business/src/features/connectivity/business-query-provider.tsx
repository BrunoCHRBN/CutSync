import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';

import {
  businessQueryClient,
  resetBusinessQueryCacheForScope,
} from './business-query';
import { installBusinessQueryLifecycle } from './business-query-lifecycle';

export function BusinessQueryProvider({ children }: PropsWithChildren) {
  useEffect(() => installBusinessQueryLifecycle(), []);

  return (
    <QueryClientProvider client={businessQueryClient}>
      {children}
    </QueryClientProvider>
  );
}

export function BusinessQueryScopeReset() {
  const { user } = useBusinessSession();
  const { activeEstablishmentId } = useBusinessOperational();
  const userId = user?.id ?? null;
  const previousScope = useRef<{
    userId: string | null;
    establishmentId: string | null;
  } | undefined>(undefined);

  useEffect(() => {
    const previous = previousScope.current;
    if (
      previous
      && (
        previous.userId !== userId
        || previous.establishmentId !== activeEstablishmentId
      )
    ) {
      resetBusinessQueryCacheForScope(
        businessQueryClient,
        userId,
        activeEstablishmentId,
      );
    }
    previousScope.current = {
      userId,
      establishmentId: activeEstablishmentId,
    };
  }, [activeEstablishmentId, userId]);

  return null;
}
