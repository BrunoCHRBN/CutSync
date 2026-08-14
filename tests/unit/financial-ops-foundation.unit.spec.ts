/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  BUSINESS_CAPABILITIES,
  FINANCIAL_OPS_CAPABILITIES,
} from '../../packages/database/src/business';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260814000000_financial_ops_foundation.sql',
);
const sqlTest = read('supabase/tests/financial_ops_foundation.sql');
const canonicalDoc = read('docs/architecture/FINANCIAL_OPERATIONAL_P0.md');

test('migration adiciona flag default false e protege escrita autenticada', () => {
  expect(migration).toContain(
    'ADD COLUMN IF NOT EXISTS financial_ops_enabled boolean NOT NULL DEFAULT false',
  );
  expect(migration).toContain('enforce_financial_ops_flag_write');
  expect(migration).toContain("RAISE EXCEPTION 'financial_ops_flag_immutable'");
  expect(migration).toContain("TG_OP = 'INSERT'");
  expect(migration).toContain('BEFORE INSERT OR UPDATE OF financial_ops_enabled');
  expect(migration).not.toContain(
    'CREATE INDEX IF NOT EXISTS establishments_financial_ops_enabled',
  );
  expect(migration).not.toContain('CREATE TABLE public.service_orders');
  expect(migration).not.toContain('membership_capability_overrides');
});

test('resolver SQL expõe capabilities granulares sem strip por flag off', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.resolve_business_operational_capabilities',
  );
  for (const capability of FINANCIAL_OPS_CAPABILITIES) {
    expect(migration).toContain(`'${capability}'`);
  }
  expect(migration).toContain("'view_own_commission'");
  expect(migration).toContain("'view_unit_reports'");
  expect(migration).toContain("identity_record.operational_role = 'admin'");
  expect(migration).toContain("identity_record.operational_role = 'owner'");
  expect(migration).toContain("'reopen_cash'");
  expect(migration).toContain('establishment.financial_ops_enabled');
  expect(migration).toContain('financial_ops_enabled boolean');
  expect(migration).toContain(
    'capabilities = potential authority of the actor',
  );
});

test('contrato compartilhado reconhece capabilities financeiras e role defaults', () => {
  for (const capability of FINANCIAL_OPS_CAPABILITIES) {
    expect(BUSINESS_CAPABILITIES).toContain(capability);
  }
  expect(BUSINESS_CAPABILITIES).toContain('view_team_orders');
  expect(BUSINESS_CAPABILITIES).toContain('view_orders');
  expect(BUSINESS_CAPABILITIES).toContain('void_orders');
  expect(BUSINESS_CAPABILITIES).toContain('manage_team_orders');
  expect(BUSINESS_CAPABILITIES).toContain('approve_sensitive_actions');
});

test('teste SQL é transacional e cobre isolamento/flag/capabilities', () => {
  expect(sqlTest.trimStart().startsWith('BEGIN;')).toBe(true);
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  expect(sqlTest).toContain('default financial_ops_enabled must be false');
  expect(sqlTest).toContain('unit B flag must be true');
  expect(sqlTest).toContain('admin must not receive reopen_cash');
  expect(sqlTest).toContain('outsider must not receive operational contexts');
  expect(sqlTest).toContain('financial_ops_flag_immutable');
  expect(sqlTest).toContain('INSERT INTO public.superadmins');
  expect(sqlTest).toContain('superadmin failed to enable financial_ops_enabled');
  expect(sqlTest).toContain('owner update of financial_ops_enabled should fail');
  expect(sqlTest).toContain('authenticated INSERT with financial_ops_enabled=true must fail');
  expect(sqlTest).toContain('owner update of unrelated establishment field failed');
  expect(sqlTest).toContain('same-value flag update blocked unrelated field write');
  expect(sqlTest).toContain('privileged update of financial_ops_enabled failed');
  expect(sqlTest).toContain('billing_accounts must remain intact');
  expect(sqlTest).toContain('financial_ops_foundation checks passed');
});

test('documento canônico registra decisões de payment_status e unicidade histórica', () => {
  expect(canonicalDoc).toContain('payment_status');
  expect(canonicalDoc).not.toContain('armazenado recalculado');
  expect(canonicalDoc).toContain(
    'UNIQUE (appointment_id) WHERE appointment_id IS NOT NULL',
  );
  expect(canonicalDoc).toContain('autoritativa persistida em `service_orders`');
  expect(canonicalDoc).toContain('**não** será uma coluna');
});
