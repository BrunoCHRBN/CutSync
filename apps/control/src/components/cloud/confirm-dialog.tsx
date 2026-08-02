import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ControlButton } from '@/components/control-ui';
import { StatusBadge } from '@/components/cloud/status-badge';
import { cloudTheme, type CloudTone } from '@/theme/cloud-components';

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  cancelLabel = 'Cancelar',
  tone = 'warning',
  busy = false,
  onConfirm,
  onCancel,
  children,
  testID,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: Exclude<CloudTone, 'neutral' | 'info' | 'success'>;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: React.ReactNode;
  testID?: string;
}) {
  return (
    <View style={styles.card} testID={testID}>
      <StatusBadge label={tone === 'danger' ? 'DESTRUTIVO' : 'CONFIRMAÇÃO'} tone={tone} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {children}
      <View style={styles.actions}>
        <ControlButton
          disabled={busy}
          label={cancelLabel}
          onPress={onCancel}
          variant="secondary"
        />
        <ControlButton
          busy={busy}
          label={confirmLabel}
          onPress={onConfirm}
          variant={tone === 'danger' ? 'danger' : 'primary'}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: cloudTheme.spacing.md,
    padding: cloudTheme.spacing.xl,
    borderWidth: 1,
    borderColor: cloudTheme.colors.borderStrong,
    borderRadius: cloudTheme.radii.lg,
    backgroundColor: cloudTheme.colors.surface,
  },
  title: { ...cloudTheme.type.sectionTitle, color: cloudTheme.colors.text },
  description: { ...cloudTheme.type.body, color: cloudTheme.colors.textSecondary },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: cloudTheme.spacing.sm,
  },
});
