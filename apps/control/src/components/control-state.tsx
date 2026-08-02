import React from 'react';
import { ActivityIndicator, StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ControlButton, ControlCard } from '@/components/control-ui';
import {
  controlColors,
  controlLayout,
  controlSpacing,
  controlType,
} from '@/theme/tokens';

interface ControlStateProps {
  title?: string;
  message?: string;
  actionLabel?: string;
  onAction?: () => void;
  loading?: boolean;
}

export function ControlState({
  title = 'CutSync Cloud',
  message,
  actionLabel,
  onAction,
  loading = false,
}: ControlStateProps) {
  const { width } = useWindowDimensions();
  const mobile = width < controlLayout.mobileBreakpoint;

  return (
    <View style={[styles.page, mobile && styles.pageMobile]}>
      <ControlCard style={[styles.card, mobile && styles.cardMobile]}>
        {loading ? <ActivityIndicator size="large" color={controlColors.brand} /> : null}
        <Text style={styles.title}>{title}</Text>
        {message ? <Text selectable style={styles.message}>{message}</Text> : null}
        {actionLabel && onAction ? (
          <ControlButton label={actionLabel} onPress={onAction} />
        ) : null}
      </ControlCard>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: controlSpacing.xl,
    backgroundColor: controlColors.canvas,
  },
  pageMobile: { padding: controlSpacing.lg },
  card: {
    maxWidth: 480,
    alignItems: 'stretch',
    padding: controlSpacing.xl,
  },
  cardMobile: { padding: controlSpacing.lg },
  title: { ...controlType.pageTitleCompact, color: controlColors.text, textAlign: 'center' },
  message: { ...controlType.body, color: controlColors.textSecondary, textAlign: 'center' },
});
