import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { User, Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { supabase } from '../services/supabase';

interface Profile {
  id: string;
  establishment_id: string | null;
  name: string;
  role: 'client' | 'professional' | 'admin';
  email: string;
  phone: string | null;
  avatar_url: string | null;
  commission_rate?: number | null;
  push_token?: string | null;
  work_hours?: string | null;
  titulo_profissional?: string | null;
}

interface AuthContextData {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  isSuperadmin: boolean;
  governanceRole: 'SaaS_Viewer' | 'SaaS_Editor' | 'SaaS_Owner' | null;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [governanceRole, setGovernanceRole] = useState<'SaaS_Viewer' | 'SaaS_Editor' | 'SaaS_Owner' | null>(null);
  const profileRef = useRef<Profile | null>(null);

  useEffect(() => {
    profileRef.current = profile;
  }, [profile]);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .rpc('get_my_profile')
        .single();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
        if (error.message?.includes('JWT expired') || error.code === 'PGRST303') {
          await supabase.auth.signOut();
          setUser(null);
          setProfile(null);
          profileRef.current = null;
          setSession(null);
        }
      } else {
        const role: Profile['role'] = data.role === 'professional' || data.role === 'admin' ? data.role : 'client';
        const nextProfile = { ...data, role };
        setProfile(nextProfile);
        profileRef.current = nextProfile;
        const { data: superadminMarker } = await supabase
          .from('superadmins')
          .select('profile_id')
          .eq('profile_id', userId)
          .maybeSingle();

        const { data: govUser } = await supabase
          .from('governance_users')
          .select('role')
          .eq('profile_id', userId)
          .maybeSingle();

        setGovernanceRole(govUser?.role ?? null);
        setIsSuperadmin(Boolean(superadminMarker) || govUser?.role === 'SaaS_Owner');

        // Registrar Push Token assincronamente e atualizar se mudou
        registerForPushNotificationsAsync().then(async (token) => {
          if (token && data.push_token !== token) {
            try {
              await supabase
                .from('profiles')
                .update({ push_token: token })
                .eq('id', userId);
            } catch (e) {
              console.warn('Erro ao atualizar push_token remoto:', e);
            }
          }
        });
      }
    } catch (err) {
      console.error('Erro no catch do perfil:', err);
    }
  };

  const refreshProfile = async () => {
    if (user) {
      await fetchProfile(user.id);
    }
  };

  const signOut = async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    profileRef.current = null;
    setSession(null);
    setIsSuperadmin(false);
    setGovernanceRole(null);
    setLoading(false);
  };

  useEffect(() => {
    let active = true;
    let pendingAuthTask: ReturnType<typeof setTimeout> | null = null;

    // 1. Verificar sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => {
          if (active) setLoading(false);
        });
      } else {
        setLoading(false);
      }
    });

    // 2. Escutar mudanças de estado do Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);

      if (pendingAuthTask) clearTimeout(pendingAuthTask);
      if (session?.user) {
        const shouldBlockNavigation = !profileRef.current;
        if (shouldBlockNavigation) setLoading(true);
        // Supabase can deadlock when another async client call is awaited
        // inside onAuthStateChange. Defer profile loading until the callback
        // releases the auth lock.
        pendingAuthTask = setTimeout(() => {
          pendingAuthTask = null;
          if (!active) return;
          void fetchProfile(session.user.id).finally(() => {
            if (active) setLoading(false);
          });
        }, 0);
      } else {
        setProfile(null);
        profileRef.current = null;
        setIsSuperadmin(false);
        setGovernanceRole(null);
        setLoading(false);
      }
    });

    return () => {
      active = false;
      if (pendingAuthTask) clearTimeout(pendingAuthTask);
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, isSuperadmin, governanceRole, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider');
  }
  return context;
}

async function registerForPushNotificationsAsync() {
  if (Platform.OS === 'web') return null;
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') return null;
    
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (e) {
    console.warn('[Push] Erro ao obter token de notificação:', e);
    return null;
  }
}
