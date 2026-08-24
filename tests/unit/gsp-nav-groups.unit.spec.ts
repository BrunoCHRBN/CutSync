/// <reference types="node" />

import { expect, test } from '@playwright/test';

import { CLOUD_NAV_MODULES } from '../../apps/control/src/navigation/module-nav';

test('GSP sidebar items use contiguous identity, governance and knowledge groups', () => {
  const gsp = CLOUD_NAV_MODULES.find((module) => module.id === 'gsp');
  expect(gsp).toBeTruthy();

  const groups = gsp!.items.map((item) => item.group ?? null);
  expect(groups).toEqual([
    null,
    'Identidade e acesso',
    'Identidade e acesso',
    'Governança',
    'Governança',
    'Governança',
    'Conhecimento',
  ]);

  const labels = gsp!.items.map((item) => item.label);
  expect(labels).toEqual([
    'Visão geral',
    'Usuários e grupos',
    'Acessos',
    'Revisões de acesso',
    'Auditoria',
    'Políticas',
    'Conhecimento',
  ]);

  const users = gsp!.items.find((item) => item.id === 'gsp-users');
  expect(users?.href).toContain('/gsp/acessos');
  expect(users?.section).toBe('users');
});
