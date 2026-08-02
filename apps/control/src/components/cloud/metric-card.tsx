import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/cloud/status-badge';
import { cloudTheme, type CloudTone } from '@/theme/cloud-components';

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: CloudTone;
}) {
  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <StatusBadge label={tone === 'neutral' ? 'OK' : tone.toUpperCase()} tone={tone} />
      </View>
      <Text style={styles.value}>{value}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    minWidth: 180,
    flexGrow: 1,
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.lg,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: cloudTheme.spacing.sm,
  },
  label: { ...cloudTheme.type.smallStrong, color: cloudTheme.colors.textSecondary },
  value: { ...cloudTheme.type.metric, color: cloudTheme.colors.text },
  detail: { ...cloudTheme.type.small, color: cloudTheme.colors.textMuted },
});
