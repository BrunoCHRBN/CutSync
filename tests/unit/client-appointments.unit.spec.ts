/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  clientCancellationReasons,
  formatClientAppointmentDateTime,
  getClientAppointmentBlockMessage,
  partitionClientAppointments,
} from '../../packages/domain/src/client-appointments';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('separa próximos e histórico com ordenação estável', () => {
  const records = [
    { id: 'past-active', startsAt: '2026-07-22T10:00:00.000Z', status: 'confirmed' as const },
    { id: 'future-later', startsAt: '2026-07-25T15:00:00.000Z', status: 'confirmed' as const },
    { id: 'cancelled', startsAt: '2026-07-26T15:00:00.000Z', status: 'cancelled' as const },
    { id: 'future-first', startsAt: '2026-07-24T15:00:00.000Z', status: 'pending' as const },
  ];

  const result = partitionClientAppointments(records, new Date('2026-07-23T12:00:00.000Z'));

  expect(result.upcoming.map((item) => item.id)).toEqual(['future-first', 'future-later']);
  expect(result.history.map((item) => item.id)).toEqual(['cancelled', 'past-active']);
});

test('formata o atendimento no fuso do estabelecimento', () => {
  const formatted = formatClientAppointmentDateTime('2026-07-24T17:30:00.000Z', 'America/Sao_Paulo');

  expect(formatted.dateLabel).toContain('24 de julho de 2026');
  expect(formatted.timeLabel).toBe('14:30');
});

test('mantém motivos fechados e mensagens das políticas', () => {
  expect(clientCancellationReasons).toHaveLength(5);
  expect(clientCancellationReasons).toContain('Vou reagendar');
  expect(getClientAppointmentBlockMessage('cancellation_window_closed', 24)).toContain('24h');
  expect(getClientAppointmentBlockMessage('reschedule_limit_reached', 24)).toContain('dois');
});

test('centraliza leitura e mutações de agendamentos no backend', () => {
  const migration = readSource('supabase/migrations/20260723040000_client_appointment_management.sql');
  const sqlTest = readSource('supabase/tests/client_appointment_management.sql');

  expect(migration).toContain('get_client_appointments');
  expect(migration).toContain('get_client_appointment');
  expect(migration).toContain('cancellation_window_closed');
  expect(migration).toContain("current_appointment.status NOT IN ('pending', 'confirmed')");
  expect(migration).toContain('current_appointment.reschedule_count >= 2');
  expect(migration).toContain('establishment.instant_booking_enabled');
  expect(migration).toContain('target_appointment_id');
  expect(sqlTest).toContain('other client must not read the appointment');
  expect(sqlTest).toContain('reschedule_limit_reached');
  expect(sqlTest).toContain('SET LOCAL ROLE anon');
});

test('expõe agenda nativa, detalhe protegido e sincronização em tempo real', () => {
  const layout = readSource('apps/client/src/app/(app)/(tabs)/_layout.tsx');
  const appLayout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const service = readSource('apps/client/src/features/appointments/client-appointments-service.ts');
  const hook = readSource('apps/client/src/features/appointments/use-client-appointments.ts');

  expect(layout).toContain("expo-router/unstable-native-tabs");
  expect(layout).toContain('name="appointments"');
  expect(appLayout).toContain('name="appointments/[id]"');
  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/(tabs)/appointments.tsx'))).toBe(true);
  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/appointments/[id].tsx'))).toBe(true);
  expect(service).toContain("rpc('get_client_appointments'");
  expect(service).toContain("rpc('get_client_appointment'");
  expect(service).not.toContain("from('appointments')");
  expect(hook).toContain('useFocusEffect');
  expect(hook).toContain("table: 'appointments'");
  expect(hook).toContain('client_id=eq.');
  expect(hook).toContain("state === 'active'");
});

test('expõe cancelamento fechado e ações orientadas pelas permissões do backend', () => {
  const appLayout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const detail = readSource('apps/client/src/screens/client-appointment-detail.tsx');
  const cancel = readSource('apps/client/src/screens/client-appointment-cancel.tsx');
  const service = readSource('apps/client/src/features/appointments/client-appointments-service.ts');
  const webAppointments = readSource('apps/web/src/components/screens/AppointmentsExperience.tsx');

  expect(appLayout).toContain('name="appointments/[id]/cancel"');
  expect(cancel).toContain('clientCancellationReasons.map');
  expect(cancel).not.toContain('TextInput');
  expect(cancel).toContain('client-appointment-cancel-confirmation');
  expect(detail).toContain('appointment.canCancel');
  expect(detail).toContain('appointment.canReschedule');
  expect(detail).toContain('cancellation_window_closed');
  expect(service).toContain("rpc('update_appointment_status'");
  expect(service).not.toContain("from('appointments')");
  expect(webAppointments).toContain('item.minCancellationHours');
  expect(webAppointments).toContain('clientCancellationReasons.map');
});
