/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  BUSINESS_PUSH_CHANNEL_IDS,
  BUSINESS_PUSH_EVENTS,
  getBusinessPushChannelId,
  sanitizeBusinessPushPayload,
} from '../../supabase/functions/dispatch-business-notifications/business-push-payload';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(
  path.join(root, relativePath),
  'utf8',
);

const establishmentId = '5b5598f7-0a8f-4661-a9d1-3dd4d36c5352';
const appointmentId = '9cabb0db-fe1a-4467-847c-9afa5be33239';
const invitationId = '2b28df1d-8fc1-4cf0-b4c2-54a97b89d2f7';
const professionalId = 'e5fccb4b-218a-4982-b51d-6130e88292b0';

test('aceita somente os cinco eventos Business entregues neste ciclo', () => {
  expect(BUSINESS_PUSH_EVENTS).toEqual([
    'appointment_created',
    'appointment_cancelled',
    'appointment_rescheduled',
    'invitation_created',
    'operational_conflict',
  ]);

  expect(sanitizeBusinessPushPayload({
    eventType: 'future_feature',
    establishmentId,
    appointmentId,
  })).toBeNull();
});

test('remove dados pessoais, financeiros e rotas arbitrárias do payload Business', () => {
  expect(sanitizeBusinessPushPayload({
    eventType: 'appointment_rescheduled',
    establishmentId,
    appointmentId,
    clientName: 'Pessoa sigilosa',
    phone: '+55 11 99999-9999',
    notes: 'Observação sigilosa',
    price: 150,
    accessToken: 'secret',
    url: '/account/security',
  })).toEqual({
    eventType: 'appointment_rescheduled',
    establishmentId,
    appointmentId,
  });
});

test('valida os identificadores obrigatórios por tipo de evento', () => {
  expect(sanitizeBusinessPushPayload({
    eventType: 'invitation_created',
    establishmentId,
    invitationId,
  })).toEqual({ eventType: 'invitation_created', establishmentId, invitationId });

  expect(sanitizeBusinessPushPayload({
    eventType: 'operational_conflict',
    establishmentId,
    professionalId,
  })).toEqual({ eventType: 'operational_conflict', establishmentId, professionalId });

  expect(sanitizeBusinessPushPayload({
    eventType: 'appointment_created',
    establishmentId,
    appointmentId: 'Legacy-Appointment_42',
  })).toEqual({
    eventType: 'appointment_created',
    establishmentId,
    appointmentId: 'Legacy-Appointment_42',
  });
  expect(sanitizeBusinessPushPayload({
    eventType: 'appointment_created',
    establishmentId,
    appointmentId: '../account',
  })).toBeNull();
  expect(sanitizeBusinessPushPayload({
    eventType: 'invitation_created',
    establishmentId,
  })).toBeNull();
  expect(sanitizeBusinessPushPayload({
    eventType: 'operational_conflict',
    establishmentId,
    professionalId: 'not-a-uuid',
  })).toBeNull();
  expect(sanitizeBusinessPushPayload({
    eventType: 'operational_conflict',
    professionalId,
  })).toBeNull();
});

test('seleciona somente canais Android registrados pelo aplicativo Business', () => {
  expect(BUSINESS_PUSH_CHANNEL_IDS).toEqual({
    operations: 'operations',
    invitations: 'invitations',
    conflicts: 'conflicts',
  });
  expect(getBusinessPushChannelId({ eventType: 'appointment_created' })).toBe('operations');
  expect(getBusinessPushChannelId({ eventType: 'invitation_created' })).toBe('invitations');
  expect(getBusinessPushChannelId({ eventType: 'operational_conflict' })).toBe('conflicts');
});

test('worker Business usa fila própria, tickets e receipts via utilitário compartilhado', () => {
  const worker = readSource(
    'supabase/functions/dispatch-business-notifications/index.ts',
  );
  const shared = readSource('supabase/functions/_shared/expo-push.ts');
  const clientWorker = readSource(
    'supabase/functions/dispatch-client-notifications/index.ts',
  );
  const config = readSource('supabase/config.toml');

  expect(worker).toContain('dispatchExpoPushDeliveries');
  expect(worker).toContain('checkExpoPushReceipts');
  expect(worker).toContain('claim_business_push_deliveries');
  expect(worker).toContain('complete_business_push_delivery');
  expect(worker).toContain('claim_business_push_receipts');
  expect(worker).toContain('complete_business_push_receipt');
  expect(worker).toContain('NOTIFICATION_DISPATCH_SECRET');
  expect(worker).toContain('getBusinessPushChannelId');
  expect(worker).not.toContain('business-operations');
  expect(worker).not.toContain('console.log');

  expect(shared).toContain('https://exp.host/--/api/v2/push/send');
  expect(shared).toContain('https://exp.host/--/api/v2/push/getReceipts');
  expect(shared).toContain('AbortSignal.timeout(12_000)');
  expect(shared).toContain('target_ticket_id');
  expect(shared).toContain('invalid_delivery_payload');
  expect(clientWorker).toContain('../_shared/expo-push.ts');
  expect(clientWorker).toContain('queue_due_client_appointment_reminders');
  expect(config).toContain('[functions.dispatch-business-notifications]');
  expect(config).toContain('./functions/dispatch-business-notifications/index.ts');
});

test('schema da fila entrega somente para dispositivos Business ativos', () => {
  const migration = readSource(
    'supabase/migrations/20260806000000_android_business_operational_cycle.sql',
  );
  const sqlTest = readSource('supabase/tests/android_business_operational_cycle.sql');
  const readFunction = (name: string) => {
    const start = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${name}`);
    const end = migration.indexOf('\n$$;', start);
    expect(start, name).toBeGreaterThanOrEqual(0);
    expect(end, name).toBeGreaterThan(start);
    return migration.slice(start, end + 4);
  };
  const businessEnqueues = [
    'enqueue_business_appointment_push',
    'enqueue_business_invitation_push',
    'enqueue_business_operational_conflict',
  ].map(readFunction);

  expect(migration).toContain('CREATE TABLE public.business_push_deliveries');
  expect(migration).toContain('public.is_safe_business_push_payload(payload)');
  expect(migration).toContain("device.app_kind = 'business'");
  expect(migration).toContain('UNIQUE (event_key, push_device_id)');
  expect(migration).toContain('FOR UPDATE SKIP LOCKED');
  expect(migration).toContain('complete_business_push_receipt');
  expect(migration).toContain("target_error_code = 'DeviceNotRegistered'");
  expect(migration).toContain("'invitation_created'");
  for (const enqueue of businessEnqueues) {
    expect(enqueue).toContain("app_kind = 'business'");
    expect(enqueue).toContain('device.enabled');
    expect(enqueue).toContain('profile.deleted_at IS NULL');
    expect(enqueue).not.toContain('profile.notification_channels');
  }
  expect(sqlTest).toContain('enabled Business device was blocked by Client profile channels');
  expect(sqlTest).toContain('disabled Business device received an invitation resend');
  expect(sqlTest).toContain('business appointment/conflict push ignored disabled device opt-out');
});
