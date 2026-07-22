/// <reference types="node" />

import fs from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';

import { getClientAuthErrorMessage } from '../../apps/client/src/features/auth/auth-errors';
import { splitUtf8Chunks, utf8ByteLength } from '../../apps/client/src/lib/utf8-chunks';
import {
  validateAuthEmail,
  validatePasswordReset,
  validateSignInCredentials,
  validateSignUpCredentials,
} from '../../packages/validation/src/auth-credentials';
import { getForbiddenInputReason } from '../../packages/validation/src/safe-input';

const root = process.cwd();
const readSource = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const readJson = (relativePath: string) => JSON.parse(readSource(relativePath));

test('normaliza e valida credenciais sem impor a política de cadastro no login', () => {
  expect(validateSignInCredentials('  Cliente@Exemplo.com ', 'senha-existente')).toEqual({
    ok: true,
    email: 'cliente@exemplo.com',
  });
  expect(validateSignInCredentials('cliente', 'senha')).toMatchObject({ ok: false, field: 'email' });
  expect(validateSignInCredentials('cliente@exemplo.com', '')).toMatchObject({ ok: false, field: 'password' });
});

test('rejeita emojis e SVG em todos os campos preenchíveis de autenticação', () => {
  expect(getForbiddenInputReason('Cliente com emoji 💈')).toBe('emoji');
  expect(getForbiddenInputReason('<svg><path /></svg>')).toBe('markup');
  expect(getForbiddenInputReason('João da Silva')).toBeNull();

  expect(validateSignInCredentials('cliente💈@exemplo.com', 'Senha1!')).toMatchObject({ ok: false, field: 'email' });
  expect(validateSignInCredentials('cliente@exemplo.com', 'Senha💈1!')).toMatchObject({ ok: false, field: 'password' });
  expect(validateAuthEmail('<svg>@exemplo.com')).toMatchObject({ ok: false, field: 'email' });
  expect(validateSignUpCredentials('Cliente 💈', 'cliente@exemplo.com', 'Senha123!', 'Senha123!')).toMatchObject({ ok: false, field: 'name' });
  expect(validateSignUpCredentials('<svg>Cliente</svg>', 'cliente@exemplo.com', 'Senha123!', 'Senha123!')).toMatchObject({ ok: false, field: 'name' });
  expect(validateSignUpCredentials('Cliente Seguro', 'cliente@exemplo.com', '<svg>Senha123!</svg>', '<svg>Senha123!</svg>')).toMatchObject({ ok: false, field: 'password' });
  expect(validatePasswordReset('Nova💈Senha1!', 'Nova💈Senha1!')).toMatchObject({ ok: false, field: 'password' });
  expect(validatePasswordReset('NovaSenha1!', '<svg>NovaSenha1!</svg>')).toMatchObject({ ok: false, field: 'confirmation' });
});

test('valida cadastro e redefinição com senha forte e dados seguros', () => {
  expect(validateSignUpCredentials('  João da Silva  ', '  CLIENTE@EXEMPLO.COM ', 'Senha123!', 'Senha123!')).toEqual({
    ok: true,
    name: 'João da Silva',
    email: 'cliente@exemplo.com',
  });
  expect(validateSignUpCredentials('Cliente', 'cliente@exemplo.com', 'fraca', 'fraca')).toMatchObject({ ok: false, field: 'password' });
  expect(validatePasswordReset('NovaSenha1!', 'outraSenha1!')).toMatchObject({ ok: false, field: 'confirmation' });
  expect(validatePasswordReset('NovaSenha1!', 'NovaSenha1!')).toEqual({ ok: true });
});

test('divide sessões grandes sem quebrar caracteres UTF-8', () => {
  const session = JSON.stringify({ token: 'x'.repeat(3700), name: 'João ✂️' });
  const chunks = splitUtf8Chunks(session, 1800);

  expect(chunks.length).toBeGreaterThan(2);
  expect(chunks.join('')).toBe(session);
  expect(chunks.every((chunk) => utf8ByteLength(chunk) <= 1800)).toBe(true);
});

test('mantém a sessão mobile em SecureStore e nunca inclui chave privilegiada', () => {
  const packageJson = readJson('apps/client/package.json');
  const storage = readSource('apps/client/src/lib/secure-session-storage.ts');
  const client = readSource('apps/client/src/lib/supabase.ts');

  expect(packageJson.dependencies['expo-secure-store']).toBe('~57.0.1');
  expect(packageJson.dependencies['@supabase/supabase-js']).toBe('2.110.3');
  expect(storage).toContain("from 'expo-secure-store'");
  expect(storage).toContain('splitUtf8Chunks');
  expect(client).toContain('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY');
  expect(client).toContain('persistSession: true');
  expect(client).toContain('lock: processLock');
  expect(client).not.toMatch(/service.?role/i);
  expect(client).not.toContain('AsyncStorage');
});

test('protege o espaço autenticado e mantém o login fora da área privada', () => {
  const rootLayout = readSource('apps/client/src/app/_layout.tsx');
  const authRoute = readSource('apps/client/src/app/(auth)/sign-in.tsx');
  const appRoute = readSource('apps/client/src/app/(app)/index.tsx');

  expect(rootLayout).toContain('<Stack.Protected guard={!session}>');
  expect(rootLayout).toContain('<Stack.Protected guard={Boolean(session)}>');
  expect(authRoute).toContain('ClientSignInScreen');
  expect(appRoute).toContain('ClientHomeScreen');
});

test('expõe o ciclo completo de cadastro, confirmação e recuperação em rotas próprias', () => {
  const rootLayout = readSource('apps/client/src/app/_layout.tsx');
  const sessionContext = readSource('apps/client/src/contexts/session-context.tsx');
  const deepLink = readSource('apps/client/src/lib/auth-deep-link.ts');
  const authField = readSource('apps/client/src/components/auth/auth-form.tsx');

  for (const route of [
    'apps/client/src/app/(auth)/sign-up.tsx',
    'apps/client/src/app/(auth)/check-email.tsx',
    'apps/client/src/app/(auth)/forgot-password.tsx',
    'apps/client/src/app/(callback)/confirm-email.tsx',
    'apps/client/src/app/(callback)/reset-password.tsx',
  ]) expect(fs.existsSync(path.join(root, route))).toBe(true);

  expect(rootLayout).toContain('<Stack.Screen name="(callback)" />');
  expect(sessionContext).toContain('supabase.auth.signUp');
  expect(sessionContext).toContain('supabase.auth.resend');
  expect(sessionContext).toContain('supabase.auth.resetPasswordForEmail');
  expect(sessionContext).toContain('supabase.auth.updateUser');
  expect(deepLink).toContain('exchangeCodeForSession');
  expect(deepLink).toContain('verifyOtp');
  expect(deepLink).not.toMatch(/console\.(log|info|warn|error)/);
  expect(authField).toContain('getForbiddenInputMessage(nextValue)');
});

test('traduz falhas de autenticação sem expor a mensagem remota', () => {
  expect(getClientAuthErrorMessage({ code: 'invalid_credentials', message: 'Invalid login credentials' })).toBe('E-mail ou senha incorretos.');
  expect(getClientAuthErrorMessage({ code: 'email_not_confirmed' })).toBe('Confirme seu e-mail antes de entrar.');
  expect(getClientAuthErrorMessage({ message: 'Network request failed' })).toContain('Verifique sua internet');
  expect(getClientAuthErrorMessage({ message: 'internal details' })).not.toContain('internal details');
});
