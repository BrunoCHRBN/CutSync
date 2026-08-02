import type { Session } from '@supabase/supabase-js';
import {
  getTotpEnrollmentErrorMessage,
  getTotpFactorState,
  normalizeTotpQrCode,
} from '@cutsync/domain';
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';

import { parseControlContext } from '@/services/control-context';
import { isSupabaseConfigured, supabase } from '@/services/supabase';
import type { ControlContext, ControlPermission } from '@/types/control';

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const ABSOLUTE_TIMEOUT_MS = 8 * 60 * 60 * 1000;
const ACCESS_REVALIDATION_MS = 60 * 1000;

type AuthStatus = 'loading' | 'signed_out' | 'mfa_required' | 'unauthorized' | 'ready' | 'error';

interface MfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

interface ControlAuthValue {
  status: AuthStatus;
  context: ControlContext | null;
  message: string;
  enrollment: MfaEnrollment | null;
  hasVerifiedTotp: boolean;
  mfaBusy: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  enrollMfa: () => Promise<void>;
  verifyMfa: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  retry: () => Promise<void>;
  can: (permission: ControlPermission) => boolean;
}

const ControlAuthContext = createContext<ControlAuthValue | null>(null);

export function ControlAuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [context, setContext] = useState<ControlContext | null>(null);
  const [message, setMessage] = useState('');
  const [enrollment, setEnrollment] = useState<MfaEnrollment | null>(null);
  const [hasVerifiedTotp, setHasVerifiedTotp] = useState(false);
  const [mfaBusy, setMfaBusy] = useState(false);
  const sessionRef = useRef<Session | null>(null);
  const mfaOperationRef = useRef(false);
  const sessionStartedAtRef = useRef(Date.now());
  const lastActivityAtRef = useRef(Date.now());

  const evaluateSession = useCallback(async (session: Session | null) => {
    sessionRef.current = session;
    setContext(null);
    setEnrollment(null);

    if (!session) {
      setHasVerifiedTotp(false);
      setStatus('signed_out');
      return;
    }

    setStatus('loading');
    const assurance = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) {
      setMessage('Não foi possível validar o nível de segurança da sessão.');
      setStatus('error');
      return;
    }

    if (assurance.data.currentLevel !== 'aal2') {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setMessage('Não foi possível consultar os autenticadores cadastrados.');
        setStatus('error');
        return;
      }
      setHasVerifiedTotp(Boolean(getTotpFactorState(factors.data?.all).verifiedFactorId));
      setMessage('');
      setStatus('mfa_required');
      return;
    }

    const result = await (supabase.rpc as any)('get_control_context');
    if (result.error) {
      const needsMfa = result.error.message?.includes('aal2');
      const denied = result.error.message?.includes('forbidden');
      setMessage(
        needsMfa
          ? 'Confirme o autenticador para continuar.'
          : denied
            ? 'Esta conta não possui acesso ativo ao CutSync Cloud.'
            : 'Não foi possível carregar o contexto de acesso.',
      );
      setStatus(needsMfa ? 'mfa_required' : denied ? 'unauthorized' : 'error');
      return;
    }

    try {
      setContext(parseControlContext(result.data));
      setMessage('');
      setStatus('ready');
    } catch {
      setMessage('O servidor retornou um contexto de acesso inválido.');
      setStatus('error');
    }
  }, []);

  const revalidateAccess = useCallback(async () => {
    if (!sessionRef.current) return;

    const result = await (supabase.rpc as any)('get_control_context');
    if (result.error) {
      const denied = result.error.message?.includes('forbidden')
        || result.error.message?.includes('aal2');
      if (denied) {
        // Re-evaluate the assurance level as well: a denied context can mean
        // either a remote access revocation or an AAL2 session downgrade.
        await evaluateSession(sessionRef.current);
      }
      return;
    }

    try {
      setContext(parseControlContext(result.data));
    } catch {
      setContext(null);
      setMessage('O servidor retornou um contexto de acesso inválido.');
      setStatus('error');
    }
  }, [evaluateSession]);

  useEffect(() => {
    let active = true;

    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      sessionStartedAtRef.current = Date.now();
      lastActivityAtRef.current = Date.now();
      void evaluateSession(data.session);
    });

    const { data } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      sessionRef.current = nextSession;
      if (event === 'SIGNED_IN') {
        sessionStartedAtRef.current = Date.now();
        lastActivityAtRef.current = Date.now();
      }
      queueMicrotask(() => {
        if (active) void evaluateSession(nextSession);
      });
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [evaluateSession]);

  useEffect(() => {
    if (typeof document === 'undefined') return undefined;

    const markActivity = () => {
      lastActivityAtRef.current = Date.now();
    };
    const activityEvents: (keyof DocumentEventMap)[] = ['keydown', 'pointerdown', 'scroll', 'visibilitychange'];
    activityEvents.forEach((eventName) => document.addEventListener(eventName, markActivity, { passive: true }));

    const timer = window.setInterval(() => {
      if (!sessionRef.current) return;
      const now = Date.now();
      if (
        now - lastActivityAtRef.current >= IDLE_TIMEOUT_MS
        || now - sessionStartedAtRef.current >= ABSOLUTE_TIMEOUT_MS
      ) {
        setMessage('Sua sessão foi encerrada por segurança.');
        void supabase.auth.signOut();
      }
    }, 60_000);

    return () => {
      window.clearInterval(timer);
      activityEvents.forEach((eventName) => document.removeEventListener(eventName, markActivity));
    };
  }, []);

  useEffect(() => {
    if (status !== 'ready' || typeof document === 'undefined') return undefined;

    const revalidateWhenVisible = () => {
      if (document.visibilityState === 'visible') void revalidateAccess();
    };
    const timer = window.setInterval(revalidateWhenVisible, ACCESS_REVALIDATION_MS);

    window.addEventListener('focus', revalidateWhenVisible);
    document.addEventListener('visibilitychange', revalidateWhenVisible);

    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', revalidateWhenVisible);
      document.removeEventListener('visibilitychange', revalidateWhenVisible);
    };
  }, [revalidateAccess, status]);

  const signIn = useCallback(async (email: string, password: string) => {
    setMessage('');
    setStatus('loading');

    if (!isSupabaseConfigured) {
      setMessage(
        'Ambiente Cloud sem Supabase configurado neste build. Na Vercel do projeto Control, defina a URL e a publishable key de Homolog para Preview/Production e redeploy.',
      );
      setStatus('signed_out');
      return;
    }

    const result = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (result.error || !result.data.session) {
      const code = result.error?.code ?? '';
      const details = result.error?.message?.toLowerCase() ?? '';
      if (
        code === 'invalid_credentials'
        || details.includes('invalid login credentials')
        || details.includes('invalid_credentials')
      ) {
        setMessage('E-mail ou senha inválidos.');
      } else if (details.includes('failed to fetch') || details.includes('network')) {
        setMessage('Não foi possível contactar o Supabase. Confirme a URL pública deste build.');
      } else {
        setMessage(
          result.error?.message
            ? `Falha na autenticação: ${result.error.message}`
            : 'E-mail ou senha inválidos.',
        );
      }
      setStatus('signed_out');
      return;
    }
    sessionStartedAtRef.current = Date.now();
    lastActivityAtRef.current = Date.now();
    await evaluateSession(result.data.session);
  }, [evaluateSession]);

  const enrollMfa = useCallback(async () => {
    if (mfaOperationRef.current) return;
    mfaOperationRef.current = true;
    setMfaBusy(true);
    setMessage('');
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setMessage('Não foi possível consultar os autenticadores cadastrados.');
        return;
      }

      const factorState = getTotpFactorState(factors.data?.all, 'CutSync Cloud');
      if (factorState.verifiedFactorId) {
        setHasVerifiedTotp(true);
        setMessage('Este usuário já possui um autenticador. Informe o código atual.');
        return;
      }

      for (const factorId of factorState.unverifiedFactorIds) {
        const removal = await supabase.auth.mfa.unenroll({ factorId });
        if (removal.error) {
          setMessage('Existe um cadastro incompleto e não foi possível reiniciá-lo.');
          return;
        }
      }

      const result = await supabase.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'CutSync Cloud',
      });
      if (result.error) {
        setMessage(getTotpEnrollmentErrorMessage(result.error));
        return;
      }
      setHasVerifiedTotp(false);
      setEnrollment({
        factorId: result.data.id,
        qrCode: normalizeTotpQrCode(result.data.totp.qr_code),
        secret: result.data.totp.secret,
      });
    } finally {
      mfaOperationRef.current = false;
      setMfaBusy(false);
    }
  }, []);

  const verifyMfa = useCallback(async (code: string) => {
    if (mfaOperationRef.current) return;
    mfaOperationRef.current = true;
    setMfaBusy(true);
    setMessage('');
    try {
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) {
        setMessage('Não foi possível consultar os autenticadores cadastrados.');
        return;
      }
      const factorId = getTotpFactorState(factors.data?.all).verifiedFactorId ?? enrollment?.factorId;

      if (!factorId) {
        setMessage('Cadastre um autenticador antes de informar o código.');
        return;
      }

      const challenge = await supabase.auth.mfa.challenge({ factorId });
      if (challenge.error) {
        setMessage('Não foi possível iniciar a validação do autenticador.');
        return;
      }

      const verification = await supabase.auth.mfa.verify({
        factorId,
        challengeId: challenge.data.id,
        code: code.trim(),
      });
      if (verification.error) {
        setMessage('Código inválido ou expirado.');
        return;
      }

      await evaluateSession(verification.data);
    } finally {
      mfaOperationRef.current = false;
      setMfaBusy(false);
    }
  }, [enrollment?.factorId, evaluateSession]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    sessionRef.current = null;
    setContext(null);
    setEnrollment(null);
    setHasVerifiedTotp(false);
    setMessage('');
    setStatus('signed_out');
  }, []);

  const retry = useCallback(async () => {
    await evaluateSession(sessionRef.current);
  }, [evaluateSession]);

  const can = useCallback((permission: ControlPermission) => (
    Boolean(context?.permissions.includes(permission))
  ), [context]);

  return (
    <ControlAuthContext.Provider
      value={{
        status,
        context,
        message,
        enrollment,
        hasVerifiedTotp,
        mfaBusy,
        signIn,
        enrollMfa,
        verifyMfa,
        signOut,
        retry,
        can,
      }}
    >
      {children}
    </ControlAuthContext.Provider>
  );
}

export function useControlAuth(): ControlAuthValue {
  const value = React.use(ControlAuthContext);
  if (!value) throw new Error('useControlAuth deve estar dentro de ControlAuthProvider.');
  return value;
}
