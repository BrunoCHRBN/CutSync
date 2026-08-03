import { useQuery } from '@tanstack/react-query';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { createBusinessQueryKey } from '@/features/connectivity/business-query';

import { businessTeamApi } from './business-team-api';

export function useBusinessTeam() {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  return useQuery({
    queryKey: createBusinessQueryKey(
      user?.id ?? 'signed-out',
      activeContext?.establishmentId ?? 'none',
      'team',
    ),
    enabled: Boolean(user && activeContext && hasCapability('manage_team')),
    queryFn: () => businessTeamApi.get(activeContext!.establishmentId),
  });
}

