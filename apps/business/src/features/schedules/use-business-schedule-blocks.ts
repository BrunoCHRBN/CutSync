import { useQuery } from '@tanstack/react-query';
import type { BusinessAgendaScope } from '@cutsync/database';
import { useEffect, useId } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { businessQueryClient, createBusinessQueryKey } from '@/features/connectivity/business-query';
import { supabase } from '@/lib/supabase';

import { businessSchedulesApi } from './business-schedules-api';

export function useBusinessScheduleBlocks(
  rangeStart: string,
  rangeEnd: string,
  scope: BusinessAgendaScope = 'team',
) {
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const instanceId = useId().replace(/:/g, '');
  const professionalId = scope === 'own' ? user?.id : null;
  const key = createBusinessQueryKey(
    user?.id ?? 'signed-out',
    activeContext?.establishmentId ?? 'none',
    'schedule-blocks',
    rangeStart,
    rangeEnd,
    scope,
    professionalId ?? 'team',
  );
  const query = useQuery({
    queryKey: key,
    enabled: Boolean(user && activeContext && rangeStart && rangeEnd),
    queryFn: () => businessSchedulesApi.list({
      establishmentId: activeContext!.establishmentId,
      rangeStart,
      rangeEnd,
      professionalId,
    }),
  });

  useEffect(() => {
    if (!supabase || !user || !activeContext) return undefined;
    const channel = supabase
      .channel(`business-schedule-blocks-${activeContext.establishmentId}-${instanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'schedule_blocks',
        filter: `establishment_id=eq.${activeContext.establishmentId}`,
      }, () => {
        void businessQueryClient.invalidateQueries({
          queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'schedule-blocks'),
        });
      })
      .subscribe();
    return () => { void supabase?.removeChannel(channel); };
  }, [activeContext?.establishmentId, instanceId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return query;
}

