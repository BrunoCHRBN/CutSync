/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const migration = read(
  'supabase/migrations/20260820000000_phase0_appointment_reassignment_containment.sql',
);
const sqlTest = read('supabase/tests/appointment_reassignment_containment.sql');
const appointmentActions = read('apps/web/src/features/appointments/use-appointment-actions.ts');
const absenceWizard = read(
  'apps/web/src/components/screens/professional-agenda/AbsenceModeWizard.tsx',
);
const agendaScreen = read(
  'apps/web/src/components/screens/professional-agenda/ProfessionalAgendaScreen.tsx',
);

test('flag de reatribuição nasce desligada e rejeita escrita dos apps', () => {
  expect(migration).toContain(
    'appointment_reassignment_enabled boolean NOT NULL DEFAULT false',
  );
  expect(migration).toContain('establishments_protect_appointment_reassignment_flag');
  expect(migration).toContain("COALESCE(jwt_role, '') IN ('anon', 'authenticated')");
  expect(migration).toContain('appointment_reassignment_flag_write_forbidden');
});

test('reschedule mantém remarcação no mesmo profissional e contém troca direta', () => {
  expect(migration).toContain(
    'previous_professional_id IS DISTINCT FROM requested_professional_id',
  );
  expect(migration).toContain('current_appointment.client_id IS NOT NULL');
  expect(migration).toContain('current_appointment.establishment_client_id IS NOT NULL');
  expect(migration).toContain('appointment_reassignment_requires_workflow');
  expect(migration).toContain(
    'current_appointment.client_id IS DISTINCT FROM actor_id AND NOT actor_is_staff',
  );
});

test('walk-in sem cliente usa correção estreita, idempotente e auditada', () => {
  expect(migration).toContain(
    'CREATE OR REPLACE FUNCTION public.transfer_unlinked_walk_in_professional',
  );
  expect(migration).toContain("COALESCE(actor_role, '') NOT IN ('owner', 'admin')");
  expect(migration).toContain('idempotency_key_required');
  expect(migration).toContain('appointment_locked_by_service_order');
  expect(migration).toContain("'appointment.walk_in.transferred'");
  expect(migration).toContain('authorization_audit_log_walk_in_transfer_request_idx');
  expect(migration).not.toContain("'client_name'");
});

test('modo ausência mantém contenção e cria solicitações sem prometer transferência', () => {
  expect(migration).toContain("ELSIF action_name = 'transfer' THEN");
  expect(migration).toContain("'ok', false");
  expect(appointmentActions).not.toContain("action: 'transfer'");
  expect(appointmentActions).not.toContain('Atendimento transferido');
  expect(absenceWizard).toContain("type ItemDecision = 'request_reassignment' | 'cancel' | 'keep'");
  expect(absenceWizard).toContain("decision === 'request_reassignment'");
  expect(absenceWizard).not.toContain("'Transferir'");
  expect(agendaScreen).toContain('canTransfer={canRequestSelectedReassignment}');
  expect(agendaScreen).toContain('<TransferProfessionalModal');
  expect(agendaScreen).toContain("responsibility: 'professional'");
});

test('teste SQL é transacional e cobre bloqueios com JWT autenticado', () => {
  expect(sqlTest.trimStart().startsWith('BEGIN;')).toBe(true);
  expect(sqlTest.trimEnd().endsWith('ROLLBACK;')).toBe(true);
  expect(sqlTest).toContain('appointment_reassignment_flag_write_forbidden');
  expect(sqlTest).toContain('appointment_reassignment_requires_workflow');
  expect(sqlTest).toContain('professional cannot correct an unlinked walk-in');
});
