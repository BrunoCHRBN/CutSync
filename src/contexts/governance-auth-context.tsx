import React, { createContext, useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
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

interface GovernanceAuthContextValue {
  user: User | null;
  profile: GovernanceProfile | null;
  loading: boolean;
  notice: GovernanceNotice | null;
  mfaRequired: boolean;
  mfaError: string;
  signIn: (email: string, password: string) => Promise<void>;
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

  async function loadGovernanceProfile(currentUser: User) {
    const { data, error } = await supabaseGovernance
      .from('governance_users')
      .select('role')
      .eq('profile_id', currentUser.id)
      .maybeSingle();

    if (error || !data) {
      await supabaseGovernance.auth.signOut();
      setUser(null);
      setProfile(null);
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
  }

  useEffect(() => {
    let active = true;
    supabaseGovernance.auth.getSession().then(async ({ data }) => {
      if (!active) return;
      if (data.session?.user) await loadGovernanceProfile(data.session.user);
      if (active) setLoading(false);
    });
    return () => {
      active = false;
    };
  }, []);

  const signIn = async (email: string, password: string) => {
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
    setUser(data.user);
    setMfaRequired(true);
    setLoading(false);
  };

  const confirmMfa = async (code: string) => {
    setMfaError('');
    if (code !== '123456') {
      setMfaError('Código MFA inválido. Use "123456" somente neste ambiente de teste.');
      return;
    }
    const { data } = await supabaseGovernance.auth.getSession();
    if (!data.session?.user) {
      setMfaError('A sessão expirou. Entre novamente.');
      setMfaRequired(false);
      return;
    }
    setLoading(true);
    await loadGovernanceProfile(data.session.user);
    setMfaRequired(false);
    setLoading(false);
  };

  const signOut = async () => {
    setLoading(true);
    await supabaseGovernance.auth.signOut();
    setUser(null);
    setProfile(null);
    setMfaRequired(false);
    setNotice(null);
    setLoading(false);
  };

  return (
    <GovernanceAuthContext.Provider
      value={{
        user,
        profile,
        loading,
        notice,
        mfaRequired,
        mfaError,
        signIn,
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
