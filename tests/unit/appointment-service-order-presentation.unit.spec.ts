/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  canManageAppointmentOrder,
  resolveBusinessAppointmentOrderAction,
} from '../../apps/business/src/features/service-orders/appointment-order-actions';
import {
  AWAITING_PAYMENT_NOTICE,
  resolveAppointmentOrderPrimaryAction,
} from '../../packages/domain/src';
import type { BusinessOperationalContext } from '../../packages/database/src/business';

const root = process.cwd();
const read = (relativePath: string) => fs
  .readFileSync(path.join(root, relativePath), 'utf8')
  .replace(/\r\n/g, '\n');

const appointmentCard = read('apps/business/src/components/operations/appointment-card.tsx');
const todayScreen = read('apps/business/src/screens/today.tsx');
const agendaScreen = read('apps/business/src/screens/agenda.tsx');
const operationScreen = read('apps/business/src/screens/appointment-operation.tsx');
const businessApi = read('apps/business/src/services/business-api.ts');
const professionalAgenda = read(
  'apps/web/src/components/screens/professional-agenda/ProfessionalAgendaScreen.tsx',
);
const adminDashboard = read(
  'apps/web/src/components/screens/AdminDashboardExperience.tsx',
);
const detailSheet = read('apps/web/src/components/calendar/appointment-detail-sheet.tsx');
const financialOpsContext = read('apps/web/src/contexts/financial-ops-context.tsx');
const webHook = read('apps/web/src/features/service-orders/use-appointment-service-order.ts');
const webLayout = read('apps/web/src/app/_layout.tsx');

const baseContext = {
  membershipId: '11111111-1111-1111-1111-111111111111',
  membershipRole: 'professional',
  membershipStatus: 'active',
  establishmentId: '22222222-2222-2222-2222-222222222222',
  establishmentName: 'Unit',
  establishmentSlug: 'unit',
  timezone: 'America/Sao_Paulo',
  operationalRole: 'professional',
  accessMode: 'full',
  capabilities: ['manage_own_orders', 'view_orders'],
  financialOpsEnabled: true,
  billingOwner: false,
  billingStatus: 'trialing',
  trialEndsAt: null,
  graceEndsAt: null,
  currentPeriodEndsAt: null,
  billingScope: 'establishment',
  billingAccountId: '33333333-3333-3333-3333-333333333333',
  subscriptionId: null,
  organizationId: null,
  coveredEstablishmentIds: ['22222222-2222-2222-2222-222222222222'],
  payerRole: null,
  pendingChangeAt: null,
} as BusinessOperationalContext;

test('Business appointment card supports accessible onPress without nested buttons', () => {
  expect(appointmentCard).toContain('onPress?: () => void');
  expect(appointmentCard).toContain('accessibilityRole="button"');
  expect(appointmentCard).toContain('minHeight: 44');
  expect(appointmentCard).toContain('if (onPress)');
  expect(todayScreen).toContain('onPress={() => openAppointment');
  expect(agendaScreen).toContain('onPress={() => openAppointment');
  expect(todayScreen).not.toContain(
    'Atualização em tempo real e ações de atendimento entram na próxima fatia.',
  );
});

test('Business operation screen gates bridge and mutations by flag/capabilities', () => {
  expect(operationScreen).toContain('financialOpsEnabled');
  expect(operationScreen).toContain('getServiceOrderForAppointment');
  expect(operationScreen).toContain('openServiceOrder');
  expect(operationScreen).toContain('startServiceOrder');
  expect(operationScreen).toContain('finishServiceOrder');
  expect(operationScreen).toContain('service_order_already_exists');
  expect(operationScreen).toContain('AWAITING_PAYMENT_NOTICE');
  expect(operationScreen).toContain('inFlightRef');
  expect(operationScreen).toContain('createMobileRequestId');
  expect(operationScreen).not.toContain('Pagamento concluído');
  expect(businessApi).toContain('service_order_already_exists');
  expect(businessApi).toContain('service_order_version_conflict');
  expect(businessApi).toContain('appointment_has_service_order');
});

