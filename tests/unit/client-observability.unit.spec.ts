import { expect, test } from '@playwright/test';

import {
  createSanitizedSentryError,
  dropSentryTransaction,
  isSentryDiagnosticEnabled,
  SENTRY_TRACES_SAMPLE_RATE,
  sanitizeSentryBreadcrumb,
  sanitizeSentryEvent,
  sanitizeSentryRoute,
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
    breadcrumbs: [{
      category: 'ui.input',
      message: 'Cliente cliente@example.com',
      data: { phone: '(16) 99999-0000' },
    }],
  });

  expect(event.user).toEqual({ id: '9cabb0db-fe1a-4467-847c-9afa5be33239' });
  expect(event.request).toBeUndefined();
  expect(event.extra).toBeUndefined();
  expect(event.contexts).toBeUndefined();
  expect(event.tags).toEqual({
    'app.environment': 'preview',
    'app.route': '/appointments/[id]',
  });
  expect(event.message).toBe('captured_event');
  expect(event.exception?.values?.[0].value).toBe('captured_exception');
  expect(event.breadcrumbs).toEqual([{
    category: 'ui.input',
    level: undefined,
    timestamp: undefined,
    type: undefined,
  }]);
  expect(sanitizeSentryBreadcrumb({
    category: 'navigation',
    message: 'cliente@example.com',
    data: { token: 'secret' },
  })).toEqual({
    category: 'navigation',
    level: undefined,
    timestamp: undefined,
    type: undefined,
  });
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
  expect(sanitizeSentryRoute('/appointments/Legacy Appointment_42/cancel'))
    .toBe('/appointments/[id]/cancel');
  expect(sanitizeSentryRoute('cutsync://establishments/salao-da-maria?token=segredo'))
    .toBe('/establishments/[slug]');
  expect(sanitizeSentryRoute('/booking/barbearia-central'))
    .toBe('/booking/[slug]');
  expect(sanitizeSentryRoute('/support/new')).toBe('/support/new');
  expect(sanitizeSentryRoute(`/invite/${'f'.repeat(64)}`)).toBe('/invite/[token]');
});

test('preserva o stack original sem manter mensagem ou token sensível', () => {
  const sourceError = new Error('Falha para cliente@example.com');
  sourceError.name = 'ClientRpcError';
  sourceError.stack = [
    'ClientRpcError: Falha para cliente@example.com',
    '    at confirmLink (establishment-links.ts:18:3)',
    '    at callback (https://cutsync.app/callback?token=segredo)',
  ].join('\n');

  const capturedError = createSanitizedSentryError(sourceError, 'client_link_confirm_failed');

  expect(capturedError.name).toBe('ClientRpcError');
  expect(capturedError.message).toBe('client_link_confirm_failed');
  expect(capturedError.stack).toContain('at confirmLink (establishment-links.ts:18:3)');
  expect(capturedError.stack).toContain('token=[redacted]');
  expect(capturedError.stack).not.toContain('cliente@example.com');
  expect(capturedError.stack).not.toContain('segredo');
});

test('mantém tracing e transações do Client bloqueados até homologação', () => {
  expect(SENTRY_TRACES_SAMPLE_RATE).toBe(0);
  expect(dropSentryTransaction()).toBeNull();
});
