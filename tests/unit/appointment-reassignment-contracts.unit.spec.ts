import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import {
  APPOINTMENT_PROFESSIONAL_PREFERENCES,
  APPOINTMENT_REASSIGNMENT_STATUSES,
  CUSTOMER_CHANGE_DECISIONS,
  isAppointmentProfessionalPreference,
  isAppointmentReassignmentStatus,
  isCustomerChangeDecision,
} from '../../packages/database/src/appointment-reassignment';

const rpcMigration = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260822001000_phase2_reassignment_request_validate_propose.sql',
), 'utf8');
const closeMigration = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260822002000_phase2_reassignment_decide_apply_close.sql',
), 'utf8');
const correctionMigration = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260822003000_phase2_assignment_correction_approval.sql',
), 'utf8');
const g13Migration = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260822004000_phase2_g13_policy_shadow_validation.sql',
), 'utf8');
const phase2Workflow = fs.readFileSync(path.join(
  process.cwd(), '.github/workflows/phase2-gate.yml',
), 'utf8');
const realJwtValidator = fs.readFileSync(path.join(
  process.cwd(), 'scripts/validate-phase2-real-jwt.mjs',
), 'utf8');

test('expõe preferências profissionais sem inferir aceite do legado', () => {
  expect(APPOINTMENT_PROFESSIONAL_PREFERENCES).toEqual(['specific', 'any_available']);
  expect(isAppointmentProfessionalPreference('specific')).toBe(true);
  expect(isAppointmentProfessionalPreference('any_available')).toBe(true);
  expect(isAppointmentProfessionalPreference('legacy_transfer')).toBe(false);
});

test('mantém estados intermediários e terminais da reatribuição separados', () => {
  expect(APPOINTMENT_REASSIGNMENT_STATUSES).toEqual([
    'requested',
    'validating',
    'awaiting_manager',
    'awaiting_customer',
    'ready_to_apply',
    'applied',
    'declined',
    'withdrawn',
    'expired',
    'failed',
    'manual_review',
  ]);
  expect(isAppointmentReassignmentStatus('awaiting_customer')).toBe(true);
  expect(isAppointmentReassignmentStatus('transferred')).toBe(false);
});

test('mantém a decisão do cliente distinta do estado do workflow', () => {
  expect(CUSTOMER_CHANGE_DECISIONS).toContain('accept_replacement');
  expect(CUSTOMER_CHANGE_DECISIONS).toContain('cancel_due_to_change');
  expect(isCustomerChangeDecision('contested')).toBe(true);
  expect(isCustomerChangeDecision('applied')).toBe(false);
});

test('request, validate e propose são server-side sem aplicar a troca', () => {
  expect(rpcMigration).toContain('public.request_appointment_reassignment(');
  expect(rpcMigration).toContain('public.validate_appointment_reassignment(');
  expect(rpcMigration).toContain('public.propose_appointment_reassignment(');
  expect(rpcMigration).toContain("'request_appointment_reassignment', 'full'");
  expect(rpcMigration).toContain("'apply_appointment_reassignment', 'full'");
  expect(rpcMigration).toContain('FOR UPDATE');
  expect(rpcMigration).toContain('target_expected_version');
  expect(rpcMigration).toContain('target_request_id');
  expect(rpcMigration).toContain('appointment_reassignment_after_order_open');
  expect(rpcMigration).toContain('replacement_professional_not_qualified');
  expect(rpcMigration).toContain('replacement_professional_unavailable');
  expect(rpcMigration).not.toContain('SET professional_id = target_proposed_professional_id');
});

test('decisão e aplicação fecham o workflow somente após revalidação server-side', () => {
  expect(closeMigration).toContain('public.decide_appointment_reassignment(');
  expect(closeMigration).toContain('public.apply_appointment_reassignment(');
  expect(closeMigration).toContain('public.withdraw_appointment_reassignment(');
  expect(closeMigration).toContain('public.expire_appointment_reassignment(');
  expect(closeMigration).toContain('customer_decision_required');
  expect(closeMigration).toContain('customer_acceptance_required');
  expect(closeMigration).toContain('replacement_professional_unavailable');
  expect(closeMigration).toContain('target_expected_version');
  expect(closeMigration).toContain('FOR UPDATE');
  expect(closeMigration).toContain('professional_id = proposed_assignment.professional_id');
});

test('correção factual exige serviço encerrado, AAL2 e aprovação separada', () => {
  expect(correctionMigration).toContain('public.request_appointment_assignment_correction_approval(');
  expect(correctionMigration).toContain('public.decide_appointment_assignment_correction_approval(');
  expect(correctionMigration).toContain('public.correct_appointment_assignment(');
  expect(correctionMigration.match(/public\.require_aal2\(\)/g)?.length).toBeGreaterThanOrEqual(3);
  expect(correctionMigration).toContain('approval_separation_required');
  expect(correctionMigration).toContain('assignment_correction_requires_completed_service');
  expect(correctionMigration).toContain("status = 'corrected'");
  expect(correctionMigration).toContain("target_proposed_professional_id, 'active', 'correction'");
  expect(correctionMigration).toContain('consumed_at = now()');
});

test('any_available só dispensa decisão com política aceita e condição equivalente', () => {
  expect(g13Migration).toContain("preference = 'any_available'");
  expect(g13Migration).toContain('policy_accepted');
  expect(g13Migration).toContain("'establishmentId'");
  expect(g13Migration).toContain("'legalEntityId'");
  expect(g13Migration).toContain("'receiverAccountId'");
  expect(g13Migration).toContain("'serviceId'");
  expect(g13Migration).toContain("'priceCents'");
  expect(g13Migration).toContain("'equivalentCondition'");
  expect(g13Migration).toContain("THEN 'awaiting_customer'");
  expect(g13Migration).toContain('reassignment_operational_party_changed');
});

test('reconciliação shadow gera evidência imutável sem fazer cutover', () => {
  expect(g13Migration).toContain('public.reconcile_appointment_assignment_shadow(');
  expect(g13Migration).toContain('public.appointment_assignment_shadow_comparison');
  expect(g13Migration).toContain('assignment_shadow_evidence_immutable');
  expect(g13Migration).toContain("'cutoverEligible'");
  expect(g13Migration).not.toContain('appointments.professional_id AS authority');
});

test('workflow G13 executa banco descartável, JWT real e TOTP', () => {
  expect(phase2Workflow).toContain('./scripts/reset-supabase-reconciled.ps1');
  expect(phase2Workflow).toContain('supabase/tests/phase2_*.sql');
  expect(phase2Workflow).toContain('npm run test:phase2:real-jwt');
  expect(realJwtValidator).toContain('authentication: "real-jwt-password-session"');
  expect(realJwtValidator).toContain('aal2: "real-totp-challenge-and-verify"');
  expect(realJwtValidator).toContain('immediateMembershipRevocation');
  expect(realJwtValidator).toContain('directTableAccessDenied');
});
