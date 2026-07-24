import { AdminReportFilters, AdminReportStatus, AdminReportTab } from '../types/admin-report';

export type AdminReportPreset = '7d' | '30d' | '90d' | 'month' | 'custom';

export interface AdminReportUrlState {
  tab: AdminReportTab;
  preset: AdminReportPreset;
  start: string;
  end: string;
  filters: AdminReportFilters;
}

const tabs: AdminReportTab[] = ['overview', 'operations', 'team', 'services', 'clients'];
const presets: AdminReportPreset[] = ['7d', '30d', '90d', 'month', 'custom'];
const statuses: AdminReportStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];
const first = (value?: string | string[]) => Array.isArray(value) ? value[0] : value;

export const toDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const rangeForReportPreset = (preset: Exclude<AdminReportPreset, 'custom'>, now = new Date()) => {
  const end = new Date(now);
  const start = new Date(end);
  if (preset === 'month') start.setDate(1);
  else start.setDate(start.getDate() - (Number(preset.replace('d', '')) - 1));
  return { start: toDateKey(start), end: toDateKey(end) };
};

export const parseAdminReportUrlState = (
  params: Record<string, string | string[] | undefined>,
  now = new Date(),
): AdminReportUrlState => {
  const rawTab = first(params.tab) as AdminReportTab;
  const rawPreset = first(params.period) as AdminReportPreset;
  const preset = presets.includes(rawPreset) ? rawPreset : '30d';
  const fallback = rangeForReportPreset(preset === 'custom' ? '30d' : preset, now);
  const rawStart = first(params.start);
  const rawEnd = first(params.end);
  const validCustom = /^\d{4}-\d{2}-\d{2}$/.test(rawStart || '') && /^\d{4}-\d{2}-\d{2}$/.test(rawEnd || '');
  const rawStatus = first(params.status) as AdminReportStatus;

  return {
    tab: tabs.includes(rawTab) ? rawTab : 'overview',
    preset: preset === 'custom' && !validCustom ? '30d' : preset,
    start: validCustom ? rawStart! : fallback.start,
    end: validCustom ? rawEnd! : fallback.end,
    filters: {
      professionalId: first(params.professionalId) || null,
      serviceId: first(params.serviceId) || null,
      status: statuses.includes(rawStatus) ? rawStatus : null,
    },
  };
};

export const adminReportUrlParams = (state: AdminReportUrlState) => ({
  tab: state.tab === 'overview' ? undefined : state.tab,
  period: state.preset === '30d' ? undefined : state.preset,
  start: state.preset === 'custom' ? state.start : undefined,
  end: state.preset === 'custom' ? state.end : undefined,
  professionalId: state.filters.professionalId || undefined,
  serviceId: state.filters.serviceId || undefined,
  status: state.filters.status || undefined,
});
