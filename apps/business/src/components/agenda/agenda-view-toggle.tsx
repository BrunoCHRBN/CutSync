import { CalendarRange, List } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { businessTheme } from '@/theme/business-theme';

export type AgendaViewMode = 'timeline' | 'list';

export function AgendaViewToggle({ value, onChange }: { value: AgendaViewMode; onChange: (value: AgendaViewMode) => void }) {
  return (
    <View testID="business-agenda-view-toggle" accessibilityRole="tablist" style={styles.control}>
      {([
        { value: 'timeline' as const, label: 'Timeline', Icon: CalendarRange },
        { value: 'list' as const, label: 'Lista', Icon: List },
      ]).map(({ value: option, label, Icon }) => {
        const selected = value === option;
        return (
          <Pressable key={option} testID={`business-agenda-view-${option}`} accessibilityRole="tab" accessibilityState={{ selected }} onPress={() => onChange(option)} style={({ pressed }) => [styles.button, selected && styles.selected, pressed && styles.pressed]}>
            <Icon color={selected ? businessTheme.colors.accentStrong : businessTheme.colors.textMuted} size={18} />
            <Text style={[styles.label, selected && styles.labelSelected]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  control: { flexDirection: 'row', gap: 4, padding: 4, borderRadius: businessTheme.radii.md, backgroundColor: businessTheme.colors.surface },
  button: { flex: 1, minHeight: 44, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: businessTheme.spacing.xs, borderRadius: businessTheme.radii.sm },
  selected: { backgroundColor: businessTheme.colors.surfaceMuted },
  pressed: { opacity: businessTheme.opacity.pressed },
  label: { ...businessTheme.typography.caption, color: businessTheme.colors.textMuted },
  labelSelected: { color: businessTheme.colors.accentStrong },
});