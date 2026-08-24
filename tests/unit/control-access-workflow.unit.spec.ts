/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824013000_control_access_profiles_and_approvals.sql');
const service = read('apps/control/src/services/control-access-workflow.ts');
const createScreen = read('apps/control/src/modules/gsp/access-request-create-screen.tsx');
const approvalsScreen = read('apps/control/src/modules/gsp/access-approvals-screen.tsx');
const applicationScreen = read('apps/control/src/modules/gsp/access-application-screen.tsx');

test('exposes only protected workflow RPCs to the Control client', () => {
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.find_control_access_target_by_email');
  expect(migration).toContain("current_control_has_permission('control.access.request')");
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.find_control_access_target_by_email(text)');
  expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.find_control_access_target_by_email(text)');
  expect(service).toContain("rpc('list_control_access_profiles')");
  expect(service).toContain("rpc('find_control_access_target_by_email', { target_email: email })");
  expect(service).toContain("rpc('list_control_access_requests', { target_status: status })");
  expect(service).toContain("rpc('create_control_access_request', {");
  expect(service).toContain("rpc('decide_control_access_request', {");
  expect(service).toContain("rpc('apply_control_access_request', {");
});

test('validates every unknown workflow payload before rendering it', () => {
  expect(service).toContain('export function parseControlDelegatedAccessProfile');
  expect(service).toContain('export function parseControlAccessRequest');
  expect(service).toContain('export function parseControlAccessMutationResult');
  expect(service).toContain('Number.isSafeInteger(value)');
  expect(service).toContain('requestStatuses.includes');
  expect(service).toContain('requestActions.includes');
  expect(service).toContain('globalThis.crypto.randomUUID()');
});

test('keeps request creation separate from access application', () => {
  expect(createScreen).toContain('A criação não concede acesso');
  expect(createScreen).toContain('Enviar para aprovação');
  expect(createScreen).toContain('clientRequestId: createControlIdempotencyKey()');
  expect(createScreen).not.toContain('setControlUserAccess(');
  expect(migration).toContain("status text NOT NULL DEFAULT 'awaiting_approval'");
  expect(migration).toContain("request_row.status <> 'approved'");
});

test('enforces separation of duties in both UI and database', () => {
  expect(approvalsScreen).toContain('selected.requestedBy === context?.profileId');
  expect(approvalsScreen).toContain('selected.targetProfileId === context?.profileId');
  expect(approvalsScreen).toContain('decideControlAccessRequest({');
  expect(migration).toContain('request_row.requested_by = actor_id');
  expect(migration).toContain('request_row.target_profile_id = actor_id');
  expect(migration).toContain("RAISE EXCEPTION 'approval_separation_required'");
});

test('applies only approved versioned requests with idempotency', () => {
  expect(applicationScreen).toContain("listControlAccessRequests('approved')");
  expect(applicationScreen).toContain('expectedVersion: pending.request.version');
  expect(applicationScreen).toContain('clientRequestId: createControlIdempotencyKey()');
  expect(migration).toContain('request_row.version <> target_expected_version');
  expect(migration).toContain('request_row.apply_request_id IS NOT NULL');
  expect(migration).toContain("'control.access.applied'");
});
