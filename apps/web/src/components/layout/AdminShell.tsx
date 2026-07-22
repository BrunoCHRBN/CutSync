import React, { ReactNode } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { BarChart3, LayoutDashboard, Scissors, Settings, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { Establishment, mapEstablishment } from '@cutsync/database';
import { colors, radii, typeScale } from '../../theme/tokens';
import { ActionMenu } from '../ui/action-menu';
import { OperationalShell } from './operational-shell';

type AdminRoute = 'overview' | 'reports' | 'services' | 'team' | 'settings';

interface AdminShellProps {
  children: ReactNode;
  activeRoute: AdminRoute;
  shopName: string;
  userName?: string;
  onSignOut: () => void;
  testID?: string;
  contentMode?: 'standard' | 'wide' | 'fixed';
  scroll?: boolean;
}

const navItems = [
  { key: 'overview', label: 'Visão geral', path: '/(admin)', icon: LayoutDashboard },
  { key: 'reports', label: 'Relatórios', path: '/(admin)/reports', icon: BarChart3 },
  { key: 'services', label: 'Serviços', path: '/(admin)/services', icon: Scissors },
  { key: 'team', label: 'Equipe', path: '/(admin)/team', icon: Users },
  { key: 'settings', label: 'Configurações', path: '/(admin)/settings', icon: Settings },
] as const;

export const AdminShell = ({ children, activeRoute, shopName, userName, onSignOut, testID = 'admin-shell', contentMode = 'standard', scroll = false }: AdminShellProps) => {
  const [availableShops, setAvailableShops] = React.useState<Establishment[]>([]);
  const [switching, setSwitching] = React.useState(false);
  const { profile, refreshProfile } = useAuth();
  const router = useRouter();

  React.useEffect(() => {
    if (!profile?.id) return;
    const load = async () => {
      const { data: links } = await supabase.from('memberships').select('establishment_id').eq('profile_id', profile.id).eq('status', 'active');
      const ids = (links || []).map((item) => item.establishment_id);
      if (profile.establishment_id && !ids.includes(profile.establishment_id)) ids.push(profile.establishment_id);
      if (!ids.length) { setAvailableShops([]); return; }
      const { data } = await supabase.from('establishments').select('*').in('id', ids).order('name');
      setAvailableShops((data || []).map(mapEstablishment));
    };
    void load();
  }, [profile?.establishment_id, profile?.id]);

  const handleSwitchShop = async (targetShopId: string) => {
    if (switching || targetShopId === profile?.establishment_id) return;
    setSwitching(true);
    try {
      const { error } = await supabase.rpc('switch_active_establishment', { target_establishment_id: targetShopId });
      if (error) throw error;
      await refreshProfile();
      router.replace('/(admin)');
    } catch (error) {
      console.warn('[AdminShell] Falha ao alternar estabelecimento:', error);
      Alert.alert('Erro', 'Não foi possível alternar de barbearia. Tente novamente.');
    } finally {
      setSwitching(false);
    }
  };

  const shopControl = availableShops.length > 1 ? (
    <ActionMenu
      testID="admin-shop-switcher"
      label="Alternar estabelecimento"
      items={availableShops.map((shop) => ({
        key: shop.id,
        label: shop.name,
        disabled: shop.id === profile?.establishment_id,
        onPress: () => { void handleSwitchShop(shop.id); },
      }))}
    />
  ) : (
    <Text testID="admin-sidebar-shop-name" numberOfLines={2} style={styles.shopName}>{shopName}</Text>
  );

  return (
    <OperationalShell
      testID={testID}
      idPrefix="admin"
      activeRoute={activeRoute}
      navItems={navItems}
      shopName={shopName}
      shopControl={shopControl}
      userName={userName}
      roleLabel="Operação atual"
      onSignOut={onSignOut}
      loading={switching}
      contentMode={contentMode}
      scroll={scroll}
    >
      {children}
    </OperationalShell>
  );
};

const styles = StyleSheet.create({
  shopName: { ...typeScale.cardTitle, color: colors.text, marginTop: 7 },
  shopSwitcher: { minHeight: 44, borderRadius: radii.md },
});
