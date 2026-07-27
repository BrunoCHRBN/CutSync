import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

interface SectionPageProps {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}

export function SectionPage({ eyebrow, title, description, children }: SectionPageProps) {
  return (
    <View style={styles.page}>
      <View style={styles.heading}>
        <Text style={styles.eyebrow}>{eyebrow}</Text>
        <Text style={styles.title}>{title}</Text>
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
    <View style={styles.pendingCard}>
      <Text style={styles.pendingLabel}>FONTE EM PREPARAÇÃO</Text>
      <Text style={styles.pendingTitle}>{source}</Text>
      <Text style={styles.pendingDetail}>{detail}</Text>
      <Text style={styles.noData}>Nenhum valor simulado é exibido.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 24, padding: 32 },
  heading: { gap: 7 },
  eyebrow: { color: '#347452', fontSize: 11, fontWeight: '800', letterSpacing: 1.6 },
  title: { color: '#17231c', fontSize: 30, fontWeight: '800' },
  description: { maxWidth: 720, color: '#667269', lineHeight: 22 },
  pendingCard: {
    maxWidth: 700,
    gap: 8,
    padding: 24,
    borderWidth: 1,
    borderColor: '#d8dfd8',
    borderRadius: 16,
    backgroundColor: '#ffffff',
  },
  pendingLabel: { color: '#8b6a32', fontSize: 10, fontWeight: '800', letterSpacing: 1.4 },
  pendingTitle: { color: '#17231c', fontSize: 19, fontWeight: '700' },
  pendingDetail: { color: '#667269', lineHeight: 21 },
  noData: { color: '#7b857e', fontSize: 12, fontWeight: '600' },
});
