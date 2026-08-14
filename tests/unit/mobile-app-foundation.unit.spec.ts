import { expect, test } from '@playwright/test';
import { QueryObserver } from '@tanstack/react-query';
import fs from 'node:fs';
import path from 'node:path';

import {
  businessQueryDefaultOptions,
  createBusinessQueryClient,
  createBusinessQueryKey,
  getBusinessQueryRetryDelay,
  isNetworkStateOnline as isBusinessNetworkStateOnline,
  resetBusinessQueryCacheForScope,
  shouldRetryBusinessQuery,
} from '../../apps/business/src/features/connectivity/business-query';
import {
  getBusinessInvitationShareUrl,
  getBusinessTeamInvitationShareUrl,
  normalizeBusinessAppointmentRouteId,
  resolveBusinessAppointmentContext,
  resolveBusinessDeepLink,
  resolveBusinessNotificationLink,
} from '../../apps/business/src/features/links/business-deep-links';
import { shouldSyncBusinessPushAfterReconnect } from '../../apps/business/src/features/notifications/business-push-lifecycle';
import {
  buildSentryRelease as buildBusinessSentryRelease,
  createSanitizedSentryError as createBusinessSentryError,
  dropSentryTransaction as dropBusinessSentryTransaction,
  SENTRY_TRACES_SAMPLE_RATE as BUSINESS_SENTRY_TRACES_SAMPLE_RATE,
  sanitizeCorrelationId as sanitizeBusinessCorrelationId,
  sanitizeSentryEvent as sanitizeBusinessSentryEvent,
  sanitizeSentryRoute as sanitizeBusinessSentryRoute,
} from '../../apps/business/src/features/observability/sentry-sanitization';
import {
  createBusinessReleasePolicyQueryKey,
  parseBusinessReleasePolicyResponse,
  resolveBusinessReleaseGateState,
} from '../../apps/business/src/features/updates/business-release-policy';
import {
  activateAcceptedBusinessTeamInvitation,
  BusinessTeamInvitationActivationError,
} from '../../apps/business/src/features/team/business-team-invitation-activation';
import {
  clientQueryDefaultOptions,
  createClientQueryClient,
  createClientQueryKey,
  getClientQueryRetryDelay,
  isNetworkStateOnline as isClientNetworkStateOnline,
  resetClientQueryCacheForScope,
  shouldRetryClientQuery,
} from '../../apps/client/src/features/connectivity/client-query';

const root = process.cwd();
const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
};

test('query keys isolam usuário e estabelecimento e mutações nunca repetem sozinhas', () => {
  expect(createBusinessQueryKey('user-a', 'unit-a', 'agenda', '2026-08-01')).toEqual([
    'business',
    'user-a',
    'unit-a',
    'agenda',
    '2026-08-01',
  ]);
  expect(createClientQueryKey('user-a', 'account', 'profile')).toEqual([
    'client',
    'user-a',
    'account',
    'profile',
  ]);
  expect(createClientQueryKey('user-a', 'unit-a', 'links')).toEqual([
    'client',
    'user-a',
    'unit-a',
    'links',
  ]);
  expect(businessQueryDefaultOptions.queries.retry).toBe(shouldRetryBusinessQuery);
  expect(clientQueryDefaultOptions.queries.retry).toBe(shouldRetryClientQuery);
  expect(businessQueryDefaultOptions.mutations.retry).toBe(false);
  expect(clientQueryDefaultOptions.mutations.retry).toBe(false);
  expect(getBusinessQueryRetryDelay(0)).toBe(750);
  expect(getBusinessQueryRetryDelay(9)).toBe(4_000);
  expect(getClientQueryRetryDelay(2)).toBe(3_000);
});

test('queries repetem somente falhas transitórias e respeitam o limite', () => {
  expect(shouldRetryBusinessQuery(0, { code: 'network_error' })).toBe(true);
  expect(shouldRetryBusinessQuery(1, new TypeError('Failed to fetch'))).toBe(true);
  expect(shouldRetryBusinessQuery(2, { code: 'network_error' })).toBe(false);
  expect(shouldRetryBusinessQuery(0, { code: 'forbidden' })).toBe(false);
  expect(shouldRetryBusinessQuery(0, { code: 'invalid_response' })).toBe(false);
  expect(shouldRetryBusinessQuery(0, new TypeError('Cannot read properties of undefined'))).toBe(false);

  expect(shouldRetryClientQuery(0, new Error(
    'Não foi possível conectar. Verifique sua internet e tente novamente.',
  ))).toBe(true);
  expect(shouldRetryClientQuery(2, new TypeError('Network request failed'))).toBe(false);
  expect(shouldRetryClientQuery(0, new Error('Recurso não encontrado.'))).toBe(false);
  expect(shouldRetryClientQuery(0, new Error('Resposta inválida.'))).toBe(false);

  const invitationScreen = read('apps/business/src/screens/team-invitation.tsx');
  expect(invitationScreen).toContain('retry: shouldRetryBusinessQuery');
  expect(invitationScreen).not.toContain('retry: 1');
});

