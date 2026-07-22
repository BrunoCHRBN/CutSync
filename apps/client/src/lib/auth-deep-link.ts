import type { EmailOtpType } from '@supabase/supabase-js';
import * as Linking from 'expo-linking';

import { supabase } from '@/lib/supabase';

export type AuthCallbackKind = 'confirmation' | 'recovery';

const routeByKind: Record<AuthCallbackKind, string> = {
  confirmation: 'confirm-email',
  recovery: 'reset-password',
};

const parseCallbackParams = (url: string) => {
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  return new URLSearchParams([query, fragment].filter(Boolean).join('&'));
};

export const getClientAuthRedirectUrl = (kind: AuthCallbackKind) => (
  Linking.createURL(routeByKind[kind], { scheme: 'cutsync' })
);

export const consumeClientAuthCallback = async (url: string, kind: AuthCallbackKind) => {
  if (!supabase) throw new Error('client_not_configured');

  const params = parseCallbackParams(url);
  if (params.get('error') || params.get('error_code')) throw new Error('auth_callback_error');

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    return;
  }

  const code = params.get('code');
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  const tokenHash = params.get('token_hash');
  if (tokenHash) {
    const expectedType: EmailOtpType = kind === 'recovery' ? 'recovery' : 'email';
    const receivedType = params.get('type');
    if (receivedType && receivedType !== expectedType) throw new Error('auth_callback_type_mismatch');

    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: expectedType });
    if (error) throw error;
    return;
  }

  throw new Error('auth_callback_missing_credentials');
};
