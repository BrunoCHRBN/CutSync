import { expect, test } from '@playwright/test';
import {
  adminReportUrlParams,
  parseAdminReportUrlState,
  rangeForReportPreset,
} from '../../apps/web/src/utils/admin-report-state';

const now = new Date('2026-07-23T12:00:00-03:00');

test('aplica padrões seguros e calcula períodos civis', () => {
  expect(rangeForReportPreset('7d', now)).toEqual({ start: '2026-07-17', end: '2026-07-23' });
  expect(parseAdminReportUrlState({}, now)).toMatchObject({
    tab: 'overview',
    preset: '30d',
    filters: { professionalId: null, serviceId: null, status: null },
  });
});

test('restaura aba, intervalo personalizado e filtros válidos da URL', () => {
  expect(parseAdminReportUrlState({
    tab: 'clients',
    period: 'custom',
    start: '2026-06-01',
    end: '2026-06-30',
    professionalId: 'professional-1',
    serviceId: 'service-1',
    status: 'completed',
  }, now)).toEqual({
    tab: 'clients',
    preset: 'custom',
    start: '2026-06-01',
    end: '2026-06-30',
    filters: {
      professionalId: 'professional-1',
      serviceId: 'service-1',
      status: 'completed',
    },
  });
});

test('descarta valores de URL desconhecidos e não serializa padrões', () => {
  const state = parseAdminReportUrlState({ tab: 'finance', status: 'paid', period: 'custom' }, now);
  expect(state.tab).toBe('overview');
  expect(state.preset).toBe('30d');
  expect(state.filters.status).toBeNull();
  expect(adminReportUrlParams(state)).toEqual({
    tab: undefined,
    period: undefined,
    start: undefined,
    end: undefined,
    professionalId: undefined,
    serviceId: undefined,
    status: undefined,
  });
});
