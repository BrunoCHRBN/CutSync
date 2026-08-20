import type { Session, User } from '@supabase/supabase-js';
import {
  validateAuthEmail,
  validatePasswordReset,
  validateSignInCredentials,
  validateSignUpCredentials,
} from '@cutsync/validation';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { BUSINESS_AUTH_MESSAGES } from '@/features/auth/business-auth-errors';
import { disableBusinessPushNotifications } from '@/features/notifications/business-push-service';
import {
  getBusinessAuthRedirectUrl,
  isValidBusinessInvitationToken,
} from '@/lib/business-auth-deep-link';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';

export type BusinessAuthActionResult =
  | { ok: true }
  | { ok: false; message: string };

export type BusinessInviteSignUpResult =
  | {
      ok: true;
      email: string;
      confirmationRequired: boolean;
    }
  | { ok: false; message: string };

export interface BusinessSessionValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isConfigured: boolean;
  bootstrapError: string | null;
  signIn: (email: string, password: string) => Promise<BusinessAuthActionResult>;
  signUpFromInvite: (
    name: string,
    email: string,
    password: string,
    confirmation: string,
    token: string,
  ) => Promise<BusinessInviteSignUpResult>;
  requestPasswordReset: (
    email: string,
    invitationToken?: string,
  ) => Promise<BusinessAuthActionResult>;
  updatePassword: (
    password: string,
    confirmation: string,
  ) => Promise<BusinessAuthActionResult>;
  signOut: () => Promise<BusinessAuthActionResult>;
}

const BusinessSessionContext = createContext<BusinessSessionValue | null>(null);

export function BusinessSessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);

  useEffect(() => {
    const client = supabase;

    if (!client) {
      setIsLoading(false);
      return undefined;
    }

    let active = true;
    const { data: { subscription } } = client.auth.onAuthStateChange(
      (_event, nextSession) => {
        if (!active) return;
        setSession(nextSession);
        if (nextSession) setBootstrapError(null);
      },
    );

    void client.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setBootstrapError('Não foi possível restaurar sua sessão. Entre novamente.');
          setSession(null);
          return;
        }
        setSession(data.session);
      })
      .catch(() => {
        if (!active) return;
        setBootstrapError('Não foi possível restaurar sua sessão. Entre novamente.');
        setSession(null);
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    let appStateSubscription: ReturnType<typeof AppState.addEventListener> | undefined;
    if (Platform.OS !== 'web') {
      if (AppState.currentState === 'active') client.auth.startAutoRefresh();
      appStateSubscription = AppState.addEventListener('change', (state) => {
        if (state === 'active') client.auth.startAutoRefresh();
        else client.auth.stopAutoRefresh();
      });
    }

    return () => {
      active = false;
      subscription.unsubscribe();
      appStateSubscription?.remove();
      if (Platform.OS !== 'web') client.auth.stopAutoRefresh();
    };
  }, []);

  const signIn = useCallback(async (
    email: string,
    password: string,
  ): Promise<BusinessAuthActionResult> => {
    const validation = validateSignInCredentials(email, password);
    if (!validation.ok) return { ok: false, message: validation.message };
    if (!supabase) return { ok: false, message: BUSINESS_AUTH_MESSAGES.notConfigured };

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: validation.email,
        password,
      });
      if (error) {
        return { ok: false, message: BUSINESS_AUTH_MESSAGES.invalidCredentials };
      }

      setBootstrapError(null);
      return { ok: true };
    } catch {
      return { ok: false, message: BUSINESS_AUTH_MESSAGES.connection };
    }
  }, []);

  const signUpFromInvite = useCallback(async (
    name: string,
    email: string,
    password: string,
    confirmation: string,
    token: string,
  ): Promise<BusinessInviteSignUpResult> => {
    if (!isValidBusinessInvitationToken(token)) {
      return { ok: false, message: BUSINESS_AUTH_MESSAGES.invalidInvitation };
    }

    const validation = validateSignUpCredentials(name, email, password, confirmation);
    if (!validation.ok) return { ok: false, message: validation.message };
    if (!supabase) return { ok: false, message: BUSINESS_AUTH_MESSAGES.notConfigured };

    try {
      const { data, error } = await supabase.auth.signUp({
        email: validation.email,
        password,
        options: {
          emailRedirectTo: getBusinessAuthRedirectUrl('confirmation', token),
          data: { name: validation.name },
        },
      });
      if (error) return { ok: false, message: BUSINESS_AUTH_MESSAGES.signUp };

      return {
        ok: true,
        email: validation.email,
        confirmationRequired: !data.session,
      };
    } catch {
      return { ok: false, message: BUSINESS_AUTH_MESSAGES.connection };
    }
  }, []);

  const requestPasswordReset = useCallback(async (
    email: string,
    invitationToken?: string,
  ): Promise<BusinessAuthActionResult> => {
    const validation = validateAuthEmail(email);
    if (!validation.ok) return { ok: false, message: validation.message };
    if (!supabase) return { ok: false, message: BUSINESS_AUTH_MESSAGES.notConfigured };

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(validation.email, {
        redirectTo: getBusinessAuthRedirectUrl('recovery', invitationToken),
      });
      if (error) {
        return { ok: false, message: BUSINESS_AUTH_MESSAGES.passwordResetRequest };
      }
      return { ok: true };
    } catch {
      return { ok: false, message: BUSINESS_AUTH_MESSAGES.connection };
    }
  }, []);

  const updatePassword = useCallback(async (
    password: string,
    confirmation: string,
  ): Promise<BusinessAuthActionResult> => {
    const validation = validatePasswordReset(password, confirmation);
    if (!validation.ok) return { ok: false, message: validation.message };
    if (!supabase) return { ok: false, message: BUSINESS_AUTH_MESSAGES.notConfigured };

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) return { ok: false, message: BUSINESS_AUTH_MESSAGES.passwordUpdate };

      await supabase.auth.signOut();
      setSession(null);
      return { ok: true };
    } catch {
      return { ok: false, message: BUSINESS_AUTH_MESSAGES.passwordUpdate };
    }
  }, []);

  const signOut = useCallback(async (): Promise<BusinessAuthActionResult> => {
    if (!supabase) return { ok: false, message: BUSINESS_AUTH_MESSAGES.notConfigured };

    try {
      await disableBusinessPushNotifications();
      const { error } = await supabase.auth.signOut();
      if (error) return { ok: false, message: BUSINESS_AUTH_MESSAGES.signOut };
      setSession(null);
      return { ok: true };
    } catch {
      return { ok: false, message: BUSINESS_AUTH_MESSAGES.signOut };
    }
  }, []);

  const value = useMemo<BusinessSessionValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isConfigured: isSupabaseConfigured,
    bootstrapError,
    signIn,
    signUpFromInvite,
    requestPasswordReset,
    updatePassword,
    signOut,
  }), [
    bootstrapError,
    isLoading,
    requestPasswordReset,
    session,
    signIn,
    signOut,
    signUpFromInvite,
    updatePassword,
  ]);

  return (
    <BusinessSessionContext.Provider value={value}>
      {children}
    </BusinessSessionContext.Provider>
  );
}

export function useBusinessSession() {
  const value = useContext(BusinessSessionContext);
  if (!value) {
    throw new Error('useBusinessSession requer BusinessSessionProvider');
  }
  return value;
}
