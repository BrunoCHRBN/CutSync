/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CorporateCasesError,
  parseCorporateAccessCaseCreationResult,
  parseCorporateAccessExpiryInput,
  parseCorporateAccessRequestProfile,
  parseCorporateCaseIdentity,
} from '../../apps/control/src/services/corporate-cases';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824016000_corporate_access_case_creation.sql');
const service = read('apps/control/src/services/corporate-cases.ts');
const screen = read('apps/control/src/modules/cases/corporate-access-case-create-screen.tsx');

test('keeps the structured access projection private and exposes only narrow RPCs', () => {
  expect(migration).toContain('CREATE TABLE public.corporate_case_access_requests');
  expect(migration).toContain('ALTER TABLE public.corporate_case_access_requests ENABLE ROW LEVEL SECURITY');
  expect(migration).toContain('REVOKE ALL ON TABLE public.corporate_case_access_requests');
  expect(migration).toContain('GRANT ALL ON TABLE public.corporate_case_access_requests TO service_role');

  for (const signature of [
    'public.list_corporate_access_request_profiles()',
    'public.find_corporate_case_participant_by_email(text)',
    'public.create_corporate_access_case(\n  uuid, text, text, text, timestamptz, text, uuid[], uuid\n)',
  ]) {
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
  }

  expect(migration).toContain('actor_context := public.get_control_context()');
  expect(migration).toContain("'control.cases.request' = ANY(actor_permissions)");
  expect(migration).not.toContain('user_metadata');
  expect(migration).not.toContain('service_role_key');
});

test('derives routing and creates the case lifecycle atomically without applying access', () => {
  for (const fragment of [
    'INSERT INTO public.corporate_cases(',
    'INSERT INTO public.corporate_case_access_requests(',
    'INSERT INTO public.corporate_case_participants(',
    'INSERT INTO public.corporate_case_tasks(',
    'INSERT INTO public.corporate_case_sla_instances(',
    'INSERT INTO public.corporate_case_events(',
    'INSERT INTO public.corporate_notifications(',
    'INSERT INTO public.corporate_notification_outbox(',
    "'corporate_case.created'",
  ]) {
    expect(migration).toContain(fragment);
  }
  expect(migration).toContain('routing_policy.risk_level = requested_profile.risk_level');
  expect(migration).toContain('initial_stage.stage_order = 1');
  expect(migration).toContain('IF runtime_settings.email_enabled THEN');
  expect(migration).not.toContain('INSERT INTO public.control_access_requests');
  expect(migration).not.toContain('INSERT INTO public.control_user_access_assignments');
});

test('enforces idempotency, exact Control identities and bounded observers', () => {
  expect(migration).toContain('corporate_case.client_request_id = target_client_request_id');
  expect(migration).toContain("RAISE EXCEPTION 'idempotency_conflict'");
  expect(migration).toContain("JOIN public.governance_users AS governance_user");
  expect(migration).toContain('cardinality(coalesce(target_observer_profile_ids, ARRAY[]::uuid[])) > 10');
  expect(migration).toContain('SELECT DISTINCT observer_id');
  expect(migration).toContain("RAISE EXCEPTION 'corporate_case_creation_disabled'");
});

test('Control validates write responses and uses only RPCs', () => {
  for (const rpcName of [
    'list_corporate_access_request_profiles',
    'find_corporate_case_participant_by_email',
    'create_corporate_access_case',
  ]) {
    expect(service).toContain(`rpc('${rpcName}'`);
  }
  expect(service).not.toContain("supabase.from('");
  expect(screen).toContain('getCorporateCasesReadContext()');
  expect(screen).toContain('readContext.creationEnabled');
  expect(screen).toContain('createCorporateCaseIdempotencyKey()');
  expect(screen).toContain('router.replace(corporateCasePath(result.caseId)');
  expect(screen).not.toContain('createControlAccessRequest');
});

test('parses creation contracts and validates calendar-bounded expiry', () => {
  expect(parseCorporateAccessRequestProfile({
    profile_id: 'a0000000-0000-4000-8000-000000000001',
    profile_key: 'finance_analyst',
    label: 'Analista financeiro',
    description: 'Acesso financeiro delegado.',
    risk_level: 'high',
    required_approvals: 2,
    requires_owner_approval: true,
    requires_expiry: true,
    review_interval_days: 90,
  })).toMatchObject({ profileKey: 'finance_analyst', riskLevel: 'high' });

  expect(parseCorporateCaseIdentity({
    profile_id: 'a0000000-0000-4000-8000-000000000002',
    name: 'Pessoa Control',
    email: 'pessoa@example.test',
  })).toMatchObject({ name: 'Pessoa Control' });

  expect(parseCorporateAccessCaseCreationResult({
    case_id: 'a0000000-0000-4000-8000-000000000003',
    protocol: 'CI-1234567890AB',
    status: 'submitted',
    version: 1,
    created_at: '2026-08-22T12:00:00.000Z',
    idempotent: false,
  })).toMatchObject({ status: 'submitted', idempotent: false });

  const now = Date.parse('2026-08-22T12:00:00.000Z');
  expect(parseCorporateAccessExpiryInput('2026-08-23', now)).toContain('2026-08-24T02:59:59.999Z');
  expect(() => parseCorporateAccessExpiryInput('2026-02-31', now)).toThrow(CorporateCasesError);
  expect(() => parseCorporateAccessExpiryInput('2028-01-01', now)).toThrow(CorporateCasesError);
});
