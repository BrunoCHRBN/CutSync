import { expect, test } from '@playwright/test';

import type { ControlPermission } from '../../apps/control/src/types/control';
import {
  getLastModuleId,
  isNavItemSelected,
  modulesForSwitcher,
  navItemsForModule,
  rememberLastModule,
  resolveActiveNavModule,
} from '../../apps/control/src/navigation/module-nav';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

test('sidebar items are contextual to the active module', () => {
  const can = canFactory([
    'control.dashboard.read',
    'control.live.read',
    'control.support.read',
    'control.billing.read',
  ]);

  const operationItems = navItemsForModule('operation', can).map((item) => item.label);
  expect(operationItems).toContain('Visão geral');
  expect(operationItems).toContain('Tempo real');
  expect(operationItems).not.toContain('Atendimentos');
  expect(operationItems).not.toContain('Cobranças');

  const supportItems = navItemsForModule('support', can).map((item) => item.label);
  expect(supportItems).toContain('Atendimentos');
  expect(supportItems).not.toContain('Saúde dos dados');
});

test('module switcher hides modules without visible nav items', () => {
  const viewer = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.support.read',
  ]));
  expect(viewer.map((module) => module.id)).toEqual(['central', 'operation', 'support']);

  const ownerAccessOnly = modulesForSwitcher(canFactory(['control.access.manage']));
  expect(ownerAccessOnly.map((module) => module.id)).toEqual(['central', 'gsp']);

  const requesterOnly = modulesForSwitcher(canFactory(['control.access.request']));
  expect(requesterOnly.map((module) => module.id)).toEqual(['gsp']);
  expect(navItemsForModule('gsp', canFactory(['control.access.request'])).map((item) => item.label))
    .toEqual(['Visão geral', 'Solicitar acesso', 'Minhas solicitações']);
});

test('module switcher keeps vertical menu ordering stable for modal list', () => {
  const modules = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.live.read',
    'control.support.read',
    'control.governance.read',
    'control.billing.read',
  ]));
  expect(modules.map((module) => module.label)).toEqual([
    'Central',
    'Operação',
    'Suporte',
    'GSP',
    'Financeiro',
  ]);
});

test('resolveActiveNavModule maps nested routes to their module', () => {
  expect(resolveActiveNavModule('/operacao/saude-dos-dados').id).toBe('operation');
  expect(resolveActiveNavModule('/gsp/acessos').id).toBe('gsp');
  expect(resolveActiveNavModule('/financeiro/cobrancas').id).toBe('finance');
  expect(resolveActiveNavModule('/central').id).toBe('central');
});

test('exact nav selection does not mark sibling overview routes', () => {
  const overview = navItemsForModule(
    'operation',
    canFactory(['control.dashboard.read', 'control.live.read']),
  ).find((item) => item.label === 'Visão geral');
  const services = navItemsForModule(
    'operation',
    canFactory(['control.dashboard.read', 'control.live.read']),
  ).find((item) => item.label === 'Serviços');
  expect(overview).toBeTruthy();
  expect(services).toBeTruthy();
  expect(isNavItemSelected('/operacao', overview!)).toBe(true);
  expect(isNavItemSelected('/operacao', services!, null)).toBe(false);
  expect(isNavItemSelected('/operacao', services!, 'services')).toBe(true);
  expect(isNavItemSelected('/operacao', overview!, 'services')).toBe(false);
  expect(isNavItemSelected('/operacao/tempo-real', overview!)).toBe(false);
});

test('last module memory ignores Central and remains in-memory only', () => {
  rememberLastModule('support');
  expect(getLastModuleId()).toBe('support');
  rememberLastModule('central');
  expect(getLastModuleId()).toBe('support');
});

test('operation module groups monitoramento and confiabilidade', () => {
  const can = canFactory(['control.dashboard.read', 'control.live.read']);
  const items = navItemsForModule('operation', can);
  const byLabel = Object.fromEntries(items.map((item) => [item.label, item]));

  expect(byLabel['Visão geral']?.group).toBe('Monitoramento');
  expect(byLabel.Serviços?.group).toBe('Monitoramento');
  expect(byLabel['Tempo real']?.group).toBe('Monitoramento');
  expect(byLabel.Incidentes?.group).toBe('Monitoramento');
  expect(byLabel['Saúde dos dados']?.group).toBe('Confiabilidade');
  expect(isNavItemSelected('/operacao', byLabel['Visão geral']!)).toBe(true);
  expect(isNavItemSelected('/operacao', byLabel.Serviços!, 'services')).toBe(true);
  expect(isNavItemSelected('/operacao/saude-dos-dados', byLabel['Saúde dos dados']!)).toBe(true);
});

test('support module uses canonical routes and selects one sidebar item per path', () => {
  const can = canFactory(['control.support.read', 'control.support.manage']);
  const items = navItemsForModule('support', can);
  const byLabel = Object.fromEntries(items.map((item) => [item.label, item]));

  expect(byLabel['Visão geral']?.href).toBe('/suporte');
  expect(byLabel.Atendimentos?.href).toBe('/suporte/atendimentos');
  expect(byLabel.Clientes?.href).toBe('/suporte/clientes');
  expect(byLabel.Monitoramento?.href).toBe('/suporte/monitoramento');
  expect(byLabel['Operações assistidas']?.href).toBe('/suporte/operacoes-assistidas');
  expect(byLabel.Clientes?.section).toBeUndefined();
  expect(byLabel.Monitoramento?.href).not.toBe('/operacao/tempo-real');

  expect(isNavItemSelected('/suporte', byLabel['Visão geral']!)).toBe(true);
  expect(isNavItemSelected('/suporte/atendimentos', byLabel['Visão geral']!)).toBe(false);
  expect(isNavItemSelected('/suporte/atendimentos', byLabel.Atendimentos!)).toBe(true);
  expect(
    isNavItemSelected(
      '/suporte/atendimentos/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      byLabel.Atendimentos!,
    ),
  ).toBe(true);
  expect(
    isNavItemSelected(
      '/suporte/atendimentos/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee',
      byLabel['Visão geral']!,
    ),
  ).toBe(false);
  expect(isNavItemSelected('/suporte/clientes', byLabel.Clientes!)).toBe(true);
  expect(isNavItemSelected('/suporte/clientes', byLabel.Atendimentos!)).toBe(false);
  expect(isNavItemSelected('/suporte/monitoramento', byLabel.Monitoramento!)).toBe(true);
  expect(isNavItemSelected('/suporte/monitoramento', byLabel['Visão geral']!)).toBe(false);
  expect(isNavItemSelected('/suporte/operacoes-assistidas', byLabel['Operações assistidas']!)).toBe(true);
  expect(isNavItemSelected('/operacao/tempo-real', byLabel.Monitoramento!)).toBe(false);
});

test('Editor sees finance and support; Viewer without billing does not', () => {
  const editor = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.support.read',
    'control.support.manage',
    'control.billing.read',
    'control.governance.read',
  ]));
  expect(editor.map((module) => module.id)).toEqual([
    'central',
    'operation',
    'support',
    'gsp',
    'finance',
  ]);

  const viewer = modulesForSwitcher(canFactory([
    'control.dashboard.read',
    'control.live.read',
  ]));
  expect(viewer.map((module) => module.id)).toEqual(['central', 'operation']);
});
