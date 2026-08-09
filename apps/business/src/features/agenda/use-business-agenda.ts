import type { BusinessAgendaItem, BusinessAgendaScope } from '@cutsync/database';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { getLocalDateInTimeZone } from '@/features/agenda/business-agenda';
import { businessApi } from '@/services/business-api';

export function useBusinessAgenda() {
  const { activeContext, hasCapability } = useBusinessOperational();
  const preferredScope: BusinessAgendaScope =
    hasCapability('view_team_agenda') ? 'team' : 'own';
  const [scope, setScopeState] = useState<BusinessAgendaScope>(preferredScope);
  const [localDate, setLocalDate] = useState(() =>
    getLocalDateInTimeZone(activeContext?.timezone ?? 'America/Sao_Paulo'));
  const [items, setItems] = useState<BusinessAgendaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestVersion = useRef(0);

  useEffect(() => {
    const nextScope: BusinessAgendaScope =
      hasCapability('view_team_agenda') ? 'team' : 'own';
    setScopeState(nextScope);
    setLocalDate(getLocalDateInTimeZone(activeContext?.timezone ?? 'America/Sao_Paulo'));
    setItems([]);
  }, [activeContext?.establishmentId, activeContext?.timezone, hasCapability]);

  const refresh = useCallback(async () => {
    if (!activeContext) {
      setItems([]);
      setIsLoading(false);
      return [];
    }
    const version = ++requestVersion.current;
    setIsLoading(true);
    setError(null);
    try {
      const next = await businessApi.getAgendaDay(activeContext.establishmentId, localDate, scope);
      if (version === requestVersion.current) setItems(next);
      return next;
    } catch {
      if (version === requestVersion.current) {
        setError('Não foi possível carregar a agenda deste dia.');
      }
      return [];
    } finally {
      if (version === requestVersion.current) setIsLoading(false);
    }
  }, [activeContext, localDate, scope]);

  useFocusEffect(useCallback(() => {
    void refresh();
    return () => {
      requestVersion.current += 1;
    };
  }, [refresh]));

  const setScope = useCallback((nextScope: BusinessAgendaScope) => {
    if (nextScope === 'team' && !hasCapability('view_team_agenda')) return;
    setScopeState(nextScope);
  }, [hasCapability]);

  return {
    items,
    isLoading,
    error,
    localDate,
    setLocalDate,
    scope,
    setScope,
    canViewTeam: hasCapability('view_team_agenda'),
    refresh,
  };
}
