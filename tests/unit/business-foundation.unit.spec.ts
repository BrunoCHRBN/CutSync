import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import type { BusinessOperationalContext } from '../../packages/database/src/business';
import {
  hasBusinessManagementNavigation,
  getActiveEstablishmentStorageKey,
  resolveActiveEstablishmentId,
  resolveBusinessEntryState,
} from '../../apps/business/src/features/access/business-access';
import {
  getLocalDateInTimeZone,
  shiftLocalDate,
  summarizeBusinessAgenda,
} from '../../apps/business/src/features/agenda/business-agenda';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const establishment = (establishmentId: string) => ({ establishmentId });

test('persiste a unidade em chave isolada por usuário e dispositivo', () => {
  expect(getActiveEstablishmentStorageKey('user-a')).toBe(
    'cutsync:business:active-establishment:user-a',
  );
  expect(getActiveEstablishmentStorageKey('user-a')).not.toBe(
    getActiveEstablishmentStorageKey('user-b'),
  );
});

test('restaura apenas uma escolha ainda vinculada e seleciona unidade única', () => {
  const contexts = [establishment('unit-a'), establishment('unit-b')];

  expect(resolveActiveEstablishmentId(contexts, ['missing', 'unit-b'])).toBe('unit-b');
  expect(resolveActiveEstablishmentId(contexts, ['missing'])).toBeNull();
  expect(resolveActiveEstablishmentId([establishment('unit-a')], ['missing'])).toBe('unit-a');
  expect(resolveActiveEstablishmentId([], ['unit-a'])).toBeNull();
});

test('resolve todos os estados de entrada sem promover acesso em falha de contexto', () => {
  const base = {
    sessionLoading: false,
    hasSession: true,
    contextLoading: false,
    contextCount: 1,
    activeAccessMode: 'full' as BusinessOperationalContext['accessMode'],
  };

  expect(resolveBusinessEntryState({ ...base, sessionLoading: true })).toBe('loading_session');
  expect(resolveBusinessEntryState({ ...base, hasSession: false })).toBe('signed_out');
  expect(resolveBusinessEntryState({ ...base, contextLoading: true })).toBe('loading_context');
  expect(resolveBusinessEntryState({
    ...base,
    contextCount: 0,
    activeAccessMode: null,
  })).toBe('no_access');
  expect(resolveBusinessEntryState({ ...base, activeAccessMode: null })).toBe('select_establishment');
  expect(resolveBusinessEntryState({ ...base, activeAccessMode: 'read_only' })).toBe('operational');
  expect(resolveBusinessEntryState({ ...base, activeAccessMode: 'blocked' })).toBe('blocked');
});

test('Gestão segue capabilities confirmadas pelo backend', () => {
  expect(hasBusinessManagementNavigation(['view_unit_reports'])).toBe(true);
  expect(hasBusinessManagementNavigation(['manage_team'])).toBe(true);
  expect(hasBusinessManagementNavigation(['view_own_agenda'])).toBe(false);
  expect(hasBusinessManagementNavigation([])).toBe(false);

  const tabs = read('apps/business/src/app/(app)/(tabs)/_layout.tsx');
  const management = read('apps/business/src/screens/management.tsx');
  expect(tabs).toContain('hidden={!canManage}');
  expect(management).toContain('hasBusinessManagementNavigation(activeContext?.capabilities)');
  expect(management).toContain('<Redirect href="/today" />');
});

test('Router protege contexto e operação sem tratar proteção client-side como autorização final', () => {
  const rootLayout = read('apps/business/src/app/_layout.tsx');
  expect(rootLayout).toContain('<Stack.Protected guard={Boolean(session)}>');
  expect(rootLayout).toContain('<Stack.Protected guard={hasOperationalAccess}>');
  expect(rootLayout).toContain('activeContext.accessMode');
});

test('data local e resumo do Hoje respeitam timezone e estados ativos', () => {
  const instant = new Date('2026-07-26T02:30:00.000Z');
  expect(getLocalDateInTimeZone('America/Sao_Paulo', instant)).toBe('2026-07-25');
  expect(getLocalDateInTimeZone('UTC', instant)).toBe('2026-07-26');
  expect(shiftLocalDate('2028-02-28', 1)).toBe('2028-02-29');

  const summary = summarizeBusinessAgenda([
    {
      id: 'past',
      establishmentId: 'unit',
      professionalId: 'professional',
      professionalName: 'Ana',
      serviceId: 'service',
      serviceName: 'Corte',
      clientDisplayName: 'Cliente A',
      startsAt: '2026-07-26T12:00:00.000Z',
      endsAt: '2026-07-26T12:30:00.000Z',
      status: 'confirmed',
    },
    {
      id: 'next',
      establishmentId: 'unit',
      professionalId: 'professional',
      professionalName: 'Ana',
      serviceId: 'service',
      serviceName: 'Barba',
      clientDisplayName: 'Cliente B',
      startsAt: '2026-07-26T14:00:00.000Z',
      endsAt: '2026-07-26T14:30:00.000Z',
      status: 'pending',
    },
    {
      id: 'cancelled',
      establishmentId: 'unit',
      professionalId: 'professional',
      professionalName: 'Ana',
      serviceId: 'service',
      serviceName: 'Corte',
      clientDisplayName: 'Cliente C',
      startsAt: '2026-07-26T15:00:00.000Z',
      endsAt: '2026-07-26T15:30:00.000Z',
      status: 'cancelled',
    },
  ], new Date('2026-07-26T13:00:00.000Z'));

  expect(summary.next?.id).toBe('next');
  expect(summary.remaining).toBe(1);
  expect(summary.delayed).toBe(1);
});

test('Business não troca perfil legado nem oferece compra de assinatura', () => {
  const sourceFiles = fs.readdirSync(path.join(root, 'apps/business/src'), {
    recursive: true,
    withFileTypes: true,
  })
    .filter((entry) => entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name))
    .map((entry) => fs.readFileSync(path.join(entry.parentPath, entry.name), 'utf8'))
    .join('\n');

  expect(sourceFiles).not.toContain('switch_active_establishment');
  expect(sourceFiles).not.toContain('profiles.establishment_id');
  expect(sourceFiles).not.toContain('WebView');
  expect(sourceFiles).not.toContain('createCheckout');
  expect(sourceFiles).not.toContain('stripe.checkout');
});

test('falha de persistência local não bloqueia contexto operacional confirmado', () => {
  const provider = read('apps/business/src/contexts/business-operational-context.tsx');

  expect(provider).toContain('const getStoredActiveEstablishmentId');
  expect(provider).toContain('const persistActiveEstablishmentId');
  expect(provider).toContain('Persistence is best-effort');
  expect(provider).toContain('setError(getOperationalContextErrorMessage(refreshError))');
  expect(provider).toContain('BUS_CTX_');
  expect(provider).toContain("throw new BusinessContextRefreshError('rpc', error)");
  expect(provider).toContain("throw new BusinessContextRefreshError('storage_read', error)");
  expect(provider).toContain("throw new BusinessContextRefreshError('storage_write', error)");
});
