/// <reference types="node" />

import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  mapBusinessAppointmentDetail,
  mapBusinessScheduleBlock,
  mapBusinessService,
  mapBusinessTeamMember,
  mapEstablishmentClient,
} from '../../packages/database/src/mobile-operations';
import {
  compareMobileVersions,
  createMobileRequestId,
  isMobileUpdateRequired,
  MOBILE_REQUEST_ID_PATTERN,
} from '../../packages/domain/src';
import {
  localDateTimeToIso,
  summarizeBusinessAgenda,
} from '../../apps/business/src/features/agenda/business-agenda';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const unitId = '5b5598f7-0a8f-4661-a9d1-3dd4d36c5352';
const professionalId = 'e5fccb4b-218a-4982-b51d-6130e88292b0';

test('gera request_id seguro antes da tentativa e compara versões nativas', () => {
  const first = createMobileRequestId();
  const second = createMobileRequestId();
  expect(first).toMatch(MOBILE_REQUEST_ID_PATTERN);
  expect(second).toMatch(MOBILE_REQUEST_ID_PATTERN);
  expect(second).not.toBe(first);
  expect(compareMobileVersions('0.1.0', '0.2.0')).toBe(-1);
  expect(isMobileUpdateRequired('0.1.0', {
    appKind: 'business',
    platform: 'android',
    minimumSupportedVersion: '0.2.0',
    latestVersion: '0.2.0',
    updateRequired: true,
    enforcementEnabled: false,
    storeUrl: null,
    message: null,
  })).toBe(false);
});

test('mapeia detalhe protegido e histórico camelCase sem exigir ator humano', () => {
  const detail = mapBusinessAppointmentDetail({
    appointmentId: 'appointment-a',
    establishmentId: unitId,
    status: 'no_show',
    startsAt: '2026-08-01T14:00:00.000Z',
    endsAt: '2026-08-01T14:30:00.000Z',
    service: { id: 'service-a', name: 'Corte', listPrice: 50 },
    professional: { id: professionalId, name: 'Profissional' },
    client: {
      establishmentClientId: '25dfd8f7-a0dc-47bb-907f-7ac1bdd48885',
      profileId: null,
      displayName: 'Cliente autorizado',
      phone: null,
      email: null,
      notes: null,
    },
    allowedActions: [],
    history: [{
      id: 1,
      eventType: 'no_show',
      actorId: null,
      createdAt: '2026-08-01T14:31:00.000Z',
      metadata: {},
    }],
  });
  expect(detail).toMatchObject({
    id: 'appointment-a',
    establishmentId: unitId,
    status: 'no_show',
    serviceListPrice: 50,
  });
  expect(detail?.history[0]).toMatchObject({ id: '1', actorId: null });
});

test('mapeia CRM, serviços, equipe e bloqueio usando contratos JSONB', () => {
  expect(mapEstablishmentClient({
    id: '25dfd8f7-a0dc-47bb-907f-7ac1bdd48885',
    establishmentId: unitId,
    displayName: 'Cliente',
    tags: ['recorrente'],
    linkStatus: 'pending',
    lastAppointmentAt: null,
    createdAt: '2026-08-01T12:00:00.000Z',
    updatedAt: '2026-08-01T12:00:00.000Z',
  })).toMatchObject({ displayName: 'Cliente', linkStatus: 'pending' });

  expect(mapBusinessService({
    id: 'service-a', establishmentId: unitId, name: 'Corte', price: 55,
    durationMinutes: 30, isActive: true, sortOrder: 10,
    professionalServices: [{ professionalId, price: 60, durationMinutes: 35, isActive: true }],
  })).toMatchObject({ price: 55, professionalServices: [{ professionalId }] });

  expect(mapBusinessTeamMember({
    membershipId: '25dfd8f7-a0dc-47bb-907f-7ac1bdd48885', profileId: professionalId,
    establishmentId: unitId, name: 'Profissional', role: 'professional', status: 'suspended',
    commissionRate: 0.5,
  })).toMatchObject({ status: 'suspended', commissionRate: 0.5 });

  expect(mapBusinessScheduleBlock({
    id: '25dfd8f7-a0dc-47bb-907f-7ac1bdd48885', establishmentId: unitId,
    professionalId, startsAt: '2026-08-03T03:00:00.000Z', endsAt: '2026-08-04T03:00:00.000Z',
    kind: 'time_off', allDay: true, localDate: '2026-08-03',
  })).toMatchObject({ kind: 'time_off', allDay: true, professionalName: null });
});

test('converte horário local da unidade e no_show nunca conta como operação ativa', () => {
  expect(localDateTimeToIso('2026-08-01', '09:30', 'America/Sao_Paulo'))
    .toBe('2026-08-01T12:30:00.000Z');
  const summary = summarizeBusinessAgenda([{
    id: 'absence', establishmentId: unitId, professionalId, professionalName: 'P',
    serviceId: 'service-a', serviceName: 'Corte', clientDisplayName: 'Cliente',
    startsAt: '2026-08-01T12:00:00.000Z', endsAt: '2026-08-01T12:30:00.000Z', status: 'no_show',
  }], new Date('2026-08-01T11:00:00.000Z'));
  expect(summary).toEqual({ next: null, remaining: 0, delayed: 0 });
});

