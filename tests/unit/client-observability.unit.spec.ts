import { expect, test } from '@playwright/test';

import {
  isSentryDiagnosticEnabled,
  sanitizeSentryEvent,
  sanitizeSentryText,
} from '../../apps/client/src/features/observability/sentry-sanitization';

test('remove PII, tokens e payloads livres antes do envio ao Sentry', () => {
  const event = sanitizeSentryEvent({
    user: {
      id: '9cabb0db-fe1a-4467-847c-9afa5be33239',
      email: 'cliente@example.com',
      ip_address: '127.0.0.1',
    },
    request: { headers: { authorization: 'Bearer segredo' } },
    extra: { appointment: { clientName: 'Cliente' } },
    contexts: { notification: { body: 'Conteúdo privado' } },
    tags: {
      'app.environment': 'preview',
      'app.route': '/appointments/9cabb0db-fe1a-4467-847c-9afa5be33239',
      unsafe: 'cliente@example.com',
    },
    message: 'Falha para cliente@example.com no telefone (16) 99999-0000',
    exception: {
      values: [{
        type: 'Error',
        value: 'token eyJabc.def.ghi usuário 9cabb0db-fe1a-4467-847c-9afa5be33239',
      }],
    },
  });

  expect(event.user).toEqual({ id: '9cabb0db-fe1a-4467-847c-9afa5be33239' });
  expect(event.request).toBeUndefined();
  expect(event.extra).toBeUndefined();
  expect(event.contexts).toBeUndefined();
  expect(event.tags).toEqual({
    'app.environment': 'preview',
    'app.route': '/appointments/[id]',
  });
  expect(event.message).not.toContain('cliente@example.com');
  expect(event.message).not.toContain('99999-0000');
  expect(event.exception?.values?.[0].value).toContain('[token]');
  expect(event.exception?.values?.[0].value).toContain('[id]');
});

test('oculta diagnóstico em produção', () => {
  expect(isSentryDiagnosticEnabled('development')).toBe(true);
  expect(isSentryDiagnosticEnabled('preview')).toBe(true);
  expect(isSentryDiagnosticEnabled('production')).toBe(false);
  expect(isSentryDiagnosticEnabled(undefined)).toBe(false);
});

test('sanitiza parâmetros sensíveis de URL', () => {
  expect(sanitizeSentryText('https://cutsync.app/callback?access_token=segredo&code=123'))
    .toBe('https://cutsync.app/callback?access_token=[redacted]&code=[redacted]');
});
