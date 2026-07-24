import type { Session, User } from '@supabase/supabase-js';
import { createContext, type PropsWithChildren, useContext, useEffect, useMemo, useState } from 'react';
import { AppState, Platform } from 'react-native';

import {
  validateAuthEmail,
  validatePasswordReset,
  validateSignInCredentials,
  validateSignUpCredentials,
} from '@cutsync/validation';

import {
  getClientAuthErrorMessage,
  getClientEmailActionErrorMessage,
  getClientSignUpErrorMessage,
} from '@/features/auth/auth-errors';
import { getClientAuthRedirectUrl } from '@/lib/auth-deep-link';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import { disableClientPushNotifications } from '@/features/notifications/client-push-service';
import { clientObservability } from '@/features/observability/client-observability';

type AuthActionResult = { ok: true } | { ok: false; message: string };
type SignUpActionResult =
  | { ok: true; email: string; confirmationRequired: boolean }
  | { ok: false; message: string };

interface SessionContextValue {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  isConfigured: boolean;
  bootstrapError: string | null;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signUp: (name: string, email: string, password: string, confirmation: string) => Promise<SignUpActionResult>;
  resendConfirmation: (email: string) => Promise<AuthActionResult>;
  requestPasswordReset: (email: string) => Promise<AuthActionResult>;
  updatePassword: (password: string, confirmation: string) => Promise<AuthActionResult>;
  signOut: () => Promise<AuthActionResult>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
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
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (active) setSession(nextSession);
    });

    void client.auth.getSession()
      .then(({ data, error }) => {
        if (!active) return;
        if (error) {
          setBootstrapError('Não foi possível restaurar sua sessão. Entre novamente.');
          setSession(null);
        } else {
          setSession(data.session);
        }
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

  const value = useMemo<SessionContextValue>(() => ({
    session,
    user: session?.user ?? null,
    isLoading,
    isConfigured: isSupabaseConfigured,
    bootstrapError,
    signIn: async (email, password) => {
      const validation = validateSignInCredentials(email, password);
      if (!validation.ok) return { ok: false, message: validation.message };
      if (!supabase) return { ok: false, message: 'O aplicativo ainda não está conectado ao ambiente CutSync.' };

      try {
        const { error } = await supabase.auth.signInWithPassword({
          email: validation.email,
          password,
        });

        if (error) return { ok: false, message: getClientAuthErrorMessage(error) };
        setBootstrapError(null);
        return { ok: true };
      } catch (error) {
        clientObservability.captureError(error, 'client_auth_sign_in_failed', '/sign-in');
        return { ok: false, message: 'Não foi possível conectar agora. Verifique sua internet e tente novamente.' };
      }
    },
    signUp: async (name, email, password, confirmation) => {
      const validation = validateSignUpCredentials(name, email, password, confirmation);
      if (!validation.ok) return { ok: false, message: validation.message };
      if (!supabase) return { ok: false, message: 'O aplicativo ainda não está conectado ao ambiente CutSync.' };

      try {
        const { data, error } = await supabase.auth.signUp({
          email: validation.email,
          password,
          options: {
            emailRedirectTo: getClientAuthRedirectUrl('confirmation'),
            data: { name: validation.name },
          },
        });

        if (error) return { ok: false, message: getClientSignUpErrorMessage(error) };
        return { ok: true, email: validation.email, confirmationRequired: !data.session };
      } catch (error) {
        clientObservability.captureError(error, 'client_auth_sign_up_failed', '/sign-up');
        return { ok: false, message: getClientSignUpErrorMessage(error as { message?: string }) };
      }
    },
    resendConfirmation: async (email) => {
      const validation = validateAuthEmail(email);
      if (!validation.ok) return { ok: false, message: validation.message };
      if (!supabase) return { ok: false, message: 'O aplicativo ainda não está conectado ao ambiente CutSync.' };

      try {
        const { error } = await supabase.auth.resend({
          type: 'signup',
          email: validation.email,
          options: { emailRedirectTo: getClientAuthRedirectUrl('confirmation') },
        });
        if (error) return { ok: false, message: getClientEmailActionErrorMessage(error) };
        return { ok: true };
      } catch (error) {
        clientObservability.captureError(error, 'client_auth_resend_confirmation_failed', '/check-email');
        return { ok: false, message: getClientEmailActionErrorMessage(error as { message?: string }) };
      }
    },
    requestPasswordReset: async (email) => {
      const validation = validateAuthEmail(email);
      if (!validation.ok) return { ok: false, message: validation.message };
      if (!supabase) return { ok: false, message: 'O aplicativo ainda não está conectado ao ambiente CutSync.' };

      try {
        const { error } = await supabase.auth.resetPasswordForEmail(validation.email, {
          redirectTo: getClientAuthRedirectUrl('recovery'),
        });
        if (error) return { ok: false, message: getClientEmailActionErrorMessage(error) };
        return { ok: true };
      } catch (error) {
        clientObservability.captureError(error, 'client_auth_password_reset_request_failed', '/forgot-password');
        return { ok: false, message: getClientEmailActionErrorMessage(error as { message?: string }) };
      }
    },
    updatePassword: async (password, confirmation) => {
      const validation = validatePasswordReset(password, confirmation);
      if (!validation.ok) return { ok: false, message: validation.message };
      if (!supabase) return { ok: false, message: 'O aplicativo ainda não está conectado ao ambiente CutSync.' };

      try {
        const { error } = await supabase.auth.updateUser({ password });
        if (error) return { ok: false, message: 'O link expirou ou não pôde ser usado. Solicite uma nova recuperação.' };
        await supabase.auth.signOut();
        setSession(null);
        return { ok: true };
      } catch (error) {
        clientObservability.captureError(error, 'client_auth_password_update_failed', '/reset-password');
        return { ok: false, message: 'O link expirou ou não pôde ser usado. Solicite uma nova recuperação.' };
      }
    },
    signOut: async () => {
      if (!supabase) return { ok: false, message: 'O aplicativo ainda não está conectado ao ambiente CutSync.' };
      try {
        await disableClientPushNotifications();
        const { error } = await supabase.auth.signOut();
        if (error) return { ok: false, message: 'Não foi possível sair agora. Tente novamente.' };
        setSession(null);
        return { ok: true };
      } catch (error) {
        clientObservability.captureError(error, 'client_auth_sign_out_failed', '/security');
        return { ok: false, message: 'Não foi possível sair agora. Tente novamente.' };
      }
    },
  }), [bootstrapError, isLoading, session]);

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const context = useContext(SessionContext);
  if (!context) throw new Error('useSession deve ser usado dentro de SessionProvider.');
  return context;
}
