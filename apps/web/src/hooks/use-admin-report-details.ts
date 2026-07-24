import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import {
  AdminReportDetailDimension,
  AdminReportDetailItem,
  AdminReportDetailPage,
  AdminReportFilters,
} from '../types/admin-report';

export interface AdminReportDetailSelection {
  dimension: AdminReportDetailDimension;
  day?: string | null;
  dayOfWeek?: number | null;
  hour?: number | null;
  status?: string | null;
}

interface Options {
  establishmentId?: string | null;
  rangeStart: string;
  rangeEnd: string;
  filters: AdminReportFilters;
  selection: AdminReportDetailSelection | null;
}

const detailErrorMessage = (message: string) => {
  if (message.includes('forbidden')) return 'Você não tem permissão para abrir estes registros.';
  if (message.includes('invalid_report')) return 'O detalhamento solicitado é inválido.';
  return 'Não foi possível abrir os registros deste indicador.';
};

export function useAdminReportDetails({ establishmentId, rangeStart, rangeEnd, filters, selection }: Options) {
  const [items, setItems] = useState<AdminReportDetailItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const fetchPage = useCallback(async (cursor: string | null, append: boolean) => {
    if (!establishmentId || !selection) return;
    const currentRequest = ++requestId.current;
    setLoading(true);
    const { data, error: queryError } = await (supabase.rpc as any)('get_admin_report_details', {
      target_establishment_id: establishmentId,
      target_range_start: rangeStart,
      target_range_end: rangeEnd,
      target_dimension: selection.dimension,
      target_professional_id: filters.professionalId || null,
      target_service_id: filters.serviceId || null,
      target_status: selection.status || filters.status || null,
      target_day: selection.day || null,
      target_day_of_week: selection.dayOfWeek ?? null,
      target_hour: selection.hour ?? null,
      target_cursor: cursor,
      target_limit: 25,
    });
    if (currentRequest !== requestId.current) return;
    if (queryError) {
      setError(detailErrorMessage(queryError.message));
      setLoading(false);
      return;
    }
    const page = data as unknown as AdminReportDetailPage;
    setItems((current) => append ? [...current, ...page.items] : page.items);
    setNextCursor(page.next_cursor);
    setError(null);
    setLoading(false);
  }, [establishmentId, filters.professionalId, filters.serviceId, filters.status, rangeEnd, rangeStart, selection]);

  useEffect(() => {
    setItems([]);
    setNextCursor(null);
    setError(null);
    if (selection) void fetchPage(null, false);
    return () => { requestId.current += 1; };
  }, [fetchPage, selection]);

  return {
    items,
    loading,
    error,
    hasMore: Boolean(nextCursor),
    loadMore: () => nextCursor ? fetchPage(nextCursor, true) : Promise.resolve(),
    retry: () => fetchPage(null, false),
  };
}
