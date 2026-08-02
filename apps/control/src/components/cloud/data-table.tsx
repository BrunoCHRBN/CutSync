import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

import { cloudTheme } from '@/theme/cloud-components';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  width?: number | string;
  render: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = 'Nenhum registro.',
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
}) {
  const { width } = useWindowDimensions();
  const compact = width < cloudTheme.layout.compactBreakpoint;

  if (!rows.length) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  if (compact) {
    return (
      <View style={styles.cardList}>
        {rows.map((row) => (
          <View key={rowKey(row)} style={styles.mobileCard}>
            {columns.map((column) => (
              <View key={column.key} style={styles.mobileRow}>
                <Text style={styles.mobileHeader}>{column.header}</Text>
                <View style={styles.mobileValue}>{asNode(column.render(row))}</View>
              </View>
            ))}
          </View>
        ))}
      </View>
    );
  }

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        {columns.map((column) => (
          <Text key={column.key} style={[styles.headerCell, column.width ? { width: column.width as number } : styles.flexCell]}>
            {column.header}
          </Text>
        ))}
      </View>
      {rows.map((row) => (
        <View key={rowKey(row)} style={styles.bodyRow}>
          {columns.map((column) => (
            <View
              key={column.key}
              style={[styles.bodyCell, column.width ? { width: column.width as number } : styles.flexCell]}
            >
              {asNode(column.render(row))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function asNode(value: React.ReactNode) {
  if (typeof value === 'string' || typeof value === 'number') {
    return <Text style={styles.cellText}>{value}</Text>;
  }
  return value;
}

const styles = StyleSheet.create({
  table: {
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    overflow: 'hidden',
    backgroundColor: cloudTheme.colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    backgroundColor: cloudTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  bodyRow: {
    flexDirection: 'row',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.borderSubtle,
  },
  headerCell: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  bodyCell: { justifyContent: 'center' },
  flexCell: { flex: 1, minWidth: 120 },
  cellText: { ...cloudTheme.type.small, color: cloudTheme.colors.text },
  empty: { ...cloudTheme.type.body, color: cloudTheme.colors.textMuted },
  cardList: { gap: cloudTheme.spacing.sm },
  mobileCard: {
    gap: cloudTheme.spacing.sm,
    padding: cloudTheme.spacing.md,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.md,
    backgroundColor: cloudTheme.colors.surface,
  },
  mobileRow: { gap: 2 },
  mobileHeader: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  mobileValue: {},
});
