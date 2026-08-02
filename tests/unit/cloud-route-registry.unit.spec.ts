import { expect, test } from '@playwright/test';

import {
  CLOUD_ROUTES,
  isCloudRoutePath,
  listCloudRoutePaths,
  supportTicketPath,
} from '../../apps/control/src/navigation/cloud-routes';

test('registers canonical Cloud router paths without duplicating /cloud', () => {
  expect(CLOUD_ROUTES.central).toBe('/central');
  expect(CLOUD_ROUTES.login).toBe('/login');
  expect(CLOUD_ROUTES.operacao.tempoReal).toBe('/operacao/tempo-real');
  expect(CLOUD_ROUTES.financeiro.cobrancas).toBe('/financeiro/cobrancas');
  expect(CLOUD_ROUTES.suporte.clientes).toBe('/suporte/clientes');
  expect(CLOUD_ROUTES.suporte.monitoramento).toBe('/suporte/monitoramento');
  expect(CLOUD_ROUTES.suporte.operacoesAssistidas).toBe('/suporte/operacoes-assistidas');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos');
  expect(listCloudRoutePaths()).toContain('/suporte/monitoramento');
  expect(listCloudRoutePaths().every((path) => !path.startsWith('/cloud/'))).toBeTruthy();
});

test('validates known Cloud paths', () => {
  expect(isCloudRoutePath('/suporte')).toBeTruthy();
  expect(isCloudRoutePath('/suporte/operacoes-assistidas')).toBeTruthy();
  expect(isCloudRoutePath('/billing')).toBeFalsy();
  expect(isCloudRoutePath('https://evil.example')).toBeFalsy();
});

test('builds opaque support ticket detail paths without PII', () => {
  const ticketId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  expect(supportTicketPath(ticketId)).toBe(`/suporte/atendimentos/${ticketId}`);
  expect(supportTicketPath(ticketId)).not.toMatch(/@|nome|email/i);
  expect(isCloudRoutePath(supportTicketPath(ticketId))).toBeFalsy();
});
