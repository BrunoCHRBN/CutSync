import React, { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { colors, layout, typeScale, typography } from '../../theme/tokens';

interface SectionHeadingProps {
  eyebrow?: string;
  title: string;
  description?: string;
  action?: ReactNode;
  testID?: string;
  variant?: 'page' | 'section';
}

export const SectionHeading = ({ eyebrow, title, description, action, testID, variant = 'page' }: SectionHeadingProps) => {
  const { width } = useWindowDimensions();
  const stacked = width < layout.mobileBreakpoint;

  return (
    <View testID={testID} style={[styles.row, stacked && styles.rowStacked]}>
      <View style={styles.copy}>
        {!!eyebrow && <Text testID={`${testID}-eyebrow`} style={styles.eyebrow}>{eyebrow}</Text>}
        <Text testID={`${testID}-title`} style={[styles.title, variant === 'section' && styles.sectionTitle]}>{title}</Text>
        {!!description && <Text testID={`${testID}-description`} style={styles.description}>{description}</Text>}
      </View>
      {!!action && <View style={[styles.action, stacked && styles.actionStacked]}>{action}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 16,
  },
  rowStacked: { alignItems: 'stretch', flexDirection: 'column' },
  copy: { flex: 1 },
  eyebrow: {
    color: colors.brand,
    fontFamily: typography.bodyStrong,
    fontSize: 11,
    lineHeight: 14,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  title: {
    color: colors.text,
    ...typeScale.pageTitle,
  },
  sectionTitle: { ...typeScale.sectionTitle },
  description: {
    color: colors.textSecondary,
    fontFamily: typography.body,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 7,
    maxWidth: 620,
  },
  action: { flexShrink: 0 },
  actionStacked: { alignSelf: 'stretch' },
});
