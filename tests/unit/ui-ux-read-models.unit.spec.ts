/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import {
  parseAvailabilityRecoveryRows,
  parseBusinessCommandCenter,
  parseProfessionalDailyFocus,
  parsePublicationReadiness,
  parsePublicEstablishmentExperience,
} from '../../packages/database/src/experience-read-models';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('introduz read models sem substituir os contratos legados', () => {
  const availability = read('supabase/migrations/20260812153554_ui_ux_availability_recovery.sql');
  const experience = read('supabase/migrations/20260812160651_ui_ux_experience_read_models.sql');

  expect(availability).toContain('get_booking_availability_recovery');
  expect(experience).toContain('get_public_establishment_experience');
  expect(experience).toContain('get_business_command_center');
  expect(experience).toContain('get_professional_daily_focus');
  expect(experience).toContain('get_publication_readiness');
  expect(experience).toContain('safe_jsonb_array');
  expect(experience).toContain("'allowedActions'");
});

test('mantém leitura operacional autenticada e perfil publicado estritamente público', () => {
  const sql = read('supabase/migrations/20260812160651_ui_ux_experience_read_models.sql');

  expect(sql).toContain("establishment.discovery_status = 'published'");
  expect(sql).toContain("establishment.account_status = 'active'");
  expect(sql).toContain('REVOKE ALL ON FUNCTION public.get_business_command_center');
  expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.get_business_command_center');
  expect(sql).toContain("RAISE EXCEPTION 'forbidden'");
});

test('fecha a telemetria em allowlists, pseudonimização e idempotência', () => {
  const sql = read('supabase/migrations/20260812161020_ui_ux_product_events.sql');

  expect(sql).toContain('allowed_identifier_keys constant text[]');
  expect(sql).toContain('extensions.digest');
  expect(sql).toContain('product_event_idempotency_conflict');
  expect(sql).toContain('REVOKE ALL ON TABLE public.product_events');
  expect(sql).not.toContain('target_email');
  expect(sql).not.toContain('target_phone');
});

test('parsers compartilhados falham fechados diante de payload parcial', () => {
  expect(parseBusinessCommandCenter({ items: [] })).toBeNull();
  expect(parseProfessionalDailyFocus({ appointments: [{ appointmentId: 'only-id' }] })).toBeNull();
  expect(parsePublicationReadiness({ eligible: true, blockers: [], recommendations: [] })).toBeNull();
  expect(parseAvailabilityRecoveryRows([{ starts_at: '2026-08-12T12:00:00Z' }])).toBeNull();
  expect(parsePublicEstablishmentExperience({ establishment: { id: 'partial' } })).toBeNull();

  expect(parsePublicationReadiness({
    eligible: true,
    bookingMode: 'instant',
    completenessScore: 70,
    blockers: [],
    recommendations: ['add_logo'],
  })?.eligible).toBe(true);
});
