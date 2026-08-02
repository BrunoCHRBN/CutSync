import { QueryClient, type DefaultOptions } from '@tanstack/react-query';

export const BUSINESS_QUERY_RETRY_LIMIT = 2;
export const BUSINESS_QUERY_STALE_TIME_MS = 30_000;
export const BUSINESS_QUERY_GC_TIME_MS = 5 * 60_000;

export const getBusinessQueryRetryDelay = (attempt: number) => (
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

export const isTransientBusinessQueryError = (error: unknown) => {
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
    'reconecte',
  ].some((marker) => text.includes(marker));
};

export const shouldRetryBusinessQuery = (failureCount: number, error: unknown) => (
  failureCount < BUSINESS_QUERY_RETRY_LIMIT && isTransientBusinessQueryError(error)
);

export const isNetworkStateOnline = (state: {
  isConnected?: boolean;
  isInternetReachable?: boolean;
}) => state.isConnected !== false && state.isInternetReachable !== false;

export const createBusinessQueryKey = <T extends readonly unknown[]>(
  userId: string,
  establishmentId: string,
  ...segments: T
) => [
  'business',
  userId,
  establishmentId,
  ...segments,
] as const;

export const businessQueryDefaultOptions = {
  queries: {
    staleTime: BUSINESS_QUERY_STALE_TIME_MS,
    gcTime: BUSINESS_QUERY_GC_TIME_MS,
    retry: shouldRetryBusinessQuery,
    retryDelay: getBusinessQueryRetryDelay,
    refetchOnReconnect: true,
    refetchOnWindowFocus: true,
  },
  mutations: {
    retry: false,
  },
} satisfies DefaultOptions;

export const createBusinessQueryClient = () => new QueryClient({
  defaultOptions: businessQueryDefaultOptions,
});

export const businessQueryClient = createBusinessQueryClient();

export const resetBusinessQueryCacheForScope = (
  queryClient: QueryClient,
  userId: string | null,
  establishmentId: string | null,
) => {
  if (!userId) {
    queryClient.clear();
    return;
  }

  const establishmentScope = establishmentId ?? 'global';
  queryClient.removeQueries({
    predicate: ({ queryKey }) => (
      queryKey[0] !== 'business'
      || queryKey[1] !== userId
      || queryKey[2] !== establishmentScope
    ),
  });
  queryClient.getMutationCache().clear();
};

export const clearBusinessQueryCache = () => {
  businessQueryClient.clear();
};
