import React, { ReactNode, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CalendarDays, Compass, LogOut, Settings2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { BrandMark } from '../ui/BrandMark';
import { colors, glassHeader, glassSurface, layout, radii, typography } from '../../theme/tokens';
import { tapLight } from '../../utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ClientRoute = 'explore' | 'appointments' | 'settings';

interface ClientShellProps {
  children: ReactNode;
  activeRoute: ClientRoute;
  userName?: string;
  onSignOut: () => void;
  testID: string;
}

const navItems = [
  { key: 'explore', label: 'Explorar', shortcut: '1', path: '/(client)', Icon: Compass },
  { key: 'appointments', label: 'Agendamentos', shortcut: '2', path: '/(client)/appointments', Icon: CalendarDays },
  { key: 'settings', label: 'Configurações', shortcut: '3', path: '/(client)/preferences', Icon: Settings2 },
] as const;

export const ClientShell = ({ children, activeRoute, userName, onSignOut, testID }: ClientShellProps) => {
  const { width } = useWindowDimensions();
  const isDesktop = width >= layout.mobileBreakpoint;
  const router = useRouter();
  const insets = useSafeAreaInsets();

  useEffect(() => {
    if (typeof window === 'undefined' || Platform.OS !== 'web') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeEl = document.activeElement;
      const isTyping = activeEl && (
        activeEl.tagName === 'INPUT' || 
        activeEl.tagName === 'TEXTAREA' || 
        activeEl.getAttribute('contenteditable') === 'true'
      );

      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        const searchInput = document.querySelector('[testID="client-search-input"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
        return;
      }

      if (isTyping) return;

      if (e.key === '1') {
        router.replace('/(client)');
      } else if (e.key === '2') {
        router.replace('/(client)/appointments');
      } else if (e.key === '3') {
        router.replace('/(client)/preferences');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [router]);

  const isEmbed = typeof window !== 'undefined' && (window.location.search.includes('embed=true') || window.self !== window.top);

  if (isEmbed) {
    return (
      <View testID={testID} style={[styles.root, { paddingBottom: 0 }]}>
        <View style={styles.content}>{children}</View>
      </View>
    );
  }

  return (
    <View testID={testID} style={styles.root}>
      <View testID="client-shell-header" style={[styles.header, { paddingTop: Math.max(insets.top, 8) }]}>
        <BrandMark compact testID="client-shell-brand" />
        {isDesktop && (
          <View testID="client-desktop-navigation" style={styles.desktopNav}>
            {navItems.map(({ key, label, shortcut, path, Icon }) => {
              const active = activeRoute === key;
              return (
                <Pressable key={key} testID={`client-nav-${key}`} accessibilityRole="tab" accessibilityState={{ selected: active }} aria-selected={active} onPress={() => { tapLight(); router.replace(path as never); }} style={({ pressed }) => [styles.navItem, active && styles.navItemActive, pressed && styles.pressed]}>
                  <Icon color={active ? colors.ink : colors.textSecondary} size={15} strokeWidth={1.8} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {label} <Text style={active ? styles.shortcutHintActive : styles.shortcutHint}>[{shortcut}]</Text>
                  </Text>
                </Pressable>
              );
            })}
          </View>
        )}
        <View style={styles.headerSpacer} />
        {isDesktop && <View style={styles.identity}>
          <Text style={styles.identityLabel}>Conta do cliente</Text>
          <Text testID="client-shell-user-name" numberOfLines={1} style={styles.identityName}>{userName || 'Cliente'}</Text>
        </View>}
        <Pressable accessibilityLabel="Sair da conta" testID="client-sign-out-button" onPress={onSignOut} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}><LogOut color={colors.textSecondary} size={16} strokeWidth={1.8} /></Pressable>
      </View>

      <View style={styles.content}>{children}</View>

      {!isDesktop && (
        <View testID="client-bottom-navigation" style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 7) }]}>
          {navItems.map(({ key, label, path, Icon }) => {
            const active = activeRoute === key;
            return (
              <Pressable key={key} testID={`client-mobile-nav-${key}`} accessibilityRole="tab" accessibilityState={{ selected: active }} aria-selected={active} onPress={() => { tapLight(); router.replace(path as never); }} style={({ pressed }) => [styles.bottomItem, active && styles.bottomItemActive, pressed && styles.pressed]}>
                <Icon color={active ? colors.text : colors.textMuted} size={20} strokeWidth={active ? 2 : 1.7} />
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
  header: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    borderBottomWidth: Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
    zIndex: 100,
    ...glassHeader,
  },
  desktopNav: { flexDirection: 'row', gap: 5, marginLeft: 22 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill },
  navItemActive: { backgroundColor: colors.accent },
  navLabel: { color: colors.textSecondary, fontFamily: typography.bodyStrong, fontSize: 12 },
  navLabelActive: { color: colors.ink },
  shortcutHint: { color: colors.textMuted, fontSize: 11, fontFamily: typography.body },
  shortcutHintActive: { color: colors.brandSecondary, fontSize: 11, fontFamily: typography.bodyStrong },
  headerSpacer: { flex: 1 },
  identity: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
  identityLabel: { color: colors.labelSoft, fontFamily: typography.bodyStrong, fontSize: 11, textTransform: 'uppercase', letterSpacing: 1.2 },
  identityName: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 2 },
  iconButton: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radii.pill,
  },
  content: { flex: 1 },
  bottomNav: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 12,
    minHeight: 64,
    flexDirection: 'row',
    borderWidth: Platform.OS === 'web' ? (0.5 as number) : StyleSheet.hairlineWidth,
    borderColor: colors.hairline,
    borderRadius: radii.xl,
    padding: 7,
    ...glassSurface,
    ...Platform.select({
      web: { boxShadow: '0 16px 40px rgba(0,0,0,0.08)' } as any,
      default: { elevation: 8, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 8 } },
    }),
  },
  bottomItem: { flex: 1, minHeight: 50, alignItems: 'center', justifyContent: 'center', gap: 4, borderRadius: radii.lg },
  bottomItemActive: { backgroundColor: colors.brandSecondarySoft },
  bottomLabel: { color: colors.textMuted, fontFamily: typography.bodyStrong, fontSize: 11, letterSpacing: 0.2 },
  bottomLabelActive: { color: colors.text },
  pressed: { opacity: 0.7, transform: [{ scale: 0.98 }] },
});
