import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  parseCorporateCaseFulfillmentQueueItem,
} from '../../apps/control/src/services/corporate-cases';

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), 'utf8');
const migration = read('supabase/migrations/20260824020000_corporate_case_fulfillment_queue.sql');
const screen = read('apps/control/src/modules/cases/corporate-case-fulfillment-queue-screen.tsx');
const service = read('apps/control/src/services/corporate-cases.ts');

test('protects the fulfillment queue with eligibility, AAL2 context and least privilege', () => {
  expect(migration).toContain('public.get_control_context()');
  expect(migration).toContain("'control.cases.fulfill'");
  expect(migration).toContain("'control.access.apply'");
  expect(migration).toContain('corporate_private.actor_can_fulfill_access_case');
  expect(migration).toContain('corporate_private.actor_is_active_group_member');
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.list_corporate_case_fulfillment_queue(',
  );
  expect(migration).toContain('FROM PUBLIC, anon, authenticated;');
  expect(migration).toContain('TO authenticated, service_role;');
  expect(migration).not.toContain('GRANT SELECT ON public.corporate_');
});

test('uses keyset pagination and targeted partial indexes for the operational queue', () => {
  expect(migration).toContain('corporate_case_fulfillment_queue_idx');
  expect(migration).toContain("WHERE task_type = 'fulfillment'");
  expect(migration).toContain('corporate_case_fulfillment_events_idx');
  expect(migration).toContain('(task.due_at, task.id) > (target_cursor_due_at, target_cursor_id)');
  expect(migration).toContain('ORDER BY queue_row.row_task_due_at, queue_row.row_task_id');
  expect(migration).not.toMatch(/\bOFFSET\b/i);
});

test('filters priority, SLA and attempt state without returning sensitive case content', () => {
  expect(migration).toContain("target_priority NOT IN ('low', 'normal', 'high', 'critical')");
  expect(migration).toContain("target_sla_state NOT IN ('overdue', 'due_soon', 'on_track')");
  expect(migration).toContain(
    "target_attempt_state NOT IN ('not_attempted', 'failed', 'deferred')",
  );
  expect(migration).not.toMatch(/summary|justification|decision_reason/);
  expect(screen).toContain('corporate-case-fulfillment-queue-filters');
  expect(screen).toContain('Vencem em até 4h');
  expect(screen).toContain('Com falha');
  expect(screen).toContain('corporateCasePath(row.caseId)');
});

test('parses queue rows strictly and sends all backend filters', () => {
  expect(parseCorporateCaseFulfillmentQueueItem({
    case_id: 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
    protocol: 'CI-AABBCCDDEEFF',
    subject: 'Concessão de acesso financeiro',
    risk_level: 'high',
    priority: 'high',
    sensitivity: 'restricted',
    case_version: 3,
    task_id: 'bbbbbbbb-cccc-4ddd-8eee-ffffffffffff',
    task_version: 2,
    task_status: 'pending',
    task_due_at: '2026-08-24T15:00:00.000Z',
    sla_state: 'due_soon',
    assigned_group_label: 'Aplicação de acessos',
    assigned_profile_id: null,
    assigned_profile_name: null,
    beneficiary_name: 'Pessoa beneficiária',
    requested_action: 'grant',
    requested_profile_key: 'finance_manager',
    requested_profile_label: 'Gestão financeira',
    requested_valid_until: '2026-09-24T15:00:00.000Z',
    attempt_count: 1,
    attempt_state: 'failed',
    latest_failure_code: 'legacy_request_state_invalid',
    can_claim: true,
    can_execute: false,
    case_expired: false,
    expires_at: '2026-08-31T15:00:00.000Z',
    updated_at: '2026-08-24T12:00:00.000Z',
  })).toMatchObject({
    priority: 'high',
    slaState: 'due_soon',
    attemptState: 'failed',
    canClaim: true,
  });

  expect(service).toContain("rpc('list_corporate_case_fulfillment_queue', {");
  for (const argument of [
    'target_priority',
    'target_sla_state',
    'target_attempt_state',
    'target_limit',
    'target_cursor_due_at',
    'target_cursor_id',
  ]) {
    expect(service).toContain(`${argument}:`);
  }
  expect(service).not.toContain("supabase.from('corporate_case_tasks')");
});
