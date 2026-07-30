/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260804004000_control_analytics_foundation.sql',
);
const sqlTest = read('supabase/tests/control_analytics_foundation.sql');

test('mantém snapshots tipados fora da API pública e sem acesso authenticated', () => {
  expect(migration).toContain(
    'CREATE SCHEMA IF NOT EXISTS analytics_private;',
  );
  expect(migration).toContain(
    'REVOKE ALL ON SCHEMA analytics_private FROM PUBLIC, anon, authenticated;',
  );
  expect(migration).toContain(
    'CREATE TABLE analytics_private.control_daily_metrics',
  );
  expect(migration).toContain(
    'PRIMARY KEY (scope_type, scope_key, metric_date)',
  );
  expect(migration).toContain('definition_version integer NOT NULL');
  expect(migration).toContain('is_final boolean NOT NULL');
  expect(migration).toContain('freshness_at timestamptz');
  expect(migration).toContain(
    'ALTER TABLE analytics_private.control_daily_metrics\n  ENABLE ROW LEVEL SECURITY;',
  );
  expect(migration).toContain(
    'REVOKE ALL ON TABLE analytics_private.control_daily_metrics\n  FROM PUBLIC, anon, authenticated;',
  );
  expect(migration).not.toContain(
    'GRANT SELECT ON TABLE analytics_private.control_daily_metrics\n  TO authenticated',
  );
});

test('expõe apenas RPCs AAL2 e mantém as funções analíticas privadas', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.list_control_metric_scopes()',
  );
  expect(migration).toContain('parent_id uuid');
  expect(migration).toContain('active_link.organization_id');
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.get_control_executive_dashboard(',
  );
  expect(migration.match(/PERFORM public\.get_control_context\(\);/g)).toHaveLength(
    2,
  );
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.list_control_metric_scopes()\n  FROM PUBLIC, anon;',
  );
  expect(migration).toContain(
    ') FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.get_control_executive_dashboard(',
  );
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION analytics_private.refresh_control_daily_metrics(date)\n  FROM PUBLIC, anon, authenticated;',
  );
  expect(migration).toContain(
    'GRANT EXECUTE ON FUNCTION analytics_private.refresh_control_daily_metrics(date)\n  TO service_role;',
  );
});

test('materializa recortes diários idempotentes e agenda ontem em São Paulo', () => {
  expect(migration).toContain(
    'CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;',
  );
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION analytics_private.refresh_control_daily_metrics(',
  );
  expect(migration).toContain('target_date date');
  expect(migration).toContain(
    'ON CONFLICT (scope_type, scope_key, metric_date)\n    DO UPDATE SET',
  );
  expect(migration).toContain("'global'::text AS scope_type");
  expect(migration).toContain("'organization'");
  expect(migration).toContain("'establishment'");
  expect(migration).toContain("'control-analytics-finalize-yesterday'");
  expect(migration).toContain("'10 6 * * *'");
  expect(migration).toContain(
    "(now() AT TIME ZONE 'America/Sao_Paulo')::date - 1",
  );
  expect(migration).toContain(
    '(target_range_end + 1)::timestamp\n              AT TIME ZONE report_timezone',
  );
});

