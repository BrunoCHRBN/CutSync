import React from 'react';
import { StyleSheet, Text, useWindowDimensions, View, type StyleProp, type ViewStyle } from 'react-native';

import { cloudTheme } from '@/theme/cloud-components';

export type DataTableColumn<T> = {
  key: string;
  header: string;
  width?: number | string;
  /** Relative flex grow when no fixed width is set. Defaults to 1. */
  flex?: number;
  render: (row: T) => React.ReactNode;
};

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  emptyLabel = 'Nenhum registro.',
  style,
}: {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { width } = useWindowDimensions();
  const compact = width < cloudTheme.layout.compactBreakpoint;

  if (!rows.length) {
    return <Text style={styles.empty}>{emptyLabel}</Text>;
  }

  if (compact) {
    return (
      <View style={[styles.cardList, style]}>
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
    <View style={[styles.table, style]}>
      <View style={styles.headerRow}>
        {columns.map((column) => (
          <View key={column.key} style={columnStyle(column)}>
            <Text style={styles.headerCell}>{column.header}</Text>
          </View>
        ))}
      </View>
      {rows.map((row) => (
        <View key={rowKey(row)} style={styles.bodyRow}>
          {columns.map((column) => (
            <View key={column.key} style={[styles.bodyCell, columnStyle(column)]}>
              {asNode(column.render(row))}
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

function columnStyle<T>(column: DataTableColumn<T>): StyleProp<ViewStyle> {
  if (column.width != null) {
    return { width: column.width as number, flexGrow: 0, flexShrink: 0 };
  }
  return {
    flexGrow: column.flex ?? 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  };
}

function asNode(value: React.ReactNode) {
  if (typeof value === 'string' || typeof value === 'number') {
    return <Text style={styles.cellText}>{value}</Text>;
  }
  return value;
}

const styles = StyleSheet.create({
  table: {
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: cloudTheme.radii.lg,
    overflow: 'hidden',
    backgroundColor: cloudTheme.colors.surface,
  },
  headerRow: {
    flexDirection: 'row',
    width: '100%',
    gap: cloudTheme.spacing.sm,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.sm,
    backgroundColor: cloudTheme.colors.surfaceMuted,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  bodyRow: {
    flexDirection: 'row',
    width: '100%',
    gap: cloudTheme.spacing.sm,
    minHeight: 56,
    paddingHorizontal: cloudTheme.spacing.md,
    paddingVertical: cloudTheme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.borderSubtle,
  },
  headerCell: { ...cloudTheme.type.caption, color: cloudTheme.colors.textMuted },
  bodyCell: { justifyContent: 'center' },
  cellText: {
    ...cloudTheme.type.small,
    color: cloudTheme.colors.text,
    flexShrink: 1,
  },
  empty: { ...cloudTheme.type.body, color: cloudTheme.colors.textMuted },
  cardList: { width: '100%', gap: cloudTheme.spacing.sm },
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
