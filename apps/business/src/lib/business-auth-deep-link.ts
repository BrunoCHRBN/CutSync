import * as Linking from 'expo-linking';

import {
  consumeBusinessAuthCallbackWithClient,
  isValidBusinessInvitationToken,
  type BusinessAuthCallbackClient,
  type BusinessAuthCallbackKind,
} from '@/features/auth/business-auth-callback';
import { supabase } from '@/lib/supabase';

export {
  getBusinessAuthInvitationTokenFromUrl,
  getBusinessInvitationTokenFromRedirect,
  getBusinessInvitePath,
  getSafeBusinessAuthRedirect,
  isValidBusinessInvitationToken,
  type BusinessAuthCallbackClient,
  type BusinessAuthCallbackKind,
  type BusinessAuthCallbackResult,
} from '@/features/auth/business-auth-callback';

export type BusinessAuthCallbackRouteParams = Partial<Record<
  | 'access_token'
  | 'refresh_token'
  | 'code'
  | 'token_hash'
  | 'type'
  | 'error'
  | 'error_code'
  | 'invite_token',
  string | string[]
>>;

const BUSINESS_SCHEME = 'cutsync-business';

const callbackRouteByKind: Record<BusinessAuthCallbackKind, string> = {
  confirmation: 'confirm-email',
  recovery: 'reset-password',
};

const firstString = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value
);

export const getBusinessAuthRedirectUrl = (
  kind: BusinessAuthCallbackKind,
  invitationToken?: string,
) => {
  const queryParams = isValidBusinessInvitationToken(invitationToken)
    ? { invite_token: invitationToken }
    : undefined;

  return Linking.createURL(callbackRouteByKind[kind], {
    scheme: BUSINESS_SCHEME,
    queryParams,
  });
};

export const getBusinessAuthCallbackUrlFromParams = (
  kind: BusinessAuthCallbackKind,
  params: BusinessAuthCallbackRouteParams,
) => {
  const queryParams = Object.fromEntries(
    Object.entries(params)
      .map(([key, value]) => [key, firstString(value)] as const)
      .filter((entry): entry is readonly [string, string] => Boolean(entry[1])),
  );

  const hasCredentials = Boolean(
    queryParams.access_token
    || queryParams.code
    || queryParams.token_hash
    || queryParams.error
    || queryParams.error_code,
  );
  if (!hasCredentials) return null;

  return Linking.createURL(callbackRouteByKind[kind], {
    scheme: BUSINESS_SCHEME,
    queryParams,
  });
};

export const consumeBusinessAuthCallback = async (
  url: string,
  kind: BusinessAuthCallbackKind,
  client: BusinessAuthCallbackClient | null = supabase,
) => {
  if (!client) throw new Error('business_auth_not_configured');
  return consumeBusinessAuthCallbackWithClient(url, kind, client);
};
