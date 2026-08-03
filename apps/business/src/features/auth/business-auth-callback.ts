import type { EmailOtpType } from '@supabase/supabase-js';

export type BusinessAuthCallbackKind = 'confirmation' | 'recovery';

export interface BusinessAuthCallbackResult {
  invitationToken: string | null;
}

export interface BusinessAuthCallbackClient {
  auth: {
    setSession: (credentials: {
      access_token: string;
      refresh_token: string;
    }) => PromiseLike<{ error: unknown }>;
    exchangeCodeForSession: (code: string) => PromiseLike<{ error: unknown }>;
    verifyOtp: (params: {
      token_hash: string;
      type: EmailOtpType;
    }) => PromiseLike<{ error: unknown }>;
  };
}

type BusinessAuthCallbackConsumer = (
  url: string,
  kind: BusinessAuthCallbackKind,
  client: BusinessAuthCallbackClient,
) => Promise<BusinessAuthCallbackResult>;

export const BUSINESS_INVITATION_TOKEN_PATTERN = /^[0-9a-f]{64}$/;
const BUSINESS_TEAM_INVITATION_PATH_PATTERN = /^\/invitations\/([0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;
const MAX_COMPLETED_CALLBACKS = 8;

const firstString = (value: string | string[] | undefined) => (
  Array.isArray(value) ? value[0] : value
);

const parseCallbackParams = (url: string) => {
  const query = url.includes('?') ? url.split('?')[1].split('#')[0] : '';
  const fragment = url.includes('#') ? url.split('#')[1] : '';
  return new URLSearchParams([query, fragment].filter(Boolean).join('&'));
};

const getCallbackCredentialKey = (
  url: string,
  kind: BusinessAuthCallbackKind,
) => {
  const params = parseCallbackParams(url);
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const code = params.get('code');
  const tokenHash = params.get('token_hash');

  if (accessToken && refreshToken) {
    return `${kind}:session:${accessToken}:${refreshToken}`;
  }
  if (code) return `${kind}:code:${code}`;
  if (tokenHash) return `${kind}:token_hash:${tokenHash}`;
  return null;
};

export const isValidBusinessInvitationToken = (
  value: unknown,
): value is string => (
  typeof value === 'string' && BUSINESS_INVITATION_TOKEN_PATTERN.test(value)
);

export const getBusinessInvitePath = (token: string) => (
  isValidBusinessInvitationToken(token) ? `/invite/${token}` : null
);

export const getBusinessInvitationTokenFromRedirect = (
  redirect: string | string[] | undefined,
) => {
  const value = firstString(redirect);
  if (!value) return null;

  const match = /^\/invite\/([0-9a-f]{64})$/.exec(value);
  return match?.[1] ?? null;
};

export const getSafeBusinessAuthRedirect = (
  redirect: string | string[] | undefined,
) => {
  const value = firstString(redirect);
  const invitationToken = getBusinessInvitationTokenFromRedirect(redirect);
  if (invitationToken) return `/invite/${invitationToken}`;
  const teamInvitation = value ? BUSINESS_TEAM_INVITATION_PATH_PATTERN.exec(value) : null;
  return teamInvitation ? `/invitations/${teamInvitation[1].toLowerCase()}` : '/';
};

export const getBusinessAuthInvitationTokenFromUrl = (url: string) => {
  const token = parseCallbackParams(url).get('invite_token');
  return isValidBusinessInvitationToken(token) ? token : null;
};

const getConfirmationOtpType = (receivedType: string | null): EmailOtpType => {
  if (!receivedType || receivedType === 'signup') return 'signup';
  if (receivedType === 'email') return 'email';
  throw new Error('business_auth_callback_type_mismatch');
};

export const consumeBusinessAuthCallbackWithClient = async (
  url: string,
  kind: BusinessAuthCallbackKind,
  client: BusinessAuthCallbackClient,
): Promise<BusinessAuthCallbackResult> => {
  const params = parseCallbackParams(url);
  if (params.get('error') || params.get('error_code')) {
    throw new Error('business_auth_callback_rejected');
  }

  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  const code = params.get('code');
  const tokenHash = params.get('token_hash');
  const receivedType = params.get('type');

  if (accessToken && refreshToken) {
    const { error } = await client.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) throw new Error('business_auth_callback_session_failed');
  } else if (code) {
    const { error } = await client.auth.exchangeCodeForSession(code);
    if (error) throw new Error('business_auth_callback_code_failed');
  } else if (tokenHash) {
    const type: EmailOtpType = kind === 'recovery'
      ? 'recovery'
      : getConfirmationOtpType(receivedType);

    if (kind === 'recovery' && receivedType && receivedType !== 'recovery') {
      throw new Error('business_auth_callback_type_mismatch');
    }

    const { error } = await client.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });
    if (error) throw new Error('business_auth_callback_otp_failed');
  } else {
    throw new Error('business_auth_callback_missing_credentials');
  }

  return {
    invitationToken: getBusinessAuthInvitationTokenFromUrl(url),
  };
};

export const createBusinessAuthCallbackConsumer = (): BusinessAuthCallbackConsumer => {
  const consumptions = new Map<string, Promise<void>>();

  return async (url, kind, client) => {
    const credentialKey = getCallbackCredentialKey(url, kind);
    if (!credentialKey) {
      return consumeBusinessAuthCallbackWithClient(url, kind, client);
    }

    let consumption = consumptions.get(credentialKey);
    if (!consumption) {
      consumption = consumeBusinessAuthCallbackWithClient(url, kind, client)
        .then(() => undefined);
      consumptions.set(credentialKey, consumption);
    }

    try {
      await consumption;
    } catch (error) {
      if (consumptions.get(credentialKey) === consumption) {
        consumptions.delete(credentialKey);
      }
      throw error;
    }

    while (consumptions.size > MAX_COMPLETED_CALLBACKS) {
      const oldestKey = consumptions.keys().next().value;
      if (!oldestKey) break;
      consumptions.delete(oldestKey);
    }

    return {
      invitationToken: getBusinessAuthInvitationTokenFromUrl(url),
    };
  };
};
