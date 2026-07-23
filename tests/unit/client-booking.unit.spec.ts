/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  addBookingCalendarDays,
  formatBookingDateLong,
  getBookingDateOptions,
} from '../../packages/domain/src/booking-dates';
import { resolveBookingOffer } from '../../packages/domain/src/booking-offer';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('gera datas locais estáveis dentro da janela de disponibilidade', () => {
  const now = new Date('2026-07-23T02:30:00.000Z');
  const dates = getBookingDateOptions('America/Sao_Paulo', 14, now);

  expect(dates).toHaveLength(14);
  expect(dates[0]).toMatchObject({ localDate: '2026-07-22', isToday: true });
  expect(dates[13].localDate).toBe('2026-08-04');
  expect(addBookingCalendarDays('2026-12-31', 1)).toBe('2027-01-01');
  expect(formatBookingDateLong('2026-07-22')).toContain('22 de julho');
});

test('resolve preço e duração por profissional e bloqueia configuração inativa', () => {
  const services = [{ id: 'service-1', name: 'Corte', price: 40, durationMinutes: 30 }];
  const professionals = [{ id: 'professional-1', name: 'Ana' }, { id: 'professional-2', name: 'Bruno' }];
  const configurations = [
    { professionalId: 'professional-1', serviceId: 'service-1', price: 55, durationMinutes: 45, isActive: true },
    { professionalId: 'professional-2', serviceId: 'service-1', price: 40, durationMinutes: 30, isActive: false },
  ];

  expect(resolveBookingOffer(services, professionals, configurations, 'service-1', 'professional-1')).toMatchObject({
    price: 55,
    durationMinutes: 45,
  });
  expect(resolveBookingOffer(services, professionals, configurations, 'service-1', 'professional-2')).toBeNull();
});

test('expõe o wizard autenticado e confirma somente pela RPC transacional', () => {
  const layout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const screen = readSource('apps/client/src/screens/client-booking.tsx');
  const service = readSource('apps/client/src/features/booking/client-booking-service.ts');

  expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)/booking/[slug].tsx'))).toBe(true);
  expect(layout).toContain('name="booking/[slug]"');
  expect(screen).toContain('client-booking-confirm');
  expect(screen).toContain('await availability.refresh()');
  expect(service).toContain("rpc('get_available_slots'");
  expect(service).toContain("rpc('create_client_appointment'");
  expect(service).not.toContain("from('appointments').insert");
  expect(service).not.toMatch(/service.?role/i);
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
});

test('mantém catálogo e criação protegidos no backend', () => {
  const migration = readSource('supabase/migrations/20260723023000_client_booking.sql');
  const sqlTest = readSource('supabase/tests/client_booking.sql');

  expect(migration).toContain('get_client_booking_options');
  expect(migration).toContain('create_client_appointment');
  expect(migration).toContain("establishment.account_status = 'active'");
  expect(migration).toContain("establishment_status IS DISTINCT FROM 'active'");
  expect(migration).toContain('created_id := public.create_appointment');
  expect(migration).toContain('REVOKE ALL ON FUNCTION public.create_client_appointment');
  expect(migration).not.toContain('document_number');
  expect(migration).not.toContain('kyc_document_url');
  expect(sqlTest).toContain('appointment_conflict');
  expect(sqlTest).toContain('SET LOCAL ROLE anon');
});
