/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  createClientEstablishmentLinkRequestIdStore,
  mapClientEstablishmentLinkMutationResult,
  mapClientEstablishmentLinks,
} from '../../apps/client/src/features/establishment-links/client-establishment-links-contract';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const linkId = '11111111-1111-4111-8111-111111111111';
const establishmentClientId = '22222222-2222-4222-8222-222222222222';
const establishmentId = '33333333-3333-4333-8333-333333333333';

test('valida de forma fechada o contrato de vínculos retornado ao Client', () => {
  const result = mapClientEstablishmentLinks([{
    linkId,
    establishmentClientId,
    establishmentId,
    establishmentName: 'Unidade Centro',
    clientDisplayName: 'Cliente local',
    matchKind: 'confirmed_email',
    status: 'pending',
    createdAt: '2026-08-01T12:00:00.000Z',
  }]);

  expect(result).toEqual([expect.objectContaining({
    linkId,
    establishmentId,
    status: 'pending',
  })]);
  expect(mapClientEstablishmentLinks([{ linkId, status: 'pending' }])).toBeNull();
  expect(mapClientEstablishmentLinks([
    ...(result ?? []).map((link) => ({
      linkId: link.linkId,
      establishmentClientId: link.establishmentClientId,
      establishmentId: link.establishmentId,
      establishmentName: link.establishmentName,
      clientDisplayName: link.clientDisplayName,
      matchKind: link.matchKind,
      status: link.status,
      createdAt: link.createdAt,
    })),
    {
      linkId,
      establishmentClientId,
      establishmentId,
      establishmentName: 'Duplicado',
      clientDisplayName: 'Cliente',
      matchKind: 'confirmed_email',
      status: 'confirmed',
      createdAt: '2026-08-01T13:00:00.000Z',
    },
  ])).toBeNull();
});

test('valida que a resposta do comando corresponde à ação solicitada', () => {
  const response = {
    linkId,
    establishmentClientId,
    establishmentId,
    status: 'confirmed',
  };

  expect(mapClientEstablishmentLinkMutationResult(response, linkId, 'confirmed'))
    .toEqual(response);
  expect(mapClientEstablishmentLinkMutationResult(response, linkId, 'rejected'))
    .toBeNull();
  expect(mapClientEstablishmentLinkMutationResult(response, establishmentId, 'confirmed'))
    .toBeNull();
});

test('reutiliza o mesmo request id após resposta ambígua e só gira após sucesso', () => {
  let sequence = 0;
  const store = createClientEstablishmentLinkRequestIdStore(() => `request-${++sequence}`);

  expect(store.getOrCreate('confirm', linkId)).toBe('request-1');
  expect(store.getOrCreate('confirm', linkId)).toBe('request-1');
  expect(store.getOrCreate('reject', linkId)).toBe('request-2');

  store.complete('confirm', linkId);
  expect(store.getOrCreate('confirm', linkId)).toBe('request-3');
});

test('usa apenas RPCs autenticadas, request id explícito e mutações sem retry automático', () => {
  const service = readSource(
    'apps/client/src/features/establishment-links/client-establishment-links-service.ts',
  );
  const hook = readSource(
    'apps/client/src/features/establishment-links/use-client-establishment-links.ts',
  );

  expect(service).toContain("invokeRpc('get_my_establishment_client_link_requests'");
  expect(service).toContain("'confirm_establishment_client_link'");
  expect(service).toContain("'reject_establishment_client_link'");
  expect(service).toContain('target_request_id: requestId');
  expect(service).toContain('clientObservability.captureError');
  expect(service).toContain('correlationId: requestId');
  expect(service).not.toContain('.from(');
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
  expect(hook).toContain('createClientQueryKey');
  expect(hook).toContain('retry: false');
  expect(hook).toContain('getOrCreate(action, linkId)');
});

test('expõe a rota protegida dentro de Conta', () => {
  const appLayout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const home = readSource('apps/client/src/screens/home.tsx');
  const route = path.join(root, 'apps/client/src/app/(app)/establishment-links.tsx');

  expect(fs.existsSync(route)).toBe(true);
  expect(appLayout).toContain('name="establishment-links"');
  expect(home).toContain('client-open-establishment-links');
  expect(home).toContain("router.push('/establishment-links'");
});
