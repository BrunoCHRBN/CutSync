/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  CorporateCasesError,
  parseCorporateCaseDetail,
  parseCorporateCaseSummary,
  parseCorporateCasesReadContext,
  parseCorporateNotification,
} from '../../apps/control/src/services/corporate-cases';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260824015000_corporate_cases_read_models.sql');
const service = read('apps/control/src/services/corporate-cases.ts');

const summaryFixture = {
  case_id: '91000000-0000-0000-0000-000000000001',
  protocol: 'CI-1234567890AB',
  case_type_key: 'access_release',
  case_type_label: 'Liberação de acesso',
  risk_level: 'moderate',
  priority: 'normal',
  sensitivity: 'restricted',
  status: 'triage',
  subject: 'Acesso ao módulo financeiro',
  summary: 'Solicitação para atividade de conciliação.',
  current_stage_order: 1,
  current_group_label: 'Recebimento de acessos',
  current_assignee_name: null,
  requester_name: 'Solicitante',
  beneficiary_name: 'Beneficiário',
  expires_at: '2026-08-29T12:00:00.000Z',
  updated_at: '2026-08-22T12:00:00.000Z',
  created_at: '2026-08-22T11:00:00.000Z',
  version: 1,
};

test('keeps helpers private and exposes only five read-only AAL2 RPCs', () => {
  expect(migration).toContain('CREATE SCHEMA IF NOT EXISTS corporate_private');
  expect(migration).toContain('REVOKE ALL ON SCHEMA corporate_private FROM PUBLIC, anon, authenticated');
  expect(migration).toContain('corporate_private.actor_can_view_case');
  expect(migration).toContain('SECURITY DEFINER\nSET search_path = pg_catalog, public');
  expect(migration).toContain('actor_context := public.get_control_context()');

  for (const signature of [
    'public.get_corporate_cases_read_context()',
    'public.list_corporate_case_types()',
    'public.list_corporate_cases(\n  text, text, integer, timestamptz, uuid\n)',
    'public.get_corporate_case_detail(uuid)',
    'public.list_corporate_notifications(\n  boolean, integer, timestamptz, uuid\n)',
  ]) {
    expect(migration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
    expect(migration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
  }

  expect(migration).not.toContain('user_metadata');
  expect(migration).not.toContain("auth.jwt()->>'email'");
  expect(migration).not.toContain('support_tickets');
});

test('enforces relationship, group and sensitivity-aware visibility', () => {
  expect(migration).toContain('corporate_case.requester_profile_id = target_actor_id');
  expect(migration).toContain('corporate_case.beneficiary_profile_id = target_actor_id');
  expect(migration).toContain('corporate_private.actor_is_active_group_member');
  expect(migration).toContain("corporate_case.sensitivity <> 'confidential'");
  expect(migration).toContain('confidential_approval_slot.requested_approver_profile_id = target_actor_id');
  expect(migration).toContain("participant.participant_role = 'observer'");
  expect(migration).toContain("message.visibility = 'internal' AND can_view_internal");
  expect(migration).toContain("message.visibility = 'restricted' AND can_view_restricted");
  expect(migration).toContain('notification_event.case_id,');
  expect(migration).toContain("RAISE EXCEPTION 'corporate_case_not_found'");
});

test('uses bounded cursor pagination instead of offset', () => {
  expect(migration).toContain('target_limit NOT BETWEEN 1 AND 100');
  expect(migration).toContain('(corporate_case.updated_at, corporate_case.id) < (');
  expect(migration).toContain('(notification.created_at, notification.id) < (');
  expect(migration).not.toMatch(/\bOFFSET\b/i);
});

test('Control calls RPCs only and validates unknown payloads', () => {
  for (const rpcName of [
    'get_corporate_cases_read_context',
    'list_corporate_case_types',
    'list_corporate_cases',
    'get_corporate_case_detail',
    'list_corporate_notifications',
  ]) {
    expect(service).toContain(`rpc('${rpcName}'`);
  }
  expect(service).not.toContain("supabase.from('");
  expect(service).toContain('Number.isSafeInteger(value)');
  expect(service).toContain('requireRecord(record.form_payload)');
  expect(service).toContain('requireRecord(record.route_payload)');
});

test('parses read context, summary and notification contracts', () => {
  expect(parseCorporateCasesReadContext({
    enabled: true,
    creation_enabled: false,
    permissions: ['control.cases.read'],
    views: { mine: true, observing: true, pending: true, queue: false, all: false },
  })).toEqual({
    enabled: true,
    creationEnabled: false,
    permissions: ['control.cases.read'],
    views: { mine: true, observing: true, pending: true, queue: false, all: false },
  });

  expect(parseCorporateCaseSummary(summaryFixture)).toMatchObject({
    caseId: summaryFixture.case_id,
    status: 'triage',
    sensitivity: 'restricted',
  });

  expect(parseCorporateNotification({
    notification_id: '92000000-0000-0000-0000-000000000001',
    event_id: '93000000-0000-0000-0000-000000000001',
    event_category: 'case_assignment',
    importance: 'high',
    title: 'Nova pendência',
    body: 'Acesse o chamado para analisar.',
    route_payload: { caseId: summaryFixture.case_id },
    read_at: null,
    created_at: summaryFixture.created_at,
  })).toMatchObject({ importance: 'high', readAt: null });
});

test('parses sensitivity-filtered detail and rejects malformed data', () => {
  const detail = parseCorporateCaseDetail({
    case: {
      ...summaryFixture,
      case_number: 101,
      area: 'access',
      category: 'access_management',
      form_key: 'access_release',
      form_version: 1,
      requester_profile_id: '94000000-0000-0000-0000-000000000001',
      beneficiary_profile_id: '94000000-0000-0000-0000-000000000002',
      current_group_id: '95000000-0000-0000-0000-000000000001',
      current_assignee_profile_id: null,
      form_payload: { requestedProfileKey: 'finance_analyst' },
      external_reference: null,
      resolved_at: null,
      closed_at: null,
    },
    visibility: { internal: false, restricted: false },
    participants: [],
    tasks: [],
    approvals: [],
    messages: [],
    events: [],
  });

  expect(detail.case.caseNumber).toBe(101);
  expect(detail.case.formPayload).toEqual({ requestedProfileKey: 'finance_analyst' });
  expect(detail.visibility).toEqual({ internal: false, restricted: false });

  expect(() => parseCorporateCaseSummary({
    ...summaryFixture,
    status: 'invented_status',
  })).toThrow(CorporateCasesError);
  expect(() => parseCorporateCaseDetail({ case: summaryFixture })).toThrow(CorporateCasesError);
});
