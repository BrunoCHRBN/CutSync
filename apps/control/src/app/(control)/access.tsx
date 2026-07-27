import { useFocusEffect } from 'expo-router';
import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';

import { ControlState } from '@/components/control-state';
import { SectionPage } from '@/components/section-page';
import { useControlAuth } from '@/contexts/control-auth-context';
import { supabase } from '@/services/supabase';
import type { GovernanceRole } from '@/types/control';

interface ControlUser {
  profile_id: string;
  name: string;
  email: string;
  role: GovernanceRole;
  is_active: boolean;
  expires_at: string | null;
  granted_at: string;
  revoked_at: string | null;
}

export default function AccessRoute() {
  const { can } = useControlAuth();
  const canManageAccess = can('control.access.manage');
  const [users, setUsers] = useState<ControlUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(useCallback(() => {
    if (!canManageAccess) return undefined;
    let active = true;
    setLoading(true);
    setError('');
    void (supabase.rpc as any)('list_control_users').then((result: { data: unknown; error: { message?: string } | null }) => {
      if (!active) return;
      if (result.error || !Array.isArray(result.data)) {
        setError('Não foi possível consultar os acessos.');
      } else {
        setUsers(result.data as ControlUser[]);
      }
      setLoading(false);
    });
    return () => { active = false; };
  }, [canManageAccess]));

  if (!canManageAccess) {
    return <ControlState title="Acesso restrito" message="Somente SaaS_Owner pode consultar ou administrar acessos." />;
  }

  return (
    <SectionPage
      eyebrow="SEGURANÇA"
      title="Acessos ao Control"
      description="Diretório privado de pessoas autorizadas. Convites e alterações serão adicionados após a validação desta base em homologação."
    >
      {loading ? <ActivityIndicator color="#173d2b" /> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <View style={styles.list}>
        {users.map((user) => {
          const effectiveActive = user.is_active
            && !user.revoked_at
            && (!user.expires_at || new Date(user.expires_at).getTime() > Date.now());
          return (
            <View key={user.profile_id} style={styles.row}>
              <View style={styles.identity}>
                <Text style={styles.name}>{user.name}</Text>
                <Text style={styles.email}>{user.email}</Text>
              </View>
              <Text style={styles.role}>{user.role}</Text>
              <Text style={[styles.status, effectiveActive ? styles.active : styles.inactive]}>
                {effectiveActive ? 'Ativo' : 'Inativo'}
              </Text>
              <Text style={styles.expiry}>
                {user.expires_at ? `Expira em ${new Date(user.expires_at).toLocaleDateString('pt-BR')}` : 'Sem expiração'}
              </Text>
            </View>
          );
        })}
      </View>
    </SectionPage>
  );
}

const styles = StyleSheet.create({
  error: { color: '#a33a31' },
  list: { width: '100%', gap: 10 },
  row: {
    width: '100%',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 14,
    padding: 18,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 13,
    backgroundColor: '#ffffff',
  },
  identity: { minWidth: 220, flex: 1, gap: 3 },
  name: { color: '#17231c', fontWeight: '700' },
  email: { color: '#667269', fontSize: 12 },
  role: { minWidth: 110, color: '#344239', fontSize: 12, fontWeight: '700' },
  status: { minWidth: 60, fontSize: 12, fontWeight: '800' },
  active: { color: '#28754b' },
  inactive: { color: '#9a3f37' },
  expiry: { minWidth: 140, color: '#667269', fontSize: 12 },
});
