import { expect, test } from '@playwright/test';

import {
  canAccessCloudRoute,
  controlPermissionChecker,
  resolveCorporateCasesLandingRoute,
  resolveDefaultCloudRoute,
} from '../../apps/control/src/navigation/cloud-route-access';
import type { ControlPermission } from '../../apps/control/src/types/control';

function canFactory(permissions: ControlPermission[]) {
  return controlPermissionChecker(permissions);
}

test('chooses the first usable Cloud landing route', () => {
  expect(resolveDefaultCloudRoute(canFactory(['control.dashboard.read']))).toBe('/central');
  expect(resolveDefaultCloudRoute(canFactory(['control.cases.request']))).toBe('/chamados');
  expect(resolveDefaultCloudRoute(canFactory(['control.cases.approve']))).toBe('/chamados');
  expect(resolveDefaultCloudRoute(canFactory(['control.cases.configure']))).toBe('/chamados');
  expect(resolveDefaultCloudRoute(canFactory(['control.live.read']))).toBe('/operacao/tempo-real');
  expect(resolveDefaultCloudRoute(canFactory(['control.support.read']))).toBe('/suporte');
  expect(resolveDefaultCloudRoute(canFactory(['control.knowledge.read']))).toBe('/gsp');
  expect(resolveDefaultCloudRoute(canFactory(['control.access.manage']))).toBe('/gsp');
  expect(resolveDefaultCloudRoute(canFactory(['control.billing.read']))).toBe('/financeiro');
  expect(resolveDefaultCloudRoute(canFactory([]))).toBe('/sem-acesso');
});

test('separates corporate case views by operational responsibility', () => {
  const requester = canFactory(['control.cases.request']);
  expect(canAccessCloudRoute('/chamados', requester)).toBe(true);
  expect(canAccessCloudRoute('/chamados/novo', requester)).toBe(true);
  expect(canAccessCloudRoute('/chamados/meus', requester)).toBe(true);
  expect(canAccessCloudRoute('/chamados/notificacoes', requester)).toBe(true);
  expect(canAccessCloudRoute('/chamados/observando', requester)).toBe(false);
  expect(canAccessCloudRoute('/chamados/fila', requester)).toBe(false);
  expect(canAccessCloudRoute('/chamados/todos', requester)).toBe(false);

  const reader = canFactory(['control.cases.read']);
  expect(canAccessCloudRoute('/chamados/novo', reader)).toBe(false);
  expect(canAccessCloudRoute('/chamados/observando', reader)).toBe(true);
  expect(canAccessCloudRoute('/chamados/pendencias', reader)).toBe(true);
  expect(canAccessCloudRoute('/chamados/fila', reader)).toBe(false);

  const triager = canFactory(['control.cases.triage']);
  expect(canAccessCloudRoute('/chamados/fila', triager)).toBe(true);
  expect(canAccessCloudRoute('/chamados/todos', triager)).toBe(false);

  const auditor = canFactory(['control.cases.audit']);
  expect(canAccessCloudRoute('/chamados/todos', auditor)).toBe(true);
  expect(
    canAccessCloudRoute('/chamados/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', auditor),
  ).toBe(true);

  const executor = canFactory(['control.cases.fulfill']);
  expect(canAccessCloudRoute('/chamados', executor)).toBe(true);
  expect(canAccessCloudRoute('/chamados/execucao', executor)).toBe(true);
  expect(canAccessCloudRoute('/chamados/fila', executor)).toBe(false);
  expect(canAccessCloudRoute('/chamados/todos', executor)).toBe(false);

  const approver = canFactory(['control.cases.approve']);
  expect(canAccessCloudRoute('/chamados', approver)).toBe(true);
  expect(canAccessCloudRoute('/chamados/meus', approver)).toBe(true);
  expect(canAccessCloudRoute('/chamados/pendencias', approver)).toBe(true);
  expect(canAccessCloudRoute('/chamados/observando', approver)).toBe(false);
  expect(canAccessCloudRoute('/chamados/fila', approver)).toBe(false);
  expect(canAccessCloudRoute('/chamados/execucao', approver)).toBe(false);

  const runtimeOwner = canFactory(['control.cases.configure']);
  expect(canAccessCloudRoute('/chamados', runtimeOwner)).toBe(true);
  expect(canAccessCloudRoute('/chamados/configuracao', runtimeOwner)).toBe(true);
  expect(canAccessCloudRoute('/chamados/configuracao', canFactory(['control.cases.manage'])))
    .toBe(false);
});

test('routes specialized case roles to their actionable landing page', () => {
  expect(resolveCorporateCasesLandingRoute(canFactory(['control.cases.approve'])))
    .toBe('/chamados/pendencias');
  expect(resolveCorporateCasesLandingRoute(canFactory(['control.cases.fulfill'])))
    .toBe('/chamados/execucao');
  expect(resolveCorporateCasesLandingRoute(canFactory(['control.cases.configure'])))
    .toBe('/chamados/configuracao');
  expect(resolveCorporateCasesLandingRoute(canFactory(['control.cases.request'])))
    .toBe('/chamados/meus');
  expect(resolveCorporateCasesLandingRoute(canFactory([
    'control.cases.approve',
    'control.cases.manage',
  ]))).toBe('/chamados/meus');
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
