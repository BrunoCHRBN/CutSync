import { expect, test } from '@playwright/test';

import {
  CLOUD_ROUTES,
  corporateCasePath,
  isCloudRoutePath,
  listCloudRoutePaths,
  supportTicketPath,
} from '../../apps/control/src/navigation/cloud-routes';

test('registers canonical Cloud router paths without duplicating /cloud', () => {
  expect(CLOUD_ROUTES.central).toBe('/central');
  expect(CLOUD_ROUTES.login).toBe('/login');
  expect(CLOUD_ROUTES.operacao.tempoReal).toBe('/operacao/tempo-real');
  expect(CLOUD_ROUTES.chamados.meus).toBe('/chamados/meus');
  expect(CLOUD_ROUTES.chamados.novo).toBe('/chamados/novo');
  expect(CLOUD_ROUTES.chamados.execucao).toBe('/chamados/execucao');
  expect(CLOUD_ROUTES.financeiro.cobrancas).toBe('/financeiro/cobrancas');
  expect(CLOUD_ROUTES.suporte.clientes).toBe('/suporte/clientes');
  expect(CLOUD_ROUTES.suporte.monitoramento).toBe('/suporte/monitoramento');
  expect(CLOUD_ROUTES.suporte.operacoesAssistidas).toBe('/suporte/operacoes-assistidas');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos/solicitar');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos/minhas-solicitacoes');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos/aprovacoes');
  expect(listCloudRoutePaths()).toContain('/gsp/acessos/aplicacao');
  expect(listCloudRoutePaths()).toContain('/suporte/monitoramento');
  expect(listCloudRoutePaths()).toContain('/chamados/notificacoes');
  expect(listCloudRoutePaths()).toContain('/chamados/execucao');
  expect(listCloudRoutePaths().every((path) => !path.startsWith('/cloud/'))).toBeTruthy();
});

test('builds opaque corporate case detail paths without identity data', () => {
  const caseId = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
  expect(corporateCasePath(caseId)).toBe(`/chamados/${caseId}`);
  expect(corporateCasePath(caseId)).not.toMatch(/@|nome|email/i);
  expect(isCloudRoutePath(corporateCasePath(caseId))).toBeFalsy();
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
