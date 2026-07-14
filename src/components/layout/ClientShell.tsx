import React, { ReactNode } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CalendarDays, Compass, LogOut, RefreshCw } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { BrandMark } from '../ui/BrandMark';
import { StatusBadge } from '../ui/StatusBadge';
import { colors, layout, radii, typography } from '../../theme/tokens';

type ClientRoute = 'explore' | 'appointments';

interface ClientShellProps {
  children: ReactNode;
  activeRoute: ClientRoute;
  userName?: string;
  isSyncing: boolean;
  syncError: Error | null;
  onSync: () => void;
  onSignOut: () => void;
  testID: string;
}

const navItems = [
  { key: 'explore', label: 'Explorar', path: '/(client)', Icon: Compass },
  { key: 'appointments', label: 'Agendamentos', path: '/(client)/appointments', Icon: CalendarDays },
] as const;

export const ClientShell = ({ children, activeRoute, userName, isSyncing, syncError, onSync, onSignOut, testID }: ClientShellProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.mobileBreakpoint;
  const router = useRouter();

  return (
    <View testID={testID} style={styles.root}>
      <View testID="client-shell-header" style={styles.header}>
        <BrandMark compact testID="client-shell-brand" />
        {isDesktop && (
          <View testID="client-desktop-navigation" style={styles.desktopNav}>
            {navItems.map(({ key, label, path, Icon }) => {
              const active = activeRoute === key;
              return (
                <Pressable key={key} testID={`client-nav-${key}`} onPress={() => router.push(path as never)} style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}>
                  <Icon color={active ? colors.ink : colors.textSecondary} size={16} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={styles.identity}>
          <Text style={styles.identityLabel}>Conta do cliente</Text>
          <Text testID="client-shell-user-name" numberOfLines={1} style={styles.identityName}>{userName || 'Cliente'}</Text>
        </View>
        <StatusBadge testID="client-shell-sync-status" label={syncError ? 'Falha' : isSyncing ? 'Sincronizando' : 'Sincronizado'} tone={syncError ? 'danger' : isSyncing ? 'warning' : 'success'} />
        <Pressable testID="client-sync-button" disabled={isSyncing} onPress={onSync} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><RefreshCw color={colors.textSecondary} size={17} /></Pressable>
        <Pressable testID="client-sign-out-button" onPress={onSignOut} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><LogOut color={colors.danger} size={17} /></Pressable>
      </View>

      <View style={styles.content}>{children}</View>

      {!isDesktop && (
        <View testID="client-bottom-navigation" style={styles.bottomNav}>
          {navItems.map(({ key, label, path, Icon }) => {
            const active = activeRoute === key;
            return (
              <Pressable key={key} testID={`client-mobile-nav-${key}`} onPress={() => router.push(path as never)} style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}>
                <Icon color={active ? colors.brand : colors.textMuted} size={20} />
                <Text style={[styles.bottomLabel, active && styles.bottomLabelActive]}>{label}</Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.canvas },
  header: { minHeight: 72, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 20, backgroundColor: colors.surface + 'F2', borderBottomWidth: 1, borderBottomColor: colors.border, zIndex: 5 },
  desktopNav: { flexDirection: 'row', gap: 5, marginLeft: 22 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 12, borderRadius: radii.md },
  navItemActive: { backgroundColor: colors.brand },
  navLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 10 },
  navLabelActive: { color: colors.ink },
  identity: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
  identityLabel: { color: colors.textMuted, fontFamily: typography.body, fontSize: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  identityName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 11, marginTop: 2 },
  iconButton: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radii.md },
  content: { flex: 1 },
  bottomNav: { position: 'absolute', left: 16, right: 16, bottom: 12, minHeight: 66, flexDirection: 'row', backgroundColor: colors.surface + 'F2', borderWidth: 1, borderColor: colors.border, borderRadius: radii.xl, padding: 7, ...Platform.select({ web: { boxShadow: '0 8px 24px rgba(0,0,0,0.06)' } as any, default: { elevation: 8, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 12 } }) },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  bottomLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 9 },
  bottomLabelActive: { color: colors.brand },
  pressed: { opacity: 0.65, transform: [{ scale: 0.98 }] },
});