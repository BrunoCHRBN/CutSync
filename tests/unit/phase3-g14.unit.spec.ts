import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  clientReassignmentOutboxKey,
  decodeClientReassignmentOutbox,
  encodeClientReassignmentOutbox,
  type ClientReassignmentOutboxEntry,
} from '../../packages/database/src/client-reassignment-outbox';
import {
  businessDecisionOutboxKey,
  decodeBusinessDecisionOutbox,
  encodeBusinessDecisionOutbox,
  type BusinessDecisionOutboxEntry,
} from '../../packages/database/src/business-decision-outbox';

const fixture: ClientReassignmentOutboxEntry = {
  version: 1,
  userId: '9cabb0db-fe1a-4467-847c-9afa5be33239',
  appointmentId: '64198c6c-5c24-48cc-88d9-c7df9c4556af',
  reassignmentRequestId: 'e7539d77-a327-44cc-91bd-9203a6b2bc1d',
  decision: 'accept_replacement',
  chosenProfessionalId: null,
  expectedVersion: 3,
  requestId: 'fa81bd4a-830c-4b56-befa-2e092aacefff',
  correlationId: 'b8dc8bf6-29fa-47ed-8f57-4549cd2ca6f4',
  status: 'offline_pending',
  attempts: 1,
  createdAt: '2026-08-09T12:00:00.000Z',
  updatedAt: '2026-08-09T12:01:00.000Z',
  lastError: 'network_error',
};

const businessFixture: BusinessDecisionOutboxEntry = {
  version: 1,
  userId: fixture.userId,
  establishmentId: '5ee28a73-68ea-4ae8-95c2-978c22a7f39e',
  reassignmentRequestId: fixture.reassignmentRequestId,
  action: 'propose',
  professionalId: 'efbed78b-b1f8-4625-863f-aa77d185dc18',
  reason: null,
  expectedVersion: 3,
  requestId: fixture.requestId,
  correlationId: fixture.correlationId,
  status: 'offline_pending',
  attempts: 1,
  createdAt: fixture.createdAt,
  updatedAt: fixture.updatedAt,
  lastError: 'network_error',
};

test('outbox Client é isolada por usuário, limitada e fail-closed', () => {
  const now = Date.parse('2026-08-10T12:00:00.000Z');
  const raw = encodeClientReassignmentOutbox([fixture]);
  expect(decodeClientReassignmentOutbox(raw, fixture.userId, now)).toEqual([fixture]);
  expect(decodeClientReassignmentOutbox(raw, 'd35f5b10-bdf0-44de-8079-f32dc09d1d8c', now)).toEqual([]);
  expect(decodeClientReassignmentOutbox('{invalid', fixture.userId, now)).toBeNull();
  expect(decodeClientReassignmentOutbox(JSON.stringify([{
    ...fixture,
    decision: 'apply',
  }]), fixture.userId, now)).toEqual([]);
  expect(decodeClientReassignmentOutbox(
    raw,
    fixture.userId,
    Date.parse('2026-08-20T12:00:00.000Z'),
  )).toEqual([]);
  expect(clientReassignmentOutboxKey(fixture.userId)).toContain(fixture.userId);
});

test('replay persiste antes da RPC e reutiliza requestId sem conclusão otimista', () => {
  const outbox = fs.readFileSync(path.join(
    process.cwd(),
    'apps/client/src/features/appointments/client-reassignment-outbox.ts',
  ), 'utf8');
  const hook = fs.readFileSync(path.join(
    process.cwd(),
    'apps/client/src/features/appointments/use-client-reassignment.ts',
  ), 'utf8');
  const panel = fs.readFileSync(path.join(
    process.cwd(),
    'apps/client/src/components/appointments/client-reassignment-ui.tsx',
  ), 'utf8');
  expect(hook.indexOf('enqueueClientReassignmentCommand({')).toBeLessThan(
    hook.indexOf('await decideClientReassignment({'),
  );
  expect(hook).toContain('requestId: entry.requestId');
  expect(outbox).toContain('requestId: entry.requestId');
  expect(outbox).toContain("error.code === 'network'");
  expect(outbox).toContain("'offline_pending'");
  expect(outbox).toContain('removeClientReassignmentCommand(userId, entry.requestId)');
  expect(panel).toContain('client-reassignment-offline-pending');
  expect(panel).toContain('mesmo protocolo será reenviado');
  expect(panel).not.toContain('Alteração concluída com sucesso');
});

