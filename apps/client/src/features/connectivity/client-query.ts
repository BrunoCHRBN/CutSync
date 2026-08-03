import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

export const CLIENT_QUERY_RETRY_LIMIT = 2;
export const CLIENT_QUERY_STALE_TIME_MS = 30_000;
export const CLIENT_QUERY_GC_TIME_MS = 5 * 60_000;

export const getClientQueryRetryDelay = (attempt: number) => (
  Math.min(750 * (2 ** Math.max(0, attempt)), 4_000)
);

const getQueryErrorText = (error: unknown) => {
  if (typeof error === 'string') return error.toLowerCase();
  if (typeof error !== 'object' || error === null) return '';
  const value = error as { code?: unknown; message?: unknown; name?: unknown };
  return [value.code, value.message, value.name]
    .filter((part): part is string => typeof part === 'string')
    .join(' ')
    .toLowerCase();
};

export const isTransientClientQueryError = (error: unknown) => {
  const text = getQueryErrorText(error);
  return [
    'network_error',
    'network request failed',
    'failed to fetch',
    'fetch failed',
    'timeout',
    'timed out',
    'sem conexao',
    'sem conexão',
    'não foi possível conectar',
    'verifique sua internet',
  ].some((marker) => text.includes(marker));
};

export const shouldRetryClientQuery = (failureCount: number, error: unknown) => (
  failureCount < CLIENT_QUERY_RETRY_LIMIT && isTransientClientQueryError(error)
);

export const isNetworkStateOnline = (state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}) => state.isConnected !== false && state.isInternetReachable !== false;

export const createClientQueryKey = <T extends readonly unknown[]>(
  userId: string,
  establishmentId: string | null,
  ...segments: T
) => [
  'client',
  userId,
  establishmentId ?? 'global',
  ...segments,
] as const;

export const clientQueryDefaultOptions = {
  queries: {
    staleTime: CLIENT_QUERY_STALE_TIME_MS,
    gcTime: CLIENT_QUERY_GC_TIME_MS,
    retry: shouldRetryClientQuery,
    retryDelay: getClientQueryRetryDelay,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  },
  mutations: {
    retry: false,
  },
} satisfies DefaultOptions;

export const createClientQueryClient = () => new QueryClient({
  defaultOptions: clientQueryDefaultOptions,
});

export const clientQueryClient = createClientQueryClient();

export const resetClientQueryCacheForScope = (
  queryClient: QueryClient,
  userId: string | null,
  establishmentId?: string | null,
) => {
  if (!userId) {
    queryClient.clear();
    return;
  }

  const establishmentScope = establishmentId === undefined
    ? undefined
    : establishmentId ?? 'global';
  queryClient.removeQueries({
    predicate: ({ queryKey }) => (
      queryKey[0] !== 'client'
      || queryKey[1] !== userId
      || (
        establishmentScope !== undefined
        && queryKey[2] !== establishmentScope
      )
    ),
  });
  queryClient.getMutationCache().clear();
};

export const clearClientQueryCache = () => {
  clientQueryClient.clear();
};
