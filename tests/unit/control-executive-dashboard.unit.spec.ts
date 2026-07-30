/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  createControlMetricRange,
  getSaoPauloDate,
} from '../../apps/control/src/services/control-executive-range';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const service = read('apps/control/src/services/control-executive.ts');
const component = read('apps/control/src/components/executive-dashboard.tsx');
const route = read('apps/control/src/app/(control)/index.tsx');

test('closes dashboard ranges on the previous complete São Paulo day', () => {
  const beforeMidnight = new Date('2026-07-30T02:00:00.000Z');
  expect(getSaoPauloDate(beforeMidnight)).toBe('2026-07-29');
  expect(createControlMetricRange(7, beforeMidnight)).toEqual({
    start: '2026-07-22',
    end: '2026-07-28',
  });

  const afterMidnight = new Date('2026-07-30T04:00:00.000Z');
  expect(getSaoPauloDate(afterMidnight)).toBe('2026-07-30');
  expect(createControlMetricRange(28, afterMidnight)).toEqual({
    start: '2026-07-02',
    end: '2026-07-29',
  });
});

test('parses every executive contract section before exposing it to the route', () => {
  for (const field of [
    'generated_at',
    'definition_version',
    'comparison_period',
    'completed_appointments',
    'operating_establishments',
    'returning_clients_rate',
    'appointments_created',
    'average_days_to_first_completion',
    'identified_client_coverage',
    'critical_tickets',
    'data_quality',
    'comparison_available',
  ]) {
    expect(service).toContain(field);
  }
  expect(service).toContain('parseControlExecutiveDashboard');
  expect(service).toContain('parseControlMetricScopes');
  expect(service).toContain("('list_control_metric_scopes')");
  expect(service).toContain("('get_control_executive_dashboard', {");
});

test('accepts explicit comparison and missing-snapshot states from the RPC', async () => {
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  const {
    parseControlExecutiveDashboard,
    parseControlMetricScopes,
  } = await import('../../apps/control/src/services/control-executive');

  const metric = (
    comparisonStatus:
      | 'available'
      | 'current_incomplete'
      | 'comparison_unavailable'
      | 'source_unavailable'
      | 'no_denominator'
      | 'previous_zero' = 'available',
  ) => ({
    value: 10,
    previous: 8,
    delta_absolute: 2,
    delta_percent: comparisonStatus === 'available' ? 25 : null,
    comparison_status: comparisonStatus,
  });
  const payload = {
    generated_at: '2026-07-30T06:10:00.000Z',
    timezone: 'America/Sao_Paulo',
    definition_version: 1,
    scope: { type: 'global', id: null, label: 'CutSync' },
    period: { start: '2026-07-22', end: '2026-07-28', days: 7 },
    comparison_period: { start: '2026-07-15', end: '2026-07-21', days: 7 },
    kpis: {
      completed_appointments: metric(),
      operating_establishments: metric('current_incomplete'),
      returning_clients_rate: metric('no_denominator'),
    },
    drivers: {
      appointments_created: metric(),
      appointments_confirmed: metric(),
      completion_rate: metric(),
      approved_establishments: metric(),
      activated_establishments_14d: metric(),
      average_days_to_first_completion: metric(),
      new_clients: metric(),
      returning_clients: metric(),
      active_professionals: metric(),
      active_owners: metric(),
      active_clients: metric(),
    },
    guardrails: {
      cancellation_rate: metric(),
      identified_client_coverage: metric(),
      critical_tickets: metric('comparison_unavailable'),
      sla_at_risk: metric('previous_zero'),
      sync_failed: metric(),
    },
    series: [{
      date: '2026-07-22',
      completed_appointments: null,
      operating_establishments: null,
      returning_clients_rate: null,
      cancellation_rate: null,
    }],
    data_quality: {
      freshness_at: null,
      latest_complete_date: null,
      coverage_start_date: '2026-07-20',
      coverage_end_date: null,
      missing_days: 7,
      missing_dates: [
        '2026-07-22',
        '2026-07-23',
        '2026-07-24',
        '2026-07-25',
        '2026-07-26',
        '2026-07-27',
        '2026-07-28',
      ],
      comparison_available: false,
      comparison_available_on: {
        '7': '2026-08-03',
        '28': '2026-09-14',
        '90': '2027-01-16',
      },
      source_coverage: [{
        family: 'operations',
        label: 'Operação e agenda',
        available_from: '2026-07-20',
        status: 'available',
        assessed_at: '2026-07-30T06:00:00.000Z',
      }],
    },
  };

  const parsed = parseControlExecutiveDashboard(payload);
  expect(parsed.kpis.operatingEstablishments.comparisonStatus).toBe(
    'current_incomplete',
  );
  expect(parsed.series[0].completedAppointments).toBeNull();
  expect(parsed.dataQuality.freshnessAt).toBeNull();
  expect(parsed.dataQuality.missingDates).toHaveLength(7);
  expect(parsed.dataQuality.comparisonAvailableOn['7']).toBe('2026-08-03');
  expect(parseControlMetricScopes([
    {
      scope_type: 'establishment',
      scope_id: '00000000-0000-0000-0000-000000000002',
      parent_id: '00000000-0000-0000-0000-000000000001',
      label: 'Unidade Centro',
    },
  ])[0].parentId).toBe('00000000-0000-0000-0000-000000000001');
});

test('offers 7, 28 and 90-day comparisons with scoped drilldown', () => {
  expect(component).toContain('([7, 28, 90] as const)');
  expect(component).toContain("scope.type === 'organization'");
  expect(component).toContain("scope.type === 'establishment'");
  expect(component).toContain('Atendimentos concluídos');
  expect(component).toContain('Unidades em operação');
  expect(component).toContain('Recorrência identificada');
  expect(component).toContain('Qualidade e risco');
  expect(component).toContain('Qualidade dos dados');
});

test('keeps the executive route behind permission and away from legacy or financial payloads', () => {
  expect(route).toContain(
    '<RequireControlPermission permission="control.dashboard.read">',
  );
  expect(route).toContain('<ExecutiveDashboard');
  expect(route).toContain('listControlMetricScopes()');
  expect(route).toContain('loadControlExecutiveDashboard({');
  expect(route).not.toContain("('get_control_dashboard')");

  for (const unsupported of [
    'revenue',
    'profit',
    'cash_balance',
    'received_revenue',
  ]) {
    expect(`${service}\n${component}`).not.toContain(unsupported);
  }
});
