/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read('supabase/migrations/20260802000000_support_center_foundation.sql');
const jsm = read('supabase/functions/_shared/jsm.ts');
const shared = read('supabase/functions/_shared/support.ts');
const createTicket = read('supabase/functions/create-jsm-ticket/index.ts');
const replyTicket = read('supabase/functions/reply-jsm-ticket/index.ts');
const worker = read('supabase/functions/reconcile-jsm-support/index.ts');
const clientService = read('apps/client/src/features/support/client-support-service.ts');
const controlService = read('apps/control/src/services/control-support.ts');

const functionBody = (name: string, nextName: string) => {
  const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
  const end = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${nextName}`, start + 1);
  expect(start, `${name} deve existir`).toBeGreaterThanOrEqual(0);
  expect(end, `${nextName} deve existir depois de ${name}`).toBeGreaterThan(start);
  return migration.slice(start, end);
};

test('nasce desativado, roteia para SUPORTE_GERAL e preserva expansão por equipe', () => {
  expect(migration).toContain('CREATE TABLE public.support_runtime_settings');
  expect(migration).toMatch(/enabled boolean NOT NULL DEFAULT false/);
  expect(migration).toMatch(/allow_new_tickets boolean NOT NULL DEFAULT false/);
  expect(migration).toMatch(/sync_enabled boolean NOT NULL DEFAULT false/);
  expect(migration).toContain("'SUPORTE_GERAL'");
  expect(migration).toContain('CREATE TABLE public.support_teams');
  expect(migration).toContain('CREATE TABLE public.support_team_members');
  expect(migration).toContain('CREATE TABLE public.support_routing_rules');
  expect(migration).toContain(
    'organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE',
  );
  expect(migration).toContain(
    'establishment_id uuid REFERENCES public.establishments(id) ON DELETE CASCADE',
  );
  expect(migration).toContain(
    'rule.establishment_id = selected_establishment_id',
  );
});

test('mantém outbox, reconciliação, retenção e filas de push independentes', () => {
  expect(migration).toContain('CREATE TABLE public.support_sync_operations');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_support_sync_operation');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_support_sync_operations');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.purge_expired_support_content');
  expect(migration).toContain('CREATE TABLE public.support_push_deliveries');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.claim_support_push_receipts');
  expect(worker).toContain('x-cutsync-support-secret');
  expect(worker).toContain('healthy: false');
});

test('isola chamados por requester e reserva operações internas à service role', () => {
  expect(migration).toContain('ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY');
  expect(migration).toContain('ALTER TABLE public.support_messages ENABLE ROW LEVEL SECURITY');
  expect(migration).toContain('requester_id = (SELECT auth.uid())');
  expect(migration).toContain(
    'REVOKE ALL ON FUNCTION public.create_support_ticket_internal',
  );
  expect(migration).toContain(
    'GRANT EXECUTE ON FUNCTION public.create_support_ticket_internal',
  );
  expect(migration).toContain('TO service_role');
  expect(createTicket).toContain('authenticateSupportRequest(request)');
  expect(replyTicket).toContain('authenticateSupportRequest(request)');
});

test('separa o payload público dos metadados operacionais do Jira', () => {
  const publicTicket = functionBody(
    'support_public_ticket_payload',
    'support_public_message_payload',
  );
  const publicMessage = functionBody(
    'support_public_message_payload',
    'enqueue_support_push',
  );

  for (const privateField of [
    'jsm_issue_key',
    'jsm_issue_url',
    'team_id',
    'assignee_profile_id',
    'last_sync_error_code',
  ]) expect(publicTicket).not.toContain(`'${privateField}'`);
  expect(publicMessage).not.toContain("'jsm_comment_id'");
  expect(shared).toContain('publicSupportTicketPayload');
  expect(shared).toContain('publicSupportMessagePayload');
  expect(clientService).not.toMatch(
    /JSM_(REQUESTER|AGENT|FIELD)|ATLASSIAN_API_TOKEN/,
  );
});

test('exige identidades separadas e todos os campos de roteamento/SLA do JSM', () => {
  expect(jsm).toContain('JSM_REQUESTER_EMAIL');
  expect(jsm).toContain('JSM_REQUESTER_ACCOUNT_ID');
  expect(jsm).toContain('JSM_AGENT_EMAIL');
  for (const field of [
    'JSM_FIELD_AREA',
    'JSM_FIELD_CUTSYNC_TEAM',
    'JSM_FIELD_LOCATION',
    'JSM_FIELD_ESCALATION_LEVEL',
    'JSM_FIELD_IMPACT',
    'JSM_FIELD_PRIORITY',
  ]) expect(jsm).toContain(`requiredEnvironment("${field}")`);
  expect(jsm).toContain(
    'comment.authorAccountId === this.config.requesterAccountId',
  );
  expect(jsm).toContain('|^pending$|^pendente$');
});

test('mantém appointment textual no Client e no Control', () => {
  expect(migration).toContain('appointment_id text REFERENCES public.appointments(id)');
  expect(clientService).toContain("'appointment_id'");
  expect(controlService).toContain(
    'appointmentId: asString(payload.appointment_id, true)',
  );
});
