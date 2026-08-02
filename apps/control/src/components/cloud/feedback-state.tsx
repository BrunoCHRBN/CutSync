import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ControlButton } from '@/components/control-ui';
import { StatusBadge } from '@/components/cloud/status-badge';
import { cloudTheme, type CloudTone } from '@/theme/cloud-components';

export type FeedbackKind = 'empty' | 'error' | 'maintenance' | 'partial';

const kindMeta: Record<FeedbackKind, { label: string; tone: CloudTone }> = {
  empty: { label: 'VAZIO', tone: 'neutral' },
  error: { label: 'ERRO', tone: 'danger' },
  maintenance: { label: 'MANUTENÇÃO', tone: 'warning' },
  partial: { label: 'ACESSO PARCIAL', tone: 'info' },
};

export function FeedbackState({
  kind,
  title,
  message,
  actionLabel,
  onAction,
}: {
  kind: FeedbackKind;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  const meta = kindMeta[kind];
  return (
    <View style={styles.card} accessibilityRole="summary">
      <StatusBadge label={meta.label} tone={meta.tone} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <ControlButton label={actionLabel} onPress={onAction} variant="secondary" />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.xl,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  title: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  message: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
});
