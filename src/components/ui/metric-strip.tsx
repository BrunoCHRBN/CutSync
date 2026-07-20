import React, { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radii, typeScale } from '../../theme/tokens';

export interface MetricStripItem {
  key: string;
  testID?: string;
  label: string;
  value: string;
  note?: string;
  icon?: ReactNode;
}

interface MetricStripProps {
  items: MetricStripItem[];
  testID: string;
}

export const MetricStrip = ({ items, testID }: MetricStripProps) => (
  <View testID={testID} style={styles.container}>
    {items.map((item) => (
      <View key={item.key} testID={item.testID || `${testID}-${item.key}`} style={styles.item}>
        <View style={styles.labelRow}>
          {item.icon}
          <Text style={styles.label}>{item.label}</Text>
        </View>
        <Text testID={item.testID ? `${item.testID}-value` : `${testID}-${item.key}-value`} selectable style={styles.value}>{item.value}</Text>
        {!!item.note && <Text style={styles.note}>{item.note}</Text>}
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radii.lg,
  },
  item: {
    flex: 1,
    minWidth: 180,
    paddingHorizontal: 18,
    paddingVertical: 15,
    borderRightWidth: 1,
    borderRightColor: colors.borderSubtle,
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  label: { ...typeScale.label, color: colors.textSecondary, textTransform: 'uppercase' },
  value: { ...typeScale.cardTitle, color: colors.text, marginTop: 8, fontVariant: ['tabular-nums'] },
  note: { ...typeScale.small, color: colors.textMuted, marginTop: 2 },
});
