import { expect, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

import {
  consumeBusinessAuthCallbackWithClient,
  getBusinessAuthInvitationTokenFromUrl,
  getBusinessInvitationTokenFromRedirect,
  getSafeBusinessAuthRedirect,
  isValidBusinessInvitationToken,
  type BusinessAuthCallbackClient,
} from '../../apps/business/src/features/auth/business-auth-callback';

const token = 'a'.repeat(64);

const callbackClient = () => {
  const calls: string[] = [];
  const client = {
    auth: {
      setSession: async () => {
        calls.push('setSession');
        return { data: { session: null, user: null }, error: null };
      },
      exchangeCodeForSession: async () => {
        calls.push('exchangeCodeForSession');
        return { data: { session: null, user: null }, error: null };
      },
      verifyOtp: async () => {
        calls.push('verifyOtp');
        return { data: { session: null, user: null }, error: null };
      },
    },
  } as unknown as BusinessAuthCallbackClient;
  return { calls, client };
};

test('aceita somente token opaco de 64 hex e sanitiza redirect externo', () => {
  expect(isValidBusinessInvitationToken(token)).toBe(true);
  expect(isValidBusinessInvitationToken('A'.repeat(64))).toBe(false);
  expect(isValidBusinessInvitationToken('a'.repeat(63))).toBe(false);
  expect(getBusinessInvitationTokenFromRedirect(`/invite/${token}`)).toBe(token);
  expect(getSafeBusinessAuthRedirect('https://evil.example/invite/token')).toBe('/');
  expect(getSafeBusinessAuthRedirect('/management')).toBe('/');
});

test('consome callbacks Supabase por sessão, PKCE e token_hash', async () => {
  const session = callbackClient();
  await consumeBusinessAuthCallbackWithClient(
    `cutsync-business://confirm-email#access_token=access&refresh_token=refresh&invite_token=${token}`,
    'confirmation',
    session.client,
  );
  expect(session.calls).toEqual(['setSession']);

  const pkce = callbackClient();
  await consumeBusinessAuthCallbackWithClient(
    'cutsync-business://confirm-email?code=pkce-code',
    'confirmation',
    pkce.client,
  );
  expect(pkce.calls).toEqual(['exchangeCodeForSession']);

  const otp = callbackClient();
  await consumeBusinessAuthCallbackWithClient(
    'cutsync-business://reset-password?token_hash=hash&type=recovery',
    'recovery',
    otp.client,
  );
  expect(otp.calls).toEqual(['verifyOtp']);
});

test('preserva o convite no callback sem incluí-lo no resultado de erro', async () => {
  expect(getBusinessAuthInvitationTokenFromUrl(
    `cutsync-business://confirm-email?code=pkce&invite_token=${token}`,
  )).toBe(token);

  const rejected = callbackClient();
  await expect(consumeBusinessAuthCallbackWithClient(
    `cutsync-business://confirm-email?error=denied&invite_token=${token}`,
    'confirmation',
    rejected.client,
  )).rejects.toThrow('business_auth_callback_rejected');
});

test('cadastro é exclusivo do convite e a implementação não registra credenciais', () => {
  const session = fs.readFileSync(
    path.join(process.cwd(), 'apps/business/src/contexts/business-session.tsx'),
    'utf8',
  );
  const authTree = fs.readFileSync(
    path.join(process.cwd(), 'apps/business/src/screens/auth/invite-sign-up-screen.tsx'),
    'utf8',
  );

  expect(session).toContain('isValidBusinessInvitationToken(token)');
  expect(authTree).toContain('É necessário um convite.');
  expect(session).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
  expect(authTree).not.toMatch(/console\.(?:log|info|warn|error|debug)/);
});

test('traduz convite expirado, reutilizado e e-mail divergente sem expor erro remoto', () => {
  const api = fs.readFileSync(
    path.join(process.cwd(), 'apps/business/src/services/business-api.ts'),
    'utf8',
  );

  expect(api).toContain("expired_invitation");
  expect(api).toContain("new BusinessApiError('invitation_expired')");
  expect(api).toContain("invalid_or_used_invitation");
  expect(api).toContain("new BusinessApiError('invitation_already_used')");
  expect(api).toContain("invitation_email_mismatch");
  expect(api).not.toContain('throw new Error(error.message)');
});
