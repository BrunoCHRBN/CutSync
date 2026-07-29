/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CLIENT_SUPPORT_CATEGORIES,
  createSupportIdempotencyKey,
  formatSupportDateTime,
  SUPPORT_REQUEST_KINDS,
  SUPPORT_SYNC_STATUSES,
  SUPPORT_TICKET_STATUSES,
  supportCategoryLabels,
  supportTicketStatusLabels,
} from '../../packages/domain/src/support';
import {
  CLIENT_SUPPORT_MESSAGE_MAX_LENGTH,
  CLIENT_SUPPORT_REPLY_MIN_LENGTH,
  validateClientSupportReply,
  validateClientSupportTicket,
} from '../../packages/validation/src/client-support';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('mantém categorias, estados e labels fechados para o Client', () => {
  expect(CLIENT_SUPPORT_CATEGORIES).toEqual([
    'access_identity',
    'booking',
    'marketplace',
    'security_privacy',
    'other',
  ]);
  expect(SUPPORT_REQUEST_KINDS).toEqual(['question', 'request', 'incident']);
  expect(SUPPORT_TICKET_STATUSES).toContain('waiting_user');
  expect(SUPPORT_TICKET_STATUSES).toContain('sync_failed');
  expect(SUPPORT_SYNC_STATUSES).toEqual(['pending', 'processing', 'synced', 'failed']);
  expect(supportCategoryLabels.security_privacy).toBe('Segurança e privacidade');
  expect(supportTicketStatusLabels.waiting_user).toContain('resposta');
  expect(formatSupportDateTime('invalid')).toBe('Data indisponível');
});

test('gera chaves idempotentes UUID v4 aceitas pelo backend', () => {
  const values = Array.from({ length: 25 }, () => createSupportIdempotencyKey());
  const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

  expect(new Set(values).size).toBe(values.length);
  expect(values.every((value) => uuidV4.test(value))).toBe(true);
});

test('normaliza chamado e aceita appointment id textual seguro', () => {
  expect(validateClientSupportTicket({
    requestKind: 'incident',
    category: 'booking',
    impact: 'normal',
    subject: '  Falha   ao reagendar ',
    message: 'Não consigo reagendar meu atendimento pelo aplicativo.',
    appointmentId: 'appointment-legacy_2026:07',
  })).toEqual({
    ok: true,
    requestKind: 'incident',
    category: 'booking',
    impact: 'normal',
    subject: 'Falha ao reagendar',
    message: 'Não consigo reagendar meu atendimento pelo aplicativo.',
    appointmentId: 'appointment-legacy_2026:07',
  });
});

test('rejeita campos fora do contrato e conteúdo inseguro', () => {
  expect(validateClientSupportTicket({
    requestKind: 'incident',
    category: 'billing',
    impact: 'normal',
    subject: 'Cobrança',
    message: 'Preciso entender esta cobrança exibida para mim.',
  })).toMatchObject({ ok: false, field: 'category' });

  expect(validateClientSupportTicket({
    requestKind: 'incident',
    category: 'other',
    impact: 'normal',
    subject: '<svg>Ajuda</svg>',
    message: 'Preciso de ajuda para concluir uma ação no aplicativo.',
  })).toMatchObject({ ok: false, field: 'subject' });

  expect(CLIENT_SUPPORT_REPLY_MIN_LENGTH).toBe(1);
  expect(validateClientSupportReply('Ok')).toEqual({ ok: true, message: 'Ok' });
  expect(validateClientSupportReply('   ')).toMatchObject({ ok: false, field: 'message' });
  expect(validateClientSupportReply('x'.repeat(CLIENT_SUPPORT_MESSAGE_MAX_LENGTH + 1)))
    .toMatchObject({ ok: false, field: 'message' });
  expect(validateClientSupportTicket({
    requestKind: 'incident',
    category: 'other',
    impact: 'normal',
    subject: 'Ajuda com o aplicativo',
    message: 'Preciso de ajuda para concluir uma ação no aplicativo.',
    appointmentId: 'x'.repeat(129),
  })).toMatchObject({ ok: false, field: 'appointmentId' });
});

test('valida as combinações de motivo e impacto', () => {
  const base = {
    category: 'other',
    subject: 'Ajuda com o CutSync',
    message: 'Preciso de ajuda para concluir uma ação no aplicativo.',
  };

  expect(validateClientSupportTicket({
    ...base,
    requestKind: 'question',
    impact: 'low',
  })).toMatchObject({ ok: true, requestKind: 'question', impact: 'low' });
  expect(validateClientSupportTicket({
    ...base,
    requestKind: 'request',
    impact: 'high',
  })).toMatchObject({ ok: false, field: 'impact' });
  expect(validateClientSupportTicket({
    ...base,
    requestKind: 'incident',
    impact: 'low',
  })).toMatchObject({ ok: false, field: 'impact' });
  expect(validateClientSupportTicket({
    ...base,
    requestKind: 'invalid',
    impact: 'normal',
  })).toMatchObject({ ok: false, field: 'requestKind' });
});

