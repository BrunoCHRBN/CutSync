/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { getBusinessNotificationRoute } from '../../packages/domain/src/business-notifications';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('Business registra dispositivo explicitamente e sincroniza permissão já concedida', () => {
  const service = readSource('apps/business/src/features/notifications/business-push-service.ts');
  const account = readSource('apps/business/src/screens/account.tsx');
  const session = readSource('apps/business/src/contexts/business-session.tsx');
  const appConfig = JSON.parse(readSource('apps/business/app.json')) as {
    expo: { plugins: unknown[] };
  };

  expect(service).toContain('requestPermissionsAsync');
  expect(service).toContain("target_app_kind: 'business'");
  expect(service).toContain("rpc('register_push_device'");
  const channelSetupIndex = service.indexOf('await ensureAndroidChannels()');
  const tokenRequestIndex = service.indexOf('getExpoPushTokenAsync({ projectId })');
  expect(channelSetupIndex).toBeGreaterThanOrEqual(0);
  expect(tokenRequestIndex).toBeGreaterThanOrEqual(0);
  expect(channelSetupIndex).toBeLessThan(tokenRequestIndex);
  expect(service).toContain('await registerToken(currentToken)');
  expect(service).toContain('return storedToken ? \'enabled\' : \'not_determined\'');
  expect(service).toContain('if (!storedToken) return;');
  expect(account).toContain('business-push-toggle');
  expect(session).toContain('await disableBusinessPushNotifications()');
  expect(JSON.stringify(appConfig.expo.plugins)).toContain('expo-notifications');
});

test('Business apresenta foreground e processa toque uma única vez', () => {
  const provider = readSource('apps/business/src/contexts/business-notifications-context.tsx');

  expect(provider).toContain('shouldShowBanner: true');
  expect(provider).toContain('shouldShowList: true');
  expect(provider).toContain('addNotificationResponseReceivedListener');
  expect(provider).toContain('getLastNotificationResponseAsync');
  expect(provider).toContain('clearLastNotificationResponse');
  expect(provider).toContain('handledResponseId.current === notificationId');
  expect(provider).toContain('pendingResponse.current = response');
  expect(provider).toContain('if (isContextLoading)');
  expect(provider.indexOf('if (isContextLoading)')).toBeLessThan(
    provider.indexOf('handledResponseId.current = notificationId'),
  );
  expect(provider).toContain('syncBusinessPushNotifications');
});

test('deep links Business aceitam somente eventos e identificadores válidos', () => {
  const establishmentId = '929b9f88-00b5-4320-91ca-1e6a395c91ff';
  const appointmentId = 'e0b190e4-f461-46a3-bd83-de805fc93a0f';
  const requestId = 'bb87d419-193b-44a0-8053-d2c872f9777e';

  expect(getBusinessNotificationRoute({
    eventType: 'appointment_reassignment_action_required',
    establishmentId,
    appointmentId,
    reassignmentRequestId: requestId,
  })).toEqual({
    pathname: '/(app)/decisions/[requestId]',
    params: { requestId },
    targetEstablishmentId: establishmentId,
  });
  expect(getBusinessNotificationRoute({
    eventType: 'appointment_rescheduled',
    establishmentId,
    appointmentId,
  })).toEqual({
    pathname: '/(app)/appointments/[appointmentId]',
    params: { appointmentId },
    targetEstablishmentId: establishmentId,
  });
  expect(getBusinessNotificationRoute({
    eventType: 'appointment_reassignment_action_required',
    establishmentId,
    reassignmentRequestId: '../account',
  })).toBeNull();
  expect(getBusinessNotificationRoute({
    eventType: 'arbitrary_event',
    establishmentId,
    appointmentId,
  })).toBeNull();
});

test('workers usam fila, recibos, Vault e segredo server-side', () => {
  const dispatcher = readSource('supabase/functions/dispatch-business-notifications/index.ts');
  const payload = readSource('supabase/functions/dispatch-business-notifications/business-push-payload.ts');
  const migration = readSource('supabase/migrations/20260823003000_phase3_notification_dispatch_runtime.sql');
  const immediateMigration = readSource('supabase/migrations/20260823004000_phase3_immediate_notification_dispatch.sql');

  expect(dispatcher).toContain('NOTIFICATION_DISPATCH_SECRET');
  expect(dispatcher).toContain('claim_business_push_deliveries');
  expect(dispatcher).toContain('claim_business_push_receipts');
  expect(payload).toContain('appointment_reassignment_action_required');
  expect(payload).toContain('sanitizeBusinessPushPayload');
  expect(migration).toContain('vault.decrypted_secrets');
  expect(migration).toContain('CREATE EXTENSION IF NOT EXISTS pg_net;');
  expect(migration).not.toContain('pg_net WITH SCHEMA extensions');
  expect(migration).toContain("'cutsync-dispatch-client-notifications'");
  expect(migration).toContain("'cutsync-dispatch-business-notifications'");
  expect(migration).not.toContain('NOTIFICATION_DISPATCH_SECRET=');
  expect(migration).not.toContain('EXPO_ACCESS_TOKEN=');
  expect(immediateMigration).toContain('public.kick_notification_dispatch()');
  expect(immediateMigration).toContain('REFERENCING NEW TABLE AS inserted_deliveries');
  expect(immediateMigration).toContain("body := '{\"mode\":\"send\",\"limit\":100}'::jsonb");
  expect(immediateMigration).toContain('The minute cron remains the durable recovery path');
  expect(immediateMigration).not.toContain('NOTIFICATION_DISPATCH_SECRET=');
});
