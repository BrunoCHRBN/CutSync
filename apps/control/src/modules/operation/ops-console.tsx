import React from 'react';
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { cloudTheme } from '@/theme/cloud-components';

export const OPS_CONTENT_MAX = 1360;

export function OpsPage({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.page, style]}>{children}</View>;
}

export function OpsHeader({
  kicker,
  title,
  description,
  meta,
  actions,
}: {
  kicker: string;
  title: string;
  description: string;
  meta?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={styles.kicker}>{kicker}</Text>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.lead}>{description}</Text>
      </View>
      <View style={styles.headerRight}>
        {meta ? <View style={styles.headerMeta}>{meta}</View> : null}
        {actions ? <View style={styles.headerActions}>{actions}</View> : null}
      </View>
    </View>
  );
}

export type OpsStripItem = {
  label: string;
  value: string;
  detail?: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
};

export function OpsStrip({ items }: { items: OpsStripItem[] }) {
  return (
    <View style={styles.strip}>
      {items.map((item, index) => (
        <React.Fragment key={item.label}>
          {index > 0 ? <View style={styles.stripDivider} /> : null}
          <View style={styles.stripCell}>
            <Text style={styles.stripLabel}>{item.label}</Text>
            <View style={styles.stripValueRow}>
              <Text
                style={[
                  styles.stripValue,
                  item.tone === 'warning' && styles.toneWarning,
                  item.tone === 'danger' && styles.toneDanger,
                  item.tone === 'success' && styles.toneSuccess,
                ]}
              >
                {item.value}
              </Text>
              {item.detail ? <Text style={styles.stripDetail}>· {item.detail}</Text> : null}
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

export function OpsPanel({
  title,
  meta,
  children,
}: {
  title: string;
  meta?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.panel}>
      <View style={styles.panelHead}>
        <Text style={styles.sectionTitle}>{title}</Text>
        {meta ? <View>{meta}</View> : null}
      </View>
      {children}
    </View>
  );
}

export function OpsGrid({
  children,
  compact,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return <View style={[styles.grid, compact && styles.gridCompact]}>{children}</View>;
}

export function OpsMainCol({ children }: { children: React.ReactNode }) {
  return <View style={styles.mainCol}>{children}</View>;
}

export function OpsSideCol({
  children,
  sticky,
}: {
  children: React.ReactNode;
  sticky?: boolean;
}) {
  return <View style={[styles.sideCol, sticky && styles.sideColSticky]}>{children}</View>;
}

export function OpsPrimaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.primaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function OpsSecondaryButton({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.secondaryButton,
        disabled && styles.disabled,
        pressed && !disabled && styles.pressed,
      ]}
    >
      <Text style={styles.secondaryButtonText}>{label}</Text>
    </Pressable>
  );
}

export function OpsTextAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [styles.textAction, disabled && styles.disabled, pressed && styles.pressed]}
    >
      <Text style={styles.textActionLabel}>{label}</Text>
    </Pressable>
  );
}

export function OpsChip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function OpsInlineNotice({
  message,
  tone = 'neutral',
}: {
  message: string;
  tone?: 'neutral' | 'warning' | 'danger' | 'success';
}) {
  return (
    <Text
      style={[
        styles.inlineNotice,
        tone === 'warning' && styles.inlineWarning,
        tone === 'danger' && styles.inlineDanger,
        tone === 'success' && styles.inlineSuccess,
      ]}
    >
      {message}
    </Text>
  );
}