test('preserva as fontes autoritativas e os recortes temporais definidos', () => {
  expect(migration).toContain(
    'CREATE INDEX IF NOT EXISTS appointments_control_date_time_idx',
  );
  expect(migration).toContain(
    'CREATE INDEX IF NOT EXISTS appointments_control_created_at_idx',
  );
  expect(migration).toContain(
    'CREATE INDEX IF NOT EXISTS appointments_control_created_range_idx',
  );
  expect(migration).toContain(
    'CREATE INDEX IF NOT EXISTS appointments_control_client_history_idx',
  );
  expect(migration).toContain('appointment.deleted_at IS NULL');
  expect(migration).toContain("appointment.status = 'completed'");
  expect(migration).toContain(
    'appointment.date_time AT TIME ZONE establishment.timezone',
  );
  expect(migration).toContain(
    'appointment.created_at AT TIME ZONE establishment.timezone',
  );
  expect(migration).toContain('FROM public.memberships');
  expect(migration).toContain('FROM public.organization_members');
  expect(migration).toContain('FROM public.organization_establishments');
  expect(migration).toContain('link.effective_from <= target_event_date');
  expect(migration).toContain(
    'previous.client_id = completed_client.client_id',
  );
  expect(migration).toContain(')::date < target_range_start');
  expect(migration).toContain(
    "target_range_start::timestamp AT TIME ZONE 'UTC'\n        - interval '14 hours'",
  );
  expect(migration).toContain(
    "(target_range_end + 1)::timestamp AT TIME ZONE 'UTC'\n        + interval '12 hours'",
  );
  expect(migration.match(
    /target_scope_type <> 'establishment'\n\s+OR appointment\.establishment_id = target_scope_id/g,
  )).toHaveLength(2);
});

test('entrega contrato executivo comparável, séries e qualidade dos dados', () => {
  for (const key of [
    "'generated_at'",
    "'timezone'",
    "'definition_version'",
    "'scope'",
    "'period'",
    "'comparison_period'",
    "'kpis'",
    "'drivers'",
    "'guardrails'",
    "'series'",
    "'data_quality'",
    "'completed_appointments'",
    "'operating_establishments'",
    "'returning_clients_rate'",
    "'appointments_created'",
    "'appointments_confirmed'",
    "'completion_rate'",
    "'approved_establishments'",
    "'activated_establishments_14d'",
    "'average_days_to_first_completion'",
    "'new_clients'",
    "'returning_clients'",
    "'active_professionals'",
    "'active_owners'",
    "'active_clients'",
    "'cancellation_rate'",
    "'identified_client_coverage'",
    "'critical_tickets'",
    "'sla_at_risk'",
    "'sync_failed'",
    "'freshness_at'",
    "'latest_complete_date'",
    "'missing_days'",
    "'comparison_available'",
  ]) {
    expect(migration).toContain(key);
  }

  for (const key of [
    "'value'",
    "'previous'",
    "'delta_absolute'",
    "'delta_percent'",
    "'comparison_status'",
  ]) {
    expect(migration).toContain(key);
  }

  expect(migration).toContain('IF period_days > 90 THEN');
  expect(migration).toContain("RAISE EXCEPTION 'analytics_range_too_large'");
  expect(migration).toContain(
    "RAISE EXCEPTION 'analytics_range_not_complete'",
  );
  expect(migration).toContain("THEN 'no_denominator'");
  for (const status of [
    "'available'",
    "'current_incomplete'",
    "'comparison_unavailable'",
    "'no_denominator'",
    "'previous_zero'",
  ]) {
    expect(migration).toContain(status);
  }
  expect(migration).toContain('AND previous_value <> 0');
  expect(migration).not.toMatch(
    /'revenue'|'profit'|'cash'|'mrr'|'marketing'/i,
  );
});

test('o teste SQL cobre autorização, valores, qualidade, limites e rollback', () => {
  expect(sqlTest).toContain("'request.jwt.claims'");
  expect(sqlTest).toContain("'aal1'");
  expect(sqlTest).toContain("'aal2'");
  expect(sqlTest).toContain('analytics_private.refresh_control_daily_metrics');
  expect(sqlTest).toContain('daily refresh is not idempotent');
  expect(sqlTest).toContain('primary KPI values are invalid');
  expect(sqlTest).toContain('driver values are invalid');
  expect(sqlTest).toContain('zero denominators must return null percentages');
  expect(sqlTest).toContain('comparison status contract is invalid');
  expect(sqlTest).toContain('analytics_range_too_large');
  expect(sqlTest.trimEnd()).toMatch(/ROLLBACK;$/);
});
