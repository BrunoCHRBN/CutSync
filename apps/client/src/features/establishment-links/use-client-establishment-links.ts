import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef } from 'react';

import { createClientQueryKey } from '@/features/connectivity/client-query';
import {
  createClientEstablishmentLinkRequestIdStore,
  type ClientEstablishmentLinkAction,
} from './client-establishment-links-contract';
import {
  confirmEstablishmentClientLink,
  listMyEstablishmentClientLinks,
  rejectEstablishmentClientLink,
} from './client-establishment-links-service';

export const clientEstablishmentLinksQueryKey = (userId: string) => (
  createClientQueryKey(userId, null, 'establishment-links')
);

export function useClientEstablishmentLinks(userId: string | null) {
  const queryClient = useQueryClient();
  const requestIdStore = useRef(createClientEstablishmentLinkRequestIdStore());
  const queryKey = clientEstablishmentLinksQueryKey(userId ?? 'signed-out');

  const query = useQuery({
    queryKey,
    queryFn: listMyEstablishmentClientLinks,
    enabled: Boolean(userId),
    refetchOnMount: 'always',
  });

  const mutation = useMutation({
    mutationKey: createClientQueryKey(userId ?? 'signed-out', null, 'establishment-links', 'mutation'),
    retry: false,
    mutationFn: async ({ action, linkId }: {
      action: ClientEstablishmentLinkAction;
      linkId: string;
    }) => {
      if (!userId) throw new Error('Sua sessão não pôde ser validada. Entre novamente antes de continuar.');
      let requestId: string;
      try {
        requestId = requestIdStore.current.getOrCreate(action, linkId);
      } catch {
        throw new Error('Este dispositivo não conseguiu criar uma confirmação segura. Reinicie o aplicativo antes de tentar novamente.');
      }
      const result = action === 'confirm'
        ? await confirmEstablishmentClientLink(linkId, requestId)
        : await rejectEstablishmentClientLink(linkId, requestId);
      requestIdStore.current.complete(action, linkId);
      return result;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });

  return {
    links: query.data ?? [],
    isLoading: query.isLoading,
    isRefreshing: query.isRefetching,
    error: query.error instanceof Error ? query.error.message : null,
    refresh: query.refetch,
    respond: mutation.mutateAsync,
    response: mutation.data ?? null,
    responseError: mutation.error instanceof Error ? mutation.error.message : null,
    resetResponse: mutation.reset,
    isResponding: mutation.isPending,
    respondingTo: mutation.variables ?? null,
  };
}
