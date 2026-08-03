import { Link } from 'expo-router';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  alertCount = 0,
  compact = false,
}: {
  href: string;
  label: string;
  description?: string;
  accent: CloudModuleAccent;
  alertCount?: number;
  compact?: boolean;
}) {
  const showBadge = alertCount > 0;
  const accessibilityLabel = [
    `Abrir área ${label}`,
    description,
    showBadge ? `${alertCount} avisos acionáveis` : null,
  ].filter(Boolean).join('. ');

  return (
    <Link href={href as never} asChild>
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.card,
          compact && styles.cardCompact,
          {
            backgroundColor: cloudTheme.colors.surface,
            borderColor: cloudTheme.colors.border,
          },
          pressed && styles.pressed,
        ]}
      >
        <View style={[styles.accentBar, { backgroundColor: accentStrong[accent] }]} />
        <View style={styles.row}>
          <View style={[styles.iconWrap, { backgroundColor: accentSoft[accent] }]}>
            <Text style={[styles.iconGlyph, { color: accentStrong[accent] }]}>
              {label.slice(0, 1)}
            </Text>
          </View>
          <View style={styles.copy}>
            <View style={styles.titleRow}>
              <Text style={styles.label}>{label}</Text>
              {showBadge ? (
                <View
                  style={[styles.badge, { backgroundColor: accentSoft[accent] }]}
                  accessibilityElementsHidden
                >
                  <Text style={[styles.badgeText, { color: accentStrong[accent] }]}>
                    {alertCount > 99 ? '99+' : String(alertCount)}
                  </Text>
                </View>
              ) : null}
            </View>
            {description ? <Text style={styles.description}>{description}</Text> : null}
          </View>
          <Text style={[styles.chevron, { color: accentStrong[accent] }]} accessibilityElementsHidden>
            ›
          </Text>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
    minWidth: 220,
    minHeight: 120,
    width: '100%',
    flexGrow: 1,
    paddingTop: cloudTheme.spacing.lg + 2,
    paddingHorizontal: cloudTheme.spacing.lg,
    paddingBottom: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderRadius: cloudTheme.radii.md,
    overflow: 'hidden',
    backgroundColor: cloudTheme.colors.surface,
  },
  cardCompact: {
    minWidth: 0,
    minHeight: 120,
  },
  accentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 3,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.md,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: cloudTheme.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGlyph: {
    fontSize: 16,
    fontWeight: '800',
  },
  copy: { flex: 1, minWidth: 0, gap: 4 },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: cloudTheme.spacing.xs,
  },
  label: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '800',
    color: cloudTheme.colors.text,
  },
  description: {
    fontSize: 13,
    lineHeight: 19,
    color: cloudTheme.colors.textMuted,
  },
  badge: {
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  chevron: {
    fontSize: 22,
    fontWeight: '700',
    lineHeight: 24,
  },
  pressed: { opacity: 0.9, transform: [{ translateY: 1 }] },
});
