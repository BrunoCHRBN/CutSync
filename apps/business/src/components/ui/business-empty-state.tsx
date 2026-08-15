import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { BusinessButton } from '@/components/ui/business-ui';
import { businessTheme } from '@/theme/business-theme';

interface BusinessEmptyStateProps {
  testID: string;
  icon: ReactNode;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function BusinessEmptyState({
  testID,
  icon,
  title,
  description,
  actionLabel,
  onAction,
}: BusinessEmptyStateProps) {
  return (
    <View testID={testID} style={styles.container}>
      <View testID={`${testID}-icon`} style={styles.icon}>
        {icon}
      </View>
      <View style={styles.copy}>
        <Text testID={`${testID}-title`} selectable style={styles.title}>{title}</Text>
        <Text testID={`${testID}-description`} selectable style={styles.description}>
          {description}
        </Text>
      </View>
      {actionLabel && onAction ? (
        <BusinessButton
          testID={`${testID}-action`}
          label={actionLabel}
          variant="secondary"
          onPress={onAction}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    minHeight: 220,
    alignItems: 'flex-start',
    justifyContent: 'center',
    gap: businessTheme.spacing.md,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: businessTheme.colors.border,
    paddingVertical: businessTheme.spacing.xxl,
  },
  icon: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: businessTheme.radii.md,
    backgroundColor: businessTheme.colors.accentSoft,
  },
  copy: {
    gap: businessTheme.spacing.xs,
    maxWidth: 460,
  },
  title: {
    ...businessTheme.typography.heading,
    color: businessTheme.colors.text,
  },
  description: {
    ...businessTheme.typography.body,
    color: businessTheme.colors.textSoft,
  },
});