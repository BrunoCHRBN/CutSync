import { QueryClientProvider } from '@tanstack/react-query';
import type { PropsWithChildren } from 'react';
import { useEffect, useRef } from 'react';

import { useSession } from '@/contexts/session-context';

import {
  clientQueryClient,
  resetClientQueryCacheForScope,
} from './client-query';
import { installClientQueryLifecycle } from './client-query-lifecycle';

export function ClientQueryProvider({ children }: PropsWithChildren) {
  useEffect(() => installClientQueryLifecycle(), []);

  return (
    <QueryClientProvider client={clientQueryClient}>
      {children}
    </QueryClientProvider>
  );
}

export function ClientQuerySessionReset() {
  const { user } = useSession();
  const previousUserId = useRef<string | null | undefined>(undefined);
  const nextUserId = user?.id ?? null;

  useEffect(() => {
    if (previousUserId.current !== undefined && previousUserId.current !== nextUserId) {
      resetClientQueryCacheForScope(clientQueryClient, nextUserId);
    }
    previousUserId.current = nextUserId;
  }, [nextUserId]);

  return null;
}
