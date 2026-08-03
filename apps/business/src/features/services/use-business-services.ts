import { useQuery } from '@tanstack/react-query';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { createBusinessQueryKey } from '@/features/connectivity/business-query';

import { businessServicesApi } from './business-services-api';

export function useBusinessServices() {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  return useQuery({
    queryKey: createBusinessQueryKey(
      user?.id ?? 'signed-out',
      activeContext?.establishmentId ?? 'none',
      'services',
    ),
    enabled: Boolean(user && activeContext && hasCapability('view_services')),
    queryFn: () => businessServicesApi.list(activeContext!.establishmentId),
  });
}

