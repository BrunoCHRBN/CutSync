import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { StatusBadge } from '@/components/cloud/status-badge';
import { cloudTheme, type CloudTone } from '@/theme/cloud-components';

const toneSurface: Record<CloudTone, string> = {
  neutral: cloudTheme.colors.surface,
  info: cloudTheme.colors.infoSoft,
  success: cloudTheme.colors.successSoft,
  warning: cloudTheme.colors.warningSoft,
  danger: cloudTheme.colors.dangerSoft,
};

export function MetricCard({
  label,
  value,
  detail,
  tone = 'neutral',
  emphasize = false,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: CloudTone;
  emphasize?: boolean;
}) {
  return (
    <View
      style={[
        styles.card,
        emphasize && { backgroundColor: toneSurface[tone], borderColor: cloudToneBorder(tone) },
      ]}
    >
      <View style={styles.header}>
        <Text style={styles.label}>{label}</Text>
        <StatusBadge
          label={tone === 'neutral' ? 'OK' : tone.toUpperCase()}
          tone={tone}
        />
      </View>
      <Text style={styles.value}>{value}</Text>
      {detail ? <Text style={styles.detail}>{detail}</Text> : null}
    </View>
  );
}

function cloudToneBorder(tone: CloudTone): string {
  if (tone === 'success') return cloudTheme.colors.success;
  if (tone === 'warning') return cloudTheme.colors.warning;
  if (tone === 'danger') return cloudTheme.colors.danger;
  if (tone === 'info') return cloudTheme.colors.info;
  return cloudTheme.colors.border;
}

const styles = StyleSheet.create({
  card: {
    minWidth: 200,
    flexGrow: 1,
    flexBasis: 200,
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