test('aceite de convite só ativa contexto confirmado e exige seleção bem-sucedida', async () => {
  const acceptance = {
    invitationId: 'ef07e1c1-dbc9-4a3d-a96c-c8286e14c717',
    membershipId: 'ea3445f6-a57e-4742-8a24-45e136428b17',
    establishmentId: '9681ca72-b779-4399-a1e2-c17848f97f19',
    status: 'accepted' as const,
  };
  let selectionCalls = 0;
  let sanitizedActivationError: unknown;

  try {
    await activateAcceptedBusinessTeamInvitation(
      acceptance,
      async () => {
        throw new Error('Falha para cliente@example.com com token secreto');
      },
      async () => true,
    );
  } catch (error) {
    sanitizedActivationError = error;
  }
  expect(sanitizedActivationError).toBeInstanceOf(BusinessTeamInvitationActivationError);
  expect((sanitizedActivationError as Error).message).not.toContain('cliente@example.com');
  expect((sanitizedActivationError as Error).message).not.toContain('secreto');

  await expect(activateAcceptedBusinessTeamInvitation(
    acceptance,
    async () => [],
    async () => {
      selectionCalls += 1;
      return true;
    },
  )).rejects.toBeInstanceOf(BusinessTeamInvitationActivationError);
  expect(selectionCalls).toBe(0);

  await expect(activateAcceptedBusinessTeamInvitation(
    acceptance,
    async () => [{ establishmentId: acceptance.establishmentId }],
    async () => {
      selectionCalls += 1;
      return false;
    },
  )).rejects.toBeInstanceOf(BusinessTeamInvitationActivationError);
  expect(selectionCalls).toBe(1);

  const activated = await activateAcceptedBusinessTeamInvitation(
    acceptance,
    async (preferredEstablishmentId) => {
      expect(preferredEstablishmentId).toBe(acceptance.establishmentId);
      return [{ establishmentId: acceptance.establishmentId }];
    },
    async (establishmentId) => {
      expect(establishmentId).toBe(acceptance.establishmentId);
      selectionCalls += 1;
      return true;
    },
  );
  expect(activated).toBe(acceptance);
  expect(selectionCalls).toBe(2);
});

