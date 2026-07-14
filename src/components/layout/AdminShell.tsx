import React, { ReactNode } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { CalendarDays, LayoutDashboard, Scissors, Settings, Users, LogOut, Wifi } from 'lucide-react-native';
import { BrandMark } from '../ui/BrandMark';
import { colors, layout, radii, typography } from '../../theme/tokens';

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
  { key: 'team', label: 'Equipe', path: '/(admin)/barbers', Icon: Users },
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

  return (
    <View testID={testID} style={styles.root}>
      {isDesktop && (
        <View testID="admin-sidebar" style={styles.sidebar}>
          <BrandMark compact />
          <View style={styles.shopBlock}>
            <Text style={styles.shopOverline}>Operação atual</Text>
            <Text testID="admin-sidebar-shop-name" numberOfLines={2} style={styles.shopName}>{shopName}</Text>
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
                  <Icon color={active ? colors.ink : colors.textSecondary} size={18} strokeWidth={2} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.sidebarFooter}>
            <View style={styles.connectionRow}>
              <Wifi color={colors.success} size={15} />
              <Text style={styles.connectionText}>Dados protegidos offline</Text>
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
                  <Icon color={active ? colors.brand : colors.textMuted} size={20} />
                  <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.canvas },
  sidebar: {
    width: 252,
    backgroundColor: colors.canvasSoft,
    borderRightWidth: 1,
    borderRightColor: colors.border,
    paddingHorizontal: 20,
    paddingVertical: 28,
  },
  shopBlock: { marginTop: 36, paddingHorizontal: 10 },
  shopOverline: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase' },
  shopName: { color: colors.text, fontFamily: typography.display, fontSize: 18, lineHeight: 23, marginTop: 6 },
  nav: { flex: 1, gap: 7, marginTop: 30 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 12, paddingVertical: 12, borderRadius: radii.md },
  navItemActive: { backgroundColor: colors.brand },
  navItemHover: { backgroundColor: colors.surfaceRaised },
  navItemPressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
  navLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 13 },
  navLabelActive: { color: colors.ink },
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
    backgroundColor: '#151518F2',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.xl,
    paddingHorizontal: 8,
    paddingVertical: 8,
    ...Platform.select({
      web: { boxShadow: '0 12px 28px rgba(0,0,0,0.38)' } as any,
      default: { shadowColor: '#000', shadowOpacity: 0.38, shadowRadius: 20, elevation: 12 },
    }),
  },
  bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9 },
  bottomLabelActive: { color: colors.brand },
});