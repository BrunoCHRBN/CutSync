import { expect, test } from '@playwright/test';

import {
  formatEventTransition,
  labelForEventType,
  labelForImpact,
  labelForProduct,
  labelForStatus,
  labelForSync,
  resolveAssigneeIdentity,
  resolvePersonIdentity,
  resolveTeamIdentity,
} from '../../apps/control/src/modules/support/presentation';

test('translates known enums and products to human labels', () => {
  expect(labelForStatus('open')).toBe('Aberto');
  expect(labelForStatus('waiting_user')).toBe('Aguardando usuário');
  expect(labelForImpact('high')).toBe('Alto');
  expect(labelForProduct('client')).toBe('Aplicativo do cliente');
  expect(labelForSync('synced')).toBe('Sincronizado');
});

test('falls back for unknown event types without breaking', () => {
  expect(labelForEventType('ticket_synced')).toBe('Sincronização concluída');
  expect(labelForEventType('ticket_created')).toBe('Chamado criado');
  expect(labelForEventType('some_unknown_event')).toBe('Evento: some unknown event');
});

test('translates before/after transition values in history', () => {
  expect(formatEventTransition('queued', 'open')).toBe('Na fila → Aberto');
  expect(formatEventTransition(null, 'high')).toBe('Alta');
  expect(formatEventTransition(null, null)).toBeNull();
});

test('resolves identities preferring names over opaque ids', () => {
  const named = resolvePersonIdentity({
    displayName: 'Bruno Vinícius',
    profileId: '0be2ea1a-1111-4111-8111-aaaaaaaaaaaa',
  });
  expect(named.primary).toBe('Bruno Vinícius');
  expect(named.secondary).toContain('ID');

  const assignee = resolveAssigneeIdentity({
    assigneeProfileId: '0be2ea1a-1111-4111-8111-aaaaaaaaaaaa',
  });
  expect(assignee.primary).toBe('Usuário interno');
  expect(assignee.secondary).toBe('ID 0be2ea1a');

  const unassigned = resolveAssigneeIdentity({ assigneeProfileId: null });
  expect(unassigned.primary).toBe('Sem responsável');

  const team = resolveTeamIdentity({ teamCode: 'SUPORTE_GERAL', teamId: null });
  expect(team.primary).toBe('Suporte Geral');
});
