import { expect, test } from '@playwright/test';

import {
  buildSupportWizardMessage,
  buildSupportWizardSubject,
  createInitialSupportWizardState,
  getSupportWizardSteps,
  hasSupportWizardDraftContent,
  supportWizardReducer,
} from '../../apps/client/src/features/support/client-support-wizard';
import {
  CLIENT_SUPPORT_DRAFT_TTL_MS,
  clientSupportDraftKey,
  decodeClientSupportDraft,
  encodeClientSupportDraft,
} from '../../apps/client/src/features/support/client-support-draft-codec';
import {
  buildClientSupportFeedbackMailto,
  normalizeClientSupportFeedbackEmail,
} from '../../apps/client/src/features/support/client-support-feedback';

test('monta apenas as etapas do incidente e mantém o contexto condicional', () => {
  expect(getSupportWizardSteps({
    hasAppointmentContext: false,
  })).toEqual(['area', 'impact', 'details', 'review']);
  expect(getSupportWizardSteps({
    hasAppointmentContext: true,
  })).toEqual(['area', 'context', 'impact', 'details', 'review']);
});

test('reducer permite voltar e mantém as escolhas do incidente', () => {
  let state = createInitialSupportWizardState();
  state = supportWizardReducer(state, { type: 'set-category', value: 'booking' });
  state = supportWizardReducer(state, { type: 'set-step', step: 'impact' });
  state = supportWizardReducer(state, { type: 'set-impact', value: 'critical' });
  state = supportWizardReducer(state, { type: 'set-step', step: 'area' });

  expect(state.step).toBe('area');
  expect(state.category).toBe('booking');
  expect(state.impact).toBe('critical');
});

test('não considera o estado inicial vazio como rascunho recuperável', () => {
  const emptyState = createInitialSupportWizardState();
  expect(hasSupportWizardDraftContent(emptyState)).toBe(false);

  const startedState = supportWizardReducer(emptyState, {
    type: 'set-category',
    value: 'other',
  });
  expect(hasSupportWizardDraftContent(startedState)).toBe(true);
  expect(hasSupportWizardDraftContent(
    createInitialSupportWizardState('appointment-123'),
  )).toBe(true);
});

test('gera assunto normalizado e mensagem única identificada', () => {
  let state = createInitialSupportWizardState('appointment-123');
  state = supportWizardReducer(state, { type: 'set-category', value: 'booking' });
  state = supportWizardReducer(state, {
    type: 'set-answer',
    key: 'attempted',
    value: '  Reagendar   um atendimento  ',
  });
  state = supportWizardReducer(state, {
    type: 'set-answer',
    key: 'observed',
    value: 'O horário não foi atualizado.',
  });
  state = supportWizardReducer(state, {
    type: 'set-answer',
    key: 'expected',
    value: 'O novo horário deveria aparecer.',
  });

  expect(buildSupportWizardSubject(state)).toBe(
    'Problema · Agendamentos: Reagendar um atendimento',
  );
  expect(buildSupportWizardMessage(state)).not.toContain('Motivo');
  expect(buildSupportWizardMessage(state)).toContain('Área\nAgendamentos');
  expect(buildSupportWizardMessage(state)).toContain(
    'O que aconteceu?\nO horário não foi atualizado.',
  );
});

test('restaura rascunho somente para o mesmo usuário e dentro da validade', () => {
  const state = createInitialSupportWizardState();
  const savedAt = new Date('2026-07-29T12:00:00.000Z');
  const raw = encodeClientSupportDraft('user-one', state, savedAt);

  expect(clientSupportDraftKey('user-one')).not.toBe(clientSupportDraftKey('user-two'));
  expect(decodeClientSupportDraft(
    raw,
    'user-one',
    savedAt.getTime() + CLIENT_SUPPORT_DRAFT_TTL_MS - 1,
  )).toEqual(state);
  expect(decodeClientSupportDraft(raw, 'user-two', savedAt.getTime())).toBeNull();
  expect(decodeClientSupportDraft(
    raw,
    'user-one',
    savedAt.getTime() + CLIENT_SUPPORT_DRAFT_TTL_MS + 1,
  )).toBeNull();
  expect(decodeClientSupportDraft('{inválido', 'user-one')).toBeNull();
});

test('rejeita rascunho antigo ou com estrutura incompatível', () => {
  const state = createInitialSupportWizardState();
  const current = JSON.parse(encodeClientSupportDraft('user-one', state)) as {
    version: number;
    state: Record<string, unknown>;
  };

  expect(decodeClientSupportDraft(JSON.stringify({
    ...current,
    version: 1,
  }), 'user-one')).toBeNull();
  expect(decodeClientSupportDraft(JSON.stringify({
    ...current,
    state: { ...current.state, requestKind: 'question', step: 'reason' },
  }), 'user-one')).toBeNull();
});

test('monta o canal de sugestões somente com e-mail válido', () => {
  expect(normalizeClientSupportFeedbackEmail(' Sugestoes@CutSync.com.br '))
    .toBe('sugestoes@cutsync.com.br');
  expect(normalizeClientSupportFeedbackEmail('invalido')).toBeNull();
  expect(buildClientSupportFeedbackMailto('sugestoes@cutsync.com.br'))
    .toContain('mailto:sugestoes@cutsync.com.br?subject=');
  expect(buildClientSupportFeedbackMailto('invalido')).toBeNull();
});
