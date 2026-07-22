import { Platform } from 'react-native';
import * as Linking from 'expo-linking';
import { supabase } from './supabase';

const parseUrlParams = (url: string) => {
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  const params = new URLSearchParams([query, fragment].filter(Boolean).join('&'));
  return params;
};

export const getPasswordRecoveryRedirectUrl = () => {
  if (Platform.OS === 'web') {
    const appUrl = process.env.EXPO_PUBLIC_APP_URL;
    if (!appUrl) throw new Error('EXPO_PUBLIC_APP_URL não configurada.');
    return `${appUrl.replace(/\/$/, '')}/reset-password`;
  }

  return Linking.createURL('/reset-password', { scheme: 'cutsync' });
};

export const isPasswordRecoveryUrl = (url: string) => {
  const params = parseUrlParams(url);
  return params.get('type') === 'recovery'
    || Boolean(params.get('access_token'))
    || Boolean(params.get('token_hash'))
    || Boolean(params.get('code'));
};

export const consumePasswordRecoveryUrl = async (url: string) => {
  const params = parseUrlParams(url);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const tokenHash = params.get('token_hash');
  const code = params.get('code');

  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
    if (error) throw error;
    return;
  }

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type: 'recovery' });
    if (error) throw error;
    return;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) throw error;
    return;
  }

  throw new Error('Link de recuperação inválido.');
};