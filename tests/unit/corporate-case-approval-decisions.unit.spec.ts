/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CorporateCasesError,
  parseCorporateCaseApprovalContext,
  parseCorporateCaseApprovalMutationResult,
} from '../../apps/control/src/services/corporate-cases';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824018000_corporate_case_approval_decisions.sql');
const service = read('apps/control/src/services/corporate-cases.ts');
const panel = read('apps/control/src/modules/cases/corporate-case-approval-panel.tsx');
const detail = read('apps/control/src/modules/cases/corporate-case-detail-screen.tsx');

test('adds a dedicated approval capability and versioned nominal slots', () => {
  expect(migration).toContain("'control.cases.approve'");
  expect(migration).toContain('ADD COLUMN version integer NOT NULL DEFAULT 1 CHECK (version > 0)');
  expect(migration).toContain('ADD COLUMN approver_was_owner boolean NOT NULL DEFAULT false');
  expect(migration).toContain('corporate_case_approval_slots_profile_unique');
  expect(migration).toContain('corporate_private.actor_has_active_control_permission');
  expect(migration).toContain('corporate_case_approval_slots_validate');
});

test('exposes only narrow AAL2 RPCs and revokes their public defaults', () => {
  for (const signature of [
    'public.list_corporate_case_approval_candidates(uuid, uuid)',
    'public.get_corporate_case_approval_context(uuid)',
    'public.decide_corporate_case_approval(\n  uuid, uuid, uuid, integer, integer, integer, text, text, uuid\n)',
  ]) {
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
  }
  expect(migration).toContain('actor_context := public.get_control_context()');
  expect(migration).not.toContain('user_metadata');
  expect(migration).not.toContain('service_role_key');
});

test('locks deterministically and protects retries with an intent fingerprint', () => {
  const decisionStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.decide_corporate_case_approval');
  const body = migration.slice(decisionStart);
  const caseLock = body.indexOf('FROM public.corporate_cases AS corporate_case');
  const taskLock = body.indexOf('FROM public.corporate_case_tasks AS task', caseLock);
  const approvalLock = body.indexOf('FROM public.corporate_case_approval_slots AS approval_slot', taskLock);
  const recheck = body.indexOf('Recheck after case -> task -> approval locks', approvalLock);
  expect(caseLock).toBeGreaterThan(0);
  expect(taskLock).toBeGreaterThan(caseLock);
  expect(approvalLock).toBeGreaterThan(taskLock);
  expect(recheck).toBeGreaterThan(approvalLock);
  expect(body).toContain("'request_fingerprint', request_fingerprint");
  expect(body).toContain("RAISE EXCEPTION 'corporate_case_version_conflict'");
});

test('consolidates approvals into fulfillment without applying access', () => {
  for (const fragment of [
    "slot_row.requested_approver_profile_id IS DISTINCT FROM actor_id",
    "RAISE EXCEPTION 'corporate_case_approval_separation_required'",
    "result_status := 'awaiting_approval'",
    "result_status := 'rejected'",
    "result_status := 'fulfillment'",
    "stage.task_type = 'fulfillment'",
    'INSERT INTO public.corporate_case_tasks(',
    'INSERT INTO public.corporate_case_sla_instances(',
    "'corporate_case.approval_decided'",
  ]) {
    expect(migration).toContain(fragment);
  }
  expect(migration).not.toContain('INSERT INTO public.control_access_requests');
  expect(migration).not.toContain('INSERT INTO public.control_user_access_assignments');
});

test('keeps decision reasons internal and outbound notifications generic', () => {
  expect(migration).toContain("target_client_request_id, 'internal', btrim(target_reason)");
  expect(migration).toContain("'reason_provided', true");
  expect(migration).not.toContain("'reason', btrim(target_reason)");
  expect(migration).toContain("'template_key', 'corporate_case.approval_updated'");
  expect(migration).toContain('Nenhuma decisão pode ser concluída por e-mail.');
});

test('Control uses typed approval RPCs and explicit confirmation', () => {
  for (const rpcName of [
    'list_corporate_case_approval_candidates',
    'get_corporate_case_approval_context',
    'decide_corporate_case_approval',
  ]) {
    expect(service).toContain(`rpc('${rpcName}'`);
  }
  expect(service).not.toContain("supabase.from('");
  expect(panel).toContain('corporate-case-approval-confirmation');
  expect(panel).toContain('Cada pessoa decide apenas seu próprio slot');
  expect(detail).toContain('<CorporateCaseApprovalPanel detail={detail} onChanged={onChanged} />');
});

test('parses approval context and mutation responses strictly', () => {
  expect(parseCorporateCaseApprovalContext({
    workflow_enabled: true,
    case_id: 'e0000000-0000-4000-8000-000000000001',
    case_version: 5,
    task: {
      task_id: 'e0000000-0000-4000-8000-000000000002',
      task_version: 1,
      status: 'pending',
      due_at: '2026-08-23T12:00:00.000Z',
    },
    approval: {
      approval_id: 'e0000000-0000-4000-8000-000000000003',
      approval_version: 1,
      slot_order: 1,
      decision: 'pending',
      due_at: '2026-08-23T12:00:00.000Z',
    },
    can_decide: true,
    approved_count: 0,
    pending_count: 2,
    required_approvals: 2,
    requires_owner_approval: true,
  })).toMatchObject({ canDecide: true, pendingCount: 2, requiresOwnerApproval: true });

  expect(parseCorporateCaseApprovalMutationResult({
    case_id: 'e0000000-0000-4000-8000-000000000001',
    case_version: 7,
    task_id: 'e0000000-0000-4000-8000-000000000002',
    task_version: 3,
    approval_id: 'e0000000-0000-4000-8000-000000000003',
    approval_version: 2,
    status: 'fulfillment',
    next_task_id: 'e0000000-0000-4000-8000-000000000004',
    approved_count: 2,
    required_approvals: 2,
    idempotent: false,
  })).toMatchObject({ status: 'fulfillment', approvedCount: 2, idempotent: false });

  expect(() => parseCorporateCaseApprovalContext({ workflow_enabled: 'true' }))
    .toThrow(CorporateCasesError);
});
