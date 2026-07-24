import React, { ReactNode } from 'react';
import { Alert, StyleSheet, Text } from 'react-native';
import { BarChart3, Building2, CreditCard, LayoutDashboard, Scissors, Settings, Users } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { useOperationalContext } from '../../contexts/operational-context';
import { colors, radii, typeScale } from '../../theme/tokens';
import { ActionMenu } from '../ui/action-menu';
import { OperationalShell } from './operational-shell';

type AdminRoute = 'overview' | 'reports' | 'services' | 'team' | 'organization' | 'billing' | 'settings';

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
  { key: 'organization', label: 'Meu grupo', path: '/(admin)/organization', icon: Building2 },
  { key: 'billing', label: 'Assinatura', path: '/(admin)/billing', icon: CreditCard },
  { key: 'settings', label: 'Configurações', path: '/(admin)/settings', icon: Settings },
] as const;

export const AdminShell = ({ children, activeRoute, shopName, userName, onSignOut, testID = 'admin-shell', contentMode = 'standard', scroll = false }: AdminShellProps) => {
  const { contexts, activeEstablishmentId, selectEstablishment, loading: switching } = useOperationalContext();
  const router = useRouter();

  const handleSwitchShop = async (targetShopId: string) => {
    if (switching || targetShopId === activeEstablishmentId) return;
    if (!contexts.some((context) => context.establishmentId === targetShopId)) {
      Alert.alert('Acesso removido', 'Este estabelecimento não está mais disponível para sua conta.');
      return;
    }
    selectEstablishment(targetShopId);
    router.replace('/(admin)');
  };

  const shopControl = contexts.length > 1 ? (
    <ActionMenu
      testID="admin-shop-switcher"
      label="Alternar estabelecimento"
      items={contexts.map((context) => ({
        key: context.establishmentId,
        label: context.establishmentName,
        disabled: context.establishmentId === activeEstablishmentId,
        onPress: () => { void handleSwitchShop(context.establishmentId); },
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
