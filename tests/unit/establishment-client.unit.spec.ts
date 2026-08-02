import { expect, test } from '@playwright/test';

import {
  canTransitionEstablishmentClient,
  isMarketingReachable,
  resolveMergedConsentStatus,
  translateEstablishmentClientError,
} from '../../packages/domain/src/establishment-client';
import {
  areLikelyDuplicateClients,
  buildClientSearchKey,
  normalizeEstablishmentClientEmail,
  normalizeEstablishmentClientPhone,
  validateEstablishmentClient,
} from '../../packages/validation/src/establishment-client';

/**
 * Keep these cases aligned with
 * `supabase/tests/establishment_client_enrichment.sql`.
 * A drift between TypeScript and SQL silently splits imports into duplicates.
 */
const PHONE_CASES: Array<[string | null, string | null]> = [
  ['(11) 99999-9999', '+5511999999999'],
  ['11999999999', '+5511999999999'],
  ['11 9999-9999', '+551199999999'],
  ['+55 11 99999-9999', '+5511999999999'],
  ['5511999999999', '+5511999999999'],
  ['+1 415 555 2671', '+14155552671'],
  ['  (11) 99999-9999  ', '+5511999999999'],
  ['99999999', null],
  ['123', null],
  ['+123', null],
  ['telefone', null],
  ['', null],
  [null, null],
];

const EMAIL_CASES: Array<[string | null, string | null]> = [
  ['CARLOS@EXEMPLO.COM', 'carlos@exemplo.com'],
  ['  maria@exemplo.com ', 'maria@exemplo.com'],
  ['sem-arroba', null],
  ['sem@dominio', null],
  ['espaco no@meio.com', null],
  ['', null],
  [null, null],
];

test('normaliza telefone brasileiro com a mesma matriz do SQL', () => {
  for (const [input, expected] of PHONE_CASES) {
    expect(normalizeEstablishmentClientPhone(input), String(input)).toBe(expected);
  }
});

test('normaliza e-mail com a mesma matriz do SQL', () => {
  for (const [input, expected] of EMAIL_CASES) {
    expect(normalizeEstablishmentClientEmail(input), String(input)).toBe(expected);
  }
});

test('valida cadastro e deriva contatos normalizados', () => {
  const ok = validateEstablishmentClient({
    name: '  Maria Silva ',
    phone: '(11) 98888-7777',
    email: 'Maria@Exemplo.com',
    tags: [' vip ', 'vip', ''],
    notes: 'Preferência noturna',
  });
  expect(ok).toMatchObject({
    ok: true,
    value: {
      name: 'Maria Silva',
      phone: '(11) 98888-7777',
      normalizedPhone: '+5511988887777',
      email: 'maria@exemplo.com',
      normalizedEmail: 'maria@exemplo.com',
      tags: ['vip'],
      notes: 'Preferência noturna',
    },
  });

  expect(validateEstablishmentClient({ name: 'A' })).toMatchObject({
    ok: false,
    field: 'name',
  });
});

test('transições de status respeitam o ciclo active → archived/merged', () => {
  expect(canTransitionEstablishmentClient('active', 'archived')).toBe(true);
  expect(canTransitionEstablishmentClient('active', 'merged')).toBe(true);
  expect(canTransitionEstablishmentClient('archived', 'active')).toBe(true);
  expect(canTransitionEstablishmentClient('archived', 'merged')).toBe(false);
  expect(canTransitionEstablishmentClient('merged', 'active')).toBe(false);
  expect(canTransitionEstablishmentClient('merged', 'archived')).toBe(false);
});

test('unificação preserva o consentimento mais restritivo', () => {
  expect(resolveMergedConsentStatus('granted', 'granted')).toBe('granted');
  expect(resolveMergedConsentStatus('granted', 'unknown')).toBe('unknown');
  expect(resolveMergedConsentStatus('unknown', 'granted')).toBe('unknown');
  expect(resolveMergedConsentStatus('granted', 'revoked')).toBe('revoked');
  expect(resolveMergedConsentStatus('revoked', 'granted')).toBe('revoked');
  expect(resolveMergedConsentStatus('unknown', 'revoked')).toBe('revoked');
  expect(isMarketingReachable('granted')).toBe(true);
  expect(isMarketingReachable('unknown')).toBe(false);
  expect(isMarketingReachable('revoked')).toBe(false);
});

test('chave de busca ignora acento e caixa', () => {
  expect(buildClientSearchKey('José da Silva')).toBe('jose da silva');
  expect(buildClientSearchKey('JOSÉ DA SILVA')).toBe('jose da silva');
  expect(buildClientSearchKey('  Ângela   Núñez ')).toBe('angela nunez');
});

test('duplicidade provável só por contato normalizado', () => {
  expect(areLikelyDuplicateClients(
    { name: 'Ana', normalizedPhone: '+5511999999999', normalizedEmail: null },
    { name: 'Outra', normalizedPhone: '+5511999999999', normalizedEmail: null },
  )).toBe(true);
  expect(areLikelyDuplicateClients(
    { name: 'Ana', normalizedPhone: null, normalizedEmail: 'a@x.com' },
    { name: 'Ana', normalizedPhone: null, normalizedEmail: 'a@x.com' },
  )).toBe(true);
  expect(areLikelyDuplicateClients(
    { name: 'Ana Silva', normalizedPhone: null, normalizedEmail: null },
    { name: 'Ana Silva', normalizedPhone: null, normalizedEmail: null },
  )).toBe(false);
});

test('traduz códigos de erro de cliente do establishment', () => {
  expect(translateEstablishmentClientError({
    message: 'establishment_client_has_future_appointments',
  })).toContain('agendamentos futuros');
  expect(translateEstablishmentClientError({ message: 'merge_link_conflict' }))
    .toContain('não podem ser unificados');
  expect(translateEstablishmentClientError({ message: 'random' }, 'fallback'))
    .toBe('fallback');
});
