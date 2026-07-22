import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, typography } from '../../theme/tokens';

interface EmptyStateProps {
  title: string;
  description: string;
  testID?: string;
  icon?: ReactNode;
  action?: ReactNode;
}

export const EmptyState = ({ title, description, testID, icon, action }: EmptyStateProps) => (
  <View testID={testID} style={styles.container}>
    {!!icon && <View style={styles.icon}>{icon}</View>}
    <Text testID={`${testID}-title`} style={styles.title}>{title}</Text>
    <Text testID={`${testID}-description`} style={styles.description}>{description}</Text>
    {action}
  </View>
);

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.canvasSoft,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    padding: 34,
  },
  icon: {
    width: 46,
    height: 46,
    borderRadius: radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.brandSoft,
    marginBottom: 14,
  },
  title: { color: colors.text, fontFamily: typography.bodyStrong, fontSize: 14 },
  description: {
    color: colors.textMuted,
    fontFamily: typography.body,
    fontSize: 11,
    lineHeight: 17,
    textAlign: 'center',
    maxWidth: 390,
    marginTop: 6,
    marginBottom: 14,
  },
});