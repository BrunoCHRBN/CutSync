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
                styles.chip,
                selected && styles.chipSelected,
                pressed && styles.pressed,
              ]}
            >
              <View style={[styles.dot, selected && styles.dotSelected]} />
              <Text style={[styles.label, selected && styles.labelSelected]}>
                {module.label}
              </Text>
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
    alignItems: 'center',
    gap: cloudTheme.spacing.xs,
  },
  chip: {
    minHeight: cloudTheme.layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.xs,
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  chipSelected: {
    borderColor: cloudTheme.colors.brand,
    backgroundColor: cloudTheme.colors.brandSoft,
  },
  pressed: { opacity: 0.86 },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: cloudTheme.colors.borderStrong,
  },
  dotSelected: { backgroundColor: cloudTheme.colors.brand },
  label: { ...cloudTheme.type.button, color: cloudTheme.colors.textSecondary },
  labelSelected: { color: cloudTheme.colors.brand },
});
