/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('registra o dispositivo Client somente depois da permissão explícita', () => {
  const service = readSource('apps/client/src/features/notifications/client-push-service.ts');
  const preferences = readSource('apps/client/src/screens/client-preferences.tsx');

  expect(service).toContain('requestPermissionsAsync');
  expect(service).toContain('getExpoPushTokenAsync({ projectId })');
  expect(service).toContain("target_app_kind: 'client'");
  expect(service).toContain("target_platform: Platform.OS");
  expect(service).toContain("rpc('register_push_device'");
  expect(preferences).toContain('enableClientPushNotifications');
  expect(preferences).toContain("toggleChannel('push', enabled)");
});

test('remove o dispositivo no opt-out e antes de encerrar a sessão', () => {
  const service = readSource('apps/client/src/features/notifications/client-push-service.ts');
  const session = readSource('apps/client/src/contexts/session-context.tsx');

  expect(service).toContain("rpc('unregister_push_device'");
  expect(service).toContain('SecureStore.deleteItemAsync(CLIENT_PUSH_TOKEN_KEY)');
  expect(session).toContain('await disableClientPushNotifications()');
  expect(session.indexOf('await disableClientPushNotifications()')).toBeLessThan(
    session.indexOf('await supabase.auth.signOut()', session.indexOf('signOut: async')),
  );
});

test('configura o canal Android antes de solicitar o token', () => {
  const service = readSource('apps/client/src/features/notifications/client-push-service.ts');
  const appConfig = JSON.parse(readSource('apps/client/app.json')) as {
    expo: { plugins: unknown[] };
  };

  expect(service).toContain('setNotificationChannelAsync(APPOINTMENTS_CHANNEL_ID');
  expect(service.indexOf('await ensureAndroidChannel()')).toBeLessThan(
    service.indexOf('getExpoPushTokenAsync({ projectId })'),
  );
  expect(JSON.stringify(appConfig.expo.plugins)).toContain('expo-notifications');
});

test('sincroniza token rotacionado e retorno do aplicativo sem solicitar nova permissão', () => {
  const provider = readSource('apps/client/src/contexts/client-notifications-context.tsx');
  const service = readSource('apps/client/src/features/notifications/client-push-service.ts');

  expect(provider).toContain('addPushTokenListener');
  expect(provider).toContain("state === 'active'");
  expect(provider).toContain('syncClientPushNotifications');
  expect(service).toContain('registerRotatedClientPushToken');
  expect(service).toContain('if (!storedToken');
});

test('enfileira eventos de agendamento com deduplicação, tentativas e recibos', () => {
  const migration = readSource('supabase/migrations/20260724010000_client_push_notifications.sql');
  const dispatcher = readSource('supabase/functions/dispatch-client-notifications/index.ts');
  const sqlTest = readSource('supabase/tests/client_push_notifications.sql');

  expect(migration).toContain('CREATE TABLE public.client_push_deliveries');
  expect(migration).toContain('UNIQUE (event_key, push_device_id)');
  expect(migration).toContain('enqueue_client_appointment_push_trigger');
  expect(migration).toContain('queue_due_client_appointment_reminders');
  expect(migration).toContain('FOR UPDATE SKIP LOCKED');
  expect(migration).toContain('complete_client_push_receipt');
  expect(migration).toContain("target_error_code = 'DeviceNotRegistered'");
  expect(dispatcher).toContain('NOTIFICATION_DISPATCH_SECRET');
  expect(dispatcher).toContain('AbortSignal.timeout');
  expect(dispatcher).not.toContain('console.log');
  expect(sqlTest).toContain('reminder queue is not idempotent');
  expect(sqlTest).toContain('permission denied');
});
