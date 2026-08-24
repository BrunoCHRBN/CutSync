/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CorporateCasesError,
  parseCorporateCaseActionContext,
  parseCorporateCaseWorkflowMutationResult,
} from '../../apps/control/src/services/corporate-cases';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824017000_corporate_case_workflow.sql');
const service = read('apps/control/src/services/corporate-cases.ts');
const panel = read('apps/control/src/modules/cases/corporate-case-action-panel.tsx');
const detail = read('apps/control/src/modules/cases/corporate-case-detail-screen.tsx');

test('keeps workflow disabled by default and exposes only narrow protected RPCs', () => {
  expect(migration).toContain('ADD COLUMN workflow_enabled boolean NOT NULL DEFAULT false');
  expect(migration).toContain('(NOT workflow_enabled OR enabled)');

  for (const signature of [
    'public.get_corporate_case_action_context(uuid)',
    'public.claim_corporate_case_task(uuid, uuid, integer, integer, uuid)',
    'public.advance_corporate_case_task(uuid, uuid, integer, integer, text, text, uuid[], uuid)',
  ]) {
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
  }

  expect(migration).toContain('actor_context := public.get_control_context()');
  expect(migration).toContain('corporate_private.actor_is_active_group_member');
  expect(migration).not.toContain('user_metadata');
  expect(migration).not.toContain('service_role_key');
});

test('locks case before task and rechecks idempotency after concurrent lock waits', () => {
  const claimStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.claim_corporate_case_task');
  const advanceStart = migration.indexOf('CREATE OR REPLACE FUNCTION public.advance_corporate_case_task');
  const claimBody = migration.slice(claimStart, advanceStart);
  const advanceBody = migration.slice(advanceStart);

  for (const body of [claimBody, advanceBody]) {
    const caseLock = body.indexOf('FROM public.corporate_cases AS corporate_case');
    const taskLock = body.indexOf('FROM public.corporate_case_tasks AS task', caseLock);
    const postLockRecheck = body.indexOf('Recheck after the deterministic case -> task locks', taskLock);
    expect(caseLock).toBeGreaterThan(0);
    expect(taskLock).toBeGreaterThan(caseLock);
    expect(postLockRecheck).toBeGreaterThan(taskLock);
    expect(body).toContain("RAISE EXCEPTION 'corporate_case_version_conflict'");
  }
});

test('enforces assignment, separation of duties and exact nominal approvers', () => {
  for (const fragment of [
    "task_row.status <> 'in_progress' OR task_row.assigned_profile_id <> actor_id",
    'cardinality(normalized_approver_ids) <> next_stage.required_approvals',
    'selected.profile_id <> actor_id',
    'selected.profile_id <> case_row.requester_profile_id',
    'selected.profile_id IS DISTINCT FROM case_row.beneficiary_profile_id',
    "RAISE EXCEPTION 'corporate_case_approver_ineligible'",
    "RAISE EXCEPTION 'corporate_case_owner_approver_required'",
    "'corporate_case.stage_advanced'",
    "'corporate_case.rejected'",
  ]) {
    expect(migration).toContain(fragment);
  }

  expect(migration).not.toContain('INSERT INTO public.control_access_requests');
  expect(migration).not.toContain('INSERT INTO public.control_user_access_assignments');
});

test('keeps reasons in internal notes and notifications free from their content', () => {
  expect(migration).toContain("target_client_request_id, 'internal', btrim(target_reason)");
  expect(migration).toContain("'reason_provided', true");
  expect(migration).not.toContain("'reason', btrim(target_reason)");
  expect(migration).toContain("'request_fingerprint', request_fingerprint");
  expect(migration).toContain('extensions.digest(');
  expect(migration).toContain("'template_key', CASE target_decision");
  expect(migration).toContain("'corporate_case.rejected'");
});

test('Control uses typed workflow RPCs and an explicit confirmation panel', () => {
  for (const rpcName of [
    'get_corporate_case_action_context',
    'claim_corporate_case_task',
    'advance_corporate_case_task',
  ]) {
    expect(service).toContain(`rpc('${rpcName}'`);
  }
  expect(service).not.toContain("supabase.from('");
  expect(panel).toContain('createCorporateCaseIdempotencyKey()');
  expect(panel).toContain('corporate-case-workflow-confirmation');
  expect(panel).toContain('Selecione exatamente');
  expect(detail).toContain('<CorporateCaseActionPanel detail={detail} onChanged={onChanged} />');
});

test('parses action and mutation responses strictly', () => {
  expect(parseCorporateCaseActionContext({
    workflow_enabled: true,
    case_id: 'a0000000-0000-4000-8000-000000000001',
    case_version: 3,
    task: {
      task_id: 'a0000000-0000-4000-8000-000000000002',
      stage_order: 2,
      task_type: 'review',
      assigned_group_id: 'a0000000-0000-4000-8000-000000000003',
      assigned_profile_id: 'a0000000-0000-4000-8000-000000000004',
      status: 'in_progress',
      due_at: '2026-08-22T18:00:00.000Z',
      version: 2,
    },
    can_claim: false,
    can_advance: true,
    next_stage: {
      stage_order: 3,
      stage_key: 'approval',
      label: 'Aprovação',
      task_type: 'approval',
      target_group_id: 'a0000000-0000-4000-8000-000000000005',
      required_approvals: 2,
      requires_owner_approval: true,
      requires_distinct_actor: true,
    },
    eligible_approvers: [{
      profile_id: 'a0000000-0000-4000-8000-000000000006',
      name: 'Aprovadora Control',
      email: 'approver@example.test',
      is_owner: true,
    }],
  })).toMatchObject({
    workflowEnabled: true,
    caseVersion: 3,
    canAdvance: true,
    nextStage: { requiredApprovals: 2, requiresOwnerApproval: true },
  });

  expect(parseCorporateCaseWorkflowMutationResult({
    case_id: 'a0000000-0000-4000-8000-000000000001',
    case_version: 4,
    task_id: 'a0000000-0000-4000-8000-000000000002',
    task_version: 3,
    status: 'awaiting_approval',
    next_task_id: 'a0000000-0000-4000-8000-000000000007',
    idempotent: false,
  })).toMatchObject({ status: 'awaiting_approval', taskVersion: 3 });

  expect(() => parseCorporateCaseActionContext({
    workflow_enabled: 'true',
  })).toThrow(CorporateCasesError);
});
