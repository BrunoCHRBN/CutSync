import { expect, test } from '@playwright/test';

import {
  canAccessCloudRoute,
  controlPermissionChecker,
  resolveDefaultCloudRoute,
} from '../../apps/control/src/navigation/cloud-route-access';
import type { ControlPermission } from '../../apps/control/src/types/control';

function canFactory(permissions: ControlPermission[]) {
  return controlPermissionChecker(permissions);
}

test('chooses the first usable Cloud landing route', () => {
  expect(resolveDefaultCloudRoute(canFactory(['control.dashboard.read']))).toBe('/central');
  expect(resolveDefaultCloudRoute(canFactory(['control.live.read']))).toBe('/operacao/tempo-real');
  expect(resolveDefaultCloudRoute(canFactory(['control.support.read']))).toBe('/suporte');
  expect(resolveDefaultCloudRoute(canFactory(['control.knowledge.read']))).toBe('/gsp');
  expect(resolveDefaultCloudRoute(canFactory(['control.access.manage']))).toBe('/gsp');
  expect(resolveDefaultCloudRoute(canFactory(['control.billing.read']))).toBe('/financeiro');
  expect(resolveDefaultCloudRoute(canFactory([]))).toBe('/sem-acesso');
});

test('enforces granular route permissions inside a visible area', () => {
  const governanceReader = canFactory(['control.governance.read']);
  expect(canAccessCloudRoute('/gsp', governanceReader)).toBe(true);
  expect(canAccessCloudRoute('/gsp/revisoes', governanceReader)).toBe(true);
  expect(canAccessCloudRoute('/gsp/acessos', governanceReader)).toBe(false);
  expect(canAccessCloudRoute('/gsp/conhecimento', governanceReader)).toBe(false);

  const accessManager = canFactory(['control.access.manage']);
  expect(canAccessCloudRoute('/gsp', accessManager)).toBe(true);
  expect(canAccessCloudRoute('/gsp/acessos', accessManager)).toBe(true);
  expect(canAccessCloudRoute('/gsp/auditoria', accessManager)).toBe(false);

  const requester = canFactory(['control.access.request']);
  expect(canAccessCloudRoute('/gsp', requester)).toBe(true);
  expect(canAccessCloudRoute('/gsp/acessos/solicitar', requester)).toBe(true);
  expect(canAccessCloudRoute('/gsp/acessos/minhas-solicitacoes', requester)).toBe(true);
  expect(canAccessCloudRoute('/gsp/acessos/aprovacoes', requester)).toBe(false);
  expect(canAccessCloudRoute('/gsp/acessos', requester)).toBe(false);

  expect(
    canAccessCloudRoute('/gsp/acessos/aprovacoes', canFactory(['control.access.approve'])),
  ).toBe(true);
  expect(
    canAccessCloudRoute('/gsp/acessos/aplicacao', canFactory(['control.access.apply'])),
  ).toBe(true);
});

test('protects support detail routes and leaves unknown routes to not-found handling', () => {
  expect(
    canAccessCloudRoute(
      '/suporte/atendimentos/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      canFactory(['control.support.read']),
    ),
  ).toBe(true);
  expect(
    canAccessCloudRoute('/suporte/operacoes-assistidas', canFactory(['control.support.read'])),
  ).toBe(false);
  expect(canAccessCloudRoute('/rota-inexistente', canFactory([]))).toBeNull();
});
