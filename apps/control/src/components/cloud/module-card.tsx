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
        accessibilityLabel={
          description ? `Abrir módulo ${label}. ${description}` : `Abrir módulo ${label}`
        }
        style={({ pressed }) => [
          styles.card,
          compact && styles.cardCompact,
          compact
            ? {
                backgroundColor: cloudTheme.colors.surface,
                borderColor: cloudTheme.colors.border,
              }
            : {
                backgroundColor: accentSoft[accent],
                borderColor: accentStrong[accent],
              },
          pressed && styles.interactive,
        ]}
      >
        {compact ? (
          <View style={[styles.accentBar, { backgroundColor: accentStrong[accent] }]} />
        ) : null}
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            { color: compact ? cloudTheme.colors.text : accentStrong[accent] },
          ]}
        >
          {label}
        </Text>
        {description ? (
          <Text style={[styles.description, compact && styles.descriptionCompact]}>
            {description}
          </Text>
        ) : null}
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
    position: 'relative',
    minWidth: 220,
    minHeight: cloudTheme.layout.moduleCardMinHeight,
    width: '100%',
    flexGrow: 1,
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.lg,
    overflow: 'hidden',
  },
  cardCompact: {
    minWidth: 0,
    minHeight: 168,
    height: '100%',
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
    gap: cloudTheme.spacing.sm,
    paddingTop: cloudTheme.spacing.xl,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingBottom: cloudTheme.spacing.lg,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  interactive: { opacity: 0.92, transform: [{ translateY: -1 }] },
  label: { ...cloudTheme.type.cardTitle },
  labelCompact: {
    fontSize: 20,
    lineHeight: 26,
    fontWeight: '800',
    textAlign: 'left',
  },
  description: {
    ...cloudTheme.type.body,
    color: cloudTheme.colors.textSecondary,
    flex: 1,
  },
  descriptionCompact: {
    flex: 0,
    fontSize: 13,
    lineHeight: 19,
    color: cloudTheme.colors.textMuted,
  },
  meta: { gap: cloudTheme.spacing.xs },
  work: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.text },
});
