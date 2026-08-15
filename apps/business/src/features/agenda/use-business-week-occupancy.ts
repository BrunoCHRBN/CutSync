import { useQueries } from '@tanstack/react-query';

import { useBusinessOperational } from '@/contexts/business-operational-context';
import { useBusinessSession } from '@/contexts/business-session';
import { createBusinessQueryKey } from '@/features/connectivity/business-query';
import { businessApi } from '@/services/business-api';

import { shiftLocalDate } from './business-agenda';

export function useBusinessWeekOccupancy(
  weekStart: string,
  scope: 'own' | 'team',
) {
  const { user } = useBusinessSession();
  const { activeContext } = useBusinessOperational();
  const dates = Array.from({ length: 7 }, (_, index) => shiftLocalDate(weekStart, index));
  const userId = user?.id ?? 'signed-out';
  const establishmentId = activeContext?.establishmentId ?? 'none';
  const queries = useQueries({
    queries: dates.map((date) => ({
      queryKey: createBusinessQueryKey(userId, establishmentId, 'agenda', date, scope),
      enabled: Boolean(user && activeContext),
      queryFn: () => businessApi.getAgendaDay(establishmentId, date, scope),
      staleTime: 60_000,
    })),
  });

  return {
    dates,
    counts: Object.fromEntries(dates.map((date, index) => [
      date,
      (queries[index].data ?? []).filter((item) => item.status !== 'cancelled' && item.status !== 'no_show').length,
    ])),
    isFetching: queries.some((query) => query.isFetching),
  };
}