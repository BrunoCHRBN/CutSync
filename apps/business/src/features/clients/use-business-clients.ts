import { useQuery } from '@tanstack/react-query';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { createBusinessQueryKey } from '@/features/connectivity/business-query';

import { businessClientsApi } from './business-clients-api';

export function useBusinessClients(
  query: string,
  options?: { includeArchived?: boolean },
) {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const canView = hasCapability('view_clients');
  const includeArchived = options?.includeArchived ?? false;
  return useQuery({
    queryKey: createBusinessQueryKey(
      userId,
      establishmentId,
      'clients',
      query.trim().toLocaleLowerCase('pt-BR'),
      includeArchived ? 'with-archived' : 'active',
    ),
    enabled: Boolean(user && activeContext && canView),
    queryFn: () => businessClientsApi.search(establishmentId, query, { includeArchived }),
  });
}
