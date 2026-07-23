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
