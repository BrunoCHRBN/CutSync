import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import {
  isNavItemSelected,
  navItemsForModule,
  rememberLastModule,
  resolveActiveNavModule,
} from '@/navigation/module-nav';
import { cloudTheme } from '@/theme/cloud-components';

export function CloudSidebar({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { can } = useControlAuth();
  const activeModule = resolveActiveNavModule(pathname);
  const items = navItemsForModule(activeModule.id, can);

  React.useEffect(() => {
    rememberLastModule(activeModule.id);
  }, [activeModule.id]);

  return (
    <View style={[styles.sidebar, compact && styles.sidebarCompact]}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>MÓDULO</Text>
        <Text style={styles.moduleTitle}>{activeModule.label}</Text>
      </View>

      <View style={styles.nav}>
        {items.map((item) => {
          const selected = isNavItemSelected(pathname, item);
          return (
            <Link key={`${item.id}-${item.href}`} href={item.href} asChild>
              <Pressable
                accessibilityRole="link"
                accessibilityState={{ selected }}
                onPress={onNavigate}
                style={StyleSheet.flatten([
                  styles.item,
                  selected && styles.itemSelected,
                ])}
              >
                <View style={[styles.marker, selected && styles.markerSelected]} />
                <Text style={[styles.itemText, selected && styles.itemTextSelected]}>
                  {item.label}
                </Text>
              </Pressable>
            </Link>
          );
        })}
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerLabel}>Ambiente</Text>
        <Text style={styles.footerValue}>
          {(
            process.env.EXPO_PUBLIC_CONTROL_ENVIRONMENT
            ?? process.env.EXPO_PUBLIC_APP_ENV
            ?? 'homologation'
          ).toUpperCase()}
        </Text>
        <Text style={styles.footerMeta}>CutSync Cloud</Text>
        <Text style={styles.footerHelp}>Ajuda e documentação</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sidebar: {
    width: cloudTheme.layout.sidebarWidth,
    flex: 1,
    gap: cloudTheme.spacing.lg,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingVertical: cloudTheme.spacing.xl,
    backgroundColor: cloudTheme.colors.brandDark,
    borderRightWidth: 1,
    borderRightColor: cloudTheme.colors.brandLine,
  },
  sidebarCompact: {
    width: '100%',
    borderRightWidth: 0,
  },
  header: { gap: 4 },
  eyebrow: {
    color: cloudTheme.colors.sidebarTextMuted,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
  },
  moduleTitle: {
    color: cloudTheme.colors.sidebarTextStrong,
    fontSize: 20,
    fontWeight: '800',
  },
  nav: { flex: 1, gap: cloudTheme.spacing.xxs },
  item: {
    minHeight: cloudTheme.layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.sm,
    borderRadius: cloudTheme.radii.md,
  },
  itemSelected: { backgroundColor: cloudTheme.colors.brandPanel },
  marker: {
    width: 3,
    height: 18,
    borderRadius: cloudTheme.radii.pill,
    backgroundColor: 'transparent',
  },
  markerSelected: { backgroundColor: cloudTheme.colors.accentSoft },
  itemText: { flex: 1, color: cloudTheme.colors.sidebarText, fontWeight: '600' },
  itemTextSelected: { color: cloudTheme.colors.sidebarTextStrong, fontWeight: '800' },
  footer: {
    gap: 4,
    paddingTop: cloudTheme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.brandLine,
  },
  footerLabel: { ...cloudTheme.type.caption, color: cloudTheme.colors.sidebarTextMuted },
  footerValue: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.sidebarTextStrong },
  footerMeta: { ...cloudTheme.type.small, color: cloudTheme.colors.sidebarText },
  footerHelp: { ...cloudTheme.type.small, color: cloudTheme.colors.accentSoft, marginTop: 6 },
});