export function OpsDefList({
  rows,
}: {
  rows: { label: string; value: string; tone?: 'neutral' | 'warning' | 'caution' }[];
}) {
  return (
    <View style={styles.defList}>
      {rows.map((row) => (
        <View key={row.label} style={styles.defRow}>
          <Text style={styles.defLabel}>{row.label}</Text>
          <Text
            style={[
              styles.defValue,
              row.tone === 'warning' && styles.toneWarning,
              row.tone === 'caution' && styles.toneWarning,
            ]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function OpsTableShell({ children }: { children: React.ReactNode }) {
  return <View style={styles.table}>{children}</View>;
}

export function OpsTableHead({
  children,
  gridStyle,
}: {
  children: React.ReactNode;
  gridStyle?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.tableHead, gridStyle]}>{children}</View>;
}

export function OpsTableRow({
  children,
  gridStyle,
  onPress,
  accent,
}: {
  children: React.ReactNode;
  gridStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accent?: boolean;
}) {
  if (onPress) {
    return (
      <Pressable
        accessibilityRole="button"
        onPress={onPress}
        style={({ pressed }) => [
          styles.tableRow,
          gridStyle,
          accent && styles.tableRowAccent,
          pressed && styles.tableRowHover,
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return (
    <View style={[styles.tableRow, gridStyle, accent && styles.tableRowAccent]}>
      {children}
    </View>
  );
}

export function OpsHeadCell({ children, style }: { children?: React.ReactNode; style?: StyleProp<TextStyle> }) {
  return <Text style={[styles.headCell, style]}>{children}</Text>;
}

export function OpsCell({
  children,
  strong,
  muted,
  mono,
  tone,
  numberOfLines = 1,
  style,
}: {
  children: React.ReactNode;
  strong?: boolean;
  muted?: boolean;
  mono?: boolean;
  tone?: 'warning' | 'danger';
  numberOfLines?: number;
  style?: StyleProp<TextStyle>;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        styles.cell,
        strong && styles.cellStrong,
        muted && styles.cellMuted,
        mono && styles.cellMono,
        tone === 'warning' && styles.toneWarning,
        tone === 'danger' && styles.toneDanger,
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function opsGridStyle(columns: string): ViewStyle {
  return Platform.select<ViewStyle>({
    web: {
      display: 'grid' as ViewStyle['display'],
      // @ts-expect-error RN web grid
      gridTemplateColumns: columns,
      alignItems: 'center',
      columnGap: 12,
      width: '100%',
    },
    default: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      width: '100%',
    },
  }) as ViewStyle;
}

const tabular: TextStyle = Platform.select({
  web: { fontVariant: ['tabular-nums'] },
  default: {},
}) ?? {};

const styles = StyleSheet.create({
  page: {
    width: '100%',
    maxWidth: OPS_CONTENT_MAX,
    alignSelf: 'center',
    gap: 18,
    paddingHorizontal: 32,
    paddingVertical: cloudTheme.layout.contentPadding,
  },
  header: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 16,
  },
  headerText: { flex: 1, minWidth: 260, gap: 6 },
  headerRight: { gap: 10, alignItems: 'flex-end' },
  headerMeta: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  headerActions: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8 },
  kicker: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  title: { color: cloudTheme.colors.text, fontSize: 27, fontWeight: '800' },
  lead: { color: cloudTheme.colors.textSecondary, fontSize: 14, lineHeight: 20, maxWidth: 620 },
  strip: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    minHeight: 68,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: cloudTheme.colors.border,
    backgroundColor: cloudTheme.colors.surface,
  },
  stripCell: {
    minWidth: 110,
    flexGrow: 1,
    gap: 2,
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  stripDivider: { width: 1, backgroundColor: cloudTheme.colors.border },
  stripLabel: {
    color: cloudTheme.colors.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  stripValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' },
  stripValue: {
    color: cloudTheme.colors.text,
    fontSize: 20,
    fontWeight: '800',
    ...tabular,
  },
  stripDetail: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  panel: {
    gap: 10,
    paddingTop: 4,
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
  },
  panelHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 12,
    marginTop: 4,
  },
  sectionTitle: {
    color: cloudTheme.colors.text,
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: 0.2,
    textTransform: 'uppercase',
  },
  grid: { flexDirection: 'row', alignItems: 'flex-start', gap: 32 },
  gridCompact: { flexDirection: 'column', gap: 20 },
  mainCol: { flexGrow: 1, flexShrink: 1, flexBasis: '0%', minWidth: 0, gap: 20 },
  sideCol: { width: 320, maxWidth: '100%', flexShrink: 0, gap: 20 },
  sideColSticky: Platform.select({
    web: {
      position: 'sticky' as ViewStyle['position'],
      top: 80,
      alignSelf: 'flex-start',
    },
    default: {},
  }) as ViewStyle,
  primaryButton: {
    minHeight: 44,
    minWidth: 118,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderRadius: 4,
    backgroundColor: '#1F6B45',
  },
  primaryButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 13 },
  secondaryButton: {
    minHeight: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#1F6B45',
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  secondaryButtonText: { color: '#1F6B45', fontWeight: '800', fontSize: 13 },
  textAction: { minHeight: 36, justifyContent: 'center', paddingHorizontal: 4 },
  textActionLabel: { color: '#1F6B45', fontSize: 13, fontWeight: '700' },
  chip: {
    minHeight: 36,
    justifyContent: 'center',
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: cloudTheme.colors.border,
    borderRadius: 4,
    backgroundColor: cloudTheme.colors.surface,
  },
  chipSelected: { borderColor: '#1F6B45', backgroundColor: '#E8F3EC' },
  chipText: { color: cloudTheme.colors.textSecondary, fontSize: 12, fontWeight: '700' },
  chipTextSelected: { color: '#1F6B45' },
  inlineNotice: {
    color: cloudTheme.colors.textSecondary,
    fontSize: 13,
    lineHeight: 19,
    paddingVertical: 8,
  },
  inlineWarning: { color: '#9A6B1F' },
  inlineDanger: { color: cloudTheme.colors.danger },
  inlineSuccess: { color: '#1F6B45' },
  defList: { borderTopWidth: 1, borderTopColor: cloudTheme.colors.border },
  defRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    minHeight: 40,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  defLabel: { color: cloudTheme.colors.textMuted, fontSize: 12, fontWeight: '600' },
  defValue: { color: cloudTheme.colors.text, fontSize: 13, fontWeight: '500', textAlign: 'right' },
  table: {
    borderTopWidth: 1,
    borderTopColor: cloudTheme.colors.border,
    width: '100%',
  },
  tableHead: {
    minHeight: 36,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  tableRow: {
    minHeight: 52,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: cloudTheme.colors.border,
  },
  tableRowAccent: {
    borderLeftWidth: 3,
    borderLeftColor: '#C9892F',
    paddingLeft: 8,
    marginLeft: -8,
  },
  tableRowHover: { backgroundColor: '#F5F8F5' },
  headCell: {
    color: cloudTheme.colors.textMuted,
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  cell: { color: cloudTheme.colors.textSecondary, fontSize: 13, lineHeight: 18 },
  cellStrong: { color: cloudTheme.colors.text, fontWeight: '700' },
  cellMuted: { color: cloudTheme.colors.textMuted },
  cellMono: { fontFamily: 'monospace', fontSize: 12 },
  toneWarning: { color: '#9A6B1F' },
  toneDanger: { color: cloudTheme.colors.danger },
  toneSuccess: { color: '#1F6B45' },
  pressed: { opacity: 0.88 },
  disabled: { opacity: 0.45 },
});
