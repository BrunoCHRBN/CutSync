import React, { createContext, useContext, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { User, Session } from '@supabase/supabase-js';
import * as Notifications from 'expo-notifications';
import { supabase } from '../services/supabase';
import { database } from '../database';

interface Profile {
  id: string;
  barbershop_id: string | null;
  name: string;
  role: 'client' | 'barber' | 'admin';
  email: string;
  phone: string | null;
  avatar_url: string | null;
  commission_rate?: number | null;
  push_token?: string | null;
}

interface AuthContextData {
  user: User | null;
  profile: Profile | null;
  session: Session | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextData>({} as AuthContextData);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Erro ao carregar perfil:', error);
      } else {
        setProfile(data);

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
    try {
      // Limpar banco local no logout para evitar vazamento de fila de push de outras sessões
      await database.write(async () => {
        await database.unsafeResetDatabase();
      });
    } catch (e) {
      console.warn('Erro ao resetar banco local no logout:', e);
    }
    await supabase.auth.signOut();
    setUser(null);
    setProfile(null);
    setSession(null);
    setLoading(false);
  };

  useEffect(() => {
    // 1. Verificar sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    });

    // 2. Escutar mudanças de estado do Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      if (session?.user) {
        setLoading(true);
        await fetchProfile(session.user.id);
        setLoading(false);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <AuthContext.Provider value={{ user, profile, session, loading, refreshProfile, signOut }}>
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
