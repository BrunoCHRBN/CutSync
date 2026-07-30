import {
  getTotpEnrollmentErrorMessage,
  getTotpFactorState,
  normalizeTotpQrCode,
} from '@cutsync/domain';
import type { Session, User } from '@supabase/supabase-js';
import React, { createContext, useCallback, useEffect, useRef, useState } from 'react';
import { supabaseGovernance } from '../services/supabaseGovernance';
import type { GovernanceRole } from '../types/governance-knowledge';

export interface GovernanceProfile {
  id: string;
  name: string;
  email: string;
  role: GovernanceRole;
}

interface GovernanceNotice {
  tone: 'success' | 'danger';
  message: string;
}

interface GovernanceMfaEnrollment {
  factorId: string;
  qrCode: string;
  secret: string;
}

interface GovernanceAuthContextValue {
  user: User | null;
  profile: GovernanceProfile | null;
  loading: boolean;
  notice: GovernanceNotice | null;
  mfaRequired: boolean;
  mfaError: string;
  mfaBusy: boolean;
  hasVerifiedTotp: boolean;
  enrollment: GovernanceMfaEnrollment | null;
  signIn: (email: string, password: string) => Promise<void>;
  enrollMfa: () => Promise<void>;
  confirmMfa: (code: string) => Promise<void>;
  signOut: () => Promise<void>;
  clearNotice: () => void;
}

const GovernanceAuthContext = createContext<GovernanceAuthContextValue | null>(null);

