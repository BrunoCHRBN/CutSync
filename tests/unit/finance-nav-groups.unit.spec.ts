/// <reference types="node" />

import { expect, test } from '@playwright/test';

import { CLOUD_NAV_MODULES } from '../../apps/control/src/navigation/module-nav';

test('Financeiro sidebar groups gestão and operação financeira', () => {
  const finance = CLOUD_NAV_MODULES.find((module) => module.id === 'finance');
  expect(finance).toBeTruthy();
  expect(finance!.items.map((item) => item.group)).toEqual([
    'Gestão',
    'Gestão',
    'Gestão',
    'Operação financeira',
    'Operação financeira',
  ]);
  expect(finance!.items.map((item) => item.label)).toEqual([
    'Visão geral',
    'Cobranças',
    'Assinaturas',
    'Movimentações',
    'Conciliação',
  ]);
});
