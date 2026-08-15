import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useMemo } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { supabase } from '@/lib/supabase';

import { businessDashboardApi } from './business-dashboard-api';

export function useBusinessDailyMetrics(localDate: string) {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const channelId = useId().replace(/:/g, '');
  const visible = Boolean(
    activeContext?.financialOpsEnabled
    && hasCapability('view_unit_reports'),
  );
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const queryKey = useMemo(() => createBusinessQueryKey(
    userId,
    establishmentId,
    'service-orders',
    'daily-metrics',
    localDate,
  ), [establishmentId, localDate, userId]);
  const query = useQuery({
    queryKey,
    enabled: Boolean(user && activeContext && visible),
    queryFn: () => businessDashboardApi.getDailyMetrics(establishmentId, localDate),
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!supabase || !user || !activeContext || !visible) return undefined;
    const channel = supabase
      .channel(`business-daily-metrics-${activeContext.establishmentId}-${channelId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'service_orders',
        filter: `establishment_id=eq.${activeContext.establishmentId}`,
      }, () => { void businessQueryClient.invalidateQueries({ queryKey }); })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `establishment_id=eq.${activeContext.establishmentId}`,
      }, () => { void businessQueryClient.invalidateQueries({ queryKey }); })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [activeContext, channelId, queryKey, user, visible]);

  return { ...query, visible };
}