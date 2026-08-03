import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CalendarPlus, LockKeyhole, MoreHorizontal } from 'lucide-react-native';
import { colors, radii, spacing, typeScale } from '../../../theme/tokens';
import { AppButton } from '../../ui/AppButton';
import { SegmentedControl } from '../../ui/SegmentedControl';

export type AgendaLayoutView = 'day' | 'week' | 'list';

interface AgendaHeaderProps {
  daySummary: string;
  syncState: 'live' | 'syncing' | 'offline';
  layoutView: AgendaLayoutView;
  primaryColor: string;
  foregroundColor: string;
  canBlock: boolean;
  onLayoutViewChange: (view: AgendaLayoutView) => void;
  onQuickBook: () => void;
  onBlock: () => void;
  onAbsenceMode: () => void;
}

const syncLabel = {
  live: 'Ao vivo',
  syncing: 'Sincronizando',
  offline: 'Offline',
} as const;

export const AgendaHeader = ({
  daySummary,
  syncState,
  layoutView,
  primaryColor,
  foregroundColor,
  canBlock,
  onLayoutViewChange,
  onQuickBook,
  onBlock,
  onAbsenceMode,
}: AgendaHeaderProps) => (
  <View style={styles.root} testID="professional-agenda-header">
    <View style={styles.topRow}>
      <View style={styles.copy}>
        <View style={styles.syncRow}>
          <View
            style={[
              styles.syncDot,
              syncState === 'live' && styles.syncLive,
              syncState === 'syncing' && styles.syncSyncing,
              syncState === 'offline' && styles.syncOffline,
            ]}
          />
          <Text style={styles.syncText}>{syncLabel[syncState]}</Text>
        </View>
        <Text style={styles.summary}>{daySummary}</Text>
      </View>
      <View style={styles.actions}>
        <AppButton
          foregroundColor={foregroundColor}
          icon={<CalendarPlus color={foregroundColor} size={16} />}
          label="Encaixe"
          onPress={onQuickBook}
          style={{ backgroundColor: primaryColor, borderColor: primaryColor }}
          testID="barber-quick-booking-button"
        />
        {canBlock ? (
          <AppButton
            icon={<LockKeyhole color={colors.textPrimary} size={16} />}
            label="Bloquear"
            onPress={onBlock}
            testID="professional-block-button"
            variant="secondary"
          />
        ) : null}
        <Pressable
          accessibilityLabel="Modo ausência"
          accessibilityRole="button"
          onPress={onAbsenceMode}
          style={({ pressed }) => [styles.moreButton, pressed && styles.pressed]}
          testID="absence-mode-open"
        >
          <MoreHorizontal color={colors.textPrimary} size={18} />
        </Pressable>
      </View>
    </View>
    <SegmentedControl
      onChange={(next) => onLayoutViewChange(next as AgendaLayoutView)}
      options={[
        { label: 'Dia', value: 'day' },
        { label: 'Semana', value: 'week' },
        { label: 'Lista', value: 'list' },
      ]}
      testID="professional-agenda-layout"
      value={layoutView}
    />
  </View>
);

const styles = StyleSheet.create({
  root: { gap: spacing.md, marginBottom: spacing.md },
  topRow: { alignItems: 'flex-start', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'space-between' },
  copy: { flex: 1, gap: 4, minWidth: 180 },
  syncRow: { alignItems: 'center', flexDirection: 'row', gap: 6 },
  syncDot: { borderRadius: 999, height: 8, width: 8 },
  syncLive: { backgroundColor: colors.success },
  syncSyncing: { backgroundColor: colors.warning },
  syncOffline: { backgroundColor: colors.danger },
  syncText: { ...typeScale.small, color: colors.textSecondary },
  summary: { ...typeScale.bodyStrong, color: colors.textPrimary },
  actions: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  moreButton: {
    alignItems: 'center',
    borderColor: colors.borderSubtle,
    borderRadius: radii.md,
    borderWidth: 1,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  pressed: { opacity: 0.85 },
});
