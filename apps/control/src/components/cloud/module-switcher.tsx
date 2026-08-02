import { Link, usePathname } from 'expo-router';
import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import {
  modulesForSwitcher,
  resolveActiveNavModule,
} from '@/navigation/module-nav';
import { cloudTheme } from '@/theme/cloud-components';

export function ModuleSwitcher({
  onNavigate,
}: {
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { can } = useControlAuth();
  const modules = modulesForSwitcher(can);
  const active = resolveActiveNavModule(pathname);

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      accessibilityRole="tablist"
    >
      {modules.map((module) => {
        const selected = module.id === active.id;
        return (
          <Link key={module.id} href={module.href} asChild>
            <Pressable
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              accessibilityLabel={`Alternar para ${module.label}`}
              onPress={onNavigate}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabSelected,
                pressed && styles.pressed,
              ]}
            >
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {module.label}
              </Text>
              <View style={[styles.underline, selected && styles.underlineSelected]} />
            </Pressable>
          </Link>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: cloudTheme.spacing.sm,
    minHeight: cloudTheme.layout.touchTarget,
  },
  tab: {
    minHeight: cloudTheme.layout.touchTarget,
    justifyContent: 'center',
    paddingHorizontal: cloudTheme.spacing.sm,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabSelected: {},
  pressed: { opacity: 0.75 },
  label: {
    ...cloudTheme.type.button,
    color: cloudTheme.colors.textSecondary,
  },
  labelSelected: {
    color: cloudTheme.colors.brand,
    fontWeight: '800',
  },
  underline: {
    position: 'absolute',
    left: 8,
    right: 8,
    bottom: 0,
    height: 2,
    backgroundColor: 'transparent',
  },
  underlineSelected: {
    backgroundColor: cloudTheme.colors.brand,
  },
});