test('outbox Business preserva usuário, unidade, versão e payload da ação', () => {
  const now = Date.parse('2026-08-10T12:00:00.000Z');
  const raw = encodeBusinessDecisionOutbox([businessFixture]);
  expect(decodeBusinessDecisionOutbox(raw, businessFixture.userId, now)).toEqual([businessFixture]);
  expect(decodeBusinessDecisionOutbox(raw, 'd35f5b10-bdf0-44de-8079-f32dc09d1d8c', now)).toEqual([]);
  expect(decodeBusinessDecisionOutbox(JSON.stringify([{
    ...businessFixture,
    professionalId: null,
  }]), businessFixture.userId, now)).toEqual([]);
  expect(decodeBusinessDecisionOutbox(JSON.stringify([{
    ...businessFixture,
    action: 'withdraw',
    professionalId: null,
    reason: 'x',
  }]), businessFixture.userId, now)).toEqual([]);
  expect(businessDecisionOutboxKey(businessFixture.userId)).toContain(businessFixture.userId);
});

test('Business persiste antes da RPC e serializa replay por usuário e unidade', () => {
  const outbox = fs.readFileSync(path.join(
    process.cwd(),
    'apps/business/src/features/decisions/business-decision-outbox.ts',
  ), 'utf8');
  const hook = fs.readFileSync(path.join(
    process.cwd(),
    'apps/business/src/features/decisions/use-business-decisions.ts',
  ), 'utf8');
  const screen = fs.readFileSync(path.join(
    process.cwd(), 'apps/business/src/screens/decision-detail.tsx',
  ), 'utf8');
  expect(hook.indexOf('enqueueBusinessDecisionCommand({')).toBeLessThan(
    hook.indexOf('await executeBusinessDecisionCommand(entry)'),
  );
  expect(hook).toContain('await invalidateDecisionReads();');
  expect(outbox).toContain('requestId: entry.requestId');
  expect(outbox).toContain('replayLocks.get(key)');
  expect(outbox).toContain("error.code === 'network_error'");
  expect(outbox).toContain('entry.establishmentId !== establishmentId');
  expect(screen).toContain('business-decision-offline-pending');
  expect(screen).toContain('mesmo requestId no replay');
  expect(screen).not.toContain('Alteração concluída com sucesso');
});

test('push de reatribuição nasce do evento imutável e mantém deep link validado', () => {
  const migration = fs.readFileSync(path.join(
    process.cwd(),
    'supabase/migrations/20260823000000_phase3_business_decision_read_models.sql',
  ), 'utf8');
  const notificationContract = fs.readFileSync(path.join(
    process.cwd(), 'packages/domain/src/client-notifications.ts',
  ), 'utf8');
  expect(migration).toContain('public.enqueue_client_reassignment_push()');
  expect(migration).toContain('AFTER INSERT ON public.appointment_assignment_events');
  expect(migration).toContain("'appointment_reassignment_decision_required'");
  expect(migration).toContain("'appointment_reassignment_updated'");
  expect(migration).toContain('ON CONFLICT (event_key, push_device_id) DO NOTHING');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.enqueue_client_reassignment_push()');
  expect(migration).not.toContain('GRANT EXECUTE ON FUNCTION public.enqueue_client_reassignment_push() TO authenticated');
  expect(notificationContract).toContain("'appointment_reassignment_decision_required'");
  expect(notificationContract).toContain("pathname: '/appointments/[id]'");
});

test('workflow prepara evidência CI sem declarar aprovação ou homologação de dispositivo', () => {
  const workflow = fs.readFileSync(path.join(
    process.cwd(), '.github/workflows/phase3-gate.yml',
  ), 'utf8');
  const evidence = fs.readFileSync(path.join(
    process.cwd(), 'docs/architecture/GATE_G14_PREPARATION.md',
  ), 'utf8');
  expect(workflow).toContain('supabase/tests/phase3_*.sql');
  expect(workflow).toContain('npm run typecheck:new-apps');
  expect(workflow).toContain('npm run test:phase2:real-jwt');
  expect(workflow).toContain('Classificação: CI reproduzido');
  expect(workflow).toContain('Não comprova: push em dispositivo real');
  expect(evidence).toContain('em preparação; não aprovado');
  expect(evidence).toContain('cold start, background e foreground');
});

test('Business expõe diagnóstico de contexto somente com códigos sanitizados', () => {
  const api = fs.readFileSync(path.join(
    process.cwd(), 'apps/business/src/services/business-api.ts',
  ), 'utf8');
  const provider = fs.readFileSync(path.join(
    process.cwd(), 'apps/business/src/contexts/business-operational-context.tsx',
  ), 'utf8');
  expect(api).toContain('/^[A-Z0-9_]{2,64}$/');
  expect(api).toContain('normalizeBusinessDiagnosticCode(diagnosticCode)');
  expect(api).toContain("diagnosticCode ? `REMOTE_${diagnosticCode}` : null");
  expect(api).toContain("'AUTHORIZED_CONTEXTS_SHAPE'");
  expect(api).toContain("'OPERATIONAL_CONTEXTS_ROW'");
  expect(provider).toContain('normalizeBusinessDiagnosticCode');
  expect(provider).toContain('targetError.diagnosticCode ?? targetError.code.toUpperCase()');
});