export function GovernanceAuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<GovernanceProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<GovernanceNotice | null>(null);
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaError, setMfaError] = useState('');
  const [mfaBusy, setMfaBusy] = useState(false);
  const [hasVerifiedTotp, setHasVerifiedTotp] = useState(false);
  const [enrollment, setEnrollment] = useState<GovernanceMfaEnrollment | null>(null);
  const mfaOperationRef = useRef(false);

  const resetGovernanceState = useCallback(() => {
    setUser(null);
    setProfile(null);
    setMfaRequired(false);
    setMfaError('');
    setHasVerifiedTotp(false);
    setEnrollment(null);
  }, []);

  const loadGovernanceProfile = useCallback(async (currentUser: User) => {
    const { data, error } = await supabaseGovernance
      .from('governance_users')
      .select('role')
      .eq('profile_id', currentUser.id)
      .maybeSingle();

    if (error || !data) {
      await supabaseGovernance.auth.signOut();
      resetGovernanceState();
      setNotice({ tone: 'danger', message: 'Acesso restrito. Sua conta não pertence à Governança.' });
      return;
    }

    setUser(currentUser);
    setProfile({
      id: currentUser.id,
      name: 'Membro da Governança',
      email: currentUser.email ?? '',
      role: data.role,
    });
    setMfaRequired(false);
    setMfaError('');
  }, [resetGovernanceState]);

  const evaluateSession = useCallback(async (session: Session | null) => {
    if (!session) {
      resetGovernanceState();
      setLoading(false);
      return;
    }

    setUser(session.user);
    setProfile(null);
    setLoading(true);
    setMfaError('');

    const assurance = await supabaseGovernance.auth.mfa.getAuthenticatorAssuranceLevel();
    if (assurance.error) {
      setNotice({ tone: 'danger', message: 'Não foi possível validar o nível de segurança da sessão.' });
      setLoading(false);
      return;
    }

    if (assurance.data.currentLevel !== 'aal2') {
      const factors = await supabaseGovernance.auth.mfa.listFactors();
      if (factors.error) {
        setNotice({ tone: 'danger', message: 'Não foi possível consultar os autenticadores cadastrados.' });
        setLoading(false);
        return;
      }

      const factorState = getTotpFactorState(factors.data?.all);
      setHasVerifiedTotp(Boolean(factorState.verifiedFactorId));
      setEnrollment(null);
      setMfaRequired(true);
      setLoading(false);
      return;
    }

    await loadGovernanceProfile(session.user);
    setLoading(false);
  }, [loadGovernanceProfile, resetGovernanceState]);

  useEffect(() => {
    let active = true;
    supabaseGovernance.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      await evaluateSession(data.session);
    });
    return () => {
      active = false;
    };
  }, [evaluateSession]);

  const signIn = useCallback(async (email: string, password: string) => {
    setLoading(true);
    setNotice(null);
    setMfaError('');
    const { data, error } = await supabaseGovernance.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error || !data.user) {
      setNotice({ tone: 'danger', message: error?.message || 'Falha na autenticação.' });
      setLoading(false);
      return;
    }
    await evaluateSession(data.session);
  }, [evaluateSession]);

  const enrollMfa = useCallback(async () => {
    if (mfaOperationRef.current) return;
    mfaOperationRef.current = true;
    setMfaBusy(true);
    setMfaError('');
    try {
      const factors = await supabaseGovernance.auth.mfa.listFactors();
      if (factors.error) {
        setMfaError('Não foi possível consultar os autenticadores cadastrados.');
        return;
      }

      const factorState = getTotpFactorState(factors.data?.all, 'CutSync Governança');
      if (factorState.verifiedFactorId) {
        setHasVerifiedTotp(true);
        setEnrollment(null);
        return;
      }

      for (const factorId of factorState.unverifiedFactorIds) {
        const removal = await supabaseGovernance.auth.mfa.unenroll({ factorId });
        if (removal.error) {
          setMfaError('Existe um cadastro incompleto e não foi possível reiniciá-lo.');
          return;
        }
      }

      const result = await supabaseGovernance.auth.mfa.enroll({
        factorType: 'totp',
        friendlyName: 'CutSync Governança',
      });
      if (result.error) {
        setMfaError(getTotpEnrollmentErrorMessage(result.error));
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

  const confirmMfa = useCallback(async (code: string) => {
    if (mfaOperationRef.current) return;
    if (!/^\d{6}$/.test(code.trim())) {
      setMfaError('Informe o código de 6 dígitos do aplicativo autenticador.');
      return;
    }

    mfaOperationRef.current = true;
    setMfaBusy(true);
    setMfaError('');
    try {
      const factors = await supabaseGovernance.auth.mfa.listFactors();
      if (factors.error) {
        setMfaError('Não foi possível consultar os autenticadores cadastrados.');
        return;
      }

      const factorId = getTotpFactorState(factors.data?.all).verifiedFactorId
        ?? enrollment?.factorId;
      if (!factorId) {
        setMfaError('Cadastre um autenticador antes de informar o código.');
        return;
      }

      const verification = await supabaseGovernance.auth.mfa.challengeAndVerify({
        factorId,
        code: code.trim(),
      });
      if (verification.error) {
        setMfaError('Código inválido ou expirado.');
        return;
      }

      const current = await supabaseGovernance.auth.getSession();
      if (current.error || !current.data.session) {
        setMfaError('A sessão expirou. Entre novamente.');
        return;
      }

      await evaluateSession(current.data.session);
    } finally {
      mfaOperationRef.current = false;
      setMfaBusy(false);
    }
  }, [enrollment?.factorId, evaluateSession]);

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabaseGovernance.auth.signOut();
    resetGovernanceState();
    setNotice(null);
    setLoading(false);
  }, [resetGovernanceState]);

  return (
    <GovernanceAuthContext.Provider
      value={{
        user,
        profile,
        loading,
        notice,
        mfaRequired,
        mfaError,
        mfaBusy,
        hasVerifiedTotp,
        enrollment,
        signIn,
        enrollMfa,
        confirmMfa,
        signOut,
        clearNotice: () => setNotice(null),
      }}
    >
      {children}
    </GovernanceAuthContext.Provider>
  );
}

export function useGovernanceAuth(): GovernanceAuthContextValue {
  const context = React.use(GovernanceAuthContext);
  if (!context) throw new Error('useGovernanceAuth deve estar dentro de GovernanceAuthProvider.');
  return context;
}
