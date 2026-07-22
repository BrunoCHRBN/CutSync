/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import {
  CLIENT_AVATAR_MAX_BYTES,
  formatClientPhone,
  getClientAvatarValidationMessage,
  validateClientPreferences,
  validateClientProfile,
} from '../../packages/validation/src/client-profile';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath: string) => JSON.parse(readSource(relativePath));

test('normaliza o perfil e rejeita emoji, SVG e telefone inválido', () => {
  expect(validateClientProfile('  Bruno Santos  ', '(11) 99999-9999')).toEqual({
    ok: true,
    name: 'Bruno Santos',
    phone: '11999999999',
  });
  expect(validateClientProfile('Bruno 💈', '(11) 99999-9999')).toMatchObject({ ok: false, field: 'name' });
  expect(validateClientProfile('<svg>Bruno</svg>', '(11) 99999-9999')).toMatchObject({ ok: false, field: 'name' });
  expect(validateClientProfile('Bruno Santos', '11999💈99999')).toMatchObject({ ok: false, field: 'phone' });
  expect(validateClientProfile('Bruno Santos', '1234')).toMatchObject({ ok: false, field: 'phone' });
  expect(formatClientPhone('11999999999')).toBe('(11) 99999-9999');
});

test('aceita somente preferências conhecidas e remove duplicações', () => {
  expect(validateClientPreferences(['whatsapp', 'email', 'email'], true)).toEqual({
    ok: true,
    channels: ['email', 'whatsapp'],
    marketingAccepted: true,
  });
  expect(validateClientPreferences(['sms'], false)).toMatchObject({ ok: false });
});

test('aceita somente avatar raster seguro de até 5 MB', () => {
  expect(getClientAvatarValidationMessage({
    fileName: 'avatar.png',
    fileSize: CLIENT_AVATAR_MAX_BYTES,
    mimeType: 'image/png',
  })).toBeNull();
  expect(getClientAvatarValidationMessage({
    fileName: 'avatar.svg',
    fileSize: 200,
    mimeType: 'image/svg+xml',
  })).toContain('SVG');
  expect(getClientAvatarValidationMessage({
    fileName: 'avatar.jpg',
    fileSize: CLIENT_AVATAR_MAX_BYTES + 1,
    mimeType: 'image/jpeg',
  })).toContain('5 MB');
});

test('expõe perfil, preferências e segurança em rotas próprias do Client', () => {
  const layout = readSource('apps/client/src/app/(app)/_layout.tsx');
  for (const route of ['profile', 'preferences', 'security']) {
    expect(fs.existsSync(path.join(root, 'apps/client/src/app/(app)', route + '.tsx'))).toBe(true);
    expect(layout).toContain('name="' + route + '"');
  }
  expect(layout).toContain('ClientProfileProvider');
  expect(readSource('apps/client/src/screens/client-profile.tsx')).toContain('launchImageLibraryAsync');
  expect(readSource('apps/client/src/screens/client-preferences.tsx')).toContain('disabled');
});

test('usa módulos Expo 57 e configura a seleção de fotos sem microfone', () => {
  const packageJson = readJson('apps/client/package.json');
  const appJson = readJson('apps/client/app.json').expo;
  const pickerPlugin = appJson.plugins.find((plugin: unknown) => Array.isArray(plugin) && plugin[0] === 'expo-image-picker');

  expect(packageJson.dependencies['expo-image']).toBe('~57.0.1');
  expect(packageJson.dependencies['expo-image-picker']).toBe('~57.0.6');
  expect(pickerPlugin?.[1]).toMatchObject({ cameraPermission: false, microphonePermission: false });
});

test('mantém a autorização no servidor e nunca usa chave privilegiada no Client', () => {
  const migration = readSource('supabase/migrations/20260722160000_client_profile_preferences.sql');
  const service = readSource('apps/client/src/features/profile/client-profile-service.ts');

  expect(migration).toContain('get_my_client_profile');
  expect(migration).toContain('update_my_client_profile');
  expect(migration).toContain('update_my_client_preferences');
  expect(migration).toContain('update_my_client_avatar');
  expect(migration).toContain('accept_my_lgpd_terms');
  expect(migration).toContain("name = (SELECT auth.uid())::text || '/avatar'");
  expect(migration).toContain('REVOKE UPDATE ON public.profiles FROM authenticated');
  expect(migration).not.toContain("GRANT UPDATE (email");
  expect(migration).not.toContain('lgpd_terms_accepted,\n  lgpd_marketing_accepted');
  expect(service).not.toMatch(/service.?role/i);
  expect(service).not.toMatch(/console\.(log|info|warn|error)/);
});
