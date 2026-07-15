import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, typography } from '../../theme/tokens';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  testID: string;
}

export const SectionHeading = ({ eyebrow, title, description, action, testID }: SectionHeadingProps) => (
  <View testID={testID} style={styles.row}>
    <View style={styles.copy}>
      {!!eyebrow && <Text testID={`${testID}-eyebrow`} style={styles.eyebrow}>{eyebrow}</Text>}
      <Text testID={`${testID}-title`} style={styles.title}>{title}</Text>
      {!!description && <Text testID={`${testID}-description`} style={styles.description}>{description}</Text>}
    </View>
    {action}
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  copy: { flex: 1 },
  eyebrow: {
    color: colors.brand,
    fontFamily: typography.bodyStrong,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    fontFamily: typography.display,
    fontSize: 30,
    letterSpacing: -1.25,
    lineHeight: 35,
  },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: 620,
  },
});