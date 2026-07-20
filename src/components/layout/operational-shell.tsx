import React, { ReactNode } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useRouter } from 'expo-router';
import { LogOut } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BrandMark } from '../ui/BrandMark';
import { colors, layout, radii, typeScale } from '../../theme/tokens';

export interface OperationalNavItem {
  key: string;
  label: string;
  path: string;
  icon: React.ComponentType<{ color?: string; size?: number; strokeWidth?: number }>;
}

interface OperationalShellProps {
  children: ReactNode;
  activeRoute: string;
  navItems: readonly OperationalNavItem[];
  shopName: string;
  userName?: string;
  roleLabel: string;
  onSignOut: () => void;
  testID: string;
  idPrefix?: 'admin' | 'professional';
  isOffline?: boolean;
  loading?: boolean;
  shopControl?: ReactNode;
  contentMode?: 'standard' | 'wide' | 'fixed';
  scroll?: boolean;
}

export const OperationalShell = ({
  children,
  activeRoute,
  navItems,
  shopName,
  userName,
  roleLabel,
  onSignOut,
  testID,
  idPrefix,
  isOffline = false,
  loading = false,
  shopControl,
  contentMode = 'standard',
  scroll = false,
}: OperationalShellProps) => {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isDesktop = width >= layout.desktopBreakpoint;
  const router = useRouter();
  const prefix = idPrefix || testID;
  const contentStyle = [
    styles.content,
    contentMode === 'wide' && styles.contentWide,
    contentMode === 'fixed' && styles.contentFixed,
  ];

  const content = scroll ? (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      showsVerticalScrollIndicator={false}
      contentContainerStyle={contentStyle}
    >
      {children}
    </ScrollView>
  ) : (
    <View style={styles.fixedViewport}>{children}</View>
  );

  return (
    <View testID={testID} style={[styles.root, { flexDirection: isDesktop ? 'row' : 'column' }]}>
      {isDesktop ? (
        <View testID={`${prefix}-sidebar`} style={styles.sidebar}>
          <BrandMark compact testID={`${prefix}-shell-brand`} />
          <View style={styles.shopBlock}>
            <Text style={styles.overline}>{roleLabel}</Text>
            {shopControl ?? <Text testID={`${prefix}-sidebar-shop-name`} numberOfLines={2} style={styles.shopName}>{shopName}</Text>}
          </View>
          <View testID={`${prefix}-shell-navigation`} accessibilityRole="tablist" style={styles.nav}>
            {navItems.map(({ key, label, path, icon: Icon }) => {
              const active = key === activeRoute;
              return (
                <Pressable
                  key={key}
                  testID={`${prefix}-nav-${key}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  onPress={() => router.push(path as never)}
                  style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}
                >
                  <Icon color={active ? colors.brandPrimary : colors.textSecondary} size={18} strokeWidth={active ? 2.2 : 1.8} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.footer}>
            <Text testID={`${prefix}-sidebar-user-name`} style={styles.userName} numberOfLines={1}>{userName || roleLabel}</Text>
            <Pressable testID={`${prefix}-sign-out-button`} accessibilityRole="button" accessibilityLabel="Sair da conta" onPress={onSignOut} style={({ pressed }) => [styles.signOut, pressed && styles.pressed]}>
              <LogOut color={colors.danger} size={17} />
              <Text style={styles.signOutText}>Sair da conta</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View testID={`${prefix}-shell-header`} style={[styles.mobileTopbar, { paddingTop: Math.max(insets.top, 10) }]}>
          <BrandMark compact testID={`${prefix}-shell-brand`} />
          <View style={styles.mobileIdentity}>
            <Text testID={`${prefix}-shell-shop-name`} style={styles.mobileShop} numberOfLines={1}>{shopName}</Text>
            <Text testID={`${prefix}-shell-user-name`} style={styles.mobileUser} numberOfLines={1}>{userName || roleLabel}</Text>
          </View>
          <Pressable testID={`${prefix}-sign-out-button`} accessibilityRole="button" accessibilityLabel="Sair da conta" onPress={onSignOut} style={({ pressed }) => [styles.mobileSignOut, pressed && styles.pressed]}>
            <LogOut color={colors.danger} size={18} />
          </Pressable>
        </View>
      )}

      <View style={styles.main}>{content}</View>

      {!isDesktop && (
        <View testID={prefix === 'professional' ? 'professional-shell-navigation' : `${prefix}-bottom-navigation`} style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {navItems.map(({ key, label, path, icon: Icon }) => {
            const active = key === activeRoute;
            return (
              <Pressable
                key={key}
                testID={`${prefix}-mobile-nav-${key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                onPress={() => router.push(path as never)}
                style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
              >
                <Icon color={active ? colors.brandPrimary : colors.textMuted} size={21} strokeWidth={active ? 2.2 : 1.7} />
                <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}

      {loading && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={colors.brandPrimary} />
          <Text style={styles.loadingText}>Atualizando operação...</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, flexDirection: 'row', backgroundColor: colors.canvas },
  sidebar: { width: 240, paddingHorizontal: 18, paddingVertical: 24, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.borderSubtle },
  shopBlock: { paddingHorizontal: 10, marginTop: 34 },
  overline: { ...typeScale.label, color: colors.textMuted, textTransform: 'uppercase' },
  shopName: { ...typeScale.cardTitle, color: colors.text, marginTop: 7 },
  nav: { flex: 1, gap: 5, marginTop: 28 },
  navItem: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 13, borderRadius: radii.md },
  navItemActive: { backgroundColor: colors.brandSecondarySoft, borderWidth: 1, borderColor: colors.brandSecondary },
  navLabel: { ...typeScale.body, color: colors.textSecondary },
  navLabelActive: { fontFamily: typeScale.bodyStrong.fontFamily, color: colors.brandPrimary },
  footer: { gap: 12, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.borderSubtle },
  userName: { ...typeScale.small, color: colors.textSecondary },
  signOut: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 9 },
  signOutText: { ...typeScale.small, fontFamily: typeScale.bodyStrong.fontFamily, color: colors.danger },
  main: { flex: 1, minWidth: 0 },
  fixedViewport: { flex: 1, minHeight: 0 },
  content: { width: '100%', maxWidth: layout.contentMax, alignSelf: 'center', padding: 24, paddingTop: 30, paddingBottom: 110, gap: 20 },
  contentWide: { maxWidth: layout.operationalMax },
  contentFixed: { maxWidth: '100%', flexGrow: 1 },
  mobileTopbar: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 10, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  mobileIdentity: { flex: 1, minWidth: 0 },
  mobileShop: { ...typeScale.label, color: colors.textMuted, textTransform: 'uppercase' },
  mobileUser: { ...typeScale.small, fontFamily: typeScale.bodyStrong.fontFamily, color: colors.text, marginTop: 2 },
  mobileSignOut: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: radii.md, borderWidth: 1, borderColor: colors.borderSubtle },
  bottomNav: { position: 'absolute', left: 10, right: 10, bottom: 8, minHeight: 64, flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6, paddingTop: 7, borderWidth: 1, borderColor: colors.borderSubtle, borderRadius: radii.xl, backgroundColor: 'rgba(255,255,255,0.97)', boxShadow: '0 12px 32px rgba(24,32,27,0.12)' },
  bottomItem: { flex: 1, minHeight: 48, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomLabel: { ...typeScale.label, color: colors.textMuted, fontSize: 11 },
  bottomLabelActive: { color: colors.brandPrimary },
  pressed: { opacity: 0.74, transform: [{ scale: 0.98 }] },
  loadingOverlay: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, zIndex: 50, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: 'rgba(245,245,242,0.86)' },
  loadingText: { ...typeScale.bodyStrong, color: colors.text },
});
