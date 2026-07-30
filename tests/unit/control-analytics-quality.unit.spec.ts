/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260805001000_control_analytics_quality_and_reprocessing.sql',
);
const requesterIndexMigration = read(
  'supabase/migrations/20260805002000_index_control_analytics_refresh_requester.sql',
);
const activationCoverageMigration = read(
  'supabase/migrations/20260805003000_align_control_activation_source_coverage.sql',
);
const sqlTest = read(
  'supabase/tests/control_analytics_quality_and_reprocessing.sql',
);
const preflight = read('supabase/tests/control_production_readiness.sql');
const service = read(
  'apps/control/src/services/control-analytics-health.ts',
);
const component = read(
  'apps/control/src/components/data-quality-dashboard.tsx',
);
const route = read('apps/control/src/app/(control)/data-quality.tsx');
const shell = read('apps/control/src/components/control-shell.tsx');

test('separates trustworthy coverage from observed zero values', () => {
  expect(migration).toContain(
    'CREATE TABLE analytics_private.control_metric_source_coverage',
  );
  expect(migration).toContain(
    "source_family IN ('operations', 'people', 'activation', 'support')",
  );
  expect(migration).toContain('operations_observed boolean NOT NULL');
  expect(migration).toContain('people_observed boolean NOT NULL');
  expect(migration).toContain('activation_observed boolean NOT NULL');
  expect(migration).toContain('support_observed boolean NOT NULL');
  expect(migration).toContain("THEN 'source_unavailable'");
  expect(activationCoverageMigration).toContain('SELECT greatest(');
  expect(activationCoverageMigration).toContain(
    "audit.changes->>'new_status' = 'active'",
  );
  expect(activationCoverageMigration).toContain(
    'SET activation_observed = EXISTS',
  );
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION analytics_private.strict_metric_comparison(',
  );
});

test('keeps the refresh queue private, bounded and auditable', () => {
  expect(migration).toContain(
    'CREATE TABLE analytics_private.control_metric_refresh_runs',
  );
  expect(migration).toContain(
    "status IN ('pending', 'running', 'succeeded', 'failed')",
  );
  expect(migration).toContain(
    'processed_in_call < bounded_days',
  );
  expect(migration).toContain(
    'least(greatest(coalesce(max_days, 3), 1), 3)',
  );
  expect(migration).toContain(
    "'control-analytics-refresh-worker'",
  );
  expect(migration).toContain("'*/5 * * * *'");
  expect(migration).toContain('FOR UPDATE SKIP LOCKED');
  expect(migration).toContain('pg_advisory_xact_lock');
  expect(requesterIndexMigration).toContain(
    'CREATE INDEX IF NOT EXISTS control_metric_refresh_runs_requested_by_idx',
  );
  expect(requesterIndexMigration).toContain(
    'WHERE requested_by IS NOT NULL',
  );
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION analytics_private.process_control_analytics_refresh_queue(',
  );
});

test('enforces owner AAL2 reprocessing with range, reason and overlap guards', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.request_control_analytics_reprocess(',
  );
  expect(migration).toContain('context_payload := public.get_control_context();');
  expect(migration).toContain("context_payload->>'role' <> 'SaaS_Owner'");
  expect(migration).toContain('range_end - range_start + 1 > 14');
  expect(migration).toContain(
    "char_length(btrim(coalesce(reason, ''))) NOT BETWEEN 10 AND 500",
  );
  expect(migration).toContain(
    'analytics_reprocess_overlaps_active_run',
  );
  expect(migration).toContain(
    ') FROM PUBLIC, anon;\nGRANT EXECUTE ON FUNCTION public.request_control_analytics_reprocess(',
  );
});

test('adds a typed health route without exposing private analytics tables', () => {
  expect(service).toContain("('get_control_analytics_health')");
  expect(service).toContain("'request_control_analytics_reprocess'");
  expect(service).toContain('parseControlAnalyticsHealth');
  expect(component).toContain('Cobertura por fonte');
  expect(component).toContain('Comparações históricas');
  expect(component).toContain('Reprocessar snapshots');
  expect(route).toContain(
    '<RequireControlPermission permission="control.dashboard.read">',
  );
  expect(route).toContain("context?.role === 'SaaS_Owner'");
  expect(shell).toContain("href: '/data-quality'");
  expect(shell).toContain("label: 'Saúde dos dados'");
});

test('ships executable SQL verification and a read-only production preflight', () => {
  expect(sqlTest).toContain('source_unavailable');
  expect(sqlTest).toContain('analytics_reprocess_range_too_large');
  expect(sqlTest.trimEnd()).toMatch(/ROLLBACK;$/);
  expect(preflight).toContain('READ-ONLY preflight');
  expect(preflight).toContain("to_regclass('analytics_private.control_daily_metrics')");
  expect(preflight).not.toMatch(/\b(INSERT|UPDATE|DELETE|ALTER|CREATE|DROP)\b(?!-ONLY)/);
});