test('Business action helper respects own/team/read_only/flag off', () => {
  const actor = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const other = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

  expect(canManageAppointmentOrder({
    context: baseContext,
    appointmentProfessionalId: actor,
    actorUserId: actor,
  })).toBe(true);
  expect(canManageAppointmentOrder({
    context: baseContext,
    appointmentProfessionalId: other,
    actorUserId: actor,
  })).toBe(false);
  expect(canManageAppointmentOrder({
    context: {
      ...baseContext,
      capabilities: ['manage_team_orders', 'view_orders'],
      operationalRole: 'admin',
      membershipRole: 'admin',
    },
    appointmentProfessionalId: other,
    actorUserId: actor,
  })).toBe(true);

  expect(resolveBusinessAppointmentOrderAction({
    context: { ...baseContext, financialOpsEnabled: false },
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
    appointmentProfessionalId: actor,
    actorUserId: actor,
  })).toBe('none');

  expect(resolveBusinessAppointmentOrderAction({
    context: { ...baseContext, accessMode: 'read_only' },
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
    appointmentProfessionalId: actor,
    actorUserId: actor,
  })).toBe('none');

  expect(resolveBusinessAppointmentOrderAction({
    context: baseContext,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: null,
    appointmentProfessionalId: actor,
    actorUserId: actor,
  })).toBe('open_order');
});

test('Web financial ops provider nests correctly and preserves unknown/network semantics', () => {
  expect(webLayout).toContain('<FinancialOpsProvider>');
  expect(webLayout).toContain('<BillingAccessProvider>');
  expect(financialOpsContext).toContain("useState<FinancialOpsState>('unknown')");
  expect(financialOpsContext).toContain('pgrst202');
  expect(financialOpsContext).toContain('could not find the function');
  expect(financialOpsContext).toContain('lastValidContextRef');
  expect(financialOpsContext).toContain("setState('unknown')");
  expect(webHook).toContain('createMobileRequestId');
  expect(webHook).toContain('retryableCommand');
  expect(webHook).toContain('service_order_already_exists');
  expect(webHook).toContain('inFlightRef');
});

test('Web professional/admin use open/start/finish and never complete when flag on', () => {
  expect(professionalAgenda).toContain('useAppointmentServiceOrder');
  expect(professionalAgenda).toContain('resolveAppointmentOrderPrimaryAction');
  expect(professionalAgenda).toContain("appointmentOrder.open()");
  expect(professionalAgenda).toContain("appointmentOrder.start()");
  expect(professionalAgenda).toContain("appointmentOrder.finish()");
  expect(professionalAgenda).toContain("financialOps.state === 'disabled'");
  expect(professionalAgenda).toContain('manage_own_orders');
  expect(adminDashboard).toContain('manage_team_orders');
  expect(adminDashboard).toContain('useAppointmentServiceOrder');
  expect(adminDashboard).toContain("appointmentOrder.open()");
  expect(adminDashboard).toContain("appointmentOrder.finish()");

  // Flag-on confirmed path must not silently call legacy completed.
  const professionalCompleteBlock = professionalAgenda.slice(
    professionalAgenda.indexOf('onComplete={(appointment)'),
    professionalAgenda.indexOf('onComplete={(appointment)') + 700,
  );
  expect(professionalCompleteBlock).toContain("status === 'pending'");
  expect(professionalCompleteBlock).toContain("financialOps.state === 'disabled'");

  const adminCompleteBlock = adminDashboard.slice(
    adminDashboard.indexOf('onComplete={(appointment)'),
    adminDashboard.indexOf('onComplete={(appointment)') + 700,
  );
  expect(adminCompleteBlock).toContain("status === 'pending'");
  expect(adminCompleteBlock).toContain("financialOps.state === 'disabled'");
});

test('Detail sheet shows comanda section and hides locked legacy actions', () => {
  expect(detailSheet).toContain('COMANDA');
  expect(detailSheet).toContain('appointmentLockedByOrder');
  expect(detailSheet).toContain('orderActionLabel');
  expect(detailSheet).toContain('onOrderAction');
  expect(detailSheet).toContain('AWAITING_PAYMENT_NOTICE');
  expect(detailSheet).toContain('formatMoneyCents');
  expect(detailSheet).not.toContain('paymentStatus');
  expect(detailSheet).not.toContain('Pago');
  expect(detailSheet).not.toContain('Pagamento concluído');
  expect(detailSheet).toContain('canReschedule && !appointmentLockedByOrder ? onReschedule');
  expect(detailSheet).toContain('canCancel && !appointmentLockedByOrder ? onCancel');
  expect(detailSheet).toContain('canTransfer && !appointmentLockedByOrder ? onTransfer');
});

test('shared action matrix covers closed/voided and awaiting_payment', () => {
  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'completed',
    serviceOrderStatus: 'closed',
  })).toBe('none');
  expect(resolveAppointmentOrderPrimaryAction({
    financialOpsEnabled: true,
    accessMode: 'full',
    canManageOrder: true,
    appointmentStatus: 'confirmed',
    serviceOrderStatus: 'voided',
  })).toBe('none');
  expect(AWAITING_PAYMENT_NOTICE).toContain('saldo zero');
  expect(AWAITING_PAYMENT_NOTICE).not.toContain('próxima etapa');
});
