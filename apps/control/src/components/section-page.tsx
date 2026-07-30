import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { ControlCard, ControlStatusBadge } from '@/components/control-ui';
import {
  controlColors,
  controlLayout,
  controlSpacing,
  controlType,
} from '@/theme/tokens';

interface SectionPageProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function SectionPage({ eyebrow, title, description, children }: SectionPageProps) {
  const { width } = useWindowDimensions();
  const mobile = width < controlLayout.mobileBreakpoint;

  return (
    <View style={[styles.page, mobile && styles.pageMobile]}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={[styles.title, mobile && styles.titleMobile]}>{title}</Text>
        <Text style={styles.description}>{description}</Text>
      </View>
      {children}
    </View>
  );
}

export function PendingIntegration({
  source,
  detail,
}: {
  source: string;
  detail: string;
}) {
  return (
    <ControlCard style={styles.pendingCard}>
      <ControlStatusBadge label="FONTE EM PREPARAÇÃO" tone="warning" />
      <Text style={styles.pendingTitle}>{source}</Text>
      <Text style={styles.pendingDetail}>{detail}</Text>
      <Text style={styles.noData}>Nenhum valor simulado é exibido.</Text>
    </ControlCard>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: controlLayout.contentMax,
    alignSelf: 'center',
    gap: controlSpacing.xl,
    padding: controlSpacing.xxl,
  },
  pageMobile: { paddingHorizontal: controlSpacing.lg, paddingVertical: controlSpacing.xl },
  heading: { gap: controlSpacing.xs },
  eyebrow: { ...controlType.eyebrow, color: controlColors.accent },
  title: { ...controlType.pageTitle, color: controlColors.text },
  titleMobile: { ...controlType.pageTitleCompact },
  description: {
    ...controlType.body,
    maxWidth: controlLayout.formMax,
    color: controlColors.textSecondary,
  },
  pendingCard: { maxWidth: 700, padding: controlSpacing.xl },
  pendingTitle: { ...controlType.sectionTitle, color: controlColors.text },
  pendingDetail: { ...controlType.body, color: controlColors.textSecondary },
  noData: { ...controlType.smallStrong, color: controlColors.textMuted },
});