test('usa RPCs para leitura e Edge Functions autenticadas para escrita', () => {
  const service = readSource('apps/client/src/features/support/client-support-service.ts');

  expect(service).toContain("invokeRpc('get_support_capabilities'");
  expect(service).toContain("invokeRpc('list_my_support_tickets'");
  expect(service).toContain("invokeRpc('get_my_support_ticket'");
  expect(service).toContain("functions.invoke<unknown>('create-jsm-ticket'");
  expect(service).toContain("functions.invoke<unknown>('reply-jsm-ticket'");
  expect(service).toContain('idempotencyKey');
  expect(service).not.toMatch(/JSM_API_TOKEN|JSM_INTEGRATION_EMAIL|ATLASSIAN_API_TOKEN/);
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
});

test('expõe suporte fora das tabs e com wrappers de rota finos', () => {
  const appLayout = readSource('apps/client/src/app/(app)/_layout.tsx');
  const tabsLayout = readSource('apps/client/src/app/(app)/(tabs)/_layout.tsx');
  const home = readSource('apps/client/src/screens/home.tsx');

  for (const route of [
    'apps/client/src/app/(app)/support/index.tsx',
    'apps/client/src/app/(app)/support/new.tsx',
    'apps/client/src/app/(app)/support/[id].tsx',
  ]) expect(fs.existsSync(path.join(root, route))).toBe(true);

  expect(appLayout).toContain('name="support/index"');
  expect(appLayout).toContain('name="support/new"');
  expect(appLayout).toContain("presentation: 'fullScreenModal'");
  expect(appLayout).toContain('name="support/[id]"');
  expect(tabsLayout).not.toContain('name="support"');
  expect(home).toContain('client-open-support');
  expect(home).toContain("router.push('/support'");
});

test('abre novos chamados somente como incidente e separa sugestões por e-mail', () => {
  const screen = readSource('apps/client/src/screens/client-support-new.tsx');
  const list = readSource('apps/client/src/screens/client-support.tsx');
  const feedback = readSource(
    'apps/client/src/features/support/client-support-feedback.ts',
  );
  const service = readSource('apps/client/src/features/support/client-support-service.ts');
  const edgeFunction = readSource('supabase/functions/create-jsm-ticket/index.ts');

  expect(screen).not.toContain('client-support-kind');
  expect(screen).not.toContain('Qual o motivo da solicitação?');
  expect(screen).toContain("requestKind: 'incident'");
  expect(service).toContain("requestKind: 'incident'");
  expect(edgeFunction).toContain('requestKind !== "incident"');
  expect(list).toContain('client-support-feedback-email');
  expect(feedback).toContain('EXPO_PUBLIC_SUPPORT_FEEDBACK_EMAIL');
});

test('mantém Realtime como gatilho de refetch e estados explícitos de tela', () => {
  const hook = readSource('apps/client/src/features/support/use-client-support.ts');
  const list = readSource('apps/client/src/screens/client-support.tsx');
  const detail = readSource('apps/client/src/screens/client-support-detail.tsx');

  expect(hook).toContain('useFocusEffect');
  expect(hook).toContain("table: 'support_tickets'");
  expect(hook).toContain("table: 'support_messages'");
  expect(hook).toContain('void refresh()');
  expect(hook).toContain('removeChannel(channel)');
  expect(list).toContain('client-support-loading');
  expect(list).toContain('client-support-empty');
  expect(list).toContain('client-support-error');
  expect(detail).toContain('validateClientSupportReply');
  expect(detail).toContain('client-support-sync-failed');
});

test('expõe o fluxo completo no Client web atualmente publicado', () => {
  const shell = readSource('apps/web/src/components/layout/ClientShell.tsx');
  const service = readSource('apps/web/src/services/client-support.ts');
  const hook = readSource('apps/web/src/hooks/use-client-support.ts');

  for (const route of [
    'apps/web/src/app/(client)/support/index.tsx',
    'apps/web/src/app/(client)/support/new.tsx',
    'apps/web/src/app/(client)/support/[id].tsx',
  ]) expect(fs.existsSync(path.join(root, route))).toBe(true);

  expect(shell).toContain("key: 'support'");
  expect(shell).toContain("path: '/(client)/support'");
  expect(service).toContain("invokeRpc('list_my_support_tickets')");
  expect(service).toContain("supabase.functions.invoke<unknown>('create-jsm-ticket'");
  expect(service).toContain("supabase.functions.invoke<unknown>('reply-jsm-ticket'");
  expect(service).not.toMatch(/JSM_API_TOKEN|JSM_AGENT_API_TOKEN|ATLASSIAN_API_TOKEN/);
  expect(hook).toContain("table: 'support_tickets'");
  expect(hook).toContain("table: 'support_messages'");
});
