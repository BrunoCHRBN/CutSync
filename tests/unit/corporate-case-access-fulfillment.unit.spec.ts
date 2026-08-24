/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CorporateCasesError,
  parseCorporateCaseFulfillmentContext,
  parseCorporateCaseFulfillmentMutationResult,
} from '../../apps/control/src/services/corporate-cases';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824019000_corporate_case_access_fulfillment.sql');
const service = read('apps/control/src/services/corporate-cases.ts');
const panel = read('apps/control/src/modules/cases/corporate-case-fulfillment-panel.tsx');
const detail = read('apps/control/src/modules/cases/corporate-case-detail-screen.tsx');
const actionPanel = read('apps/control/src/modules/cases/corporate-case-action-panel.tsx');

test('adds a dedicated critical fulfillment capability with least privilege', () => {
  expect(migration).toContain("'control.cases.fulfill'");
  expect(migration).toContain("WHERE access_profile.profile_key IN ('saas_owner', 'access_administrator')");
  expect(migration).toContain("'control.access.apply'");
  expect(migration).toContain('corporate_private.actor_can_fulfill_access_case');
});

test('enforces separation from requester, beneficiary, review and approval actors', () => {
  for (const fragment of [
    'corporate_case.requester_profile_id <> target_actor_id',
    'corporate_case.beneficiary_profile_id IS DISTINCT FROM target_actor_id',
    "previous_task.task_type IN ('triage', 'review')",
    'previous_task.completed_by = target_actor_id',
    'approval_slot.decided_by = target_actor_id',
    "RAISE EXCEPTION 'corporate_case_fulfillment_separation_required'",
  ]) {
    expect(migration).toContain(fragment);
  }
});

test('locks deterministically and protects execution retries by intent', () => {
  const start = migration.indexOf('CREATE OR REPLACE FUNCTION public.execute_corporate_access_fulfillment');
  const body = migration.slice(start);
  const caseLock = body.indexOf('FROM public.corporate_cases AS corporate_case');
  const taskLock = body.indexOf('FROM public.corporate_case_tasks AS task', caseLock);
  const projectionLock = body.indexOf('FROM public.corporate_case_access_requests AS access_request', taskLock);
  const legacyLock = body.indexOf('FROM public.control_access_requests AS request', projectionLock);
  expect(caseLock).toBeGreaterThan(0);
  expect(taskLock).toBeGreaterThan(caseLock);
  expect(projectionLock).toBeGreaterThan(taskLock);
  expect(legacyLock).toBeGreaterThan(projectionLock);
  expect(body).toContain("target_operation || '|' || btrim(target_reason)");
  expect(body).toContain("'request_fingerprint', request_fingerprint");
});

test('reuses the existing access authority without direct assignment writes', () => {
  expect(migration).toContain('apply_result := public.apply_control_access_request(');
  expect(migration).toContain('INSERT INTO public.control_access_requests(');
  expect(migration).toContain('legacy_access_request_id = legacy_request.id');
  expect(migration).not.toContain('INSERT INTO public.control_user_access_assignments');
  expect(migration).not.toContain('UPDATE public.control_user_access_assignments');
});

test('resolves only after application and returns failed work to the queue', () => {
  expect(migration).toContain("IF execution_status = 'applied' THEN");
  expect(migration).toContain("SET status = 'resolved'");
  expect(migration).toContain("SET status = 'pending',\n        assigned_profile_id = NULL");
  expect(migration).toContain("event_type := 'corporate_case.fulfillment_failed'");
  expect(migration).toContain("event_type := 'corporate_case.fulfillment_deferred'");
  expect(migration).toContain("'reason_provided', true");
  expect(migration).not.toContain("'reason', btrim(target_reason)");
});

test('exposes only narrow protected RPCs and generic multichannel notifications', () => {
  for (const signature of [
    'public.get_corporate_case_fulfillment_context(uuid)',
    'public.claim_corporate_case_fulfillment(\n  uuid, uuid, integer, integer, uuid\n)',
    'public.execute_corporate_access_fulfillment(\n  uuid, uuid, integer, integer, text, text, uuid\n)',
  ]) {
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
  }
  expect(migration).toContain("'template_key', 'corporate_case.fulfillment_updated'");
  expect(migration).toContain('O e-mail não contém justificativas, dados sensíveis ou ações executáveis.');
  expect(migration).not.toContain('user_metadata');
  expect(migration).not.toContain('service_role_key');
});

test('Control uses typed fulfillment RPCs and an explicit destructive confirmation', () => {
  for (const rpcName of [
    'get_corporate_case_fulfillment_context',
    'claim_corporate_case_fulfillment',
    'execute_corporate_access_fulfillment',
  ]) {
    expect(service).toContain(`rpc('${rpcName}'`);
  }
  expect(service).not.toContain("supabase.from('");
  expect(panel).toContain('corporate-case-fulfillment-confirmation');
  expect(panel).toContain('Esta ação pode conceder ou revogar acesso real.');
  expect(detail).toContain('<CorporateCaseFulfillmentPanel detail={detail} onChanged={onChanged} />');
  expect(actionPanel).toContain("task?.taskType === 'fulfillment'");
});

test('parses fulfillment context and mutation responses strictly', () => {
  expect(parseCorporateCaseFulfillmentContext({
    workflow_enabled: true,
    case_id: 'f0000000-0000-4000-8000-000000000001',
    case_version: 8,
    task: {
      task_id: 'f0000000-0000-4000-8000-000000000002',
      task_version: 2,
      status: 'in_progress',
      due_at: '2026-08-23T12:00:00.000Z',
      assigned_profile_id: 'f0000000-0000-4000-8000-000000000003',
    },
    request: {
      requested_action: 'grant',
      requested_profile_key: 'finance_manager',
      requested_profile_label: 'Gestor Financeiro',
      requested_valid_until: '2026-09-23T12:00:00.000Z',
      legacy_access_request_id: null,
      legacy_status: null,
    },
    can_claim: false,
    can_execute: true,
    separation_satisfied: true,
    attempt_count: 1,
    latest_outcome: 'deferred',
  })).toMatchObject({ canExecute: true, attemptCount: 1, latestOutcome: 'deferred' });

  expect(parseCorporateCaseFulfillmentMutationResult({
    case_id: 'f0000000-0000-4000-8000-000000000001',
    case_version: 9,
    task_id: 'f0000000-0000-4000-8000-000000000002',
    task_version: 3,
    status: 'resolved',
    execution_status: 'applied',
    legacy_access_request_id: 'f0000000-0000-4000-8000-000000000004',
    assignment_id: 'f0000000-0000-4000-8000-000000000005',
    failure_code: null,
    retryable: true,
    idempotent: false,
  })).toMatchObject({ status: 'resolved', executionStatus: 'applied', idempotent: false });

  expect(() => parseCorporateCaseFulfillmentContext({ workflow_enabled: 'true' }))
    .toThrow(CorporateCasesError);
});
