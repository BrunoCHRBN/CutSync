import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { GlobalSearch } from '@/components/cloud/global-search';
import { ModuleSwitcher } from '@/components/cloud/module-switcher';
import { cloudTheme } from '@/theme/cloud-components';

export function CloudTopbar({
  environmentLabel,
  menuOpen,
  onToggleMenu,
  showMenuButton,
}: {
  environmentLabel: string;
  menuOpen: boolean;
  onToggleMenu: () => void;
  showMenuButton: boolean;
}) {
  return (
    <View style={styles.bar}>
      <View style={styles.brandBlock}>
        <Text style={styles.eyebrow}>CUTSYNC</Text>
        <Text style={styles.title}>Cloud</Text>
        <View style={styles.envBadge}>
          <Text style={styles.envText}>{environmentLabel}</Text>
        </View>
      </View>

      <View style={styles.tools}>
        <View style={styles.search}>
          <GlobalSearch />
        </View>
        <ModuleSwitcher />
      </View>

      {showMenuButton ? (
        <Pressable
          accessibilityLabel={menuOpen ? 'Fechar menu do Cloud' : 'Abrir menu do Cloud'}
          accessibilityRole="button"
          accessibilityState={{ expanded: menuOpen }}
          onPress={onToggleMenu}
          style={({ pressed }) => [styles.menuButton, pressed && styles.pressed]}
        >
          <Text style={styles.menuText}>{menuOpen ? 'Fechar' : 'Menu'}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: cloudTheme.layout.topbarHeight,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingVertical: cloudTheme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.brandLine,
    backgroundColor: cloudTheme.colors.brandDark,
  },
  brandBlock: {
    minWidth: 120,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  eyebrow: {
    color: cloudTheme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
  },
  title: {
    color: cloudTheme.colors.sidebarTextStrong,
    fontSize: 22,
    fontWeight: '800',
  },
  envBadge: {
    paddingHorizontal: cloudTheme.spacing.sm,
    paddingVertical: cloudTheme.spacing.xxs,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brandLine,
    borderRadius: cloudTheme.radii.pill,
    backgroundColor: cloudTheme.colors.brandPanel,
  },
  envText: {
    color: cloudTheme.colors.accentSoft,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  tools: {
    flex: 1,
    minWidth: 240,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  search: { flex: 1, minWidth: 200, maxWidth: 420 },
  menuButton: {
    minHeight: cloudTheme.layout.touchTarget,
    minWidth: 76,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.brandLine,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.brandPanel,
  },
  pressed: { opacity: 0.82 },
  menuText: { color: cloudTheme.colors.sidebarTextStrong, fontWeight: '800' },
});
