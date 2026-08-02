import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/cloud/status-badge';
import type { CloudModuleAccent } from '@/navigation/module-registry';
import { cloudTheme } from '@/theme/cloud-components';

const accentSoft: Record<CloudModuleAccent, string> = {
  blue: cloudTheme.colors.accentBlueSoft,
  green: cloudTheme.colors.accentGreenSoft,
  violet: cloudTheme.colors.accentVioletSoft,
  amber: cloudTheme.colors.accentAmberSoft,
};

const accentStrong: Record<CloudModuleAccent, string> = {
  blue: cloudTheme.colors.accentBlue,
  green: cloudTheme.colors.accentGreen,
  violet: cloudTheme.colors.accentViolet,
  amber: cloudTheme.colors.accentAmber,
};

export function ModuleCard({
  href,
  label,
  description,
  accent,
  availabilityLabel,
  workLabel,
  compact = false,
}: {
  href: string;
  label: string;
  description?: string;
  accent: CloudModuleAccent;
  availabilityLabel?: string;
  workLabel?: string;
  compact?: boolean;
}) {
  return (
    <Link href={href} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Abrir módulo ${label}`}
        style={({ pressed }) => [
          styles.card,
          compact && styles.cardCompact,
          {
            backgroundColor: accentSoft[accent],
            borderColor: accentStrong[accent],
          },
          pressed && styles.interactive,
        ]}
      >
        <Text style={[styles.label, compact && styles.labelCompact, { color: accentStrong[accent] }]}>
          {label}
        </Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
        {(availabilityLabel || workLabel) ? (
          <View style={styles.meta}>
            {availabilityLabel ? <StatusBadge label={availabilityLabel} tone="success" /> : null}
            {workLabel ? <Text style={styles.work}>{workLabel}</Text> : null}
          </View>
        ) : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 220,
    minHeight: cloudTheme.layout.moduleCardMinHeight,
    flexGrow: 1,
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.lg,
  },
  cardCompact: {
    minWidth: 0,
    minHeight: 140,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: cloudTheme.spacing.xl,
  },
  interactive: { opacity: 0.9, transform: [{ translateY: -1 }] },
  label: { ...cloudTheme.type.cardTitle },
  labelCompact: {
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'center',
  },
  description: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary, flex: 1 },
  meta: { gap: cloudTheme.spacing.xs },
  work: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
});
