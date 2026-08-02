import { expect, test } from '@playwright/test';

import {
  parseSupportQueueParams,
  serializeSupportQueueParams,
  supportQueueHref,
  supportQueueSetParams,
  supportTicketHref,
} from '../../apps/control/src/modules/support/support-queue-params';
import { supportTicketPath } from '../../apps/control/src/navigation/cloud-routes';

test('parses and normalizes support queue query params', () => {
  const parsed = parseSupportQueueParams({
    q: '  login  ',
    status: 'open',
    priority: 'high',
    category: 'marketplace',
    sla: 'at_risk',
    sort: 'sla',
    page: '2',
    pageSize: '50',
    junk: 'x',
  });

  expect(parsed).toEqual({
    q: 'login',
    status: 'open',
    priority: 'high',
    category: 'marketplace',
    sla: 'at_risk',
    sort: 'sla',
    page: 2,
    pageSize: 50,
  });
});

test('rejects invalid enum and pagination values', () => {
  const parsed = parseSupportQueueParams({
    status: 'nope',
    priority: 'urgent',
    category: 'xyz',
    sla: 'late',
    sort: 'client',
    page: '0',
    pageSize: '15',
  });

  expect(parsed.status).toBeNull();
  expect(parsed.priority).toBeNull();
  expect(parsed.category).toBeNull();
  expect(parsed.sla).toBe('all');
  expect(parsed.sort).toBe('updated');
  expect(parsed.page).toBe(1);
  expect(parsed.pageSize).toBe(20);
});

test('serializes only non-default queue params for URL restoration', () => {
  const serialized = serializeSupportQueueParams({
    q: 'login',
    status: 'open',
    priority: null,
    category: null,
    sla: 'all',
    sort: 'updated',
    page: 1,
    pageSize: 20,
  });

  expect(serialized).toEqual({ q: 'login', status: 'open' });
});

test('setParams payload clears omitted filters explicitly', () => {
  const params = supportQueueSetParams({
    q: '',
    status: null,
    priority: 'high',
    category: null,
    sla: 'all',
    sort: 'updated',
    page: 1,
    pageSize: 20,
  });

  expect(params.priority).toBe('high');
  expect(params.q).toBeUndefined();
  expect(params.status).toBeUndefined();
  expect(params.category).toBeUndefined();
});

test('builds ticket detail href with queue context and opaque UUID path', () => {
  const ticketId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  const href = supportTicketHref(ticketId, {
    q: 'login',
    status: 'open',
    priority: null,
    category: null,
    sla: 'at_risk',
    sort: 'sla',
    page: 2,
    pageSize: 20,
  }, 'conversation');

  expect(href.pathname).toBe('/suporte/atendimentos/[ticketId]');
  expect(href.params.ticketId).toBe(ticketId);
  expect(href.params.q).toBe('login');
  expect(href.params.status).toBe('open');
  expect(href.params.sla).toBe('at_risk');
  expect(href.params.page).toBe('2');
  expect(href.params.tab).toBe('conversation');
  expect(supportTicketPath(ticketId)).toBe(`/suporte/atendimentos/${ticketId}`);
});

test('queue href restores filters when returning from detail', () => {
  const href = supportQueueHref({
    q: 'login',
    status: 'open',
    priority: 'high',
    category: null,
    sla: 'at_risk',
    sort: 'updated',
    page: 2,
    pageSize: 20,
  });

  expect(href).toEqual({
    pathname: '/suporte/atendimentos',
    params: {
      q: 'login',
      status: 'open',
      priority: 'high',
      sla: 'at_risk',
      page: '2',
    },
  });
});
