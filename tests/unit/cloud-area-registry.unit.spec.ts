import { expect, test } from '@playwright/test';

import {
  CLOUD_AREAS,
  areasVisibleTo,
  launcherAreasVisibleTo,
} from '../../apps/control/src/navigation/cloud-area-registry';
import type { ControlPermission } from '../../apps/control/src/types/control';

function canFactory(permissions: ControlPermission[]) {
  return (permission: ControlPermission) => permissions.includes(permission);
}

test('area registry keeps stable order and canonical hrefs', () => {
  expect(CLOUD_AREAS.map((area) => area.id)).toEqual([
    'central',
    'cases',
    'operation',
    'support',
    'gsp',
    'finance',
  ]);
  expect(CLOUD_AREAS[0].label).toBe('Central');
  expect(CLOUD_AREAS.find((area) => area.id === 'finance')?.href).toBe('/financeiro');
});

test('launcher omits Central and respects permissions', () => {
  const areas = launcherAreasVisibleTo(canFactory([
    'control.dashboard.read',
    'control.support.read',
  ]));
  expect(areas.map((area) => area.id)).toEqual(['operation', 'support']);
});

test('switcher includes Central when authorized', () => {
  const areas = areasVisibleTo(canFactory(['control.dashboard.read', 'control.billing.read']));
  expect(areas.map((area) => area.id)).toEqual(['central', 'operation', 'finance']);
});

test('GSP appears with any of its permissions', () => {
  const areas = launcherAreasVisibleTo(canFactory(['control.access.manage']));
  expect(areas.map((area) => area.id)).toEqual(['gsp']);
});

test('Chamados appears with any corporate case permission', () => {
  const requesterAreas = launcherAreasVisibleTo(canFactory(['control.cases.request']));
  const auditorAreas = launcherAreasVisibleTo(canFactory(['control.cases.audit']));
  const executorAreas = launcherAreasVisibleTo(canFactory(['control.cases.fulfill']));
  expect(requesterAreas.map((area) => area.id)).toEqual(['cases']);
  expect(auditorAreas.map((area) => area.id)).toEqual(['cases']);
  expect(executorAreas.map((area) => area.id)).toEqual(['cases']);
});
