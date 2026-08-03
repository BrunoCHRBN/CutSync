import type { BusinessAgendaScope } from '@cutsync/database';
import { useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useId, useState } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import {
  businessQueryClient,
  createBusinessQueryKey,
} from '@/features/connectivity/business-query';
import { supabase } from '@/lib/supabase';
import { businessApi } from '@/services/business-api';

import { getLocalDateInTimeZone } from './business-agenda';

export function useBusinessAgenda() {
  const { user } = useBusinessSession();
  const { activeContext, hasCapability } = useBusinessOperational();
  const preferredScope: BusinessAgendaScope =
    activeContext?.operationalRole === 'professional' ? 'own' : 'team';
  const [scope, setScopeState] = useState<BusinessAgendaScope>(preferredScope);
  const [localDate, setLocalDate] = useState(() =>
    getLocalDateInTimeZone(activeContext?.timezone ?? 'America/Sao_Paulo'));
  const channelInstanceId = useId().replace(/:/g, '');
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const agendaKey = createBusinessQueryKey(userId, establishmentId, 'agenda', localDate, scope);

  useEffect(() => {
    setScopeState(activeContext?.operationalRole === 'professional' ? 'own' : 'team');
    setLocalDate(getLocalDateInTimeZone(activeContext?.timezone ?? 'America/Sao_Paulo'));
  }, [activeContext?.establishmentId, activeContext?.operationalRole, activeContext?.timezone]);

  const query = useQuery({
    queryKey: agendaKey,
    enabled: Boolean(user && activeContext),
    queryFn: () => businessApi.getAgendaDay(establishmentId, localDate, scope),
  });

  useEffect(() => {
    if (!supabase || !user || !activeContext) return undefined;
    const channel = supabase
      .channel(`business-agenda-${activeContext.establishmentId}-${channelInstanceId}`)
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'appointments',
        filter: `establishment_id=eq.${activeContext.establishmentId}`,
      }, () => {
        void businessQueryClient.invalidateQueries({
          queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda'),
        });
      })
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'schedule_blocks',
        filter: `establishment_id=eq.${activeContext.establishmentId}`,
      }, () => {
        void Promise.all([
          businessQueryClient.invalidateQueries({
            queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'agenda'),
          }),
          businessQueryClient.invalidateQueries({
            queryKey: createBusinessQueryKey(user.id, activeContext.establishmentId, 'schedule-blocks'),
          }),
        ]);
      })
      .subscribe();
    return () => {
      void supabase?.removeChannel(channel);
    };
  }, [activeContext?.establishmentId, channelInstanceId, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const setScope = useCallback((nextScope: BusinessAgendaScope) => {
    if (nextScope === 'team' && !hasCapability('view_team_agenda')) return;
    setScopeState(nextScope);
  }, [hasCapability]);

  const refresh = useCallback(async () => {
    const result = await query.refetch();
    return result.data ?? [];
  }, [query]);

  return {
    items: query.data ?? [],
    isLoading: query.isLoading,
    error: query.error ? 'Não foi possível carregar a agenda deste dia.' : null,
    localDate,
    setLocalDate,
    scope,
    setScope,
    canViewTeam: hasCapability('view_team_agenda'),
    refresh,
  };
}
