/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { isValidClientName, isValidClientPhone, normalizeClientName, normalizeClientPhone } from '../../packages/validation/src/client-profile';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

test('valida e normaliza os dados editáveis do cliente', () => {
  expect(normalizeClientName('  Bruno  ')).toBe('Bruno');
  expect(normalizeClientPhone('  (11) 99999-9999  ')).toBe('(11) 99999-9999');
  expect(isValidClientName('B')).toBe(false);
  expect(isValidClientName('Bruno')).toBe(true);
  expect(isValidClientPhone('')).toBe(true);
  expect(isValidClientPhone('(11) 99999-9999')).toBe(true);
  expect(isValidClientPhone('1234')).toBe(false);
});

test('mantém Configurações como destino principal do cliente', () => {
  const shell = readSource('apps/web/src/components/layout/ClientShell.tsx');
  const route = readSource('apps/web/src/app/(client)/preferences.tsx');

  expect(shell).toContain("label: 'Configurações'");
  expect(shell).toContain("path: '/(client)/preferences'");
  expect(shell).not.toContain("label: 'Conta'");
  expect(shell).not.toContain("label: 'Meu negócio'");
  expect(route).toContain('ClientSettingsExperience');
});

test('protege a vitrine contra unidades não publicadas e mantém retry real', () => {
  const explore = readSource('apps/web/src/components/screens/ExploreExperience.tsx');

  expect(explore).toContain(".eq('account_status', 'active')");
  expect(explore).not.toContain("'pending_verification'");
  expect(explore).toContain('client-shops-retry-button');
  expect(explore).toContain('contentFit="contain"');
  expect(explore).not.toContain('onSync={');
});
