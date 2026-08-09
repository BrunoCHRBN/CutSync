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
  mapBusinessReassignmentDetail,
  mapBusinessReassignmentCandidate,
  mapClientReassignmentDecision,
  mapClientReassignmentDetail,
  mapDecisionQueueItem,
  mapAppointmentReassignmentMutationReceipt,
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
const phase3ReadModels = fs.readFileSync(path.join(
  process.cwd(),
  'supabase/migrations/20260823000000_phase3_business_decision_read_models.sql',
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

test('read model da fila falha fechado e preserva ações calculadas pelo backend', () => {
  const item = mapDecisionQueueItem({
    reassignmentRequestId: 'request-id',
    appointmentId: 'appointment-id',
    establishmentId: 'establishment-id',
    status: 'awaiting_manager',
    urgency: 'urgent',
    responsibility: 'manager',
    dueAt: '2026-08-10T12:00:00.000Z',
    nextActorKind: 'manager',
    customerDecisionRequired: true,
    monetaryImpact: false,
    allowedActions: ['propose', 'withdraw'],
    correlationId: 'correlation-id',
    version: 2,
    dataCutoffAt: '2026-08-09T12:00:00.000Z',
    appointmentStartsAt: '2026-08-10T13:00:00.000Z',
    clientDisplayName: 'Cliente',
    serviceName: 'Corte',
    currentProfessionalName: 'Profissional A',
    proposedProfessionalName: null,
  });
  expect(item?.allowedActions).toEqual(['propose', 'withdraw']);
  expect(mapDecisionQueueItem({ ...item, version: '2' })).toBeNull();
  expect(mapDecisionQueueItem({ ...item, allowedActions: ['apply', 7] })).toBeNull();
});

test('detalhe compartilha correlationId e timeline sem aceitar evento incompleto', () => {
  const detail = mapBusinessReassignmentDetail({
    reassignmentRequestId: 'request-id',
    appointmentId: 'appointment-id',
    establishmentId: 'establishment-id',
    status: 'requested',
    responsibility: 'professional',
    reasonCode: 'professional_absence',
    dueAt: '2026-08-10T12:00:00.000Z',
    customerDecisionRequired: true,
    monetaryImpact: false,
    previousCondition: {},
    proposedCondition: {},
    allowedActions: ['withdraw'],
    correlationId: 'correlation-id',
    version: 1,
    dataCutoffAt: '2026-08-09T12:00:00.000Z',
    appointmentStartsAt: '2026-08-10T13:00:00.000Z',
    appointmentEndsAt: '2026-08-10T13:30:00.000Z',
    clientDisplayName: 'Cliente',
    serviceName: 'Corte',
    currentProfessional: { id: 'professional-id', name: 'Profissional A' },
    proposedProfessional: null,
    timeline: [{
      id: 'event-id',
      appointmentId: 'appointment-id',
      establishmentId: 'establishment-id',
      reassignmentRequestId: 'request-id',
      assignmentId: null,
      eventType: 'reassignment.requested',
      actorId: 'professional-id',
      actorKind: 'professional',
      requestId: 'command-id',
      correlationId: 'correlation-id',
      previousVersion: null,
      resultingVersion: 1,
      occurredAt: '2026-08-09T12:00:00.000Z',
    }],
  });
  expect(detail?.timeline[0]?.correlationId).toBe(detail?.correlationId);
  expect(mapBusinessReassignmentDetail({ ...detail, timeline: [{}] })).toBeNull();
});

test('read models Client preservam ações server-side e timeline persistente', () => {
  const decision = mapClientReassignmentDecision({
    reassignmentRequestId: 'request-id',
    appointmentId: 'appointment-id',
    status: 'awaiting_customer',
    dueAt: '2026-08-10T12:00:00.000Z',
    responsibility: 'customer',
    appointmentStartsAt: '2026-08-10T13:00:00.000Z',
    establishmentName: 'Unidade',
    establishmentTimezone: 'America/Sao_Paulo',
    serviceName: 'Corte',
    currentProfessionalName: 'Profissional A',
    proposedProfessionalName: 'Profissional B',
    monetaryImpact: true,
    allowedActions: ['accept_replacement', 'choose_professional'],
    version: 3,
    correlationId: 'correlation-id',
    dataCutoffAt: '2026-08-09T12:00:00.000Z',
  });
  expect(decision?.allowedActions).toEqual(['accept_replacement', 'choose_professional']);
  expect(mapClientReassignmentDecision({ ...decision, allowedActions: ['apply'] })).toBeNull();

  const detail = mapClientReassignmentDetail({
    ...decision,
    establishmentId: 'establishment-id',
    currency: 'BRL',
    reasonCode: 'professional_absence',
    customerDecisionRequired: true,
    previousCondition: { priceCents: 5000 },
    proposedCondition: { priceCents: 5500 },
    appointmentEndsAt: '2026-08-10T13:30:00.000Z',
    currentProfessional: { id: 'professional-a', name: 'Profissional A' },
    proposedProfessional: { id: 'professional-b', name: 'Profissional B' },
    initiatedByKind: 'professional',
    timeline: [{
      id: 'event-id',
      appointmentId: 'appointment-id',
      establishmentId: 'establishment-id',
      reassignmentRequestId: 'request-id',
      assignmentId: null,
      eventType: 'reassignment.requested',
      actorId: 'professional-a',
      actorKind: 'professional',
      requestId: 'command-id',
      correlationId: 'correlation-id',
      previousVersion: null,
      resultingVersion: 1,
      occurredAt: '2026-08-09T12:00:00.000Z',
    }],
  });
  expect(detail?.timeline[0]?.correlationId).toBe(detail?.correlationId);
  expect(mapClientReassignmentDetail({ ...detail, initiatedByKind: 'owner' })).toBeNull();
});

test('RPCs da Fase 3 mantêm tabelas privadas e filtram ações por capability', () => {
  expect(phase3ReadModels).toContain('public.list_business_decision_queue(');
  expect(phase3ReadModels).toContain('public.get_business_reassignment_detail(');
  expect(phase3ReadModels).toContain('public.list_business_reassignment_candidates(');
  expect(phase3ReadModels).toContain('public.list_client_reassignment_decisions()');
  expect(phase3ReadModels).toContain('public.get_client_reassignment_detail(');
  expect(phase3ReadModels).toContain('appointment.client_id = actor_id');
  expect(phase3ReadModels).toContain("'request_appointment_reassignment', 'full'");
  expect(phase3ReadModels).toContain("'apply_appointment_reassignment', 'full'");
  expect(phase3ReadModels).toContain("WHERE action = ANY(ARRAY['validate', 'propose', 'apply', 'review', 'withdraw'])");
  expect(phase3ReadModels).not.toContain('GRANT SELECT ON public.decision_queue_items');
  expect(phase3ReadModels).not.toContain('GRANT SELECT ON public.appointment_assignment_events');
});

test('candidatos e recibos de comando falham fechado', () => {
  expect(mapBusinessReassignmentCandidate({
    profileId: 'professional-id',
    name: 'Profissional',
    priceCents: 5500,
    monetaryImpact: true,
  })).toEqual({
    profileId: 'professional-id',
    name: 'Profissional',
    priceCents: 5500,
    monetaryImpact: true,
  });
  expect(mapBusinessReassignmentCandidate({
    profileId: 'professional-id', name: 'Profissional', priceCents: 55.5, monetaryImpact: false,
  })).toBeNull();

  const receipt = mapAppointmentReassignmentMutationReceipt({
    reassignmentRequestId: 'request-id',
    status: 'awaiting_manager',
    version: 2,
    requestId: 'command-id',
    correlationId: 'correlation-id',
    replayed: false,
  });
  expect(receipt?.version).toBe(2);
  expect(mapAppointmentReassignmentMutationReceipt({ ...receipt, replayed: 'false' })).toBeNull();
});

test('Business envia comandos versionados sem conclusão otimista', () => {
  const api = fs.readFileSync(path.join(
    process.cwd(), 'apps/business/src/services/business-api.ts',
  ), 'utf8');
  const hook = fs.readFileSync(path.join(
    process.cwd(), 'apps/business/src/features/decisions/use-business-decisions.ts',
  ), 'utf8');
  const screen = fs.readFileSync(path.join(
    process.cwd(), 'apps/business/src/screens/decision-detail.tsx',
  ), 'utf8');
  expect(api).toContain("'validate_appointment_reassignment'");
  expect(api).toContain("'propose_appointment_reassignment'");
  expect(api).toContain("'apply_appointment_reassignment'");
  expect(api).toContain("'withdraw_appointment_reassignment'");
  expect(api).toContain('target_expected_version: input.expectedVersion');
  expect(api).toContain('target_request_id: input.requestId');
  expect(hook).toContain('useMutation({');
  expect(hook).not.toContain('onMutate:');
  expect(hook).toContain('enqueueBusinessDecisionCommand({');
  expect(hook).toContain('requestId: command.requestId');
  expect(screen).toContain('business-decision-offline-pending');
  expect(screen).toContain('receipt.replayed');
});

test('Web converte transferência em workflow e proposta sem escrita direta', () => {
  const api = fs.readFileSync(path.join(
    process.cwd(), 'apps/web/src/features/appointments/reassignment-api.ts',
  ), 'utf8');
  const actions = fs.readFileSync(path.join(
    process.cwd(), 'apps/web/src/features/appointments/use-appointment-actions.ts',
  ), 'utf8');
  const modal = fs.readFileSync(path.join(
    process.cwd(), 'apps/web/src/components/calendar/transfer-professional-modal.tsx',
  ), 'utf8');
  expect(api).toContain("rpc('request_appointment_reassignment'");
  expect(api).toContain("rpc('validate_appointment_reassignment'");
  expect(api).toContain("rpc('propose_appointment_reassignment'");
  expect(api).toContain("rpc('list_business_reassignment_candidates'");
  expect(api).not.toContain("from('appointments')");
  expect(api).not.toContain("from('professional_services')");
  expect(actions).toContain('requestIntentsRef.current');
  expect(actions).toContain('expectedAppointmentUpdatedAt');
  expect(actions).toContain("action: 'request_reassignment'");
  expect(modal).toContain('A criação da proposta não troca o profissional');
  expect(modal).toContain('Enviar proposta ao cliente');
  expect(modal).not.toContain('Transferir no mesmo horário');
});

test('Client decide por RPC versionada e nunca apresenta troca antes da confirmação server-side', () => {
  const api = fs.readFileSync(path.join(
    process.cwd(), 'apps/client/src/features/appointments/client-reassignment-service.ts',
  ), 'utf8');
  const hook = fs.readFileSync(path.join(
    process.cwd(), 'apps/client/src/features/appointments/use-client-reassignment.ts',
  ), 'utf8');
  const panel = fs.readFileSync(path.join(
    process.cwd(), 'apps/client/src/components/appointments/client-reassignment-ui.tsx',
  ), 'utf8');
  const agenda = fs.readFileSync(path.join(
    process.cwd(), 'apps/client/src/screens/client-appointments.tsx',
  ), 'utf8');
  expect(api).toContain("invokeRpc('decide_appointment_reassignment'");
  expect(api).toContain("target_channel: 'client_app'");
  expect(api).toContain('target_expected_version: input.expectedVersion');
  expect(api).toContain('target_request_id: input.requestId');
  expect(api).not.toContain(".from('appointment_reassignment_requests')");
  expect(hook).toContain("setSyncStatus('syncing')");
  expect(hook).toContain("setSyncStatus(receipt.status === 'manual_review'");
  expect(hook).toContain('enqueueClientReassignmentCommand({');
  expect(hook).toContain('requestId: entry.requestId');
  expect(panel).toContain('Aceite registrado; aguardando aplicação pelo estabelecimento');
  expect(panel).toContain('Nenhuma cobrança é alterada por esta tela.');
  expect(panel).toContain('Correlação {event.correlationId}');
  expect(agenda).toContain('ClientPendingDecisionBanner');
});
