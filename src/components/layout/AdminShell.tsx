import React, { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View, ActivityIndicator, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, LayoutDashboard, Scissors, Settings, Users, LogOut, Wifi } from 'lucide-react-native';
import { BrandMark } from '../ui/BrandMark';
import { colors, layout, radii, typography } from '../../theme/tokens';
import { useAuth } from '../../contexts/AuthContext';
import { supabase } from '../../services/supabase';
import { Establishment, mapEstablishment } from '../../types/database';

type AdminRoute = 'overview' | 'services' | 'team' | 'settings';

interface AdminShellProps {
  children: ReactNode;
  activeRoute: AdminRoute;
  shopName: string;
  userName?: string;
  onSignOut: () => void;
  testID: string;
}

const navItems = [
  { key: 'overview', label: 'Visão geral', path: '/(admin)', Icon: LayoutDashboard },
  { key: 'services', label: 'Serviços', path: '/(admin)/services', Icon: Scissors },
  { key: 'team', label: 'Equipe', path: '/(admin)/team', Icon: Users },
  { key: 'settings', label: 'Configurações', path: '/(admin)/settings', Icon: Settings },
] as const;

export const AdminShell = ({
  children,
  activeRoute,
  shopName,
  userName,
  onSignOut,
  testID,
}: AdminShellProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.desktopBreakpoint;
  const router = useRouter();

  const navigate = (path: string) => router.push(path as never);

  const [availableShops, setAvailableShops] = React.useState<Establishment[]>([]);
  const [switching, setSwitching] = React.useState(false);
  const { profile, refreshProfile } = useAuth();

  React.useEffect(() => {
    if (!profile?.id) return;
    
    const load = async () => {
      const { data: links } = await supabase.from('profile_establishments').select('establishment_id').eq('profile_id', profile.id);
      const ids = (links || []).map((item) => item.establishment_id);
      if (profile.establishment_id && !ids.includes(profile.establishment_id)) ids.push(profile.establishment_id);
      if (!ids.length) { setAvailableShops([]); return; }
      const { data } = await supabase.from('establishments').select('*').in('id', ids).order('name');
      setAvailableShops((data || []).map(mapEstablishment));
    };
    void load();
  }, [profile?.id]);

  const handleSwitchShop = async (targetShopId: string) => {
    if (switching || targetShopId === profile?.establishment_id) return;
    setSwitching(true);
    try {
      // 1. Atualizar active barbershop no Supabase
      const { error } = await supabase.from('profiles')
        .update({ establishment_id: targetShopId })
        .eq('id', profile?.id);
        
      if (error) throw error;
      
      // 2. Atualizar o profile no contexto de autenticação
      await refreshProfile();

      // 3. Redirecionar; os hooks Realtime carregam a nova unidade
      router.replace('/(admin)');
    } catch (err) {
      console.warn('Erro ao alternar de barbearia:', err);
      Alert.alert('Erro', 'Não foi possível alternar de barbearia. Tente novamente.');
    } finally {
      setSwitching(false);
    }
  };

  return (
    <View testID={testID} style={styles.root}>
      {isDesktop && (
        <View testID="admin-sidebar" style={styles.sidebar}>
          <BrandMark compact monochrome />
          <View style={styles.shopBlock}>
            <Text style={styles.shopOverline}>Operação atual</Text>
            {availableShops.length > 1 ? (
              Platform.OS === 'web' ? (
                <View style={styles.selectWrapper}>
                  {React.createElement('select', {
                    value: profile?.establishment_id || '',
                    onChange: (e: any) => handleSwitchShop(e.target.value),
                    style: {
                      backgroundColor: colors.surfaceRaised,
                      color: colors.text,
                      fontFamily: typography.bodyStrong,
                      fontSize: '13px',
                      border: `1px solid ${colors.border}`,
                      borderRadius: radii.md,
                      padding: '8px 12px',
                      width: '100%',
                      cursor: 'pointer',
                      outline: 'none',
                      marginTop: 6,
                    }
                  }, 
                    availableShops.map((shop) => 
                      React.createElement('option', { key: shop.id, value: shop.id }, shop.name)
                    )
                  )}
                </View>
              ) : (
                <View style={styles.mobileSelectContainer}>
                  <Pressable 
                    onPress={() => {
                      Alert.alert(
                        'Alternar Estabelecimento',
                        'Escolha o estabelecimento que deseja gerenciar:',
                        availableShops.map((shop) => ({
                          text: shop.name,
                          style: shop.id === profile?.establishment_id ? 'cancel' : 'default',
                          onPress: () => handleSwitchShop(shop.id)
                        }))
                      );
                    }}
                    style={styles.mobileSelectButton}
                  >
                    <Text style={styles.mobileSelectButtonText}>{shopName} ▾</Text>
                  </Pressable>
                </View>
              )
            ) : (
              <Text testID="admin-sidebar-shop-name" numberOfLines={2} style={styles.shopName}>{shopName}</Text>
            )}
          </View>
          <View style={styles.nav}>
            {navItems.map(({ key, label, path, Icon }) => {
              const active = key === activeRoute;
              return (
                <Pressable
                  key={key}
                  testID={`admin-nav-${key}`}
                  onPress={() => navigate(path)}
                  style={({ pressed }) => [
                    styles.navItem,
                    active && styles.navItemActive,
                    pressed && styles.navItemPressed,
                  ]}
                >
                  {active ? <View style={styles.activeIndicator} /> : null}
                  <Icon color={active ? colors.text : colors.textSecondary} size={18} strokeWidth={active ? 2.2 : 1.8} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.sidebarFooter}>
            <View style={styles.connectionRow}>
              <Wifi color={colors.success} size={15} />
              <Text style={styles.connectionText}>Atualizações em tempo real</Text>
            </View>
            <Text testID="admin-sidebar-user-name" style={styles.userName}>{userName || 'Administrador'}</Text>
            <Pressable testID="admin-sign-out-button" onPress={onSignOut} style={styles.signOut}>
              <LogOut color={colors.danger} size={16} />
              <Text style={styles.signOutText}>Sair da conta</Text>
            </Pressable>
          </View>
        </View>
      )}

      <View style={styles.main}>
        {!isDesktop && availableShops.length > 1 && (
          <View style={styles.mobileTopbar}>
            <Text style={styles.mobileTopbarLabel}>Unidade:</Text>
            <Pressable 
              onPress={() => {
                Alert.alert(
                  'Alternar Estabelecimento',
                  'Escolha o estabelecimento que deseja gerenciar:',
                  availableShops.map((shop) => ({
                    text: shop.name,
                    onPress: () => handleSwitchShop(shop.id)
                  }))
                );
              }}
              style={styles.mobileTopbarButton}
            >
              <Text style={styles.mobileTopbarButtonText}>{shopName} ▾</Text>
            </Pressable>
          </View>
        )}
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {children}
        </ScrollView>
        {!isDesktop && (
          <View testID="admin-bottom-navigation" style={styles.bottomNav}>
            {navItems.map(({ key, label, path, Icon }) => {
              const active = key === activeRoute;
              return (
                <Pressable
                  key={key}
                  testID={`admin-mobile-nav-${key}`}
                  onPress={() => navigate(path)}
                  style={({ pressed }) => [styles.bottomItem, pressed && styles.navItemPressed]}
                >
                  <Icon color={active ? colors.text : colors.textMuted} size={20} />
                  <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      {switching && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.accent} />
          <Text style={styles.loadingText}>Alternando estabelecimento...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.canvas },
  sidebar: {
    width: 252,
    backgroundColor: colors.surface,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  shopBlock: { marginTop: 36, paddingHorizontal: 10 },
  shopOverline: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 18, lineHeight: 23, marginTop: 6 },
  nav: { flex: 1, gap: 7, marginTop: 30 },
  navItem: { position: 'relative', overflow: 'hidden', flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 12, borderRadius: radii.sm },
  navItemActive: { backgroundColor: colors.surfacePressed },
  activeIndicator: { position: 'absolute', left: 0, top: 9, bottom: 9, width: 2, borderRadius: 2, backgroundColor: colors.accent },
  navItemHover: { backgroundColor: colors.surfaceRaised },
  navItemPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  navLabel: { color: colors.textSecondary, fontFamily: typography.body, fontSize: 13 },
  navLabelActive: { color: colors.text, fontFamily: typography.bodyStrong },
  sidebarFooter: { borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 18, gap: 12 },
  connectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  connectionText: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10 },
  userName: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  signOutText: { color: colors.danger, fontFamily: typography.bodyStrong, fontSize: 12 },
  main: { flex: 1 },
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingTop: 34, paddingBottom: 110 },
  bottomNav: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 10,
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.surface + 'F2',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...Platform.select({
      web: { boxShadow: '0 4px 12px rgba(0,0,0,0.08)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 10, elevation: 6 },
    }),
  },
  bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9 },
  bottomLabelActive: { color: colors.text },
  selectWrapper: { marginTop: 6, width: '100%' },
  mobileSelectContainer: { marginTop: 6, width: '100%' },
  mobileSelectButton: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 8,
    paddingHorizontal: 12,
    width: '100%',
    alignItems: 'center',
  },
  mobileSelectButtonText: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 13,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(244, 244, 245, 0.85)',
    zIndex: 9999,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 14,
  },
  mobileTopbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: colors.canvasSoft,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  mobileTopbarLabel: {
    color: colors.textMuted,
    fontFamily: typography.bodyStrong,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  mobileTopbarButton: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.md,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  mobileTopbarButtonText: {
    color: colors.text,
    fontFamily: typography.bodyStrong,
    fontSize: 12,
  },
});