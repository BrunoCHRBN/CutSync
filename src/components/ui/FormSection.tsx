import React, { ReactNode } from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';
import { colors, typography } from '../../theme/tokens';
import { AppCard } from './AppCard';

interface FormSectionProps {
  title: string;
  description?: string;
  testID: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

export const FormSection = ({ title, description, testID, children, style }: FormSectionProps) => (
  <AppCard testID={testID} style={[styles.card, style]}>
    <View style={styles.heading}>
      <Text testID={`${testID}-title`} style={styles.title}>{title}</Text>
      {!!description && <Text style={styles.description}>{description}</Text>}
    </View>
    <View style={styles.content}>{children}</View>
  </AppCard>
);

const styles = StyleSheet.create({
  card: { gap: 20 },
  heading: { paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
  title: { color: colors.text, fontFamily: typography.display, fontSize: 17, letterSpacing: -0.4 },
  description: { color: colors.textMuted, fontFamily: typography.body, fontSize: 10, lineHeight: 16, marginTop: 5, maxWidth: 580 },
  content: { gap: 16 },
});