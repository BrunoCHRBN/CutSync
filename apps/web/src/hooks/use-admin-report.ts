import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { supabase } from '../services/supabase';
import { AdminReport, AdminReportFilters } from '../types/admin-report';

interface UseAdminReportOptions {
  establishmentId?: string | null;
  rangeStart: string;
  rangeEnd: string;
  enabled?: boolean;
  interactive?: boolean;
  filters?: AdminReportFilters;
}

const reportErrorMessage = (message: string) => {
  if (message.includes('forbidden')) return 'Você não tem permissão para consultar os relatórios desta unidade.';
  if (message.includes('invalid_report_range')) return 'O período selecionado é inválido ou maior que um ano.';
  if (message.includes('invalid_schedule_configuration')) return 'Revise os horários da unidade ou da equipe para calcular a ocupação.';
  if (message.includes('schedule_blocks') && message.includes('does not exist')) return 'A atualização de compatibilidade dos relatórios ainda não foi aplicada no banco.';
  if (message.includes('get_admin_report') && message.includes('schema cache')) return 'Os relatórios ainda não foram habilitados no banco de dados.';
  return 'Não foi possível carregar os relatórios agora.';
};

export function useAdminReport({
  establishmentId,
  rangeStart,
  rangeEnd,
  enabled = true,
  interactive = false,
  filters = {},
}: UseAdminReportOptions) {
  const [report, setReport] = useState<AdminReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);
  const instanceId = useId().replace(/:/g, '');
  const realtimeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refresh = useCallback(async () => {
    const currentRequest = ++requestId.current;
    if (!enabled || !establishmentId) {
      setReport(null);
      setError(null);
      setLoading(false);
      return null;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(rangeStart) || !/^\d{4}-\d{2}-\d{2}$/.test(rangeEnd)) {
      setReport(null);
      setError('Informe um período válido no formato AAAA-MM-DD.');
      setLoading(false);
      return null;
    }

    setLoading(true);
    const { data, error: queryError } = interactive
      ? await (supabase.rpc as any)('get_admin_report_v2', {
        target_establishment_id: establishmentId,
        target_range_start: rangeStart,
        target_range_end: rangeEnd,
        target_professional_id: filters.professionalId || null,
        target_service_id: filters.serviceId || null,
        target_status: filters.status || null,
      })
      : await supabase.rpc('get_admin_report', {
        target_establishment_id: establishmentId,
        target_range_start: rangeStart,
        target_range_end: rangeEnd,
      });
    if (currentRequest !== requestId.current) return null;

    if (queryError) {
      console.error('[useAdminReport] Falha ao carregar relatório:', queryError);
      setReport(null);
      setError(reportErrorMessage(queryError.message));
      setLoading(false);
      return null;
    }

    const nextReport = data as unknown as AdminReport;
    setReport(nextReport);
    setError(null);
    setLoading(false);
    return nextReport;
  }, [enabled, establishmentId, filters.professionalId, filters.serviceId, filters.status, interactive, rangeEnd, rangeStart]);

  useEffect(() => {
    setReport(null);
    setError(null);
    setLoading(true);
    void refresh();
    if (!enabled || !establishmentId) {
      return () => { requestId.current += 1; };
    }

    const scheduleRefresh = () => {
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      realtimeTimer.current = setTimeout(() => { void refresh(); }, 350);
    };
    const channel = supabase
      .channel(`admin-report-${establishmentId}-${instanceId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointments', filter: `establishment_id=eq.${establishmentId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'schedule_blocks', filter: `establishment_id=eq.${establishmentId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'services', filter: `establishment_id=eq.${establishmentId}` }, scheduleRefresh)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'memberships', filter: `establishment_id=eq.${establishmentId}` }, scheduleRefresh)
      .subscribe();

    return () => {
      requestId.current += 1;
      if (realtimeTimer.current) clearTimeout(realtimeTimer.current);
      void supabase.removeChannel(channel);
    };
  }, [enabled, establishmentId, instanceId, refresh]);

  return { report, loading, error, refresh };
}
