import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useControlAuth } from '@/contexts/control-auth-context';
import { modulesVisibleTo, type CloudModule } from '@/navigation/module-registry';
import { cloudTheme } from '@/theme/cloud-components';

const accentMap: Record<CloudModule['accent'], string> = {
  blue: cloudTheme.colors.accentBlue,
  green: cloudTheme.colors.accentGreen,
  violet: cloudTheme.colors.accentViolet,
  amber: cloudTheme.colors.accentAmber,
};

export function ModuleSwitcher({
  compact = false,
  onNavigate,
}: {
  compact?: boolean;
  onNavigate?: () => void;
}) {
  const { can } = useControlAuth();
  const modules = modulesVisibleTo(can);

  return (
    <View style={[styles.row, compact && styles.column]}>
      {modules.map((module) => (
        <Link key={module.id} href={module.href} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Abrir módulo ${module.label}`}
            onPress={onNavigate}
            style={({ pressed }) => [
              styles.chip,
              { borderColor: accentMap[module.accent] },
              pressed && styles.pressed,
            ]}
          >
            <View style={[styles.dot, { backgroundColor: accentMap[module.accent] }]} />
            <Text style={styles.label}>{module.label}</Text>
          </Pressable>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.xs,
  },
  column: { flexDirection: 'column' },
  chip: {
    minHeight: cloudTheme.layout.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.xs,
    paddingHorizontal: cloudTheme.spacing.md,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  pressed: { opacity: 0.86 },
  dot: { width: 8, height: 8, borderRadius: 99 },
  label: { ...cloudTheme.type.button, color: cloudTheme.colors.text },
});
