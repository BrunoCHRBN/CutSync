import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/cloud/status-badge';
import { cloudTheme, type CloudTone } from '@/theme/cloud-components';

export function PageHeader({
  eyebrow,
  title,
  description,
  badge,
  badgeTone = 'neutral',
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  badge?: string;
  badgeTone?: CloudTone;
  actions?: React.ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.copy}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <View style={styles.titleRow}>
          <Text style={styles.title}>{title}</Text>
          {badge ? <StatusBadge label={badge} tone={badgeTone} /> : null}
        </View>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      {actions ? <View style={styles.actions}>{actions}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.md,
  },
  copy: { flex: 1, minWidth: 220, gap: cloudTheme.spacing.xs },
  eyebrow: { ...cloudTheme.type.eyebrow, color: cloudTheme.colors.accent },
  titleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: cloudTheme.spacing.sm,
  },
  title: { ...cloudTheme.type.pageTitle, color: cloudTheme.colors.text },
  description: {
    ...cloudTheme.type.body,
    maxWidth: 720,
    color: cloudTheme.colors.textSecondary,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: cloudTheme.spacing.sm,
  },
});