test('tela mantém request_id até concluir ativação e só então navega', () => {
  const invitationScreen = read('apps/business/src/screens/team-invitation.tsx');
  const teamApi = read('apps/business/src/features/team/business-team-api.ts');
  const operationalContext = read(
    'apps/business/src/contexts/business-operational-context.tsx',
  );
  const mutationStart = invitationScreen.indexOf('mutationFn: async () => {');
  const successStart = invitationScreen.indexOf(
    'onSuccess: (acceptance) => {',
    mutationStart,
  );
  const mutationBody = invitationScreen.slice(mutationStart, successStart);
  const successBody = invitationScreen.slice(successStart);

  expect(mutationBody).toContain('businessTeamApi.acceptMyInvitation(');
  expect(mutationBody).toContain('activateAcceptedBusinessTeamInvitation(');
  expect(mutationBody).toContain('activeInvitationId.current !== acceptance.invitationId');
  expect(mutationBody).not.toContain('requestId.current = null');
  expect(mutationBody).not.toContain("router.replace('/today')");
  expect(successBody.indexOf('requestId.current = null')).toBeLessThan(
    successBody.indexOf("router.replace('/today')"),
  );
  expect(invitationScreen).not.toContain('invitation.data?.establishmentId');
  expect(invitationScreen).toContain(
    "disabled={invitation.data.status !== 'pending' && !requestId.current}",
  );
  expect(invitationScreen).toMatch(/useEffect\(\(\) => \{\s+requestId\.current = null;/u);
  expect(invitationScreen).toContain("}, [invitationId]);");
  expect(invitationScreen).toContain('accept.reset();');
  expect(teamApi).toContain('mapTeamInvitationAcceptance(data, invitationId)');
  expect(teamApi).toContain("status: 'accepted'");
  expect(operationalContext).toContain('confirmedContextsRef.current');
  expect(operationalContext).toContain('confirmed.userId !== user.id');
});

test('troca de escopo remove cache antigo sem apagar query nova ativa', async () => {
  const businessClient = createBusinessQueryClient();
  const previousBusinessKey = createBusinessQueryKey('user-a', 'unit-a', 'agenda');
  const nextBusinessKey = createBusinessQueryKey('user-a', 'unit-b', 'agenda');
  businessClient.setQueryData(previousBusinessKey, ['old-unit']);
  const businessFetch = deferred<string[]>();
  const businessObserver = new QueryObserver(businessClient, {
    queryKey: nextBusinessKey,
    queryFn: () => businessFetch.promise,
    retry: false,
  });
  const unsubscribeBusiness = businessObserver.subscribe(() => undefined);

  resetBusinessQueryCacheForScope(businessClient, 'user-a', 'unit-b');
  expect(businessClient.getQueryData(previousBusinessKey)).toBeUndefined();
  expect(businessClient.getQueryCache().find({ queryKey: nextBusinessKey })).toBeDefined();
  expect(businessObserver.getCurrentResult().fetchStatus).toBe('fetching');
  businessFetch.resolve(['new-unit']);
  await expect.poll(() => businessObserver.getCurrentResult().status).toBe('success');
  expect(businessObserver.getCurrentResult()).toMatchObject({
    data: ['new-unit'],
    fetchStatus: 'idle',
  });
  unsubscribeBusiness();

  const client = createClientQueryClient();
  const previousClientKey = createClientQueryKey('user-a', 'account', 'establishment-links');
  const nextClientKey = createClientQueryKey('user-b', 'account', 'establishment-links');
  client.setQueryData(previousClientKey, ['old-user']);
  const clientFetch = deferred<string[]>();
  const clientObserver = new QueryObserver(client, {
    queryKey: nextClientKey,
    queryFn: () => clientFetch.promise,
    retry: false,
  });
  const unsubscribeClient = clientObserver.subscribe(() => undefined);

  resetClientQueryCacheForScope(client, 'user-b');
  expect(client.getQueryData(previousClientKey)).toBeUndefined();
  expect(client.getQueryCache().find({ queryKey: nextClientKey })).toBeDefined();
  expect(clientObserver.getCurrentResult().fetchStatus).toBe('fetching');
  clientFetch.resolve(['new-user']);
  await expect.poll(() => clientObserver.getCurrentResult().status).toBe('success');
  expect(clientObserver.getCurrentResult()).toMatchObject({
    data: ['new-user'],
    fetchStatus: 'idle',
  });
  unsubscribeClient();

  const previousClientUnitKey = createClientQueryKey('user-b', 'unit-a', 'links');
  const nextClientUnitKey = createClientQueryKey('user-b', 'unit-b', 'links');
  client.setQueryData(previousClientUnitKey, ['old-unit']);
  client.setQueryData(nextClientUnitKey, ['new-unit']);
  resetClientQueryCacheForScope(client, 'user-b', 'unit-b');
  expect(client.getQueryData(previousClientUnitKey)).toBeUndefined();
  expect(client.getQueryData(nextClientUnitKey)).toEqual(['new-unit']);

  resetBusinessQueryCacheForScope(businessClient, null, null);
  resetClientQueryCacheForScope(client, null);
  expect(businessClient.getQueryCache().getAll()).toHaveLength(0);
  expect(client.getQueryCache().getAll()).toHaveLength(0);
});

test('release policy usa escopo anon/global antes da sessão e preserva bloqueio válido', () => {
  const releaseGate = read(
    'apps/business/src/features/updates/business-release-gate.tsx',
  );
  expect(releaseGate).toContain('enabled: isSupabaseConfigured');
  expect(releaseGate).toContain('createBusinessReleasePolicyQueryKey(');
  expect(releaseGate).not.toContain('Boolean(user && activeContext)');

  expect(createBusinessReleasePolicyQueryKey(null, null, '0.1.0')).toEqual([
    'business',
    'anon',
    'global',
    'release-policy',
    '0.1.0',
    'android',
  ]);
  expect(createBusinessReleasePolicyQueryKey('user-a', null, '0.1.0')).toEqual([
    'business',
    'user-a',
    'global',
    'release-policy',
    '0.1.0',
    'android',
  ]);

  const enforcedPolicy = {
    appKind: 'business' as const,
    platform: 'android' as const,
    minimumSupportedVersion: '0.2.0',
    latestVersion: '0.2.0',
    updateRequired: true,
    enforcementEnabled: true,
    storeUrl: 'https://play.google.com/store/apps/details?id=com.cutsync.business',
    message: null,
  };
  expect(resolveBusinessReleaseGateState({
    appVersion: '0.1.0',
    configured: true,
    errorCode: 'network_error',
    fetchStatus: 'idle',
    policy: enforcedPolicy,
    status: 'error',
  })).toBe('blocked');
});

test('release gate permite primeira abertura offline, mas fecha falhas de contrato', () => {
  expect(resolveBusinessReleaseGateState({
    appVersion: '0.1.0',
    configured: true,
    errorCode: null,
    fetchStatus: 'paused',
    status: 'pending',
  })).toBe('allow');
  expect(resolveBusinessReleaseGateState({
    appVersion: '0.1.0',
    configured: true,
    errorCode: 'network_error',
    fetchStatus: 'idle',
    status: 'error',
  })).toBe('allow');
  expect(resolveBusinessReleaseGateState({
    appVersion: '0.1.0',
    configured: true,
    errorCode: 'invalid_response',
    fetchStatus: 'idle',
    status: 'error',
  })).toBe('validation_error');
  expect(resolveBusinessReleaseGateState({
    appVersion: '0.1.0',
    configured: true,
    fetchStatus: 'idle',
    status: 'success',
  })).toBe('validation_error');
});

test('release policy rejeita booleanos ausentes ou malformados sem desativar enforcement', () => {
  const valid = {
    app_kind: 'business',
    platform: 'android',
    minimum_supported_version: '0.1.0',
    latest_version: '0.2.0',
    update_required: true,
    enforcement_enabled: true,
    store_url: 'https://play.google.com/store/apps/details?id=com.cutsync.business',
    message: null,
  };

  expect(parseBusinessReleasePolicyResponse([valid])).toMatchObject({
    updateRequired: true,
    enforcementEnabled: true,
  });
  expect(parseBusinessReleasePolicyResponse([{
    ...valid,
    update_required: 'false',
  }])).toBeNull();
  expect(parseBusinessReleasePolicyResponse([{
    ...valid,
    enforcement_enabled: undefined,
  }])).toBeNull();
});

test('release policy exige destino Play oficial somente para bloqueio obrigatório', () => {
  const valid = {
    app_kind: 'business',
    platform: 'android',
    minimum_supported_version: '0.1.0',
    latest_version: '0.2.0',
    update_required: true,
    enforcement_enabled: true,
    store_url: 'https://play.google.com/store/apps/details?id=com.cutsync.business',
    message: null,
  };

  expect(parseBusinessReleasePolicyResponse([valid])).toMatchObject({
    storeUrl: valid.store_url,
    updateRequired: true,
    enforcementEnabled: true,
  });
  expect(parseBusinessReleasePolicyResponse([{ ...valid, store_url: null }])).toBeNull();

  expect(parseBusinessReleasePolicyResponse([{
    ...valid,
    enforcement_enabled: false,
    store_url: null,
  }])).toMatchObject({ storeUrl: null, enforcementEnabled: false });
  expect(parseBusinessReleasePolicyResponse([{
    ...valid,
    update_required: false,
    store_url: null,
  }])).toMatchObject({ storeUrl: null, updateRequired: false });

  for (const storeUrl of [
    'http://play.google.com/store/apps/details?id=com.cutsync.business',
    'https://play.google.com.evil.example/store/apps/details?id=com.cutsync.business',
    'https://user:password@play.google.com/store/apps/details?id=com.cutsync.business',
    'https://play.google.com/store/apps/details?id=com.cutsync.client',
    'https://play.google.com/store/apps/details?id=com.cutsync.business&redirect=evil',
    'https://play.google.com/store/apps/details?id=com.cutsync.business#redirect',
  ]) {
    expect(parseBusinessReleasePolicyResponse([{
      ...valid,
      store_url: storeUrl,
    }]), storeUrl).toBeNull();
  }

  expect(parseBusinessReleasePolicyResponse([{
    ...valid,
    minimum_supported_version: '0.3.0',
    latest_version: '0.2.0',
  }])).toBeNull();
});

test('estado de rede só pausa queries quando a desconexão é confirmada', () => {
  expect(isBusinessNetworkStateOnline({})).toBe(true);
  expect(isBusinessNetworkStateOnline({ isConnected: true })).toBe(true);
  expect(isBusinessNetworkStateOnline({ isConnected: false })).toBe(false);
  expect(isClientNetworkStateOnline({
    isConnected: true,
    isInternetReachable: false,
  })).toBe(false);
});

test('links Business aceitam somente convite ou atendimento com identificadores válidos', () => {
  const invitationToken = 'a'.repeat(64);
  const appointmentId = 'Legacy Appointment_42';
  const establishmentId = 'ca68f734-51ad-4bf5-bc4f-dac1b14bf1b5';
  const invitationId = '2b28df1d-8fc1-4cf0-b4c2-54a97b89d2f7';

  expect(resolveBusinessDeepLink(`cutsync-business://invite/${invitationToken}`)).toEqual({
    kind: 'invitation',
    href: `/invite/${invitationToken}`,
    invitationToken,
    requiresOperationalAccess: false,
  });
  expect(resolveBusinessDeepLink(`/appointments/${appointmentId}`)).toMatchObject({
    kind: 'appointment',
    appointmentId,
    establishmentId: null,
    href: '/appointments/Legacy%20Appointment_42',
  });
  expect(normalizeBusinessAppointmentRouteId('Legacy-Appointment_42'))
    .toBe('Legacy-Appointment_42');
  expect(normalizeBusinessAppointmentRouteId('Legacy%20Appointment_42'))
    .toBe('Legacy Appointment_42');
  expect(normalizeBusinessAppointmentRouteId('%2Faccount')).toBeNull();
  expect(normalizeBusinessAppointmentRouteId('../account')).toBeNull();
  expect(resolveBusinessDeepLink(`/invitations/${invitationId}`)).toMatchObject({
    kind: 'team_invitation',
    invitationId,
  });
  expect(getBusinessTeamInvitationShareUrl(invitationId))
    .toBe(`cutsync-business://invitations/${invitationId}`);
  expect(getBusinessInvitationShareUrl(invitationToken))
    .toBe(`cutsync-business://invite/${invitationToken}`);
  expect(getBusinessInvitationShareUrl('token-inválido')).toBeNull();
  expect(getBusinessTeamInvitationShareUrl('../security')).toBeNull();
  expect(resolveBusinessDeepLink('https://evil.example/appointments/9cabb0db-fe1a-4467-847c-9afa5be33239'))
    .toBeNull();
  expect(resolveBusinessDeepLink('cutsync-business://reset-password?code=secret')).toBeNull();
  expect(resolveBusinessNotificationLink({
    type: 'appointment_rescheduled',
    appointment_id: appointmentId,
    establishment_id: establishmentId,
    client_name: 'não deve participar do link',
  })).toMatchObject({
    kind: 'appointment',
    appointmentId,
    establishmentId,
  });
  expect(resolveBusinessNotificationLink({
    eventType: 'appointment_created',
    appointmentId,
    establishmentId,
  })).toMatchObject({ kind: 'appointment', appointmentId, establishmentId });
  expect(resolveBusinessNotificationLink({
    eventType: 'operational_conflict',
    professionalId: invitationId,
  })).toBeNull();
  expect(resolveBusinessNotificationLink({
    eventType: 'operational_conflict',
    establishmentId,
    professionalId: invitationId,
  })).toMatchObject({ kind: 'agenda', establishmentId });
  expect(resolveBusinessNotificationLink({
    eventType: 'appointment_created',
    appointmentId: 'android-cycle-cancel',
    establishmentId,
  })).toMatchObject({
    kind: 'appointment',
    appointmentId: 'android-cycle-cancel',
    href: '/appointments/android-cycle-cancel',
  });
  expect(resolveBusinessNotificationLink({
    eventType: 'invitation_created',
    invitationId,
    establishmentId,
  })).toMatchObject({ kind: 'team_invitation', invitationId });
  expect(resolveBusinessNotificationLink({
    type: 'appointment_rescheduled',
    appointment_id: '../security',
  })).toBeNull();
  expect(resolveBusinessNotificationLink({
    type: 'appointment_rescheduled',
    appointment_id: 'unsafe?redirect=/account',
  })).toBeNull();
  expect(resolveBusinessDeepLink('/appointments/%2Faccount')).toBeNull();
  expect(resolveBusinessDeepLink('/appointments/..')).toBeNull();
});

test('link direto de atendimento resolve somente entre unidades autorizadas e não oculta falha de rede', async () => {
  const checked: string[] = [];
  const contexts = [
    { establishmentId: 'unit-blocked', accessMode: 'blocked' as const },
    { establishmentId: 'unit-a', accessMode: 'full' as const },
    { establishmentId: 'unit-b', accessMode: 'read_only' as const },
  ];
  const establishmentId = await resolveBusinessAppointmentContext({
    appointmentId: 'appointment-42',
    activeEstablishmentId: 'unit-a',
    contexts,
    loadDetail: async (candidate) => {
      checked.push(candidate);
      if (candidate !== 'unit-b') throw Object.assign(new Error('missing'), { code: 'not_found' });
    },
  });

  expect(establishmentId).toBe('unit-b');
  expect(checked).toEqual(['unit-a', 'unit-b']);
  await expect(resolveBusinessAppointmentContext({
    appointmentId: 'appointment-42',
    activeEstablishmentId: 'unit-a',
    contexts,
    loadDetail: async () => {
      throw Object.assign(new Error('offline'), { code: 'network_error' });
    },
  })).rejects.toMatchObject({ code: 'network_error' });

  const appointmentHook = read(
    'apps/business/src/features/appointments/use-business-appointment.ts',
  );
  expect(appointmentHook).toContain('resolveBusinessAppointmentContext({');
  expect(appointmentHook).toContain(
    "const appointmentId = normalizeBusinessAppointmentRouteId(routeAppointmentId) ?? '';",
  );
  expect(appointmentHook).toContain('filter: `id=eq.${appointmentId}`');
  expect(appointmentHook).toContain('filter: `appointment_id=eq.${appointmentId}`');
  expect(appointmentHook).toContain("context.accessMode !== 'blocked'");
  expect(appointmentHook).toContain('await selectEstablishment(resolvedEstablishmentId)');
});

test('URI fria mantém a rota protegida durante bootstrap e valida antes do detalhe', () => {
  const rootLayout = read('apps/business/src/app/_layout.tsx');
  const appLayout = read('apps/business/src/app/(app)/_layout.tsx');
  const appointmentHook = read(
    'apps/business/src/features/appointments/use-business-appointment.ts',
  );

  expect(rootLayout).toContain('const isAccessBootstrapping = isSessionLoading');
  expect(rootLayout).toMatch(
    /const hasOperationalAccess\s*=\s*\(?\s*isAccessBootstrapping/,
  );
  expect(rootLayout).toContain('|| canResolveAppointmentRoute');
  expect(rootLayout).toContain("routeLink?.kind === 'appointment'");
  expect(appLayout).toContain(
    'if (!isBootstrapping && !activeContext && !canResolveAppointmentRoute)',
  );
  expect(appointmentHook).toContain('normalizeBusinessAppointmentRouteId(routeAppointmentId)');
  expect(appointmentHook).toContain('canResolveWithoutActiveContext');
  expect(appointmentHook).toContain(
    '|| canResolveWithoutActiveContext',
  );
});

test('push repete somente em reconexão confirmada com o app ativo', () => {
  expect(shouldSyncBusinessPushAfterReconnect(
    false,
    { isConnected: true, isInternetReachable: true },
    'active',
  )).toBe(true);
  expect(shouldSyncBusinessPushAfterReconnect(
    null,
    { isConnected: true, isInternetReachable: true },
    'active',
  )).toBe(false);
  expect(shouldSyncBusinessPushAfterReconnect(
    true,
    { isConnected: true, isInternetReachable: true },
    'active',
  )).toBe(false);
  expect(shouldSyncBusinessPushAfterReconnect(
    false,
    { isConnected: true, isInternetReachable: true },
    'background',
  )).toBe(false);
  expect(shouldSyncBusinessPushAfterReconnect(
    false,
    { isConnected: false, isInternetReachable: false },
    'active',
  )).toBe(false);
});

test('Sentry Business preserva apenas contexto operacional seguro', () => {
  const correlationId = 'req:9cabb0db-fe1a-4467-847c-9afa5be33239';
  const event = sanitizeBusinessSentryEvent({
    user: { id: 'user-id', email: 'pessoa@example.com' },
    request: { headers: { authorization: 'Bearer secret' } },
    extra: { notes: 'observação privada' },
    contexts: { payment: { amount: 300 } },
    tags: {
      'app.operation': 'appointment.confirm',
      'app.route': `/invite/${'a'.repeat(64)}`,
      'request.correlation_id': correlationId,
      unsafe: 'pessoa@example.com',
    },
    message: 'Erro de Maria em pessoa@example.com',
    breadcrumbs: [{
      category: 'ui.input',
      message: 'Nome Maria e observação privada',
      data: { phone: '16999990000' },
    }],
    exception: { values: [{ type: 'Error', value: 'Erro de Maria' }] },
  });

  expect(event.user).toEqual({ id: 'user-id' });
  expect(event.request).toBeUndefined();
  expect(event.extra).toBeUndefined();
  expect(event.contexts).toBeUndefined();
  expect(event.tags).toEqual({
    'app.operation': 'appointment.confirm',
    'app.route': '/invite/[token]',
    'request.correlation_id': correlationId,
  });
  expect(event.message).toBe('captured_event');
  expect(event.exception.values[0].value).toBe('captured_exception');
  expect(event.breadcrumbs[0]).not.toHaveProperty('message');
  expect(event.breadcrumbs[0]).not.toHaveProperty('data');
  expect(sanitizeBusinessCorrelationId('bad id with spaces')).toBeUndefined();
  expect(buildBusinessSentryRelease('cutsync-business', '0.1.0', '12'))
    .toBe('cutsync-business@0.1.0+12');
  expect(sanitizeBusinessSentryRoute(
    'cutsync-business://appointments/Legacy%20Appointment_42?token=secret',
  )).toBe('/appointments/[id]');
  expect(sanitizeBusinessSentryRoute(
    '/clients/9cabb0db-fe1a-4467-847c-9afa5be33239',
  )).toBe('/clients/[id]');
});

test('Sentry preserva frames úteis sem carregar a mensagem sensível do erro', () => {
  const sourceError = new Error('Falha para cliente@example.com');
  sourceError.name = 'BusinessRpcError';
  sourceError.stack = [
    'BusinessRpcError: Falha para cliente@example.com',
    '    at confirmAppointment (appointments.ts:42:7)',
    '    at callback (https://cutsync.app/callback?access_token=segredo)',
  ].join('\n');

  const capturedError = createBusinessSentryError(
    sourceError,
    'business_appointment_confirm_failed',
  );

  expect(capturedError.name).toBe('BusinessRpcError');
  expect(capturedError.message).toBe('business_appointment_confirm_failed');
  expect(capturedError.stack).toContain('at confirmAppointment (appointments.ts:42:7)');
  expect(capturedError.stack).toContain('access_token=[redacted]');
  expect(capturedError.stack).not.toContain('cliente@example.com');
  expect(capturedError.stack).not.toContain('segredo');
});

test('Sentry não envia tracing nem propaga contexto antes da homologação', () => {
  const businessObservability = read(
    'apps/business/src/features/observability/business-observability.ts',
  );
  const clientObservability = read(
    'apps/client/src/features/observability/client-observability.ts',
  );

  expect(BUSINESS_SENTRY_TRACES_SAMPLE_RATE).toBe(0);
  expect(dropBusinessSentryTransaction()).toBeNull();

  for (const observability of [businessObservability, clientObservability]) {
    expect(observability).toContain('tracesSampleRate: SENTRY_TRACES_SAMPLE_RATE');
    expect(observability).toContain('tracePropagationTargets: []');
    expect(observability).toContain('beforeSendTransaction: dropSentryTransaction');
    expect(observability).toContain('beforeBreadcrumb:');
    expect(observability).toContain('beforeSend:');
  }
});

test('configuração Business fixa runtime, update URL e canais por ambiente', () => {
  const appConfig = JSON.parse(read('apps/business/app.json')) as {
    expo: {
      runtimeVersion: { policy: string };
      updates: { url: string };
      extra: { eas: { projectId: string } };
      plugins: unknown[];
    };
  };
  const easConfig = JSON.parse(read('apps/business/eas.json')) as {
    build: Record<string, { channel: string; env?: Record<string, string> }>;
    submit: { production: { android: { track: string } } };
  };
  const dynamicConfig = read('apps/business/app.config.js');
  const metroConfig = read('apps/business/metro.config.js');
  const operationsRunbook = read('docs/operations/BUSINESS_ANDROID_CLOSED_TEST.md');

  expect(appConfig.expo.runtimeVersion.policy).toBe('appVersion');
  expect(appConfig.expo.updates.url).toBe(
    `https://u.expo.dev/${appConfig.expo.extra.eas.projectId}`,
  );
  expect(JSON.stringify(appConfig.expo.plugins)).toContain('expo-notifications');
  expect(easConfig.build.development.channel).toBe('development');
  expect(easConfig.build.preview.channel).toBe('preview');
  expect(easConfig.build.production.channel).toBe('production');
  expect(easConfig.build.preview.env?.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
  expect(easConfig.build.production.env?.SENTRY_DISABLE_AUTO_UPLOAD).toBeUndefined();
  expect(easConfig.submit.production.android.track).toBe('internal');
  expect(dynamicConfig).toContain('process.env.GOOGLE_SERVICES_JSON');
  expect(dynamicConfig).toContain('googleServicesFile');
  expect(metroConfig).toContain("getSentryExpoConfig(__dirname");
  expect(operationsRunbook).toContain('npx sentry-expo-upload-sourcemaps dist');
});

test('providers usam Network/AppState, limpam cache e registram canal antes do token', () => {
  const businessLifecycle = read(
    'apps/business/src/features/connectivity/business-query-lifecycle.ts',
  );
  const clientLifecycle = read(
    'apps/client/src/features/connectivity/client-query-lifecycle.ts',
  );
  const businessProvider = read(
    'apps/business/src/features/connectivity/business-query-provider.tsx',
  );
  const clientProvider = read(
    'apps/client/src/features/connectivity/client-query-provider.tsx',
  );
  const pushService = read(
    'apps/business/src/features/notifications/business-push-service.ts',
  );
  const businessSession = read('apps/business/src/contexts/business-session.tsx');
  const businessNotifications = read(
    'apps/business/src/features/notifications/business-notifications-provider.tsx',
  );
  const easIgnore = read('.easignore');

  for (const lifecycle of [businessLifecycle, clientLifecycle]) {
    expect(lifecycle).toContain('onlineManager.setEventListener');
    expect(lifecycle).toContain('focusManager.setEventListener');
    expect(lifecycle).toContain('Network.addNetworkStateListener');
    expect(lifecycle).toContain("AppState.addEventListener('change'");
    expect(lifecycle).toContain('if (!networkEventObserved) updateOnlineState(state);');
    expect(lifecycle).toContain('networkEventObserved = true;');
  }
  expect(businessProvider).toContain('resetBusinessQueryCacheForScope');
  expect(clientProvider).toContain('resetClientQueryCacheForScope');
  expect(businessProvider).not.toContain('void clearBusinessQueryCache');
  expect(clientProvider).not.toContain('void clearClientQueryCache');
  expect(pushService.indexOf('ensureBusinessAndroidChannels();')).toBeLessThan(
    pushService.indexOf('Notifications.getExpoPushTokenAsync({ projectId })'),
  );
  expect(pushService).toContain("target_app_kind: 'business'");
  expect(pushService).toContain('await registerToken(currentToken, storedToken);');
  expect(pushService).toContain('if (unregisterError) throw unregisterError;');
  expect(pushService.indexOf('if (unregisterError) throw unregisterError;')).toBeLessThan(
    pushService.indexOf('await SecureStore.setItemAsync(BUSINESS_PUSH_TOKEN_KEY, token);'),
  );
  expect(pushService).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
  expect(businessSession).toContain('await disableBusinessPushNotifications();');
  expect(businessNotifications).toContain('businessApi.inspectInvitation');
  expect(businessNotifications).toContain('businessTeamApi.getMyInvitation');
  expect(businessNotifications).toContain('businessAppointmentsApi.getDetail');
  expect(businessNotifications).toContain('Network.addNetworkStateListener');
  expect(businessNotifications).toContain('shouldSyncBusinessPushAfterReconnect');
  expect(businessNotifications).toContain('if (active && !networkEventObserved)');
  expect(businessNotifications).toContain('networkEventObserved = true;');
  expect(businessNotifications).toContain("'business_push_sync_failed'");
  expect(businessNotifications).toContain("'business_push_token_rotation_failed'");
  expect(businessNotifications).not.toContain('setTimeout(');
  expect(businessNotifications).not.toContain('route: pendingLink.href');
  expect(businessNotifications).toContain('route: sanitizeSentryRoute(pendingLink.href)');
  expect(businessNotifications.indexOf('businessAppointmentsApi.getDetail')).toBeLessThan(
    businessNotifications.lastIndexOf('router.push(pendingLink.href'),
  );
  expect(easIgnore).toContain('/apps/business/android');
});