test('mobile usa somente RPCs específicas e preserva mutações sem retry automático', () => {
  const files = [
    'apps/business/src/features/appointments/business-appointments-api.ts',
    'apps/business/src/features/clients/business-clients-api.ts',
    'apps/business/src/features/schedules/business-schedules-api.ts',
    'apps/business/src/features/services/business-services-api.ts',
    'apps/business/src/features/team/business-team-api.ts',
  ];
  const source = files.map(read).join('\n');
  const rpcSource = read('apps/business/src/features/connectivity/business-rpc.ts');
  expect(source).not.toContain(".from('");
  expect(source).toContain("callBusinessRpc('create_business_appointment'");
  expect(source).toContain("callBusinessRpc('merge_establishment_clients'");
  expect(source).toContain("callBusinessRpc('update_business_schedule_block'");
  expect(source).toContain("callBusinessRpc('reorder_business_services'");
  expect(source).toContain("callBusinessRpc('update_business_team_commission'");
  expect(source).toContain("callBusinessRpc('create_business_team_invite'");
  expect(rpcSource).toContain('businessObservability.captureError');
  expect(rpcSource).toContain('correlationId:');
  expect(rpcSource).toContain('operation: name');
  expect(rpcSource).toContain("data.errorCode === 'appointment_conflict'");
  expect(rpcSource).toContain("data.errorCode === 'schedule_block_conflict'");
  expect(rpcSource).toContain('captureTranslatedFailure(responseError)');
  expect(rpcSource).not.toContain('captureError(result.data');
  for (const screen of ['appointment-reschedule.tsx', 'clients.tsx', 'schedule-blocks.tsx', 'services.tsx', 'team.tsx', 'walk-in.tsx']) {
    expect(read(`apps/business/src/screens/${screen}`)).toContain('retry: false');
  }
});

test('fluxos operacionais selecionam entidades autorizadas sem pedir UUID ao usuário', () => {
  const services = read('apps/business/src/screens/services.tsx');
  const blocks = read('apps/business/src/screens/schedule-blocks.tsx');
  const clientDetail = read('apps/business/src/screens/client-detail.tsx');

  expect(services).toContain('useBusinessTeam');
  expect(services).not.toContain('ID do profissional');
  expect(blocks).toContain('activeTeamMembers.map');
  expect(blocks).not.toContain('ID profissional');
  expect(clientDetail).toContain('useBusinessClients');
  expect(clientDetail).toContain('nenhum cadastro é unido automaticamente por nome');
  expect(clientDetail).not.toContain('ID do cadastro duplicado');
});

test('migration declara isolamento, receipts, eventos, release policy e RLS sem grants mobile', () => {
  const migration = read('supabase/migrations/20260806000000_android_business_operational_cycle.sql');
  const sqlTest = read('supabase/tests/android_business_operational_cycle.sql');
  for (const table of [
    'command_receipts', 'appointment_events', 'mobile_app_release_policies',
    'business_push_deliveries', 'establishment_clients',
    'establishment_client_links', 'establishment_client_merge_events',
  ]) expect(migration).toContain(`CREATE TABLE public.${table}`);
  expect(migration).toContain("RAISE EXCEPTION 'idempotency_conflict'");
  expect(migration).toContain('FOR UPDATE');
  expect(migration).toContain('ALTER TABLE public.command_receipts ENABLE ROW LEVEL SECURITY');
  expect(migration).toContain('REVOKE ALL ON public.command_receipts FROM PUBLIC, anon, authenticated');
  expect(migration).toContain("appointment.status IN ('pending', 'confirmed')");
  expect(migration).toContain("NEW.status <> 'no_show'");
  expect(migration).toContain("'no_show_count', count(*) FILTER (WHERE status = 'no_show')");
  expect(migration).toContain("'production_value', CASE WHEN appointment.status = 'completed'");
  expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_admin_report_v2_before_business_access(');
  expect(migration).not.toContain('\n+--');
  expect(migration).toContain("enforcement_enabled boolean NOT NULL DEFAULT false");
  expect(migration).toContain("'appointment-conflict:' || target_request_id::text");
  expect(migration).toContain("'schedule-block-conflict:' || target_request_id::text");
  expect(migration).toContain("'duplicateClientId', 'professionalId', 'errorCode'");
  expect(sqlTest).toContain('appointment create conflict receipt/push retry contract failed');
  expect(sqlTest).toContain('schedule block update conflict mutated state or duplicated push');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.inspect_business_invitation_token');
  expect(migration).toContain('CREATE OR REPLACE FUNCTION public.accept_business_invitation_token');
  expect(migration).toContain("|| jsonb_build_object('invitationToken', invitation_token)");
  expect(sqlTest).toContain("response_payload ? 'invitationToken'");
});
