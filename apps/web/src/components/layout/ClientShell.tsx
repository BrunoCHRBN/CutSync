import React, { ReactNode, useEffect } from 'react';
import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { CalendarDays, Compass, Headphones, LogOut, Settings2 } from 'lucide-react-native';
import { useRouter } from 'expo-router';
import { BrandMark } from '../ui/BrandMark';
import { layout, radii, typography } from '../../theme/tokens';
import { clientTheme } from '../../theme/client-tokens';
import { tapLight } from '../../utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

type ClientRoute = 'explore' | 'appointments' | 'support' | 'settings';

interface ClientShellProps {
  children: ReactNode;
  activeRoute: ClientRoute;
  userName?: string;
  onSignOut: () => void;
  testID: string;
}

const navItems = [
  { key: 'explore', label: 'Explorar', shortcut: '1', path: '/(client)', Icon: Compass },
  { key: 'appointments', label: 'Agenda', shortcut: '2', path: '/(client)/appointments', Icon: CalendarDays },
  { key: 'support', label: 'Suporte', shortcut: '3', path: '/(client)/support', Icon: Headphones },
  { key: 'settings', label: 'Perfil', shortcut: '4', path: '/(client)/preferences', Icon: Settings2 },
] as const;

const desktopLabels: Record<ClientRoute, string> = {
  explore: 'Explorar',
  appointments: 'Agendamentos',
  support: 'Suporte',
  settings: 'Configurações',
};

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
        router.replace('/(client)/support');
      } else if (e.key === '4') {
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
      <View testID="client-shell-header" style={[styles.header, !isDesktop && styles.headerCompact, { paddingTop: Math.max(insets.top, 10) }]}>
        <BrandMark compact variant="inverse" testID="client-shell-brand" />
        {isDesktop && (
          <View testID="client-desktop-navigation" style={styles.desktopNav}>
            {navItems.map(({ key, shortcut, path, Icon }) => {
              const active = activeRoute === key;
              return (
                <Pressable
                  key={key}
                  testID={`client-nav-${key}`}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: active }}
                  aria-selected={active}
                  onPress={() => { tapLight(); router.replace(path as never); }}
                  style={({ pressed, hovered }) => [styles.navItem, hovered && !active && styles.navItemHovered, active && styles.navItemActive, pressed && styles.pressed]}
                >
                  <Icon color={active ? clientTheme.navTextActive : 'rgba(255,255,255,0.78)'} size={15} strokeWidth={1.8} />
                  <Text style={[styles.navLabel, active && styles.navLabelActive]}>
                    {desktopLabels[key]} <Text style={active ? styles.shortcutHintActive : styles.shortcutHint}>[{shortcut}]</Text>
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
        <Pressable accessibilityLabel="Sair da conta" testID="client-sign-out-button" onPress={onSignOut} style={({ pressed }) => [styles.iconButton, pressed && styles.pressed]}>
          <LogOut color="rgba(255,255,255,0.85)" size={16} strokeWidth={1.8} />
        </Pressable>
      </View>

      <View style={styles.content}>{children}</View>

      {!isDesktop && (
        <View testID="client-bottom-navigation" style={[styles.bottomNav, { paddingBottom: Math.max(insets.bottom, 8) }]}>
          {navItems.map(({ key, label, path, Icon }) => {
            const active = activeRoute === key;
            return (
              <Pressable
                key={key}
                testID={`client-mobile-nav-${key}`}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                aria-selected={active}
                onPress={() => { tapLight(); router.replace(path as never); }}
                style={({ pressed }) => [styles.bottomItem, pressed && styles.pressed]}
              >
                <View style={[styles.bottomIconPill, active && styles.bottomIconPillActive]}>
                  <Icon color={active ? clientTheme.accent : '#8A8A85'} size={20} strokeWidth={active ? 2.1 : 1.7} />
                </View>
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
  root: { flex: 1, backgroundColor: '#F5F5F2' },
  header: {
    minHeight: 68,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 20,
    paddingBottom: 10,
    backgroundColor: clientTheme.navBg,
    zIndex: 100,
    ...Platform.select({
      web: { position: 'sticky' as any, top: 0, boxShadow: '0 6px 24px rgba(24,32,27,0.16)' } as any,
      default: {},
    }),
  },
  headerCompact: { minHeight: 58 },
  desktopNav: { flexDirection: 'row', gap: 4, marginLeft: 26 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 7, minHeight: 40, paddingHorizontal: 14, borderRadius: radii.pill },
  navItemHovered: { backgroundColor: 'rgba(255,255,255,0.08)' },
  navItemActive: { backgroundColor: clientTheme.navPillActive },
  navLabel: { color: 'rgba(255,255,255,0.78)', fontFamily: typography.bodyStrong, fontSize: 12 },
  navLabelActive: { color: clientTheme.navTextActive },
  shortcutHint: { color: 'rgba(255,255,255,0.42)', fontSize: 11, fontFamily: typography.body },
  shortcutHintActive: { color: 'rgba(44,67,52,0.55)', fontSize: 11, fontFamily: typography.bodyStrong },
  headerSpacer: { flex: 1 },
  identity: { flex: 1, alignItems: 'flex-end', minWidth: 0 },
  identityLabel: { color: 'rgba(255,255,255,0.5)', fontFamily: typography.bodyStrong, fontSize: 10, textTransform: 'uppercase', letterSpacing: 1.2 },
  identityName: { color: '#FFFFFF', fontFamily: typography.bodyStrong, fontSize: 12, marginTop: 2 },
  iconButton: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    borderRadius: radii.pill,
  },
  content: { flex: 1 },
  bottomNav: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 64,
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: clientTheme.cardBorder,
    paddingTop: 8,
    paddingHorizontal: 8,
    zIndex: 50,
    ...Platform.select({
      web: { boxShadow: '0 -8px 28px rgba(24,32,27,0.08)' } as any,
      default: { elevation: 12, shadowColor: '#000', shadowOpacity: 0.08, shadowRadius: 14, shadowOffset: { width: 0, height: -6 } },
    }),
  },
  bottomItem: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 3, minHeight: 52 },
  bottomIconPill: { width: 48, height: 28, borderRadius: radii.pill, alignItems: 'center', justifyContent: 'center' },
  bottomIconPillActive: { backgroundColor: clientTheme.accentSoft },
  bottomLabel: { color: '#8A8A85', fontFamily: typography.bodyStrong, fontSize: 10.5, letterSpacing: 0.2 },
  bottomLabelActive: { color: clientTheme.accent },
  pressed: { opacity: 0.72, transform: [{ scale: 0.97 }] },
});
